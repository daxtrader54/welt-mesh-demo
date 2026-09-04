import 'server-only'
import { isRefundStatus, settlementStanding } from '@/lib/mesh/webhook'
import { store } from './index'

/**
 * What the server keeps, and for how long.
 *
 * The Coinbase auth token lives here and nowhere else. It arrives in the browser because that is
 * how the SDK hands it over, gets posted straight to the server, and is never sent back down.
 * TTL follows the token's own `expiresInSeconds` so we are not holding a credential longer than
 * it is valid for.
 */

const SESSION_TTL = 60 * 60 * 4 // 4 hours, or the token's own lifetime if shorter
const ORDER_TTL = 60 * 60 * 24
const WEBHOOK_TTL = 60 * 60 * 24
const RATE_TTL = 60

export type Connection = {
  /** Stable across token refresh. Passed back to Link to skip re-authentication. */
  tokenId: string | null
  brokerType: string
  brokerName: string
  /** Mesh's own id for the account. Replayed into `accessTokens`, which wants it populated. */
  accountId: string | null
  accountName: string | null
  /** Never leaves the server. Never logged. Never rendered. */
  authToken: string
  connectedAt: number
  expiresAt: number | null
}

export type SessionRecord = {
  userId: string
  createdAt: number
  connections: Connection[]
}

export type OrderStatus = 'created' | 'paid' | 'settled' | 'failed'

export type OrderRecord = {
  /** A UUID. The store key, and the `transactionId` Mesh returns on the webhook. */
  id: string
  /** What the customer sees and reads out. Derived from the id, carries no meaning. */
  reference: string
  /**
   * The session that created this order. Both order routes check it, because without it any
   * caller who knew or guessed an id could read an order and stamp it paid.
   */
  sid: string
  createdAt: number
  status: OrderStatus
  /** What was bought. */
  colourway: string
  colourwayRef: string
  size: string
  /** What was asked for. Fixed by the merchant, never taken from the browser. */
  amount: number
  symbol: string
  networkId: string
  destination: string
  /** What actually happened, filled in from SDK events. */
  paidAt?: number
  source?: string
  txId?: string
  transferId?: string
  txHash?: string
  totalAmountInFiat?: number
  /** Filled in from a verified webhook, and only from there. */
  settledAt?: number
  webhook?: {
    eventId: string
    transferStatus: string
    receivedAt: number
    txHash?: string
  }
  failure?: { code: string; detail?: string }
}

const sessionKey = (sid: string) => `session:${sid}`
const orderKey = (id: string) => `order:${id}`
const webhookKey = (eventId: string) => `webhook:${eventId}`

export async function getSession(sid: string): Promise<SessionRecord | null> {
  return store().get<SessionRecord>(sessionKey(sid))
}

export async function putSession(sid: string, record: SessionRecord): Promise<void> {
  const shortest = record.connections
    .map(c => (c.expiresAt ? Math.floor((c.expiresAt - Date.now()) / 1000) : SESSION_TTL))
    .filter(s => s > 0)
  const ttl = shortest.length ? Math.min(SESSION_TTL, ...shortest) : SESSION_TTL
  await store().set(sessionKey(sid), record, Math.max(ttl, 60))
}

export async function clearSession(sid: string): Promise<void> {
  await store().del(sessionKey(sid))
}

/**
 * Forget one provider's connection, keeping the session and any others.
 *
 * Called when Mesh refuses the stored token. Leaving a dead connection on file is what put a
 * returning shopper in a loop: the shop kept offering "already connected, no sign-in this time",
 * the holdings call kept failing, and nothing on screen would clear it. Note this deliberately
 * does not call Mesh's remove-connection endpoint, which permanently revokes a tokenId. The token
 * is already useless to us; there is no need to destroy it at Mesh's end too.
 */
export async function dropConnection(sid: string, brokerType: string): Promise<void> {
  const session = await getSession(sid)
  if (!session) return
  await putSession(sid, {
    ...session,
    connections: session.connections.filter(c => c.brokerType !== brokerType)
  })
}

export async function getOrder(id: string): Promise<OrderRecord | null> {
  return store().get<OrderRecord>(orderKey(id))
}

export async function putOrder(record: OrderRecord): Promise<void> {
  await store().set(orderKey(record.id), record, ORDER_TTL)
}

/**
 * Returns false when this event has already been handled. `EventId` is stable across Mesh's
 * retries, so a duplicate delivery is a no-op rather than a second state change.
 */
export async function claimWebhookEvent(eventId: string, peek = false): Promise<boolean> {
  if (peek) {
    // Look without taking it, so the key is only consumed once the work has actually succeeded.
    return (await store().get(webhookKey(eventId))) === null
  }
  return store().setIfAbsent(webhookKey(eventId), { at: Date.now() }, WEBHOOK_TTL)
}

/**
 * Link tokens are real Mesh resources, so a stuck client should not mint them in a loop.
 *
 * Fails open. A rate limiter is a courtesy to Mesh; it must never be the reason a customer cannot
 * pay, so a store outage lets the request through rather than blocking it.
 */
export async function underRateLimit(sid: string, max = 20): Promise<boolean> {
  try {
    const n = await store().incr(`rate:${sid}`, RATE_TTL)
    return n <= max
  } catch {
    return true
  }
}

/**
 * Settlement lives in its own key, written only by the webhook and never touched by the browser.
 *
 * The order record has two writers doing read-modify-write with no compare-and-swap, so a webhook
 * landing between the browser's read and its write was silently erased along with the whole
 * reconciliation trail. One writer per fact removes the race rather than narrowing it.
 */
export type SettlementRecord = {
  eventId: string
  transferStatus: string
  receivedAt: number
  txHash?: string
  transferId?: string
  /**
   * What the delivery claimed, checked against what was ordered. Absent on records written before
   * the check existed, which is why every reader treats it as optional rather than assuming.
   */
  verification?: {
    checked: string[]
    mismatches: string[]
  }
}

const settlementKey = (orderId: string) => `settlement:${orderId}`
const refundKey = (orderId: string) => `refund:${orderId}`

export async function putSettlement(orderId: string, record: SettlementRecord): Promise<void> {
  const refund = isRefundStatus(record.transferStatus)
  const key = refund ? refundKey(orderId) : settlementKey(orderId)

  const held = await store().get<SettlementRecord>(key)
  if (held) {
    // Refunds have no ordering of their own worth defending, so the latest one stands.
    if (!refund) {
      if (settlementStanding(record.transferStatus) < settlementStanding(held.transferStatus)) return
      if (settlementStanding(record.transferStatus) === settlementStanding(held.transferStatus)) {
        // Same standing, so the first delivery keeps the timestamp it settled at. A later one only
        // fills in what the first was missing, which is usually the transaction hash.
        await store().set(
          key,
          { ...held, txHash: held.txHash ?? record.txHash, transferId: held.transferId ?? record.transferId },
          ORDER_TTL
        )
        return
      }
    }
  }

  await store().set(key, record, ORDER_TTL)
}

export async function getSettlement(orderId: string): Promise<SettlementRecord | null> {
  return store().get<SettlementRecord>(settlementKey(orderId))
}

export async function getRefund(orderId: string): Promise<SettlementRecord | null> {
  return store().get<SettlementRecord>(refundKey(orderId))
}
