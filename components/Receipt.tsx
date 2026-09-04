'use client'

import { useState } from 'react'
import { token, truncate, usd } from '@/lib/format'
import { HANDLING_FEE, PRODUCT, type Colourway } from '@/lib/product'
import type { OrderState } from '@/lib/order/state'

/**
 * The receipt prints. One easter egg, and it earns its place because the spec-sheet direction
 * already wanted a docket: perforated top edge, monospace figures, rows arriving in sequence.
 *
 * It shows both numbers. The merchant receives fifty dollars, the customer paid fifty dollars and
 * one cent, and the difference is the institution's transfer fee. Hiding that is the kind of thing
 * a merchant finds out about a week later.
 */

export function Receipt({
  order,
  orderId,
  size,
  colourway,
  settled
}: {
  order: OrderState
  orderId: string | null
  size: string | null
  colourway: Colourway
  settled: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const p = order.payment

  /**
   * Add up what the customer was actually charged.
   *
   * `totalAmountInFiat` from Mesh is not reliable for this: the same transfer showed $50.01 in
   * the Link overlay and returned 50 in the completion payload, and earlier runs returned 50.01
   * in that field. The fee breakdown on `transferPreviewed` has been consistent every time, so
   * the arithmetic is the honest source and Mesh's own figure is shown beside it when they differ.
   */
  const fees = (order.fees.institution ?? 0) + (order.fees.client ?? 0) + (order.fees.gas ?? 0)
  const computedTotal = p.amount !== null ? p.amount + fees : null
  const totalCharged = computedTotal ?? p.totalAmountInFiat ?? PRODUCT.price
  const meshDisagrees =
    p.totalAmountInFiat !== null &&
    computedTotal !== null &&
    Math.abs(p.totalAmountInFiat - computedTotal) > 0.0001

  const rows: { label: string; value: string; mono?: boolean }[] = [
    { label: 'Item', value: `${PRODUCT.brand} ${PRODUCT.name}` },
    { label: 'Colour', value: `${colourway.name} · ${colourway.ref}` },
    { label: 'Size', value: size ?? '—' },
    { label: 'Price', value: usd(PRODUCT.price), mono: true },
    /**
     * The fees belong in the body, not behind a disclosure. Without them the receipt showed a
     * $50.00 price and a $50.01 total with nothing on screen accounting for the difference, which
     * is the one thing a receipt exists to prevent.
     */
    ...(order.fees.institution
      ? [
          {
            label: 'Exchange fee',
            value: token(order.fees.institution, order.fees.institutionCurrency ?? p.symbol),
            mono: true
          }
        ]
      : []),
    ...(order.fees.client
      ? [{ label: 'Handling fee', value: token(order.fees.client, p.symbol), mono: true }]
      : HANDLING_FEE > 0
        ? [{ label: 'Handling fee', value: usd(HANDLING_FEE), mono: true }]
        : []),
    { label: 'Paid with', value: p.symbol ?? PRODUCT.settlement.symbol },
    { label: 'Network', value: p.networkName ?? PRODUCT.settlement.network },
    { label: 'From', value: order.source?.name ?? '—' },
    { label: 'Status', value: settled ? 'Settled' : 'Paid' }
  ]

  const detail: { label: string; value: string }[] = [
    { label: 'Amount sent', value: token(p.amount, p.symbol) },
    { label: 'Network fee', value: token(order.fees.gas ?? 0, p.symbol) },
    // Only worth a row when it contradicts the arithmetic above it, which it sometimes does.
    ...(meshDisagrees
      ? [{ label: 'Mesh reported total', value: usd(p.totalAmountInFiat) }]
      : []),
    { label: 'Destination', value: p.toAddress ?? '—' },
    { label: 'Refund address', value: p.refundAddress ?? '—' },
    { label: 'Transaction', value: p.txId ?? '—' },
    { label: 'Transfer', value: p.transferId ?? '—' },
    { label: 'Reference', value: p.txHash ?? '—' }
  ]

  return (
    <div className="border border-rule bg-plate">
      <div className="perforated h-3 bg-ground" />

      <div className="px-6 pb-6 pt-2">
        <div className="rule-b flex items-baseline justify-between pb-3">
          <span className="data text-sm font-semibold tracking-tight">{orderId ?? 'WELT'}</span>
          <span className="label">{settled ? 'Settled' : 'Paid'}</span>
        </div>

        <dl>
          {rows.map((r, i) => (
            <div
              key={r.label}
              className="rule-b print-row flex items-baseline justify-between gap-6 py-2"
              style={{ animationDelay: `${i * 55}ms` }}
            >
              <dt className="label">{r.label}</dt>
              <dd className={`${r.mono ? 'data' : ''} text-right text-sm`}>{r.value}</dd>
            </div>
          ))}
        </dl>

        <div
          className="print-row flex items-baseline justify-between gap-6 pt-3"
          style={{ animationDelay: `${rows.length * 55}ms` }}
        >
          <span className="label">Total charged</span>
          <span className="data text-lg font-semibold">{usd(totalCharged)}</span>
        </div>
        {totalCharged > PRODUCT.price && (
          <p className="note mt-1">
            The destination address receives {usd(PRODUCT.price)}. The rest is the exchange&apos;s
            withdrawal fee{HANDLING_FEE > 0 ? ' and ours' : ''}, charged on top.
          </p>
        )}

        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="btn-quiet mt-5"
          aria-expanded={expanded}
        >
          {expanded ? 'Hide transaction details' : 'View transaction details'}
        </button>

        {expanded && (
          <dl className="mt-4 rule-t pt-3">
            {detail.map(d => (
              <div key={d.label} className="flex items-baseline justify-between gap-4 py-1.5">
                <dt className="label shrink-0">{d.label}</dt>
                <dd className="data text-right text-xs" title={d.value}>
                  {d.value.length > 24 ? truncate(d.value, 8, 8) : d.value}
                </dd>
              </div>
            ))}
            {meshDisagrees && (
              <p className="note mt-3">
                The total above is added up from the amount and the fees Mesh quoted. Mesh&apos;s
                own <span className="data">totalAmountInFiat</span> came back as{' '}
                {usd(p.totalAmountInFiat)} on this transfer, which does not include the withdrawal
                fee. The arithmetic is what your account was debited.
              </p>
            )}
            <p className="note mt-3">
              Two different fees. The exchange charges the withdrawal and Mesh quotes it in the
              payment preview. The handling fee is the merchant&apos;s own charge, sent to Mesh as
              clientFee on the link token, as a proportion of the order amount.
            </p>
            <p className="note mt-2">
              The reference is a Mesh sandbox transfer id. It is not on a public chain, so there is
              nothing to link to on an explorer.
            </p>
          </dl>
        )}
      </div>
    </div>
  )
}
