import { describe, expect, it } from 'vitest'
import { mapProviders, suggestProvider } from './providers'

/**
 * Fixtures trimmed from real sandbox responses. The shapes differ between the two endpoints on
 * purpose: that difference is what this file exists to pin down.
 */

const ETHEREUM = 'e3c7fdd8-b1fc-4e51-85ae-bb276e075611'
const SETTLEMENT = { networkId: ETHEREUM, symbol: 'USDC', network: 'Ethereum' }

const ethereum = { id: ETHEREUM, name: 'Ethereum', chainId: '1', supportedTokens: ['USDC', 'ETH'] }
const sepolia = { id: '11155111-x', name: 'Sepolia', chainId: '11155111', supportedTokens: ['PYUSD'] }

/** From GET /api/v1/transfers/managed/integrations — 13 rows, keyed `content.integrations`. */
const CAPABLE = [
  { id: 'a1', name: 'Coinbase', type: 'sandboxCoinbase', supportsOutgoingTransfers: true, networks: [ethereum] },
  { id: 'a2', name: 'Coinbase', type: 'coinbase', supportsOutgoingTransfers: true, networks: [ethereum] },
  { id: 'a3', name: 'Coinbase', type: 'coinbaseRamp', supportsOutgoingTransfers: true, networks: [ethereum] },
  { id: 'b1', name: 'Binance', type: 'sandbox', supportsOutgoingTransfers: true, networks: [ethereum] },
  { id: 'k1', name: 'Kraken', type: 'krakenOAuth', supportsOutgoingTransfers: true, networks: [ethereum] },
  { id: 'm1', name: 'MetaMask', type: 'deFiWallet', supportsOutgoingTransfers: true, networks: [sepolia] }
]

/** From GET /api/v1/integrations — 5 rows, keyed `content.items`. */
const OFFERED = [
  { id: 'b1', name: 'Binance', type: 'sandbox' },
  { id: 'a1', name: 'Coinbase', type: 'sandboxCoinbase' },
  { id: 'm1', name: 'MetaMask', type: 'deFiWallet' }
]

const byType = (type: string) => mapProviders(CAPABLE, OFFERED, SETTLEMENT).find(p => p.type === type)!

describe('mapProviders', () => {
  /**
   * The regression this file was written for. Reading `content.integrations` from the availability
   * endpoint produced an empty set, so every provider reported unavailable, the technical panel
   * labelled sandbox Coinbase "production only" while the demo paid through it, and the checkout
   * rendered a sentence with no subject.
   */
  it('marks the sandbox integrations as available', () => {
    expect(byType('sandboxCoinbase').sandboxAvailable).toBe(true)
    expect(byType('sandbox').sandboxAvailable).toBe(true)
  })

  /** Three entries share the name "Coinbase" and only one of them has a test account. */
  it('does not mark the production Coinbase variants available just because the name matches', () => {
    expect(byType('coinbase').sandboxAvailable).toBe(false)
    expect(byType('coinbaseRamp').sandboxAvailable).toBe(false)
  })

  it('separates being able to pay from being offered', () => {
    const kraken = byType('krakenOAuth')
    expect(kraken.canPay).toBe(true)
    expect(kraken.sandboxAvailable).toBe(false)
  })

  it('says why a wallet cannot fund the payment, in its own terms', () => {
    const wallet = byType('deFiWallet')
    expect(wallet.canPay).toBe(false)
    expect(wallet.sandboxAvailable).toBe(true)
    expect(wallet.reason).toContain('Ethereum')
  })

  it('sorts the usable ones first', () => {
    const ordered = mapProviders(CAPABLE, OFFERED, SETTLEMENT)
    expect(ordered[0]!.canPay && ordered[0]!.sandboxAvailable).toBe(true)
    expect(ordered.at(-1)!.canPay).toBe(false)
  })

  it('survives an empty availability list rather than throwing', () => {
    const none = mapProviders(CAPABLE, [], SETTLEMENT)
    expect(none).toHaveLength(CAPABLE.length)
    expect(none.every(p => !p.sandboxAvailable)).toBe(true)
  })

  it('does not claim a provider can pay when it lacks the settlement asset', () => {
    const noUsdc = [{ ...CAPABLE[0]!, networks: [{ ...ethereum, supportedTokens: ['ETH'] }] }]
    expect(mapProviders(noUsdc, OFFERED, SETTLEMENT)[0]!.canPay).toBe(false)
  })
})

/**
 * The default the checkout deep-links Link to. A tester who does not own crypto hit Mesh's full
 * catalogue and could not tell which entry was for them, so the merchant now names one.
 */
describe('suggesting a provider', () => {
  const all = () => mapProviders(CAPABLE, OFFERED, SETTLEMENT)

  it('picks one that can settle here and that Link will actually offer', () => {
    const s = suggestProvider(all())
    expect(s).not.toBeNull()
    const chosen = all().find(p => p.id === s!.id)!
    expect(chosen.canPay).toBe(true)
    expect(chosen.sandboxAvailable).toBe(true)
  })

  it('never suggests a wallet that cannot reach the merchant network', () => {
    const wallets = all().filter(p => !p.canPay).map(p => p.id)
    expect(wallets).not.toContain(suggestProvider(all())!.id)
  })

  it('returns null rather than guessing when nothing is usable', () => {
    expect(suggestProvider(mapProviders(CAPABLE, [], SETTLEMENT))).toBeNull()
    expect(suggestProvider([])).toBeNull()
  })
})

/**
 * The catalogue's own order is an accident. Sandbox Binance is typed `sandbox` and named
 * "Binance", so sorting alphabetically put it above Coinbase and the checkout deep-linked Link to
 * Binance, which is not the account the demo runs on.
 */
describe('the merchant ranking', () => {
  it('puts Coinbase above Binance even though B sorts first', () => {
    const ordered = mapProviders(CAPABLE, OFFERED, SETTLEMENT)
    const names = ordered.map(p => p.name)
    expect(names.indexOf('Coinbase')).toBeLessThan(names.indexOf('Binance'))
    expect(suggestProvider(ordered)!.name).toBe('Coinbase')
  })

  it('still puts usable-here above the merchant ranking', () => {
    // Coinbase drops out of what Link offers; Binance is then the only usable entry and wins,
    // because a preferred provider nobody can pick with is worse than a working one.
    const withoutCoinbase = OFFERED.filter(o => o.type !== 'sandboxCoinbase')
    const s = suggestProvider(mapProviders(CAPABLE, withoutCoinbase, SETTLEMENT))
    expect(s!.name).toBe('Binance')
  })

  it('suggests the sandbox Coinbase id, not one of the production variants', () => {
    expect(suggestProvider(mapProviders(CAPABLE, OFFERED, SETTLEMENT))!.id).toBe('a1')
  })
})
