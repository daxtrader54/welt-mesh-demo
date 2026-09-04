import { failure } from '@/lib/failure'
import { fail, guard, ok } from '@/lib/http'
import { configureTransfer, getQuote } from '@/lib/mesh/client'
import { ACCEPTED_ASSETS, PRODUCT } from '@/lib/product'
import { meshEnv } from '@/lib/env'
import { readSessionId } from '@/lib/session'
import { getSession } from '@/lib/store/records'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Which of the assets this merchant accepts can actually pay for this order.
 *
 * Separate from the portfolio route on purpose. Holdings come back in one round trip and render
 * immediately; the quotes take one Mesh call per asset and fill in behind them. Putting both in
 * one route would make the shopper wait for five calls to see the first number.
 *
 * This is Mesh's answer rather than ours. Comparing a balance against a price would miss the
 * exchange's withdrawal minimum, its fees, and the fact that Mesh can fund a payment from buying
 * power or a card when the balance alone is short.
 */
export async function GET() {
  return guard(async () => {
    const sid = await readSessionId()
    const session = sid ? await getSession(sid) : null
    const connection = session?.connections.at(-1)

    if (!connection) {
      return fail(failure('portfolio_failed', { detail: 'No connected account for this session' }), 409)
    }

    const env = meshEnv()

    /**
     * Two different questions, asked together.
     *
     * The quotes price the merchant's own assets: minimums, fees, and the funding routes a broker
     * supports. They take no auth token, so they say nothing about this account, which is a thing
     * the UI was quietly reading them as though they did.
     *
     * `configure` takes the auth token and answers per holding for this account, including
     * `eligibleForTransferWithFunding`, which is Mesh saying it could pay with that asset by
     * converting it. That is what lets the page say a shopper's BTC can buy a pair of shoes
     * instead of listing it as something the shop cannot accept.
     */
    const [results, config] = await Promise.all([
      Promise.all(ACCEPTED_ASSETS.map(a => getQuote(connection.brokerType, a.symbol, PRODUCT.price))),
      configureTransfer(
        connection.authToken,
        connection.brokerType,
        PRODUCT.price,
        ACCEPTED_ASSETS.map(a => ({
          networkId: env.merchantNetworkId,
          symbol: a.symbol,
          address: env.merchantAddress
        }))
      )
    ])

    return ok({
      // A quote that failed to fetch is reported as unknown rather than as ineligible: we do not
      // know, and telling a shopper they cannot pay with something because a call timed out would
      // be worse than saying nothing.
      quotes: results.map((r, i) => {
        const asset = ACCEPTED_ASSETS[i]!
        return r.ok
          ? { ...r.data, name: asset.name, primary: 'primary' in asset }
          : {
              symbol: asset.symbol,
              name: asset.name,
              primary: 'primary' in asset,
              eligible: null,
              reason: null,
              feesInFiat: null,
              funding: []
            }
      }),
      /**
       * Mesh's per-holding answer for this account, or null when the call failed. Null means
       * unknown and must never be rendered as a refusal, which is the mistake the quotes made.
       */
      funding: config.ok ? config.data.holdings : null,
      fundingStatus: config.ok ? config.data.fundingStatus : null,
      /**
       * Why the per-account answer is missing, when it is. Silence here was the problem: the
       * holdings list simply showed no verdict and there was no way to tell whether Mesh had said
       * nothing, said no, or never been asked.
       */
      fundingError: config.ok ? null : (config.error.detail ?? config.error.title),
      fundingMs: config.ms,
      /** Stated on screen: Mesh documents the quote endpoint as Coinbase-only for now. */
      brokerType: connection.brokerType,
      amountInFiat: PRODUCT.price
    })
  })
}
