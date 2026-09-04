#!/usr/bin/env node
/**
 * Prove the webhook endpoint behaves, without waiting for Mesh to send one.
 *
 * This tests our side of the contract: signature verification over the raw body, rejection of a
 * bad signature, idempotency on EventId, and whether a delivery actually moves an order to
 * settled. It does not test Mesh's delivery, which is exactly the point. When settlement does not
 * appear in a demo, this tells you in ten seconds whether the endpoint is at fault or whether
 * nothing arrived.
 *
 *   node scripts/webhook-check.mjs                                   # against localhost:3000
 *   node scripts/webhook-check.mjs https://welt-mesh-demo.vercel.app # against the deployment
 *   node scripts/webhook-check.mjs <url> WELT-1234                   # settle a real order
 *
 * The secret is read from MESH_WEBHOOK_SECRET, or from .env.local if it is not in the environment.
 */

import { createHmac, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'

const base = (process.argv[2] ?? 'http://localhost:3000').replace(/\/+$/, '')
const orderId = process.argv[3] ?? null

function secret() {
  if (process.env.MESH_WEBHOOK_SECRET) return process.env.MESH_WEBHOOK_SECRET.trim()
  try {
    const line = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
      .split(/\r?\n/)
      .find(l => l.startsWith('MESH_WEBHOOK_SECRET='))
    return line?.slice('MESH_WEBHOOK_SECRET='.length).trim() || null
  } catch {
    return null
  }
}

const WEBHOOK_SECRET = secret()
if (!WEBHOOK_SECRET) {
  console.error('No MESH_WEBHOOK_SECRET. Set it in the environment or .env.local.')
  process.exit(1)
}

const url = `${base}/api/mesh/webhook`

async function send(body, signature) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-mesh-signature-256': signature },
    body
  })
  return { status: res.status, text: (await res.text()).slice(0, 60) }
}

const sign = body => createHmac('sha256', WEBHOOK_SECRET).update(body, 'utf8').digest('base64')

// Shaped like a real Mesh transfer webhook. PascalCase, because that endpoint is unlike the rest.
const eventId = randomUUID()
const body = JSON.stringify({
  EventId: eventId,
  Id: randomUUID(),
  SentTimestamp: Math.floor(Date.now() / 1000),
  TransferId: randomUUID(),
  TransferStatus: 'Succeeded',
  TransactionId: orderId ?? 'WELT-0000',
  TxHash: 'a'.repeat(64),
  Chain: 'Ethereum',
  Token: 'USDC',
  SourceAmount: 50,
  DestinationAmount: 50,
  SourceAccountProvider: 'Coinbase'
})

const checks = []
const record = (name, pass, detail) => {
  checks.push({ name, pass, detail })
  console.log(`${pass ? ' ok ' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

console.log(`\nwebhook: ${url}\norder:   ${orderId ?? 'WELT-0000 (not a real order, settlement will not apply)'}\n`)

// 1. A correctly signed delivery is accepted.
const first = await send(body, sign(body))
record('signed delivery accepted', first.status === 200, `HTTP ${first.status} ${first.text}`)

// 2. The same EventId again is a no-op, because Mesh retries and must not settle twice.
const second = await send(body, sign(body))
record(
  'replay deduplicated on EventId',
  second.status === 200 && second.text.includes('duplicate'),
  `HTTP ${second.status} ${second.text}`
)

// 3. A wrong signature is refused.
const forged = await send(body, sign(body + ' '))
record('bad signature rejected', forged.status === 401, `HTTP ${forged.status} ${forged.text}`)

// 4. An unsigned delivery is refused.
const unsigned = await send(body, '')
record('unsigned delivery rejected', unsigned.status === 401, `HTTP ${unsigned.status} ${unsigned.text}`)

// 5. The trap this whole design exists to avoid: same data, re-serialised, different bytes.
const reserialised = JSON.stringify(JSON.parse(body), null, 2)
const tampered = await send(reserialised, sign(body))
record(
  'body must match the signed bytes exactly',
  tampered.status === 401,
  `HTTP ${tampered.status}`
)

// 6. If a real order was named, it should now be settled.
if (orderId) {
  const res = await fetch(`${base}/api/orders/${encodeURIComponent(orderId)}`)
  const json = await res.json().catch(() => null)
  const status = json?.order?.status
  record(
    `order ${orderId} moved to settled`,
    status === 'settled',
    `status=${status ?? 'not found'}`
  )
  if (status !== 'settled' && res.status === 404) {
    console.log('\n      The order does not exist. Orders live in the store for 24 hours, and')
    console.log('      without Redis they do not survive between serverless invocations at all.')
    console.log('      Check /api/health reports storage: redis.')
  }
}

const failed = checks.filter(c => !c.pass).length
console.log(`\n${checks.length - failed}/${checks.length} passed\n`)
process.exit(failed ? 1 : 0)
