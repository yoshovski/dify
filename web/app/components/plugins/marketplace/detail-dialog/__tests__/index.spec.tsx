import type { Plugin } from '@/app/components/plugins/types'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'next-themes'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { PluginInstallPermissionProvider } from '@/app/components/plugins/install-plugin/components/plugin-install-permission-provider'
import { PluginCategoryEnum } from '@/app/components/plugins/types'
import MarketplaceDetailDialog from '../index'

const mocks = vi.hoisted(() => ({
  install: vi.fn(),
  canEmbed: vi.fn(() => true),
}))

vi.mock('../embed', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../embed')>()),
  canEmbedMarketplace: mocks.canEmbed,
}))

vi.mock('../../utils', () => ({
  getPluginLinkInMarketplace: (
    plugin: Plugin,
    params: {
      canInstall?: string
      installed: string
      language: string
      source?: string
      theme?: string
      view: string
    },
  ) =>
    `about:blank?plugin=${plugin.org}/${plugin.name}&installed=${params.installed}&language=${params.language}&source=${params.source}&theme=${params.theme}&view=${params.view}&canInstall=${params.canInstall}`,
}))

vi.mock('../use-silent-install', () => ({
  useSilentMarketplaceInstall: () => ({ install: mocks.install }),
}))

const plugin = {
  type: 'plugin',
  org: 'dify',
  name: 'plugin-a',
  plugin_id: 'plugin-a',
  version: '1.0.0',
  latest_version: '1.0.0',
  latest_package_identifier: 'pkg',
  icon: 'icon.png',
  verified: true,
  label: { 'en-US': 'Plugin A' },
  brief: { 'en-US': 'Brief' },
  description: { 'en-US': 'Description' },
  introduction: 'Intro',
  repository: 'https://github.com/dify/plugin-a',
  category: PluginCategoryEnum.tool,
  install_count: 42,
  endpoint: { settings: [] },
  tags: [],
  badges: [],
  verification: { authorized_category: 'community' },
  from: 'marketplace',
} as Plugin

