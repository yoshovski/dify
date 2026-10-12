import type { ComponentProps } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import QueryEmbeddingSection from '../query-embedding-section'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (selector: (keys: Record<string, string>) => string) =>
      selector(new Proxy({}, { get: (_, key) => String(key) })),
    i18n: { language: 'en_US' },
  }),
}))

const profile = {
  tenant_id: 'tenant-1',
  provider: 'voyage',
  document_model: 'voyage-4',
  query_model: 'voyage-4-lite',
  dimensions: 1024 as const,
  encoding: 'float' as const,
}
const props: ComponentProps<typeof QueryEmbeddingSection> = {
  queryModel: null,
  onChange: vi.fn(),
  options: [profile],
  models: [
    {
      provider: 'voyage',
      tenant_id: 'tenant-1',
      label: { en_US: 'Voyage' },
      status: 'active',
      models: [
        {
          model: 'voyage-4-lite',
          status: 'active',
          label: { en_US: 'Voyage 4 Lite' },
          model_type: 'text-embedding',
          model_properties: {},
          fetch_from: 'customizable-model',
        },
        {
          model: 'voyage-3.5',
          status: 'active',
          label: { en_US: 'Voyage 3.5' },
          model_type: 'text-embedding',
          model_properties: {},
          fetch_from: 'customizable-model',
        },
      ],
    },
  ],
  valid: true,
  readonly: false,
  enabled: true,
}

describe('Query embedding selection', () => {
  it('offers only approved active models and lets users restore the document model', async () => {
    const user = userEvent.setup()
    const change = vi.fn()
    const { rerender } = render(<QueryEmbeddingSection {...props} onChange={change} />)
    const select = screen.getByRole('combobox', { name: 'form.queryEmbeddingModel' })
    expect(select).toHaveTextContent('form.queryEmbeddingSame')
    await user.click(select)
    expect(screen.queryByRole('option', { name: 'voyage-3.5' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('option', { name: 'voyage-4-lite' }))
    expect(change).toHaveBeenCalledWith({ provider: 'voyage', model: 'voyage-4-lite' })
    rerender(
      <QueryEmbeddingSection
        {...props}
        onChange={change}
        queryModel={{ provider: 'voyage', model: 'voyage-4-lite' }}
      />,
    )
    await user.click(screen.getByRole('combobox', { name: 'form.queryEmbeddingModel' }))
    await user.click(screen.getByRole('option', { name: 'form.queryEmbeddingSame' }))
    expect(change).toHaveBeenLastCalledWith(null)
  })

  it('keeps incompatible saved selections visible until explicitly cleared', async () => {
    const user = userEvent.setup()
    render(
      <QueryEmbeddingSection
        {...props}
        options={[]}
        valid={false}
        queryModel={{ provider: 'voyage', model: 'voyage-4-lite' }}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('form.queryEmbeddingInvalid')
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-invalid', 'true')
    await user.click(screen.getByRole('combobox'))
    const option = screen.getByRole('option', { name: 'voyage-4-lite' })
    expect(option).toHaveAttribute('aria-disabled', 'true')
  })

  it('leaves only the document default for unsupported datasets', async () => {
    const user = userEvent.setup()
    render(<QueryEmbeddingSection {...props} enabled={false} />)
    await user.click(screen.getByRole('combobox'))
    expect(screen.getAllByRole('option')).toHaveLength(1)
    expect(screen.getByText('form.queryEmbeddingUnsupported')).toBeInTheDocument()
  })

  it('does not allow readers to change the model', () => {
    render(<QueryEmbeddingSection {...props} readonly />)
    expect(screen.getByRole('combobox')).toBeDisabled()
  })
})
