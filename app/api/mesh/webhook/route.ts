import { meshEnv } from '@/lib/env'
import { webhookPayload } from '@/lib/mesh/schemas'
import { SIGNATURE_HEADER, checkAgainstOrder, idempotencyKey, verifyWebhook } from '@/lib/mesh/webhook'
import { claimWebhookEvent, getOrder, putSettlement } from '@/lib/store/records'

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

  // Everything from here is inside a try: this is the one route with no `guard()` wrapper, and a
  // missing environment variable or a malformed body should not become an unstructured 500 that
  // Mesh then retries forever.
  try {
    const env = meshEnv()

    const verified = verifyWebhook(raw, req.headers.get(SIGNATURE_HEADER), env.webhookSecret)
    if (!verified.ok) {
      console.warn('[welt] webhook rejected:', verified.reason)
      // 401 rather than 400: this is an authentication failure, and Mesh should not retry it into
      // a state where we silently accept unsigned traffic. The reason stays in the log rather than
      // the body, so an unauthenticated caller cannot learn how the deployment is configured.
      return new Response(null, { status: 401 })
    }

    return await handle(raw)
  } catch (err) {
    console.error('[welt] webhook handler failed', err)
    // 503 so Mesh retries. A 500 here would also retry, but this says why.
    return new Response(null, { status: 503 })
  }
}

async function handle(raw: string): Promise<Response> {
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return new Response('unparseable', { status: 400 })
  }

  const parsed = webhookPayload.safeParse(body)
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

  // A replay of an event already applied is expected under at-least-once delivery, not an error.
  if (!(await claimWebhookEvent(key, true))) {
    return new Response('duplicate', { status: 200 })
  }

  const orderId = payload.TransactionId
  if (!orderId) {
    console.warn('[welt] webhook without a transaction id, ignored')
    return new Response('ok', { status: 200 })
  }

  /**
   * Check the delivery against the order before believing it.
   *
   * The amount, token and destination arrive on this payload and were parsed and discarded, so
   * "Succeeded" was taken entirely on trust. Now they are compared with what the merchant asked
   * for, and the result is recorded either way, so the panel can show the check rather than assert
   * it. An order that cannot be loaded leaves `checked` empty, which is the honest record of a
   * comparison that did not happen; refusing to settle on that basis would be worse than settling.
   */
  const order = await getOrder(orderId)
  const verification = order
    ? checkAgainstOrder(payload, order)
    : { checked: [], mismatches: [], blocking: false }

  // `checkAgainstOrder` decides what is serious enough to refuse on: a wrong destination or a
  // wrong amount. A token naming difference, or an amount so far out that it reads as a different
  // unit, is recorded and surfaced instead, because our own assumption being wrong must not be
  // able to refuse a real settlement.
  if (verification.mismatches.length) {
    console.warn('[welt] webhook does not match the order', { orderId, ...verification })
  }

  /**
   * Written to its own key, never merged into the order record.
   *
   * The browser also writes that record, and both paths were doing read-modify-write with no
   * compare-and-swap, so a webhook landing between the browser's read and its write vanished along
   * with the whole reconciliation trail. One writer per fact removes the race instead of narrowing
   * it, and it means the settlement survives whatever the browser does afterwards.
   *
   * `?? undefined` on the optional fields because the payload is nullish throughout: Mesh's
   * contract allows an explicit null, and the record only wants the value or nothing.
   */
  await putSettlement(orderId, {
    eventId: key,
    // `Unverified` ranks below every real status, so this records what arrived without ever
    // displacing a settlement that checked out.
    transferStatus: verification.blocking ? 'Unverified' : (payload.TransferStatus ?? ''),
    receivedAt: Date.now(),
    txHash: payload.TxHash ?? undefined,
    transferId: payload.TransferId ?? undefined,
    verification
  })

  /**
   * Claimed only after the write succeeds. Claiming first meant a delivery that arrived before its
   * order existed, or a write that threw, burned the EventId and Mesh's retry was answered
   * "duplicate" — losing the settlement permanently and silently.
   */
  await claimWebhookEvent(key)

  return new Response('ok', { status: 200 })
}
