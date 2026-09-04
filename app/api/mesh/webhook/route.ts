import { meshEnv } from '@/lib/env'
import { webhookPayload } from '@/lib/mesh/schemas'
import { SIGNATURE_HEADER, idempotencyKey, verifyWebhook } from '@/lib/mesh/webhook'
import { claimWebhookEvent, getOrder, putOrder } from '@/lib/store/records'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The only authority on settlement.
 *
 * The browser's `transferCompleted` says the provider acknowledged the transfer. It does not say
 * the merchant has been paid, and a merchant should never take the customer's browser at its word
 * for that. This route is what moves an order to settled, and nothing else does.
 *
 * Three things matter here and they are all easy to get wrong:
 *  1. Hash the raw bytes. `req.text()` first, parse after. Re-serialising the JSON changes the
 *     digest and every delivery fails for reasons that look like a key problem.
 *  2. Deduplicate on EventId, which is stable across retries. `Id` changes per attempt.
 *  3. Answer fast. Mesh wants a 200 inside 200ms, so the work here is one read and one write.
 */
export async function POST(req: Request) {
  const raw = await req.text()
  const env = meshEnv()

  const verified = verifyWebhook(raw, req.headers.get(SIGNATURE_HEADER), env.webhookSecret)
  if (!verified.ok) {
    console.warn('[welt] webhook rejected:', verified.reason)
    // 401 rather than 400: this is an authentication failure, and Mesh should not retry it
    // into a state where we silently accept unsigned traffic.
    return new Response(verified.reason, { status: 401 })
  }

  const parsed = webhookPayload.safeParse(JSON.parse(raw))
  if (!parsed.success) {
    console.warn('[welt] webhook payload did not parse')
    return new Response('unparseable', { status: 400 })
  }

  const payload = parsed.data
  const key = idempotencyKey(payload)
  if (!key) {
    // Nothing to deduplicate on. Acknowledge so Mesh stops retrying, but do not act.
    console.warn('[welt] webhook without EventId or transfer identity, ignored')
    return new Response('ok', { status: 200 })
  }

  if (!(await claimWebhookEvent(key))) {
    // Already handled. At-least-once delivery means this is expected, not an error.
    return new Response('duplicate', { status: 200 })
  }

  const orderId = payload.TransactionId
  if (orderId) {
    const order = await getOrder(orderId)
    if (order) {
      const status = payload.TransferStatus ?? ''
      const settled = status === 'Succeeded'
      const failed = status === 'Failed'

      await putOrder({
        ...order,
        status: settled ? 'settled' : failed ? 'failed' : order.status,
        settledAt: settled ? Date.now() : order.settledAt,
        txHash: payload.TxHash ?? order.txHash,
        transferId: payload.TransferId ?? order.transferId,
        webhook: {
          eventId: key,
          transferStatus: status,
          receivedAt: Date.now(),
          txHash: payload.TxHash
        }
      })
    } else {
      console.warn('[welt] webhook for unknown order', orderId)
    }
  }

  return new Response('ok', { status: 200 })
}
