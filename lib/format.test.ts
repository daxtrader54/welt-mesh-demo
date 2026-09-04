import { describe, expect, it } from 'vitest'
import { maskToken, orderNumber, token, truncate, usd } from './format'

describe('usd', () => {
  it('always shows two places, because a price with one looks broken', () => {
    expect(usd(50)).toBe('$50.00')
    expect(usd(50.01)).toBe('$50.01')
    expect(usd(64)).toBe('$64.00')
  })

  it('shows a dash rather than NaN when a value is missing', () => {
    expect(usd(null)).toBe('—')
    expect(usd(undefined)).toBe('—')
    expect(usd(Number.NaN)).toBe('—')
  })
})

describe('token', () => {
  /** Real sandbox balance. Rounding it to two places makes crypto look like fiat. */
  it('trims the long tail on a large balance', () => {
    expect(token(9949.47591718333, 'USDC')).toBe('9949.48 USDC')
  })

  it('keeps precision on small amounts', () => {
    expect(token(0.01, 'USDC')).toBe('0.01 USDC')
    expect(token(0.000292375, 'BLAST')).toBe('0.00029237 BLAST')
  })

  it('does not leave trailing zeros behind', () => {
    expect(token(7, 'ETH')).toBe('7 ETH')
    expect(token(50, 'USDC')).toBe('50 USDC')
  })

  it('works without a symbol', () => {
    expect(token(5)).toBe('5')
    expect(token(null)).toBe('—')
  })
})

describe('truncate', () => {
  it('shortens a hash but keeps both ends recognisable', () => {
    expect(truncate('599f887207b2cf9b434fd692a7b72e98b0e936669ebc5b3e1d32669c867a00dc')).toBe('599f88…7a00dc')
  })

  it('leaves short values alone', () => {
    expect(truncate('USDC')).toBe('USDC')
  })
})

describe('maskToken', () => {
  /** The auth token must never be readable, but the drawer should prove one arrived. */
  it('hides the middle of a token', () => {
    const masked = maskToken('e9267024-6a3e-403a-989e-098d13d17045')
    expect(masked).not.toContain('6a3e')
    expect(masked.startsWith('e926')).toBe(true)
    expect(masked.endsWith('7045')).toBe(true)
  })
})

describe('orderNumber', () => {
  const ID = '3f9a2c10-7b5e-4d21-9c8a-0e1f2a3b4c5d'

  it('is derived from the order id, so the same order always reads the same', () => {
    expect(orderNumber(ID)).toBe(orderNumber(ID))
  })

  it('is short enough to read out on a call', () => {
    expect(orderNumber(ID)).toBe('WELT-3F9A2C')
    expect(orderNumber(ID)).toMatch(/^WELT-[0-9A-F]{6}$/)
  })

  /**
   * The point of the change, stated precisely.
   *
   * The old id was a 32-bit hash reduced modulo 10,000, and it was simultaneously the display
   * number, the store key and Mesh's transactionId, so two orders colliding meant one silently
   * overwriting the other and the webhook settling the wrong one. That is fixed by the id being a
   * UUID, not by this label.
   *
   * The label is only a label. Six hex characters is 16.7 million values, so it will collide
   * eventually, and when it does nothing breaks: two orders that never meet share a string a human
   * reads aloud. What matters is that it is rare across the 24 hour window an order actually lives
   * for, which at a few hundred orders is comfortably under a tenth of a percent.
   */
  it('is effectively unique across a day of orders', () => {
    const ids = Array.from({ length: 300 }, () => crypto.randomUUID())
    expect(new Set(ids.map(orderNumber)).size).toBe(ids.length)
  })

  it('is a label, not the key: the id is what identifies an order', () => {
    const a = '3f9a2c10-0000-4000-8000-000000000001'
    const b = '3f9a2c10-ffff-4fff-8fff-ffffffffffff'
    // Same reference, different orders. Harmless, because the store and Mesh both key on the id.
    expect(orderNumber(a)).toBe(orderNumber(b))
    expect(a).not.toBe(b)
  })
})
