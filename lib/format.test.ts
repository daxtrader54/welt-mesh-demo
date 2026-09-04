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
   * The point of the change. Two different orders used to be able to produce the same string in a
   * 10,000-value space, and that string was also the store key and Mesh's transactionId, so a
   * collision settled the wrong order.
   */
  it('does not collide across a realistic number of orders', () => {
    const ids = Array.from({ length: 5000 }, () => crypto.randomUUID())
    expect(new Set(ids.map(orderNumber)).size).toBe(ids.length)
  })
})
