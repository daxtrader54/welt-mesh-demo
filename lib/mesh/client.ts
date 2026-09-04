import 'server-only'
import type { ZodType } from 'zod'
import { meshEnv } from '@/lib/env'
import { failure, type Failure } from '@/lib/failure'
import {
  configureResponse,
  holdingsResponse,
  holdingsValueResponse,
  linkTokenResponse,
  quoteResponse,
  type CryptoPosition
} from './schemas'
import {
  buildConnectTokenBody,
  buildPaymentTokenBody,
  quoteBrokerType,
  type ConnectTokenInput,
  type PaymentTokenInput
} from './requests'
import { holdingsFailureCode } from './errors'

/**
 * The whole Mesh surface this app touches: three endpoints, one fetch helper.
 * There is no client abstraction beyond this because there is nothing to abstract over.
 */

const TIMEOUT_MS = 15_000

export type MeshCall<T> =
  | { ok: true; data: T; ms: number }
  /**
   * `status` and `errorType` ride alongside the shopper-facing failure because some decisions can
   * only be made from the raw answer. Telling an expired connection from a bad minute is one of
   * them, and it decides whether we throw the stored token away.
   */
  | { ok: false; error: Failure; ms: number; status?: number; errorType?: string | null }


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

    const envelope = parsed.data as {
      status?: string
      message?: string
      displayMessage?: string
      errorHash?: string
      errorType?: string
    }

    if (!res.ok || (envelope.status && envelope.status !== 'ok')) {
      return {
        ok: false,
        ms,
        status: res.status,
        errorType: envelope.errorType ?? null,
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
      status: holdings.status,
      errorType: holdings.errorType,
      error: failure(
        holdingsFailureCode({
          httpStatus: holdings.status,
          errorType: holdings.errorType,
          message: holdings.error.detail
        }),
        { detail: holdings.error.detail, reference: holdings.error.reference }
      )
    }
  }

  /**
   * The other half of the same failure, and the one that actually bit.
   *
   * A token Mesh cannot parse is rejected by the API: HTTP 400, `invalidIntegrationToken`, caught
   * above. A token that is well formed and simply not accepted any more gets past the API into the
   * integration, which answers **HTTP 200** with `content.status` failed and
   * `content.errorMessage: "Unauthorized token"`. Same fault, same cure, different shape, and
   * classifying only the HTTP branch left a returning shopper on the old dead end.
   *
   * There is no `errorType` at this level, so the message is all there is to read.
   */
  const content = holdings.data.content
  if (content?.status && content.status !== 'succeeded') {
    const detail = content.errorMessage || `holdings status: ${content.status}`
    return {
      ok: false,
      ms: Date.now() - started,
      error: failure(holdingsFailureCode({ message: content.errorMessage }), { detail })
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
      // Production broker types only here, unlike every other endpoint. See quoteBrokerType.
      brokerType: quoteBrokerType(brokerType)
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
      /**
       * The lower bound of Mesh's range, which is what paying from a balance you already hold
       * costs. The upper bound assumes Mesh has to buy the asset for you first.
       *
       * Not shown as the amount that will be charged, and deliberately. The quote is priced
       * against the production broker (see `quoteBrokerType`) while the sandbox transfer charges
       * its own fee, which was 0.01 USDC. Quoting one and charging the other would be worse than
       * saying nothing, so this informs the fee note rather than printing a number.
       */
      feesInFiat: c?.fees?.inFiat?.minFeesFiat ?? null,
      funding: (c?.fundingOptions ?? []).map(f => ({
        type: f.fundingOption ?? 'unknown',
        method: f.paymentMethodType ?? null
      }))
    }
  }
}

export type AssetFunding = {
  symbol: string
  /** Mesh can send this asset as it stands. */
  eligible: boolean
  /** Mesh could fund the payment with this asset by converting it. The interesting one. */
  eligibleWithFunding: boolean
  reason: string | null
  balanceInFiat: number | null
}

export type TransferConfig = {
  holdings: AssetFunding[]
  /** disabled | available | requiresAmountLowering | notApplicable | unavailable */
  fundingStatus: string | null
}

/**
 * Ask Mesh which of THIS account's holdings can pay for THIS order.
 *
 * The quote endpoint cannot answer that and was being read as though it could. It takes no auth
 * token, so what it returns is a broker's capability and its minimums, not a view of anyone's
 * balances. This endpoint takes `fromAuthToken` and answers per holding, which is what turns
 * "the merchant settles in USDC" into "your BTC can pay for this, by converting".
 *
 * `fromType` takes the connection's own broker type. Confirmed by probe: `sandboxCoinbase`,
 * `coinbase` and `sandbox` are all accepted here, unlike the quote endpoint, which refuses the
 * sandbox names, and unlike holdings/get, which requires them.
 */
export async function configureTransfer(
  authToken: string,
  brokerType: string,
  amountInFiat: number,
  destinations: { networkId: string; symbol: string; address: string }[]
): Promise<MeshCall<TransferConfig>> {
  const res = await meshPost(
    '/api/v1/transfers/managed/configure',
    {
      fromAuthToken: authToken,
      fromType: brokerType,
      toAddresses: destinations,
      amountInFiat,
      fiatCurrency: 'USD'
    },
    configureResponse
  )
  if (!res.ok) return res

  const c = res.data.content
  return {
    ok: true,
    ms: res.ms,
    data: {
      holdings: (c?.holdings ?? [])
        .filter(h => h.symbol)
        .map(h => ({
          symbol: h.symbol!,
          eligible: h.eligibleForTransfer ?? false,
          eligibleWithFunding: h.eligibleForTransferWithFunding ?? false,
          reason: h.ineligibilityReason ?? null,
          balanceInFiat: h.availableBalanceInFiat ?? null
        })),
      fundingStatus: c?.transferBalanceFundingAvailability?.status ?? null
    }
  }
}
