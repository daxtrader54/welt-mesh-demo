/**
 * One product, four colourways, five plates each. Not a catalogue.
 *
 * The shoe is a real Skechers trainer and WELT is a fictional retailer listing it, the same
 * relationship a clearance site has with the brands it sells. Price, size range and the gaps in
 * that range follow the source listing, converted to USD because the payment settles in USDC.
 */

export const BRAND = 'WELT'

export const PRODUCT = {
  brand: 'Skechers Sport',
  name: 'Track Syntac',
  /** Exactly what Mesh will move. The rest of the app derives from this, never the reverse. */
  price: 50,
  rrp: 64,
  currency: 'USD',
  settlement: { symbol: 'USDC', network: 'Ethereum' }
} as const

/**
 * The merchant's handling fee, in dollars. Mesh takes it as `clientFee` on the link token and
 * it sits on top of the order, so the destination address still receives the full $50. Public
 * because it is a price the shopper sees, and read from the same variable the server sends.
 */
export const HANDLING_FEE = Number.parseFloat(
  process.env.NEXT_PUBLIC_MERCHANT_HANDLING_FEE ?? '0'
) || 0

/**
 * What this merchant accepts, all to the same address on the same network.
 *
 * USDC is the required settlement asset and stays the default. The other two are here so the
 * shopper genuinely has a choice: Mesh's `toAddresses` takes an array, and its own guidance is to
 * offer every destination you can so a transfer has more ways to succeed.
 *
 * Stablecoins only, deliberately. All three sit at roughly a dollar, so a $50 price stays a $50
 * price whichever one is used. Accepting ETH would mean showing a converted amount that moves
 * while the shopper reads it, which is a different product decision and not this one.
 */
export const ACCEPTED_ASSETS = [
  { symbol: 'USDC', name: 'USD Coin', primary: true },
  { symbol: 'USDT', name: 'Tether' },
  { symbol: 'PYUSD', name: 'PayPal USD' }
] as const

export type AcceptedSymbol = (typeof ACCEPTED_ASSETS)[number]['symbol']

export function isAccepted(symbol: string | null | undefined): symbol is AcceptedSymbol {
  return ACCEPTED_ASSETS.some(a => a.symbol === symbol)
}

export type ColourwayId = 'charcoal' | 'navy' | 'stone' | 'black'

export type Colourway = {
  id: ColourwayId
  /** The real supplier reference, used as the product reference on screen. */
  ref: string
  name: string
  /** Swatch dot. Approximates the upper. */
  swatch: string
  /** The colourway's own accent, taken off the shoe. Drives callout lines, never the pay button. */
  accent: string
}

export const COLOURWAYS: Colourway[] = [
  { id: 'charcoal', ref: 'XS30329', name: 'Charcoal / Lime', swatch: '#4A4E52', accent: '#7FBF2A' },
  { id: 'navy', ref: 'XS30322', name: 'Navy / Amber', swatch: '#2A3348', accent: '#D98A1F' },
  { id: 'stone', ref: 'XS30330', name: 'Stone / Taupe', swatch: '#C8C0B2', accent: '#3A4A6B' },
  { id: 'black', ref: 'XS30325', name: 'Black / Black', swatch: '#1C1C1C', accent: '#6E6E6E' }
]

export const DEFAULT_COLOURWAY: ColourwayId = 'charcoal'

export type PlateId = 'lateral' | 'medial' | 'top' | 'heel' | 'outsole'

export const PLATES: { id: PlateId; label: string }[] = [
  { id: 'lateral', label: 'Lateral' },
  { id: 'medial', label: 'Medial' },
  { id: 'top', label: 'Top' },
  { id: 'heel', label: 'Heel' },
  { id: 'outsole', label: 'Outsole' }
]

export function plateSrc(colourway: ColourwayId, plate: PlateId): string {
  return `/product/${colourway}/${plate}.webp`
}

/**
 * Sizes follow the source listing, gaps included. UK 10 and 11 are genuinely absent from it,
 * which is what a clearance range actually looks like, so they are shown and disabled rather
 * than quietly removed.
 */
export type Size = { uk: string; eu: string; inStock: boolean }

export const SIZES: Size[] = [
  { uk: '7', eu: '41', inStock: true },
  { uk: '8', eu: '42', inStock: false },
  { uk: '9', eu: '43', inStock: true },
  { uk: '10', eu: '44.5', inStock: true },
  { uk: '11', eu: '46', inStock: false },
  { uk: '12', eu: '47.5', inStock: true }
]

/**
 * Derived from the size run, never written out by hand.
 *
 * The listing advertised "Sizes 6 to 12" as a literal string and kept advertising it after UK 6 was
 * taken out of stock, which is the sort of thing a shop gets complained at for. Anything the shop
 * says about its sizes now comes from the same array the size picker reads.
 */
export const SIZE_RUN = (() => {
  const stocked = SIZES.filter(s => s.inStock)
  return {
    from: stocked[0]?.uk ?? null,
    to: stocked.at(-1)?.uk ?? null,
    stocked: stocked.length,
    soldOut: SIZES.length - stocked.length
  }
})()

/** The real saving off RRP, so the badge and the price block cannot disagree. */
export const SAVING = Math.round((PRODUCT.rrp - PRODUCT.price) * 100) / 100
export const SAVING_PERCENT = Math.round((SAVING / PRODUCT.rrp) * 100)

/** Only what is visible on the shoe or printed on it. No invented performance claims. */
export const SPEC: { n: string; label: string; value: string }[] = [
  { n: '01', label: 'Upper', value: 'Mesh with synthetic overlays' },
  { n: '02', label: 'Midsole', value: 'Lite-weight, printed sidewall' },
  { n: '03', label: 'Outsole', value: 'Moulded flex grooves' },
  { n: '04', label: 'Sockliner', value: 'Memory foam' },
  { n: '05', label: 'Closure', value: 'Lace' }
]

/** Plates that take a callout overlay well. A side profile does not, a sole and a top-down do. */
export const ANNOTATED_PLATES: PlateId[] = ['outsole', 'top']

export function colourway(id: ColourwayId): Colourway {
  return COLOURWAYS.find(c => c.id === id) ?? COLOURWAYS[0]!
}

/**
 * The merchant's own ranking of payment providers, best first.
 *
 * Ordering the catalogue alphabetically put Binance at the top, because the sandbox's Binance
 * entry is typed `sandbox` and named "Binance". That is an accident of the catalogue, not a
 * merchant decision, and it decided which provider the checkout opened Link on.
 *
 * Matched on the brand name, not the integration type: a merchant ranks Coinbase, not
 * `sandboxCoinbase`, `coinbase` and `coinbaseRamp` separately. Anything not listed keeps its
 * alphabetical place after the ones that are.
 */
export const PREFERRED_PROVIDERS = ['coinbase', 'binance', 'kraken', 'robinhood'] as const

/** Lower is better. Unlisted providers all share the same rank and fall back to alphabetical. */
export function providerRank(name: string): number {
  const i = PREFERRED_PROVIDERS.indexOf(name.trim().toLowerCase() as (typeof PREFERRED_PROVIDERS)[number])
  return i === -1 ? PREFERRED_PROVIDERS.length : i
}
