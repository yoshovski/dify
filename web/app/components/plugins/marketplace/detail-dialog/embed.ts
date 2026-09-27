// marketplace.dify.ai sends `frame-ancestors https://cloud.dify.ai`, so browsers refuse
// to render it inside any other origin (every self-hosted install). There the detail
// dialog opens the page in a new tab instead of showing an empty frame.
const MARKETPLACE_EMBED_ORIGINS = ['https://cloud.dify.ai']

export const canEmbedMarketplace = () =>
  typeof window !== 'undefined' && MARKETPLACE_EMBED_ORIGINS.includes(window.location.origin)

export const getStandaloneMarketplaceUrl = (src: string) => {
  const url = new URL(src, window.location.href)
  url.searchParams.delete('view')
  return url.toString()
}
