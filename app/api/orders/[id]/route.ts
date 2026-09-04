import { z } from 'zod'
import { failure } from '@/lib/failure'
import { fail, guard, ok, readJson } from '@/lib/http'
import { readSessionId } from '@/lib/session'
import { type OrderRecord, getOrder, getRefund, getSettlement, putOrder } from '@/lib/store/records'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/**
 * The order record, as the server sees it.
 *
 * The page polls this after payment to find out whether the webhook has arrived. Polling stops
 * once the order settles or after a bounded number of attempts, because a sandbox that never
 * sends a webhook should not leave the browser asking forever.
 */
/**
 * 404 rather than 403 on a mismatch, so the endpoint does not confirm which ids exist. The webhook
 * has no cookie and never comes through here; it writes settlement to its own key.
 */
async function owned(id: string) {
  const [sid, order] = await Promise.all([readSessionId(), getOrder(id)])
  return order && sid && order.sid === sid ? order : null
}

/**
 * The order as the browser is allowed to see it.
 *
 * `sid` is the value of the httpOnly session cookie. Spreading the whole record put it in a JSON
 * body the page reads every few seconds, which hands it to any script on the page and undoes the
 * one thing httpOnly is for. Nothing in the UI ever needed it.
 */
function forBrowser(order: OrderRecord) {
  const { sid: _sid, ...rest } = order
  return rest
}

export async function GET(_req: Request, ctx: Ctx) {
  return guard(async () => {
    const { id } = await ctx.params
    const [order, settlement, refund] = await Promise.all([
      owned(id),
      getSettlement(id),
      getRefund(id)
    ])
    if (!order) {
      return fail(
        failure('unknown', { title: 'We cannot find that order', detail: `No order ${id}` }),
        404
      )
    }

    // Settlement is the webhook's fact and lives in its own key, so it is merged on read rather
    // than written into a record the browser also updates. A refund is a separate fact in a
    // separate key, because it describes what happened after settlement rather than replacing it.
    const settled = settlement?.transferStatus === 'Succeeded'

    return ok({
      order: {
        ...forBrowser(order),
        status: settled ? 'settled' : settlement?.transferStatus === 'Failed' ? 'failed' : order.status,
        settledAt: settled ? settlement?.receivedAt : order.settledAt,
        txHash: settlement?.txHash ?? order.txHash,
        refundStatus: refund?.transferStatus,
        webhook: settlement
          ? {
              eventId: settlement.eventId,
              transferStatus: settlement.transferStatus,
              receivedAt: settlement.receivedAt,
              txHash: settlement.txHash
            }
          : order.webhook
      }
    })
  })
}

/**
 * The browser reports what it saw. It can move an order to `paid` and record the references Mesh
 * handed back, and that is the limit of what it is trusted with. Only the verified webhook writes
 * `settled`, and the amount and destination are never taken from here.
 */
const patch = z.object({
  status: z.enum(['paid', 'failed']),
  source: z.string().optional(),
  txId: z.string().optional(),
  transferId: z.string().optional(),
  txHash: z.string().optional(),
  totalAmountInFiat: z.number().optional(),
  failure: z.object({ code: z.string(), detail: z.string().optional() }).optional()
})

export async function PATCH(req: Request, ctx: Ctx) {
  return guard(async () => {
    const { id } = await ctx.params
    const parsed = patch.safeParse(await readJson(req))
    if (!parsed.success) return fail(failure('unknown', { detail: 'Malformed order update' }), 400)

    const order = await owned(id)
    if (!order) {
      return fail(
        failure('unknown', { title: 'We cannot find that order', detail: `No order ${id}` }),
        404
      )
    }

    /**
     * A webhook may have arrived first. Settlement outranks anything the browser reports.
     *
     * This used to test `order.status === 'settled'`, which could never be true: `settled` is
     * derived on read from the settlement key and is never written into the order record. So the
     * guard read as protection and was doing nothing. Ask the key that actually holds the fact.
     */
    const settlement = await getSettlement(id)
    if (settlement?.transferStatus === 'Succeeded') return ok({ order: forBrowser(order) })

    const update = parsed.data
    await putOrder({
      ...order,
      status: update.status,
      paidAt: update.status === 'paid' ? Date.now() : order.paidAt,
      source: update.source ?? order.source,
      txId: update.txId ?? order.txId,
      transferId: update.transferId ?? order.transferId,
      txHash: update.txHash ?? order.txHash,
      totalAmountInFiat: update.totalAmountInFiat ?? order.totalAmountInFiat,
      failure: update.failure ?? order.failure
    })

    const saved = await getOrder(id)
    return ok({ order: saved ? forBrowser(saved) : null })
  })
}
