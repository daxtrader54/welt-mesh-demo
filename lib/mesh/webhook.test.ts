import { describe, expect, it } from 'vitest'
import { idempotencyKey, signWebhook, verifyWebhook } from './webhook'

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
