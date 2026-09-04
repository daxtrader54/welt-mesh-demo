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
  it('is stable for the same session', () => {
    expect(orderNumber('abc')).toBe(orderNumber('abc'))
  })

  it('looks like an order number', () => {
    expect(orderNumber('abc')).toMatch(/^WELT-\d{4}$/)
  })
})
