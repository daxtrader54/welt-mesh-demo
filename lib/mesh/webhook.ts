import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Mesh signs webhooks as base64 HMAC-SHA256 over the raw request body, in `X-Mesh-Signature-256`.
 *
 * The trap, and Mesh's docs call it out: you must hash the bytes exactly as they arrived.
 * Parsing JSON and re-serialising changes key order and whitespace, the digest changes, and every
 * delivery fails verification for reasons that look nothing like the cause. So this function takes
 * a string, never an object, and the route reads `await req.text()` before anything else.
 */

export const SIGNATURE_HEADER = 'x-mesh-signature-256'

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: 'no_secret' | 'no_signature' | 'mismatch' | 'malformed' }

export function signWebhook(rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64')
}

export function verifyWebhook(
  rawBody: string,
  signature: string | null | undefined,
  secret: string | null | undefined
): VerifyResult {
  if (!secret) return { ok: false, reason: 'no_secret' }
  if (!signature) return { ok: false, reason: 'no_signature' }

  const expected = Buffer.from(signWebhook(rawBody, secret), 'utf8')

  let received: Buffer
  try {
    received = Buffer.from(signature, 'utf8')
  } catch {
    return { ok: false, reason: 'malformed' }
  }

  // timingSafeEqual throws on a length mismatch, which is itself a mismatch.
  if (received.length !== expected.length) return { ok: false, reason: 'mismatch' }
  return timingSafeEqual(received, expected) ? { ok: true } : { ok: false, reason: 'mismatch' }
}

/**
 * A refund is what happened after settlement, not a replacement for it.
 *
 * Kept apart because it was overwriting the settlement it followed: a `RefundPending` landing on a
 * settled order dropped it back to `created`, so a receipt for a payment that genuinely succeeded
 * stopped saying so.
 */
export function isRefundStatus(status: string): boolean {
  return status === 'RefundPending' || status === 'RefundSucceeded' || status === 'RefundFailed'
}

/**
 * Where a delivery's status ranks. Higher wins, and nothing ever moves backwards.
 *
 * Mesh delivers at least once, and its own log shows two deliveries per transfer as the norm,
 * about 24 seconds apart and not always in chronological order. Storing whichever arrived last
 * meant a late `Pending` un-settled an order that had already succeeded, while the browser's poll
 * had stopped looking and left the receipt claiming otherwise.
 *
 * Anything unrecognised ranks 0: recorded when there is nothing to displace, never displacing.
 */
export function settlementStanding(status: string): number {
  if (status === 'Succeeded') return 3
  if (status === 'Failed') return 2
  if (status === 'Pending') return 1
  return 0
}

export type SettlementCheck = {
  /** Which facts the delivery carried and were therefore compared. */
  checked: string[]
  /** Human-readable descriptions of anything that did not match. Empty is the good case. */
  mismatches: string[]
  /** Whether a mismatch is serious enough to refuse settlement on. */
  blocking: boolean
}

/**
 * Above this multiple, an amount is read as a different unit rather than a different amount.
 *
 * The one way an amount check can be wrong in a way that matters is if Mesh sends the value in
 * token base units: 50 USDC would arrive as 50000000 and every genuine settlement would be
 * refused, on stage, for a payment that worked. Live `transfers/managed/mesh` returns
 * `destinationAmount: 50` for a $50 order, so whole units is almost certainly right, but "almost
 * certainly" is not something to bet a demo on when the cost of being wrong is asymmetric.
 *
 * A hundredfold covers every plausible decimal convention (6 and 18 decimals are 10^6 and 10^18
 * out) while a fraudulent amount is a small multiple: the $1-against-$50 case is fifty times, and
 * it blocks.
 */
const UNIT_SCALE_FACTOR = 100

/**
 * Does this delivery describe the order it says it does?
 *
 * The route used to mark an order paid on `TransferStatus === 'Succeeded'` alone. The amount, the
 * token and the destination address all arrive on the same payload and were parsed and thrown
 * away, so nothing ever compared what Mesh said had happened with what the merchant had asked for.
 * Not exploitable here, because those three values are bound into the link token server side and
 * only Mesh can sign a delivery. It is worth doing anyway: a merchant's security person asks "so a
 * $1 transfer against my $50 order marks it paid?" and the answer should be no, with the check on
 * screen.
 *
 * Fields Mesh omits are not treated as failures. You cannot verify what you were not sent, and
 * inventing a mismatch out of an absent field would stop real settlements.
 *
 * The amount tolerance is one percent or one cent, whichever is larger. That absorbs the rounding
 * and the FX wobble that made `totalAmountInFiat` return both 50 and 50.01 for the same transfer,
 * and still catches anything meaningfully different from what was ordered.
 */
export function checkAgainstOrder(
  payload: {
    DestinationAmount?: number | null
    Token?: string | null
    DestinationAddress?: string | null
  },
  order: { amount: number; symbol: string; destination: string }
): SettlementCheck {
  const checked: string[] = []
  const mismatches: string[] = []
  let blocking = false

  if (typeof payload.DestinationAmount === 'number') {
    checked.push('amount')
    const amount = payload.DestinationAmount
    const tolerance = Math.max(0.01, Math.abs(order.amount) * 0.01)
    if (Math.abs(amount - order.amount) > tolerance) {
      const offBy = order.amount === 0 ? Infinity : Math.abs(amount / order.amount)
      const unitScale = offBy >= UNIT_SCALE_FACTOR || offBy <= 1 / UNIT_SCALE_FACTOR
      mismatches.push(
        unitScale
          ? `amount ${amount}, ordered ${order.amount}, off by a factor that reads as a different unit`
          : `amount ${amount}, ordered ${order.amount}`
      )
      // A wrong amount blocks. An amount that is orders of magnitude out is our unit assumption
      // being wrong, not a fraudulent payment, and refusing a real settlement over it is worse.
      if (!unitScale) blocking = true
    }
  }

  if (payload.Token) {
    checked.push('token')
    if (payload.Token.toUpperCase() !== order.symbol.toUpperCase()) {
      // Recorded, not blocking. Mesh could reasonably call USDC "USD Coin" without anything being
      // wrong, and the destination and amount are the two that decide whether the merchant was paid.
      mismatches.push(`token ${payload.Token}, ordered ${order.symbol}`)
    }
  }

  if (payload.DestinationAddress) {
    checked.push('destination')
    // Case-insensitive: the same address turns up checksummed and lowercased.
    if (payload.DestinationAddress.toLowerCase() !== order.destination.toLowerCase()) {
      mismatches.push(`destination ${payload.DestinationAddress}, ordered ${order.destination}`)
      // No interpretation available on a string comparison of an address. Money arriving somewhere
      // other than the merchant's wallet is not a settlement of this order, whatever the status says.
      blocking = true
    }
  }

  return { checked, mismatches, blocking }
}

/**
 * Mesh delivers at least once and retries on timeout or non-200. `EventId` is stable across
 * retries, `Id` changes on each attempt, so `EventId` is the only correct idempotency key.
 * Falls back to a composite when Mesh omits it rather than silently processing a duplicate.
 */
export function idempotencyKey(payload: {
  EventId?: string | null
  TransferId?: string | null
  TransferStatus?: string | null
}): string | null {
  if (payload.EventId) return payload.EventId
  if (payload.TransferId && payload.TransferStatus) {
    return `${payload.TransferId}:${payload.TransferStatus}`
  }
  return null
}
