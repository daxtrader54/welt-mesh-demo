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
  { uk: '6', eu: '39.5', inStock: true },
  { uk: '7', eu: '41', inStock: true },
  { uk: '8', eu: '42', inStock: true },
  { uk: '9', eu: '43', inStock: true },
  { uk: '10', eu: '44.5', inStock: false },
  { uk: '11', eu: '46', inStock: false },
  { uk: '12', eu: '47.5', inStock: true }
]

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
