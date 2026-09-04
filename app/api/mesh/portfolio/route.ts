import { failure } from '@/lib/failure'
import { fail, guard, ok } from '@/lib/http'
import { getPortfolio } from '@/lib/mesh/client'
import { PRODUCT } from '@/lib/product'
import { readSessionId } from '@/lib/session'
import { dropConnection, getSession } from '@/lib/store/records'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Reads the connected account's holdings using the auth token held server-side.
 *
 * The response is shaped for the page rather than passed through raw: the position that can
 * actually pay for this order is singled out, and the sandbox `totalValue` is left out of the
 * headline because it is dominated by ten million dollars of simulated fiat, which would look
 * ridiculous next to a fifty dollar pair of trainers.
 */
export async function GET() {
  return guard(async () => {
    const sid = await readSessionId()
    const session = sid ? await getSession(sid) : null
    const connection = session?.connections.at(-1)

    if (!connection) {
      return fail(failure('portfolio_failed', { detail: 'No connected account for this session' }), 409)
    }

    if (connection.expiresAt && connection.expiresAt < Date.now()) {
      await dropConnection(sid!, connection.brokerType)
      return fail(
        failure('connection_expired', {
          detail: `Auth token expired at ${new Date(connection.expiresAt).toISOString()}`
        }),
        409
      )
    }

    const res = await getPortfolio(connection.authToken, connection.brokerType)

    /**
     * Only the expiry we can see up front is caught above. Link does not always return an
     * `expiresInSeconds`, so a connection can sit here with `expiresAt` null and a token Mesh
     * stopped accepting hours ago, and the first we hear of it is this call failing. Throwing the
     * connection away here is what stops the next click repeating it.
     */
    if (!res.ok) {
      if (res.error.code === 'connection_expired') {
        await dropConnection(sid!, connection.brokerType)
        return fail(res.error, 409)
      }

      /**
       * Name the provider. Reading holdings is a per-integration capability, not a property of the
       * app, and the two behave differently in this sandbox: Coinbase returns fourteen positions,
       * while Binance answers `holdings/get` with "Could not get portfolio from Sandbox."
       *
       * A shopper who connected Binance and read an unattributed "could not read your balances"
       * has no way to tell whether it was them, us, or Mesh. Saying which account it was makes the
       * next decision, try another one, obvious. It is also the more interesting fact for a
       * merchant watching: portfolio read and payment are separate capabilities, and this
       * integration has the second without the first. The payment still works, which is why this
       * stays a warning, and a run today proved it by connecting Binance, failing this call, then
       * paying from Coinbase inside Link.
       */
      return fail(
        { ...res.error, title: `We connected to ${connection.brokerName}, but could not read your balances` },
        502
      )
    }

    const positions = res.data.positions
      .filter(p => (p.marketValue ?? 0) > 0 || p.amount > 0)
      .sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0))

    const settlement = positions.find(p => p.symbol === PRODUCT.settlement.symbol) ?? null

    return ok({
      provider: connection.brokerName,
      accountName: res.data.accountName ?? connection.accountName,
      positions,
      cryptoValue: res.data.cryptoValue,
      settlement: settlement && {
        symbol: settlement.symbol,
        amount: settlement.amount,
        marketValue: settlement.marketValue ?? null,
        /** Whether this account can cover the order in the asset the merchant settles in. */
        covers: settlement.amount >= PRODUCT.price
      },
      ms: res.ms
    })
  })
}
