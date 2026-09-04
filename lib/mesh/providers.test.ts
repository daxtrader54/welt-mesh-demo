import { describe, expect, it } from 'vitest'
import { mapProviders } from './providers'

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