describe('MarketplaceDetailDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.install.mockResolvedValue({ status: 'success' })
    mocks.canEmbed.mockReturnValue(true)
  })

  describe('when the marketplace cannot be embedded (self-hosted origin)', () => {
    beforeEach(() => {
      mocks.canEmbed.mockReturnValue(false)
    })

    it('opens the standalone marketplace page in a new tab and closes', () => {
      const open = vi.spyOn(window, 'open').mockReturnValue({} as Window)
      const onOpenChange = vi.fn()

      render(
        <ThemeProvider forcedTheme="dark">
          <MarketplaceDetailDialog open isInstalled plugin={plugin} onOpenChange={onOpenChange} />
        </ThemeProvider>,
      )

      expect(open).toHaveBeenCalledTimes(1)
      const [url, target, features] = open.mock.calls[0]!
      expect(String(url)).toContain('plugin=dify%2Fplugin-a')
      expect(String(url)).not.toContain('view=modal')
      expect(target).toBe('_blank')
      expect(features).toBe('noopener,noreferrer')
      expect(onOpenChange).toHaveBeenCalledWith(false)
      expect(document.querySelector('iframe')).not.toBeInTheDocument()
    })

    it('offers a link instead of an empty frame when the popup is blocked', async () => {
      vi.spyOn(window, 'open').mockReturnValue(null)
      const onOpenChange = vi.fn()

      render(
        <ThemeProvider forcedTheme="dark">
          <MarketplaceDetailDialog open isInstalled plugin={plugin} onOpenChange={onOpenChange} />
        </ThemeProvider>,
      )

      expect(onOpenChange).not.toHaveBeenCalled()
      expect(document.querySelector('iframe')).not.toBeInTheDocument()
      const link = screen.getByRole('link', {
        name: /plugin\.marketplace\.detailDialog\.openInNewTab/,
      })
      expect(link).toHaveAttribute('target', '_blank')
      expect(link.getAttribute('href')).not.toContain('view=modal')

      await userEvent.setup().click(link)
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })

  it('renders the marketplace detail route in modal mode and closes in place', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()

    render(
      <ThemeProvider forcedTheme="dark">
        <MarketplaceDetailDialog open isInstalled plugin={plugin} onOpenChange={onOpenChange} />
      </ThemeProvider>,
    )

    const frame = screen.getByTitle('Plugin A · plugin.detailPanel.operation.detail')
    expect(frame).toHaveAttribute(
      'src',
      // resolvedTheme maps the "system" preference to the concrete value, so
      // the embedded detail page receives light/dark rather than "system".
      'about:blank?plugin=dify/plugin-a&installed=true&language=en-US&source=http://localhost:3000&theme=light&view=modal&canInstall=true',
    )
    expect(document.querySelector('.bg-linear-to-t')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'common.operation.close' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('installs from the embedded detail frame without opening a confirmation dialog', async () => {
    render(
      <ThemeProvider forcedTheme="dark">
        <MarketplaceDetailDialog open isInstalled={false} plugin={plugin} onOpenChange={vi.fn()} />
      </ThemeProvider>,
    )

    const frame = screen.getByTitle(
      'Plugin A · plugin.detailPanel.operation.detail',
    ) as HTMLIFrameElement
    const postMessage = vi.spyOn(frame.contentWindow!, 'postMessage')
    const installRequest = {
      type: 'dify-marketplace:install-plugin',
      pluginUniqueIdentifier: plugin.latest_package_identifier,
    }
    fireEvent(
      window,
      new MessageEvent('message', {
        data: installRequest,
        origin: 'https://attacker.example',
        source: frame.contentWindow,
      }),
    )
    fireEvent(
      window,
      new MessageEvent('message', {
        data: {
          ...installRequest,
          pluginUniqueIdentifier: 'another/plugin:1.0.0',
        },
        origin: 'null',
        source: frame.contentWindow,
      }),
    )
    expect(mocks.install).not.toHaveBeenCalled()

    fireEvent(
      window,
      new MessageEvent('message', {
        data: installRequest,
        origin: 'null',
        source: frame.contentWindow,
      }),
    )

    expect(mocks.install).toHaveBeenCalledOnce()
    expect(mocks.install).toHaveBeenCalledWith(plugin)
    expect(screen.queryByRole('dialog', { name: 'plugin.installModal.installPlugin' })).toBeNull()

    await waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith(
        {
          type: 'dify-marketplace:install-plugin-status',
          pluginUniqueIdentifier: plugin.latest_package_identifier,
          status: 'success',
        },
        'null',
      )
    })
  })

  it('does not install when the workspace lacks plugin.install', async () => {
    render(
      <PluginInstallPermissionProvider canInstallPlugin={false}>
        <ThemeProvider forcedTheme="dark">
          <MarketplaceDetailDialog
            open
            isInstalled={false}
            plugin={plugin}
            onOpenChange={vi.fn()}
          />
        </ThemeProvider>
      </PluginInstallPermissionProvider>,
    )

    const frame = screen.getByTitle(
      'Plugin A · plugin.detailPanel.operation.detail',
    ) as HTMLIFrameElement
    expect(frame).toHaveAttribute(
      'src',
      'about:blank?plugin=dify/plugin-a&installed=false&language=en-US&source=http://localhost:3000&theme=light&view=modal&canInstall=false',
    )
    const postMessage = vi.spyOn(frame.contentWindow!, 'postMessage')
    fireEvent(
      window,
      new MessageEvent('message', {
        data: {
          type: 'dify-marketplace:install-plugin',
          pluginUniqueIdentifier: plugin.latest_package_identifier,
        },
        origin: 'null',
        source: frame.contentWindow,
      }),
    )

    expect(mocks.install).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith(
        {
          type: 'dify-marketplace:install-plugin-status',
          pluginUniqueIdentifier: plugin.latest_package_identifier,
          status: 'failed',
        },
        'null',
      )
    })
  })

  it('ignores a late install result after the timeout has already settled', async () => {
    vi.useFakeTimers()
    let finishInstall: ((result: { status: 'success' }) => void) | undefined
    mocks.install.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishInstall = resolve
        }),
    )

    try {
      render(
        <ThemeProvider forcedTheme="dark">
          <MarketplaceDetailDialog
            open
            isInstalled={false}
            plugin={plugin}
            onOpenChange={vi.fn()}
          />
        </ThemeProvider>,
      )

      const frame = screen.getByTitle(
        'Plugin A · plugin.detailPanel.operation.detail',
      ) as HTMLIFrameElement
      const postMessage = vi.spyOn(frame.contentWindow!, 'postMessage')
      fireEvent(
        window,
        new MessageEvent('message', {
          data: {
            type: 'dify-marketplace:install-plugin',
            pluginUniqueIdentifier: plugin.latest_package_identifier,
          },
          origin: 'null',
          source: frame.contentWindow,
        }),
      )

      await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
      expect(postMessage).toHaveBeenCalledWith(
        {
          type: 'dify-marketplace:install-plugin-status',
          pluginUniqueIdentifier: plugin.latest_package_identifier,
          status: 'timeout',
        },
        'null',
      )

      finishInstall?.({ status: 'success' })
      await Promise.resolve()
      await vi.runAllTimersAsync()

      expect(postMessage).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
