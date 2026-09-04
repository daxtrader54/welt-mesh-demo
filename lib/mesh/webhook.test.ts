import { describe, expect, it } from 'vitest'
import {
  checkAgainstOrder,
  idempotencyKey,
  isRefundStatus,
  settlementStanding,
  signWebhook,
  verifyWebhook
} from './webhook'

const SECRET = 'whsec_test_9f3a'
const BODY = '{"EventId":"evt_1","TransferId":"tr_1","TransferStatus":"Succeeded"}'

describe('verifyWebhook', () => {
  it('accepts a signature it produced', () => {
    expect(verifyWebhook(BODY, signWebhook(BODY, SECRET), SECRET)).toEqual({ ok: true })
  })

  it('rejects a body that has been altered by a single character', () => {
    const signature = signWebhook(BODY, SECRET)
    const tampered = BODY.replace('Succeeded', 'succeeded')
    expect(verifyWebhook(tampered, signature, SECRET).ok).toBe(false)
  })

  it('rejects a signature made with a different secret', () => {
    expect(verifyWebhook(BODY, signWebhook(BODY, 'whsec_other'), SECRET).ok).toBe(false)
  })

  /**
   * The failure this guards against: parsing the body and re-serialising it before hashing.
   * Same data, different bytes, and every delivery fails for reasons that look unrelated.
   */
  it('rejects a re-serialised body even though the data is identical', () => {
    const signature = signWebhook(BODY, SECRET)
    const reserialised = JSON.stringify(JSON.parse(BODY), null, 2)
    expect(JSON.parse(reserialised)).toEqual(JSON.parse(BODY))
    expect(verifyWebhook(reserialised, signature, SECRET).ok).toBe(false)
  })

  it('reports why it refused, so the drawer can say something useful', () => {
    expect(verifyWebhook(BODY, signWebhook(BODY, SECRET), null)).toEqual({
      ok: false,
      reason: 'no_secret'
    })
    expect(verifyWebhook(BODY, null, SECRET)).toEqual({ ok: false, reason: 'no_signature' })
    expect(verifyWebhook(BODY, 'short', SECRET)).toEqual({ ok: false, reason: 'mismatch' })
  })

  it('does not throw when the signature length differs', () => {
    expect(() => verifyWebhook(BODY, 'a', SECRET)).not.toThrow()
    expect(() => verifyWebhook(BODY, 'a'.repeat(500), SECRET)).not.toThrow()
  })
})

describe('idempotencyKey', () => {
  it('uses EventId, which is stable across retries', () => {
    expect(idempotencyKey({ EventId: 'evt_1', TransferId: 'tr_1', TransferStatus: 'Succeeded' })).toBe('evt_1')
  })

  it('falls back to transfer and status when EventId is absent', () => {
    expect(idempotencyKey({ TransferId: 'tr_1', TransferStatus: 'Pending' })).toBe('tr_1:Pending')
  })

  it('distinguishes two statuses for the same transfer', () => {
    const pending = idempotencyKey({ TransferId: 'tr_1', TransferStatus: 'Pending' })
    const succeeded = idempotencyKey({ TransferId: 'tr_1', TransferStatus: 'Succeeded' })
    expect(pending).not.toBe(succeeded)
  })

  it('returns null rather than inventing a key it cannot trust', () => {
    expect(idempotencyKey({})).toBeNull()
    expect(idempotencyKey({ TransferId: 'tr_1' })).toBeNull()
  })
})

