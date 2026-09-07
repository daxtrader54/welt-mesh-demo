import { describe, expect, it } from 'vitest'
import { cannotSettle, choosableAssets } from './settlement'

const usdc = { symbol: 'USDC', amount: 8547.71 }
const usdt = { symbol: 'USDT', amount: 1149.97 }
const btc = { symbol: 'BTC', amount: 5 }
const sepolia = { symbol: 'SEPOLIAETH', amount: 0.4 }

const q = (symbol: string, eligible: boolean | null) => ({ symbol, eligible })

describe('choosableAssets', () => {
  it('offers what Mesh confirmed', () => {
    const out = choosableAssets([usdc, usdt, btc], [q('USDC', true), q('USDT', true), q('BTC', false)])
    expect(out.map(p => p.symbol)).toEqual(['USDC', 'USDT'])
  })

  /**
   * The regression this tier exists for. A quote outage once produced "Nothing in this account can
   * settle $50.00" directly above 9,397 USDC, because an unfetched quote was read as a refusal.
   */
  it('falls back to unpriced holdings when Mesh confirmed nothing', () => {
    const out = choosableAssets([usdc, btc], [q('USDC', null), q('BTC', null)])
    expect(out.map(p => p.symbol)).toEqual(['USDC', 'BTC'])
  })

  it('does not offer an unpriced holding with no balance', () => {
    expect(choosableAssets([{ symbol: 'USDC', amount: 0 }], [q('USDC', null)])).toEqual([])
  })

  it('prefers a confirmed asset over an unpriced one rather than mixing them', () => {
    const out = choosableAssets([usdc, btc], [q('USDC', true), q('BTC', null)])
    expect(out.map(p => p.symbol)).toEqual(['USDC'])
  })
})

describe('cannotSettle', () => {
  /**
   * Narrow on purpose. This drives whether the checkout replaces its Pay button, so it may only be
   * true when Mesh has actually answered and left nothing to choose.
   */
  it('is unknown while the quotes are still loading', () => {
    expect(cannotSettle([usdc], null)).toBe(false)
    expect(cannotSettle([], null)).toBe(false)
  })

  it('is false when something can pay', () => {
    expect(cannotSettle([usdc], [q('USDC', true)])).toBe(false)
  })

  it('is false when the quotes failed, because unknown is not a refusal', () => {
    expect(cannotSettle([usdc], [q('USDC', null)])).toBe(false)
  })

  /** A wallet holding Sepolia ETH against a mainnet merchant. Mesh answered, and the answer is no. */
  it('is true when Mesh answered and nothing is eligible', () => {
    expect(cannotSettle([sepolia], [q('USDC', false), q('USDT', false), q('PYUSD', false)])).toBe(true)
  })

  it('is true for an account holding nothing at all', () => {
    expect(cannotSettle([], [q('USDC', false)])).toBe(true)
  })
})
