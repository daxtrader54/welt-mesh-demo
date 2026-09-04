import type { MetadataRoute } from 'next'

/**
 * Refuse the whole origin.
 *
 * A demonstration store listing a real shoe at a real price should never appear in a search
 * result. The page metadata already sets `noindex` and `next.config.ts` sets `X-Robots-Tag`, but
 * both of those are read after a crawler has already fetched something. This is the one that
 * answers first, so it is the one that matters for a well-behaved crawler.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', disallow: '/' }
  }
}
