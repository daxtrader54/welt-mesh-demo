import { failure } from '@/lib/failure'
import { fail, guard, ok } from '@/lib/http'
import { getQuote } from '@/lib/mesh/client'
import { ACCEPTED_ASSETS, PRODUCT } from '@/lib/product'
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

    const results = await Promise.all(
      ACCEPTED_ASSETS.map(a => getQuote(connection.brokerType, a.symbol, PRODUCT.price))
    )

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
      /** Stated on screen: Mesh documents this endpoint as Coinbase-only for now. */
      brokerType: connection.brokerType,
      amountInFiat: PRODUCT.price
    })
  })
}
