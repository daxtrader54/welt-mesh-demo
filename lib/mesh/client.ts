import 'server-only'
import type { ZodType } from 'zod'
import { meshEnv } from '@/lib/env'
import { failure, type Failure } from '@/lib/failure'
import {
  holdingsResponse,
  holdingsValueResponse,
  linkTokenResponse,
  type CryptoPosition
} from './schemas'
import {
  buildConnectTokenBody,
  buildPaymentTokenBody,
  type ConnectTokenInput,
  type PaymentTokenInput
} from './requests'

/**
 * The whole Mesh surface this app touches: three endpoints, one fetch helper.
 * There is no client abstraction beyond this because there is nothing to abstract over.
 */

const TIMEOUT_MS = 15_000

export type MeshCall<T> = { ok: true; data: T; ms: number } | { ok: false; error: Failure; ms: number }

async function meshPost<T>(path: string, body: unknown, schema: ZodType<T>): Promise<MeshCall<T>> {
  const started = Date.now()
  const env = meshEnv()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(env.baseUrl + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Id': env.clientId,
        'X-Client-Secret': env.apiKey
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: 'no-store'
    })

    const ms = Date.now() - started
    const raw: unknown = await res.json().catch(() => null)
    const parsed = schema.safeParse(raw)

    if (!parsed.success) {
      return {
        ok: false,
        ms,
        error: failure('unknown', {
          detail: `Unexpected response shape from ${path}: ${parsed.error.issues
            .map(i => `${i.path.join('.') || '(root)'} ${i.message}`)
            .join('; ')}`
        })
      }
    }

    const envelope = parsed.data as { status?: string; message?: string; displayMessage?: string; errorHash?: string }

    if (!res.ok || (envelope.status && envelope.status !== 'ok')) {
      return {
        ok: false,
        ms,
        error: failure(res.status === 429 ? 'rate_limited' : 'link_token', {
          title: envelope.displayMessage || undefined,
          detail: envelope.message || `HTTP ${res.status} from ${path}`,
          reference: envelope.errorHash
        })
      }
    }

    return { ok: true, data: parsed.data, ms }
  } catch (err) {
    const ms = Date.now() - started
    const aborted = err instanceof Error && err.name === 'AbortError'
    return {
      ok: false,
      ms,
      error: failure(aborted ? 'timeout' : 'network', {
        detail: err instanceof Error ? err.message : String(err)
      })
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function createConnectToken(input: ConnectTokenInput): Promise<MeshCall<string>> {
  const res = await meshPost('/api/v1/linktoken', buildConnectTokenBody(input), linkTokenResponse)
  if (!res.ok) return res
  const token = res.data.content?.linkToken
  if (!token) {
    return { ok: false, ms: res.ms, error: failure('link_token', { detail: 'Mesh returned no linkToken' }) }
  }
  return { ok: true, data: token, ms: res.ms }
}

export async function createPaymentToken(input: PaymentTokenInput): Promise<MeshCall<string>> {
  const res = await meshPost('/api/v1/linktoken', buildPaymentTokenBody(input), linkTokenResponse)
  if (!res.ok) return res
  const token = res.data.content?.linkToken
  if (!token) {
    return { ok: false, ms: res.ms, error: failure('link_token', { detail: 'Mesh returned no linkToken' }) }
  }
  return { ok: true, data: token, ms: res.ms }
}

export type Portfolio = {
  institutionName: string | null
  accountName: string | null
  positions: CryptoPosition[]
  /** Crypto only. The sandbox `totalValue` is dominated by $10m of simulated fiat. */
  cryptoValue: number | null
  totalValue: number | null
}

/**
 * `type` must be the brokerType from the connect payload, not a hardcoded 'coinbase'.
 * The sandbox reports 'sandboxCoinbase' and 'sandbox', and passing the wrong one fails.
 */
export async function getPortfolio(authToken: string, brokerType: string): Promise<MeshCall<Portfolio>> {
  const started = Date.now()
  const [holdings, value] = await Promise.all([
    meshPost('/api/v1/holdings/get', { authToken, type: brokerType, includeMarketValue: true }, holdingsResponse),
    meshPost('/api/v1/holdings/value', { authToken, type: brokerType }, holdingsValueResponse)
  ])

  if (!holdings.ok) {
    return { ok: false, ms: Date.now() - started, error: { ...holdings.error, code: 'portfolio_failed' } }
  }

  const content = holdings.data.content
  if (content?.status && content.status !== 'succeeded') {
    return {
      ok: false,
      ms: Date.now() - started,
      error: failure('portfolio_failed', {
        detail: content.errorMessage || `holdings status: ${content.status}`
      })
    }
  }

  return {
    ok: true,
    ms: Date.now() - started,
    data: {
      institutionName: content?.institutionName ?? null,
      accountName: content?.accountName ?? null,
      positions: content?.cryptocurrencyPositions ?? [],
      cryptoValue: value.ok ? (value.data.content?.cryptocurrenciesValue ?? null) : null,
      totalValue: value.ok ? (value.data.content?.totalValue ?? null) : null
    }
  }
}
