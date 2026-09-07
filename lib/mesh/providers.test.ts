import { describe, expect, it } from 'vitest'
import { brandsByType, isSelfCustody, mapProviders, suggestProvider } from './providers'

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
  { id: 'm1', name: 'MetaMask', type: 'deFiWallet', supportsOutgoingTransfers: true, networks: [sepolia] },
  { id: 'r1', name: 'Rainbow', type: 'deFiWallet', supportsOutgoingTransfers: true, networks: [sepolia] }
]

/**
 * From GET /api/v1/integrations — 5 rows, keyed `content.items`.
 *
 * Only this endpoint carries `style` and `logo`. The capability endpoint does not, which is why
 * the brand has to be joined on from here rather than read off the row being mapped.
 */
const OFFERED = [
  {
    id: 'b1',
    name: 'Binance',
    type: 'sandbox',
    style: {
      buttonPrimaryLight: '#FCD535',
      buttonHoverLight: '#F0B90B',
      buttonTextLight: '#202630'
    },
    logo: { iconColorUrl: 'https://file-cdn.meshconnect.com/public/logos/Binance_Icon_Color.svg' }
  },
  {
    id: 'a1',
    name: 'Coinbase',
    type: 'sandboxCoinbase',
    style: {
      buttonPrimaryLight: '#0052FF',
      buttonHoverLight: '#014CEC',
      buttonTextLight: '#FFFFFF'
    },
    logo: { iconColorUrl: 'https://file-cdn.meshconnect.com/public/logos/Coinbase_Icon_Color.svg' }
  },
  {
    id: 'm1',
    name: 'MetaMask',
    type: 'deFiWallet',
    style: { buttonPrimaryLight: '#0376C9', buttonTextLight: '#FFFFFF' }
  },
  {
    id: 'r1',
    name: 'Rainbow',
    type: 'deFiWallet',
    style: { buttonPrimaryLight: '#A575FF', buttonTextLight: '#FFFFFF' }
  }
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

/**
 * The palette Mesh publishes per integration, which this route was fetching and discarding.
 *
 * These values reach a `style` attribute, so the tests that matter are the ones about refusing
 * input rather than the ones about passing it through.
 */
describe('broker brands', () => {
  it('carries the integration palette through from the availability catalogue', () => {
    const brand = byType('sandboxCoinbase').brand
    expect(brand).toEqual({
      button: '#0052FF',
      hover: '#014CEC',
      text: '#FFFFFF',
      icon: 'https://file-cdn.meshconnect.com/public/logos/Coinbase_Icon_Color.svg'
    })
  })

  /** Most of the catalogue has no palette. That has to look deliberate, not half-applied. */
  it('is null when Mesh published no style for the integration', () => {
    expect(byType('krakenOAuth').brand).toBeNull()
    expect(byType('coinbaseRamp').brand).toBeNull()
  })

  /**
   * The bug this pairing exists to stop. MetaMask, Phantom and Rainbow are all typed `deFiWallet`
   * with different palettes, and matching on type alone gave MetaMask whichever row sorted last.
   */
  it('tells apart brands that share a broker type', () => {
    const all = mapProviders(CAPABLE, OFFERED, SETTLEMENT)
    expect(all.find(p => p.name === 'MetaMask')?.brand?.button).toBe('#0376C9')
    expect(all.find(p => p.name === 'Rainbow')?.brand?.button).toBe('#A575FF')
  })

  it('refuses anything that is not a hex colour', () => {
    const hostile = [
      {
        id: 'x',
        type: 'sandboxCoinbase',
        style: {
          buttonPrimaryLight: 'red; background-image: url(//evil.example/x)',
          buttonTextLight: '#FFFFFF'
        }
      }
    ]
    expect(mapProviders(CAPABLE, hostile, SETTLEMENT).find(p => p.type === 'sandboxCoinbase')!.brand).toBeNull()
  })

  /** A fill with no legible foreground is worse than the house accent, so it is both or neither. */
  it('refuses a fill with no text colour', () => {
    const half = [{ id: 'x', type: 'sandboxCoinbase', style: { buttonPrimaryLight: '#0052FF' } }]
    expect(mapProviders(CAPABLE, half, SETTLEMENT).find(p => p.type === 'sandboxCoinbase')!.brand).toBeNull()
  })

  it('falls back to the fill when Mesh gives no hover colour', () => {
    const noHover = [
      {
        id: 'x',
        type: 'sandboxCoinbase',
        style: { buttonPrimaryLight: '#0052FF', buttonTextLight: '#FFFFFF' }
      }
    ]
    const brand = mapProviders(CAPABLE, noHover, SETTLEMENT).find(p => p.type === 'sandboxCoinbase')!.brand
    expect(brand?.hover).toBe('#0052FF')
  })

  /** The CSP would block a foreign image anyway, but a blocked image renders as a broken one. */
  it('drops an icon that is not on the Mesh CDN', () => {
    const offsite = [
      {
        id: 'x',
        type: 'sandboxCoinbase',
        style: { buttonPrimaryLight: '#0052FF', buttonTextLight: '#FFFFFF' },
        logo: { iconColorUrl: 'https://evil.example/coinbase.svg' }
      }
    ]
    const brand = mapProviders(CAPABLE, offsite, SETTLEMENT).find(p => p.type === 'sandboxCoinbase')!.brand
    expect(brand?.icon).toBeNull()
  })

  it('keeps the colours with the suggested provider, so the button can be coloured on first paint', () => {
    const suggestion = suggestProvider(mapProviders(CAPABLE, OFFERED, SETTLEMENT))
    expect(suggestion?.name).toBe('Coinbase')
    expect(suggestion?.brand?.button).toBe('#0052FF')
  })

  /** Keyed by type because that is what `Connection.brokerType` gives the checkout back. */
  it('keys brands by broker type and omits the ones without a palette', () => {
    const brands = brandsByType(mapProviders(CAPABLE, OFFERED, SETTLEMENT))
    expect(brands.sandboxCoinbase?.button).toBe('#0052FF')
    expect(brands.sandbox?.button).toBe('#FCD535')
    expect(brands.deFiWallet).toBeUndefined()
  })

  /**
   * A connection reports only its broker type, so `deFiWallet` is unanswerable: three wallets,
   * three palettes, one key. Better an uncoloured button than MetaMask painted Rainbow purple.
   */
  it('drops a type whose brands disagree rather than picking one', () => {
    const brands = brandsByType(mapProviders(CAPABLE, OFFERED, SETTLEMENT))
    expect(Object.keys(brands)).not.toContain('deFiWallet')
  })
})

/**
 * An exchange account with nothing eligible is an empty account, and "try another one" is fair
 * advice. A self-custody wallet in this sandbox can never settle here however it is funded, so the
 * same empty result needs different words.
 */
describe('isSelfCustody', () => {
  it('recognises the type all three sandbox wallets report', () => {
    expect(isSelfCustody('deFiWallet')).toBe(true)
    expect(isSelfCustody('cryptocurrencyAddress')).toBe(true)
    expect(isSelfCustody('cryptocurrencyWallet')).toBe(true)
  })

  it('does not catch exchanges', () => {
    expect(isSelfCustody('sandboxCoinbase')).toBe(false)
    expect(isSelfCustody('coinbase')).toBe(false)
    expect(isSelfCustody('sandbox')).toBe(false)
    expect(isSelfCustody('krakenOAuth')).toBe(false)
  })

  /** Broker type casing has bitten this codebase before, so it is matched case-insensitively. */
  it('is case insensitive, and safe on nothing', () => {
    expect(isSelfCustody('DEFIWALLET')).toBe(true)
    expect(isSelfCustody(null)).toBe(false)
    expect(isSelfCustody(undefined)).toBe(false)
    expect(isSelfCustody('')).toBe(false)
  })
})
