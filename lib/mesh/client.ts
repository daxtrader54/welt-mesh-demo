import 'server-only'
import type { ZodType } from 'zod'
import { meshEnv } from '@/lib/env'
import { failure, type Failure } from '@/lib/failure'
import {
  holdingsResponse,
  holdingsValueResponse,
  linkTokenResponse,
  quoteResponse,
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
    // Status first. A 5xx returning an HTML error page should read as a server failure, not as
    // "unexpected response shape", which sends whoever is debugging to the wrong place.
    if (res.status >= 500) {
      return {
        ok: false,
        ms,
        error: failure('network', { detail: `HTTP ${res.status} from ${path}` })
      }
    }

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
    // Rebuilt rather than spread: `failure()` looks up title, hint and retryable from the code at
    // construction, so overriding only `code` leaves the link-token copy attached to a holdings
    // error and the shopper reads "We could not start the payment" about their balances.
    return {
      ok: false,
      ms: Date.now() - started,
      error: failure('portfolio_failed', {
        detail: holdings.error.detail,
        reference: holdings.error.reference
      })
    }
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

export type AssetQuote = {
  symbol: string
  eligible: boolean
  reason: string | null
  /** Total fees in fiat, as Mesh quotes them for this asset. */
  feesInFiat: number | null
  /**
   * Where the money would come from. `existingCryptocurrencyBalance` means they already hold it;
   * `buyingPowerPurchase` and `paymentMethodDepositUsage` mean Mesh would buy it for them, which
   * is the part a merchant does not expect.
   */
  funding: { type: string; method: string | null }[]
}

/**
 * Ask Mesh whether one asset can actually pay for this order, and what it would cost.
 *
 * Documented as Coinbase-only for `brokerType` at the time of writing, which suits a demo whose
 * required source is Coinbase, but it is not a general capability yet and the UI says so.
 */
export async function getQuote(
  brokerType: string,
  symbol: string,
  amountInFiat: number
): Promise<MeshCall<AssetQuote>> {
  const env = meshEnv()
  const res = await meshPost(
    '/api/v1/transfers/managed/quote',
    {
      amountInFiat,
      fiatCurrency: 'USD',
      symbol,
      networkId: env.merchantNetworkId,
      toAddress: env.merchantAddress,
      brokerType
    },
    quoteResponse
  )

  if (!res.ok) return res

  const c = res.data.content
  return {
    ok: true,
    ms: res.ms,
    data: {
      symbol,
      eligible: c?.isEligible ?? false,
      reason: c?.ineligibilityReason ?? null,
      feesInFiat: c?.fees?.totalFeesInFiat ?? null,
      funding: (c?.fundingOptions ?? []).map(f => ({
        type: f.cryptocurrencyFundingOptionType ?? 'unknown',
        method: f.paymentMethodType ?? null
      }))
    }
  }
}
