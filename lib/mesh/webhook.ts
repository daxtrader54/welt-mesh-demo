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
 * Mesh delivers at least once and retries on timeout or non-200. `EventId` is stable across
 * retries, `Id` changes on each attempt, so `EventId` is the only correct idempotency key.
 * Falls back to a composite when Mesh omits it rather than silently processing a duplicate.
 */
export function idempotencyKey(payload: {
  EventId?: string
  TransferId?: string
  TransferStatus?: string
}): string | null {
  if (payload.EventId) return payload.EventId
  if (payload.TransferId && payload.TransferStatus) {
    return `${payload.TransferId}:${payload.TransferStatus}`
  }
  return null
}
