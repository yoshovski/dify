import type { ToolWithProvider } from '@/app/components/workflow/types'
import { describe, expect, it } from 'vite-plus/test'
import { CollectionType } from '@/app/components/tools/types'
import { getAgentProviderCredentialId } from '../tool-provider-catalog'

describe('getAgentProviderCredentialId', () => {
  const customProvider = { id: 'provider-id', type: CollectionType.custom } as ToolWithProvider

  it('uses the custom API provider ID when API-key credentials are configured', () => {
    expect(
      getAgentProviderCredentialId(
        { provider_id: 'provider-id', credential_id: undefined },
        customProvider,
        'api-key',
      ),
    ).toBe('provider-id')
  })

  it('preserves an existing credential ID', () => {
    expect(
      getAgentProviderCredentialId(
        { provider_id: 'provider-id', credential_id: 'credential-id' },
        customProvider,
        'api-key',
      ),
    ).toBe('credential-id')
  })

  it('does not create a credential reference for providers without credentials', () => {
    expect(
      getAgentProviderCredentialId(
        { provider_id: 'provider-id', credential_id: undefined },
        customProvider,
        undefined,
      ),
    ).toBeUndefined()
  })
})
