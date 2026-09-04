'use client'

import { useState } from 'react'
import Image from 'next/image'
import { token, truncate, usd } from '@/lib/format'
import { HANDLING_FEE, PRODUCT, plateSrc, type Colourway } from '@/lib/product'
import { chargedTotal, describeFundingType, meshTotalDisagrees, type OrderState } from '@/lib/order/state'
import { formatAddress, type Address } from './Delivery'

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
  address,
  settled
}: {
  order: OrderState
  orderId: string | null
  size: string | null
  colourway: Colourway
  address: Address
  settled: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const p = order.payment

  // Both numbers come from lib/order/state, so the headline on the page and the total on the
  // receipt cannot drift apart again.
  const totalCharged = chargedTotal(order, PRODUCT.price + HANDLING_FEE)
  const meshDisagrees = meshTotalDisagrees(order, PRODUCT.price + HANDLING_FEE)

  /**
   * The same total in the settlement token, printed under the dollar one whenever a fee is charged.
   *
   * Fiat is two decimal places. A withdrawal fee need not be. A real PYUSD payment came back with a
   * 0.001 fee, and the receipt listed that fee on its own row and then rounded it straight out of
   * the total: $50.00 price, 0.001 PYUSD fee, $50.00 charged. Not wrong, but it reads as broken,
   * and the note underneath fired at the same time to explain a difference nothing on screen
   * showed. The token figure is what the account was actually debited, and it keeps the digits the
   * dollar figure throws away.
   *
   * Only when the fee is quoted in the token that was sent, though. Mesh gives the institution fee
   * its own currency, and summing a fee denominated in something else and then labelling the result
   * PYUSD would be a worse lie than the rounding.
   */
  const feesCharged = (order.fees.institution ?? 0) + (order.fees.client ?? 0) + (order.fees.gas ?? 0)
  const feesInSettlementToken =
    !order.fees.institution || (order.fees.institutionCurrency ?? p.symbol) === p.symbol
  const tokenTotal =
    feesCharged > 0 && p.amount !== null && p.symbol !== null && feesInSettlementToken
      ? token(totalCharged, p.symbol)
      : null

  /** True when two decimal places cannot show the fee at all, which is the case worth naming. */
  const fiatHidesFee = totalCharged > PRODUCT.price && usd(totalCharged) === usd(PRODUCT.price)

  /** Just the money. Everything else moved to a block that suits it better than a table row does. */
  const money: { label: string; value: string; mono?: boolean }[] = [
    { label: PRODUCT.name, value: usd(PRODUCT.price), mono: true },
    { label: 'Delivery', value: 'Free' },
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
        : [])
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

        {/**
         * A confirmation, not a data table.
         *
         * The previous version printed twelve label and value rows at identical weight, so the
         * order number, the shoe, the address and the total all shouted equally and the thing
         * anyone actually looks for, what was charged, sat at the bottom of the pile. This is the
         * shape every other shop uses because it works: what you bought, what it cost, where it is
         * going, how it was paid. The technical half is still here, one click away, where the
         * people who want it will look.
         */}
        <div className="rule-b print-row flex items-center gap-4 py-4">
          <div className="relative h-16 w-16 shrink-0 border border-rule bg-plate">
            <Image
              src={plateSrc(colourway.id, 'lateral')}
              alt=""
              fill
              sizes="64px"
              className="object-contain p-1"
            />
            {/* The one easter egg that survived the redesign, moved off the big product plate and
                onto the thing a confirmation actually shows. */}
            <span
              className="stamp data absolute -right-1.5 -top-1.5 border-2 bg-plate px-1 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em]"
              style={{
                borderColor: 'var(--color-positive)',
                color: 'var(--color-positive)',
                transform: 'rotate(-8deg)'
              }}
            >
              Yours
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold leading-tight">
              {PRODUCT.brand} {PRODUCT.name}
            </div>
            <div className="note">
              {colourway.name} · {size ?? '—'} · Qty 1
            </div>
            <div className="note">{colourway.ref}</div>
          </div>
        </div>

        <dl>
          {money.map((r, i) => (
            <div
              key={r.label}
              className="print-row flex items-baseline justify-between gap-6 py-1"
              style={{ animationDelay: `${i * 55}ms` }}
            >
              <dt className="text-sm text-muted">{r.label}</dt>
              <dd className={`${r.mono ? 'data' : ''} text-right text-sm`}>{r.value}</dd>
            </div>
          ))}
        </dl>

        <div
          className="rule-t print-row mt-2 flex items-baseline justify-between gap-6 pt-3"
          style={{ animationDelay: `${money.length * 55}ms` }}
        >
          <span className="text-base font-semibold">Total charged</span>
          <span className="text-right">
            <span className="data block text-xl font-semibold">{usd(totalCharged)}</span>
            {tokenTotal && <span className="data block text-xs text-muted">{tokenTotal}</span>}
          </span>
        </div>
        {totalCharged > PRODUCT.price && (
          <p className="note mt-1">
            The destination address receives {usd(PRODUCT.price)}. The rest is the exchange&apos;s
            withdrawal fee{HANDLING_FEE > 0 ? ' and ours' : ''}, charged on top.
            {tokenTotal && fiatHidesFee
              ? ' That fee is smaller than a cent, so the dollar total rounds it off and only the token figure carries it.'
              : ''}
          </p>
        )}

        <div className="rule-t mt-5 grid gap-5 pt-4 sm:grid-cols-2">
          <div>
            <div className="label mb-1.5">Delivering to</div>
            {address.name && <div className="text-sm">{address.name}</div>}
            {address.line1 && <div className="note">{formatAddress(address)}</div>}
            <div className="note mt-1">Free delivery, 2 to 4 days</div>
          </div>

          <div>
            <div className="label mb-1.5">Paid with</div>
            <div className="text-sm">
              {p.symbol ?? PRODUCT.settlement.symbol} from {order.source?.name ?? 'your account'}
            </div>
            <div className="note">
              Sent on {p.networkName ?? PRODUCT.settlement.network}
            </div>
            {order.funding
              .filter(f => f.type !== 'existingCryptocurrencyBalance')
              .map(f => (
                <div key={f.type} className="note mt-1">
                  {describeFundingType(f.type)}{' '}
                  {f.amountInCrypto ? `${token(f.amountInCrypto)} ` : ''}
                  {f.symbol}
                </div>
              ))}
          </div>
        </div>

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
