import { describe, expect, it } from 'vitest'
import { COLOURWAYS, SIZES, SIZE_RUN, inStock, sizeRunFor, sizesFor } from './product'

/**
 * Stock is per colourway, and three things read it: the size picker, the listing card, and the
 * link token route that refuses an order for a pair that does not exist. If they can disagree,
 * the shop advertises a size the checkout then rejects with a generic message.
 */
describe('per-colourway stock', () => {
  it('gives each colourway a different run, which is the point', () => {
    const runs = COLOURWAYS.map(c => sizeRunFor(c.id).stocked)
    expect(new Set(runs).size).toBeGreaterThan(1)
  })

  it('offers every size in the run, in stock or not, so the gaps are visible', () => {
    for (const c of COLOURWAYS) {
      expect(sizesFor(c.id)).toHaveLength(SIZES.length)
    }
  })

  it('agrees with itself: a size is buyable exactly when it has units', () => {
    for (const c of COLOURWAYS) {
      for (const s of sizesFor(c.id)) {
        expect(inStock(c.id, s.uk)).toBe(s.units > 0)
        expect(s.inStock).toBe(s.units > 0)
      }
    }
  })

  it('never lists a size the shoe is not made in', () => {
    const known = new Set(SIZES.map(s => s.uk))
    for (const c of COLOURWAYS) {
      for (const uk of Object.keys(c.stock)) expect(known.has(uk)).toBe(true)
    }
  })

  it('never records a colourway as having zero or negative units in a size it lists', () => {
    for (const c of COLOURWAYS) {
      for (const units of Object.values(c.stock)) expect(units).toBeGreaterThan(0)
    }
  })

  it('keeps every colourway buyable, so no card is a dead end', () => {
    for (const c of COLOURWAYS) {
      expect(sizeRunFor(c.id).stocked).toBeGreaterThan(0)
    }
  })

  it('reports a run that starts and ends on sizes that are actually in stock', () => {
    for (const c of COLOURWAYS) {
      const run = sizeRunFor(c.id)
      expect(inStock(c.id, run.from)).toBe(true)
      expect(inStock(c.id, run.to)).toBe(true)
    }
  })

  it('refuses a size no colourway carries', () => {
    expect(inStock('stone', '99')).toBe(false)
    expect(inStock('stone', null)).toBe(false)
    expect(inStock('stone', undefined)).toBe(false)
  })
})

describe('SIZE_RUN, which speaks for the whole shop', () => {
  it('counts every pair across every colourway', () => {
    const byHand = COLOURWAYS.reduce(
      (n, c) => n + Object.values(c.stock).reduce((m, u) => m + u, 0),
      0
    )
    expect(SIZE_RUN.units).toBe(byHand)
  })

  it('advertises a range some colourway can actually sell at both ends', () => {
    expect(COLOURWAYS.some(c => inStock(c.id, SIZE_RUN.from))).toBe(true)
    expect(COLOURWAYS.some(c => inStock(c.id, SIZE_RUN.to))).toBe(true)
  })

  /** The bug this replaces: the listing advertised a range it had stopped stocking. */
  it('never claims more sizes than the shoe is made in', () => {
    expect(SIZE_RUN.stocked).toBeLessThanOrEqual(SIZES.length)
    expect(SIZE_RUN.stocked + SIZE_RUN.soldOut).toBe(SIZES.length)
  })
})
