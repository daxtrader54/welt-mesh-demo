import { z } from 'zod'
import { meshEnv } from '@/lib/env'
import { failure } from '@/lib/failure'
import { fail, guard, ok, readJson } from '@/lib/http'
import { createConnectToken, createPaymentToken } from '@/lib/mesh/client'
import { PRODUCT, COLOURWAYS, SIZES } from '@/lib/product'
import { ensureSessionId, meshUserId } from '@/lib/session'
import { getSession, putOrder, underRateLimit, type OrderRecord } from '@/lib/store/records'
import { orderNumber } from '@/lib/format'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Mints a Link token. Two shapes, one route.
 *
 * Tokens last ten minutes and are single use, so this is called on the click and never on page
 * load. The client secret only ever exists here.
 *
 * The amount, asset, network and destination come from server configuration. The browser chooses
 * a colourway and a size and nothing else, because a checkout that lets the client name its own
 * price is not a checkout.
 */

const body = z.object({
  intent: z.enum(['connect', 'pay']),
  colourway: z.string().optional(),
  size: z.string().optional(),
  /**
   * Which provider to open Link on. The shopper picks this in our own UI rather than in Mesh's
   * catalogue screen, so the choice is made in the merchant's design and the fumble of scrolling
   * a provider list mid-payment goes away. Shape-checked, not allowlisted: it only deep-links
   * Link, and Mesh rejects an id that is not in this client's catalogue.
   */
  integrationId: z.uuid().optional()
})

export async function POST(req: Request) {
  return guard(async () => {
    const parsed = body.safeParse(await readJson(req))
    if (!parsed.success) {
      return fail(failure('unknown', { detail: 'Malformed request body' }), 400)
    }

    const sid = await ensureSessionId()
    const env = meshEnv()
    const userId = meshUserId(sid)

    /**
     * Counted after validation, not before. Previously a client sending twenty malformed bodies
     * locked itself out for a minute without ever reaching Mesh, which is a live-demo footgun and
     * protects nothing.
     */
    const withinLimit = async () => underRateLimit(sid)

    if (parsed.data.intent === 'connect') {
      if (!(await withinLimit())) {
        return fail(failure('rate_limited', { detail: 'Too many link tokens for this session' }), 429)
      }
      const res = await createConnectToken({
        userId,
        integrationId: parsed.data.integrationId ?? env.coinbaseIntegrationId
      })
      if (!res.ok) return fail(res.error, 502)
      return ok({ linkToken: res.data, ms: res.ms })
    }

    // Paying. Validate the selection, then build the order from server-side truth.
    const colourway = COLOURWAYS.find(c => c.id === parsed.data.colourway)
    const size = SIZES.find(s => s.uk === parsed.data.size && s.inStock)
    if (!colourway || !size) {
      return fail(
        failure('unknown', {
          title: 'Choose a colour and a size first',
          detail: `Unknown colourway "${parsed.data.colourway}" or unavailable size "${parsed.data.size}"`
        }),
        400
      )
    }

    if (!(await withinLimit())) {
      return fail(failure('rate_limited', { detail: 'Too many link tokens for this session' }), 429)
    }

    const session = await getSession(sid)
    const order: OrderRecord = {
      id: orderNumber(`${sid}:${Date.now()}`),
      createdAt: Date.now(),
      status: 'created',
      colourway: colourway.name,
      colourwayRef: colourway.ref,
      size: `UK ${size.uk}`,
      amount: PRODUCT.price,
      symbol: PRODUCT.settlement.symbol,
      networkId: env.merchantNetworkId,
      destination: env.merchantAddress
    }

    const res = await createPaymentToken({
      userId,
      integrationId: parsed.data.integrationId ?? null,
      transactionId: order.id,
      destination: {
        networkId: env.merchantNetworkId,
        address: env.merchantAddress,
        symbol: PRODUCT.settlement.symbol
      },
      amount: PRODUCT.price,
      displayAmountInFiat: PRODUCT.price,
      clientFee: env.handlingFee
    })
    if (!res.ok) return fail(res.error, 502)

    await putOrder(order)

    return ok({
      linkToken: res.data,
      ms: res.ms,
      order: { id: order.id, amount: order.amount, symbol: order.symbol },
      // Passed to createLink so a returning shopper is not asked to sign in again. These are
      // Mesh-managed token ids, not credentials.
      accessTokens: (session?.connections ?? [])
        .filter(c => c.tokenId)
        .map(c => ({
          accessToken: c.tokenId!,
          brokerType: c.brokerType,
          brokerName: '',
          accountId: '',
          accountName: ''
        }))
    })
  })
}
