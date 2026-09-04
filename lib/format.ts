/**
 * Money and identifiers, formatted the same way everywhere so the receipt and the technical view
 * never disagree with each other.
 */

const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

export function usd(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return USD.format(value)
}

/**
 * Token amounts. Crypto balances arrive with long tails (9949.47591718333) and rounding them to
 * two places makes a balance look like a fiat figure, so significant digits are kept for small
 * amounts and trimmed for large ones.
 */
export function token(amount: number | null | undefined, symbol?: string | null): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return '—'
  const abs = Math.abs(amount)
  const decimals = abs === 0 ? 2 : abs >= 1000 ? 2 : abs >= 1 ? 4 : 8
  const formatted = amount
    .toFixed(decimals)
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '')
  return symbol ? `${formatted} ${symbol}` : formatted
}

/** Long hashes and addresses, shortened for display. The full value is always copyable. */
export function truncate(value: string | null | undefined, lead = 6, tail = 6): string {
  if (!value) return '—'
  if (value.length <= lead + tail + 1) return value
  return `${value.slice(0, lead)}…${value.slice(-tail)}`
}

/** Auth tokens must never be shown. This exists so the technical view can prove one was received. */
export function maskToken(value: string | null | undefined): string {
  if (!value) return '—'
  // Anything short enough for the ends to reconstruct the middle is hidden outright.
  if (value.length < 16) return '•'.repeat(12)
  return `${value.slice(0, 4)}${'•'.repeat(8)}${value.slice(-4)}`
}

export function clockTime(at: number | null | undefined): string {
  if (!at) return '--:--:--'
  const d = new Date(at)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** Elapsed time since a reference point, for the manifest. */
export function elapsed(at: number | null | undefined, from: number | null | undefined): string {
  if (!at || !from) return '—'
  const ms = at - from
  if (ms < 1000) return `+${ms}ms`
  return `+${(ms / 1000).toFixed(1)}s`
}

/**
 * The customer-facing order number, derived from the order's real id.
 *
 * These used to be the same string, and that string was a 32-bit hash reduced modulo 10,000. It
 * was simultaneously the display number, the store key and the `transactionId` sent to Mesh, in a
 * space small enough to collide at even odds after about 118 orders. A collision silently
 * overwrote one order with another and then settled the wrong one, and because the id lived on
 * Mesh's side of the boundary, changing it later would have meant changing what reconciliation
 * joins on.
 *
 * Now the id is a UUID and this is a label derived from it: short enough to read out on a call,
 * and carrying no meaning of its own. Six hex characters will collide eventually and that is fine,
 * because nothing keys on it. The store and Mesh both use the id.
 */
export function orderNumber(id: string): string {
  return `WELT-${id.replace(/-/g, '').slice(0, 6).toUpperCase()}`
}