describe('checkAgainstOrder', () => {
  const ORDER = {
    amount: 50,
    symbol: 'USDC',
    destination: '0x0Ff0000f0A0f0000F0F000000000ffFf00f0F0f0'
  }

  it('passes a delivery that matches what was ordered', () => {
    const result = checkAgainstOrder(
      { DestinationAmount: 50, Token: 'USDC', DestinationAddress: ORDER.destination },
      ORDER
    )
    expect(result.mismatches).toEqual([])
    expect(result.blocking).toBe(false)
    expect(result.checked).toEqual(['amount', 'token', 'destination'])
  })

  /** The question a merchant's security person actually asks. */
  it('refuses a $1 transfer against a $50 order', () => {
    const result = checkAgainstOrder({ DestinationAmount: 1 }, ORDER)
    expect(result.mismatches).toHaveLength(1)
    expect(result.mismatches[0]).toContain('amount 1')
    expect(result.blocking).toBe(true)
  })

  /**
   * The one way this check could be wrong in a way that matters: if Mesh sent base units, every
   * genuine settlement would be refused. Orders of magnitude out is our assumption being wrong,
   * not a fraudulent payment, so it is recorded rather than blocking.
   */
  it('does not refuse an amount that is orders of magnitude out', () => {
    const baseUnits = checkAgainstOrder({ DestinationAmount: 50_000_000 }, ORDER)
    expect(baseUnits.mismatches).toHaveLength(1)
    expect(baseUnits.mismatches[0]).toContain('different unit')
    expect(baseUnits.blocking).toBe(false)
  })

  it('refuses money going to an address the merchant did not ask for', () => {
    const result = checkAgainstOrder({ DestinationAddress: '0xdeadbeef' }, ORDER)
    expect(result.mismatches[0]).toMatch(/^destination /)
    expect(result.blocking).toBe(true)
  })

  it('records a wrong token without refusing on it', () => {
    const result = checkAgainstOrder({ Token: 'DOGE' }, ORDER)
    expect(result.mismatches).toHaveLength(1)
    expect(result.blocking).toBe(false)
  })

  /**
   * `totalAmountInFiat` returned both 50 and 50.01 for one transfer during the build, so a
   * tolerance is not optional. One percent of $50 absorbs that and still fails a $1 transfer.
   */
  it('tolerates the rounding wobble the sandbox actually produces', () => {
    expect(checkAgainstOrder({ DestinationAmount: 50.01 }, ORDER).mismatches).toEqual([])
    expect(checkAgainstOrder({ DestinationAmount: 49.6 }, ORDER).mismatches).toEqual([])
    expect(checkAgainstOrder({ DestinationAmount: 45 }, ORDER).mismatches).toHaveLength(1)
  })

  it('treats the same address in a different case as the same address', () => {
    const lower = ORDER.destination.toLowerCase()
    expect(checkAgainstOrder({ DestinationAddress: lower }, ORDER).mismatches).toEqual([])
    expect(checkAgainstOrder({ Token: 'usdc' }, ORDER).mismatches).toEqual([])
  })

  /** You cannot verify what you were not sent. An absent field is not a failed check. */
  it('does not invent a mismatch out of a field Mesh omitted', () => {
    const result = checkAgainstOrder({}, ORDER)
    expect(result.mismatches).toEqual([])
    expect(result.checked).toEqual([])
  })

  it('treats an explicit null the same as an absent field', () => {
    const result = checkAgainstOrder(
      { DestinationAmount: null, Token: null, DestinationAddress: null },
      ORDER
    )
    expect(result.mismatches).toEqual([])
    expect(result.checked).toEqual([])
  })
})

describe('settlementStanding', () => {
  /**
   * The bug this exists to stop: Mesh sends two deliveries per transfer, not always in
   * chronological order, and a plain last-write-wins let a late Pending un-settle a paid order.
   */
  it('never lets a later Pending outrank a Succeeded', () => {
    expect(settlementStanding('Pending')).toBeLessThan(settlementStanding('Succeeded'))
  })

  it('never lets a later Failed outrank a Succeeded', () => {
    expect(settlementStanding('Failed')).toBeLessThan(settlementStanding('Succeeded'))
  })

  it('ranks anything it does not recognise below everything it does', () => {
    expect(settlementStanding('Unverified')).toBe(0)
    expect(settlementStanding('')).toBe(0)
    expect(settlementStanding('Unverified')).toBeLessThan(settlementStanding('Pending'))
  })
})

describe('isRefundStatus', () => {
  it('separates the refund events from the settlement ones', () => {
    expect(isRefundStatus('RefundPending')).toBe(true)
    expect(isRefundStatus('RefundSucceeded')).toBe(true)
    expect(isRefundStatus('Succeeded')).toBe(false)
    expect(isRefundStatus('Pending')).toBe(false)
  })
})
