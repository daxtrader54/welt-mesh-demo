import 'server-only'

/**
 * Configuration is validated once, on first use, and the failure is loud and specific.
 * "Invalid or missing environment configuration" is a named failure mode in the brief, and a
 * demo that dies with `undefined is not a string` three layers into a fetch is the worst version
 * of it. Anything genuinely optional is typed as optional and degrades on its own terms.
 */

export type MeshEnv = {
  clientId: string
  apiKey: string
  baseUrl: string
  merchantAddress: string
  merchantNetworkId: string
  coinbaseIntegrationId: string | null
  /** Merchant handling fee in dollars. Sent to Mesh as a ratio of the order amount. */
  handlingFee: number
  webhookSecret: string | null
  redis: { url: string; token: string } | null
}

export class ConfigError extends Error {
  readonly missing: string[]
  constructor(missing: string[]) {
    super(`Missing required environment variables: ${missing.join(', ')}`)
    this.name = 'ConfigError'
    this.missing = missing
  }
}

const REQUIRED = [
  'MESH_CLIENT_ID',
  'MESH_API_KEY',
  'MESH_API_BASE_URL',
  'MERCHANT_ADDRESS',
  'MERCHANT_NETWORK_ID'
] as const

let cached: MeshEnv | null = null

export function meshEnv(): MeshEnv {
  if (cached) return cached

  const missing = REQUIRED.filter(key => !process.env[key]?.trim())
  if (missing.length) throw new ConfigError(missing)

  // Two namings for the same thing. Upstash's own dashboard gives UPSTASH_REDIS_REST_*, while
  // adding it through the Vercel Marketplace injects KV_REST_API_*. Both are the same REST
  // endpoint and the same client, so accept either rather than making someone rename variables
  // Vercel set for them.
  const redisUrl = (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL)?.trim()
  const redisToken = (process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN)?.trim()

  cached = {
    clientId: process.env.MESH_CLIENT_ID!.trim(),
    apiKey: process.env.MESH_API_KEY!.trim(),
    baseUrl: process.env.MESH_API_BASE_URL!.trim().replace(/\/+$/, ''),
    merchantAddress: process.env.MERCHANT_ADDRESS!.trim(),
    merchantNetworkId: process.env.MERCHANT_NETWORK_ID!.trim(),
    coinbaseIntegrationId: process.env.MESH_COINBASE_INTEGRATION_ID?.trim() || null,
    handlingFee: Number.parseFloat(process.env.NEXT_PUBLIC_MERCHANT_HANDLING_FEE ?? '0') || 0,
    webhookSecret: process.env.MESH_WEBHOOK_SECRET?.trim() || null,
    redis: redisUrl && redisToken ? { url: redisUrl, token: redisToken } : null
  }
  return cached
}

/** Presence only. Never returns a value, so it is safe to expose on /api/health. */
export function configStatus() {
  const present = (key: string) => Boolean(process.env[key]?.trim())
  const missing = REQUIRED.filter(key => !present(key))
  const isSandbox = (process.env.MESH_API_BASE_URL ?? '').includes('sandbox')

  return {
    ok: missing.length === 0,
    missing,
    environment: isSandbox ? ('sandbox' as const) : ('production' as const),
    optional: {
      webhookSecret: present('MESH_WEBHOOK_SECRET'),
      redis:
        (present('UPSTASH_REDIS_REST_URL') && present('UPSTASH_REDIS_REST_TOKEN')) ||
        (present('KV_REST_API_URL') && present('KV_REST_API_TOKEN')),
      coinbaseDeepLink: present('MESH_COINBASE_INTEGRATION_ID')
    }
  }
}
