'use client'

import Image from 'next/image'
import { usd } from '@/lib/format'
import { HANDLING_FEE, PRODUCT, plateSrc, type Colourway } from '@/lib/product'

/**
 * The bag, and the panel that confirms an add.
 *
 * Delivery is free and quantity is fixed at one. Both are honest constraints rather than
 * simplifications: the Mesh payment is for exactly fifty dollars, so a delivery charge or a
 * second pair would put the bag total and the amount Mesh moves out of step, and a total that
 * disagrees with the payment is the one thing a checkout must never do.
 */

export type BagItem = {
  colourway: Colourway
  size: string
}

export function AddedToBag({
  item,
  onViewBag,
  onKeepShopping
}: {
  item: BagItem
  onViewBag: () => void
  onKeepShopping: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-start sm:justify-end sm:p-6">
      <div className="absolute inset-0 bg-ink/30" onClick={onKeepShopping} aria-hidden />

      <div
        role="dialog"
        aria-label="Added to bag"
        className="stamp relative w-full border border-rule bg-plate p-5 sm:w-[24rem]"
      >
        <div className="flex items-center gap-2">
          <span
            className="grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold"
            style={{ background: 'var(--plate-accent)', color: 'var(--color-plate)' }}
            aria-hidden
          >
            ✓
          </span>
          <span className="label text-ink">Added to bag</span>
        </div>

        <div className="mt-4 flex gap-4">
          <div className="relative h-20 w-24 shrink-0 border border-rule bg-plate">
            <Image
              src={plateSrc(item.colourway.id, 'lateral')}
              alt=""
              fill
              sizes="96px"
              className="object-contain p-1"
            />
          </div>
          <div className="min-w-0">
            <p className="label">{PRODUCT.brand}</p>
            <p className="truncate text-sm font-semibold">{PRODUCT.name}</p>
            <p className="note">
              {item.colourway.name} · UK {item.size}
            </p>
            <p className="data mt-1 text-sm font-semibold">{usd(PRODUCT.price)}</p>
          </div>
        </div>

        <button type="button" onClick={onViewBag} className="btn-primary mt-5 w-full py-3.5 text-sm">
          View bag
        </button>
        <button type="button" onClick={onKeepShopping} className="btn-quiet mt-4">
          Keep looking
        </button>
      </div>
    </div>
  )
}

export function BagView({
  item,
  onCheckout,
  onBack,
  onRemove
}: {
  item: BagItem
  onCheckout: () => void
  onBack: () => void
  onRemove: () => void
}) {
  const savings = PRODUCT.rrp - PRODUCT.price

  return (
    <div className="mx-auto grid max-w-3xl gap-10 py-10 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-14">
      <div>
        <h1 className="text-3xl font-bold tracking-[-0.02em]">Bag</h1>
        <p className="note mt-1">One item</p>

        <div className="rule-t mt-6 flex gap-5 pt-6">
          <div className="relative h-28 w-32 shrink-0 border border-rule bg-plate sm:h-32 sm:w-40">
            <Image
              src={plateSrc(item.colourway.id, 'lateral')}
              alt={`${PRODUCT.name} in ${item.colourway.name}`}
              fill
              sizes="160px"
              className="object-contain p-2"
            />
          </div>

          <div className="min-w-0 flex-1">
            <p className="label">{PRODUCT.brand}</p>
            <p className="text-lg font-semibold leading-tight">{PRODUCT.name}</p>
            <dl className="mt-2 space-y-0.5">
              <div className="flex gap-2">
                <dt className="label">Colour</dt>
                <dd className="text-sm">{item.colourway.name}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="label">Size</dt>
                <dd className="text-sm">UK {item.size}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="label">Ref</dt>
                <dd className="data text-sm">{item.colourway.ref}</dd>
              </div>
            </dl>

            <div className="mt-3 flex items-baseline gap-4">
              <span className="data text-lg font-semibold">{usd(PRODUCT.price)}</span>
              <span className="data text-sm text-faint line-through">{usd(PRODUCT.rrp)}</span>
            </div>

            <div className="mt-3 flex items-center gap-5">
              <button type="button" onClick={onRemove} className="btn-quiet">
                Remove
              </button>
              <span className="note">One pair per order</span>
            </div>
          </div>
        </div>

        <button type="button" onClick={onBack} className="btn-quiet mt-8">
          Continue shopping
        </button>
      </div>

      <aside className="rule-t pt-6 lg:border-t-0 lg:pt-0">
        <h2 className="label mb-4">Summary</h2>
        <dl className="space-y-2.5">
          {[
            ['Items', '1'],
            ['Goods total', usd(PRODUCT.price)],
            ['Delivery', 'Free'],
            ...(HANDLING_FEE > 0 ? [['Handling', usd(HANDLING_FEE)]] : [])
          ].map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-4">
              <dt className="text-sm text-muted">{k}</dt>
              <dd className="data text-sm">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="rule-t mt-4 flex items-baseline justify-between gap-4 pt-4">
          <span className="text-base font-semibold">Total</span>
          <span className="data text-2xl font-semibold">{usd(PRODUCT.price + HANDLING_FEE)}</span>
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-4">
          <span className="label">Savings off RRP</span>
          <span className="data text-sm" style={{ color: 'var(--plate-accent)' }}>
            {usd(savings)}
          </span>
        </div>

        <button type="button" onClick={onCheckout} className="btn-primary mt-6 w-full py-4 text-sm">
          Checkout securely
        </button>

        <p className="note mt-3">
          {HANDLING_FEE > 0
            ? `Delivery is free. The ${usd(HANDLING_FEE)} handling fee is ours and is added on top, so the merchant still receives ${usd(PRODUCT.price)}. Your exchange may add its own withdrawal fee, which is shown before you confirm.`
            : 'Delivery is free on this drop, so the total is exactly what gets paid.'}
        </p>
      </aside>
    </div>
  )
}
