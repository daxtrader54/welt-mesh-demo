import { z } from 'zod'
import { failure } from '@/lib/failure'
import { fail, guard, ok, readJson } from '@/lib/http'
import { getOrder, getSettlement, putOrder } from '@/lib/store/records'

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
export async function GET(_req: Request, ctx: Ctx) {
  return guard(async () => {
    const { id } = await ctx.params
    const [order, settlement] = await Promise.all([getOrder(id), getSettlement(id)])
    if (!order) {
      return fail(
        failure('unknown', { title: 'We cannot find that order', detail: `No order ${id}` }),
        404
      )
    }

    // Settlement is the webhook's fact and lives in its own key, so it is merged on read rather
    // than written into a record the browser also updates.
    const settled = settlement?.transferStatus === 'Succeeded'
    const refunded =
      settlement?.transferStatus === 'RefundSucceeded' ||
      settlement?.transferStatus === 'RefundPending'

    return ok({
      order: {
        ...order,
        status: settled ? 'settled' : settlement?.transferStatus === 'Failed' ? 'failed' : order.status,
        settledAt: settled ? settlement?.receivedAt : order.settledAt,
        txHash: settlement?.txHash ?? order.txHash,
        refundStatus: refunded ? settlement?.transferStatus : undefined,
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

    const order = await getOrder(id)
    if (!order) return fail(failure('unknown', { detail: `No order ${id}` }), 404)

    // A webhook may have arrived first. Settlement outranks anything the browser reports.
    if (order.status === 'settled') return ok({ order })

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
    return ok({ order: saved })
  })
}
