import 'server-only'
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
  id: string
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
export async function claimWebhookEvent(eventId: string): Promise<boolean> {
  return store().setIfAbsent(webhookKey(eventId), { at: Date.now() }, WEBHOOK_TTL)
}

/** Link tokens are real Mesh resources. This stops a stuck client minting them in a loop. */
export async function underRateLimit(sid: string, max = 20): Promise<boolean> {
  const n = await store().incr(`rate:${sid}`, RATE_TTL)
  return n <= max
}
