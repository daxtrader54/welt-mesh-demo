'use client'

import Image from 'next/image'
import { usd } from '@/lib/format'
import { RATING, Stars } from './Reviews'
import {
  COLOURWAYS,
  PRODUCT,
  SAVING,
  SAVING_PERCENT,
  SIZE_RUN,
  SPEC,
  plateSrc,
  type ColourwayId
} from '@/lib/product'

/**
 * The listing page.
 *
 * These are the four colourways, presented as four products, which is what they are: each has its
 * own supplier reference and on the source retailer each is a separate listing with its own page.
 * So this is a product listing page rather than an invented catalogue, and every image on it is
 * one we actually have.
 *
 * It costs one click before Mesh appears. That click is what makes the rest of the journey read
 * as a shop, which is the thing the whole demo rests on.
 */

export function ShopFront({ onSelect }: { onSelect: (id: ColourwayId) => void }) {
  return (
    <div className="py-10">
      <div className="rule-b flex flex-wrap items-end justify-between gap-x-10 gap-y-4 pb-8">
        <div className="max-w-xl">
          <p className="label mb-3">{PRODUCT.brand} · End of run</p>
          <h1 className="text-[3rem] font-bold leading-[0.92] tracking-[-0.035em] sm:text-[4rem]">
            The Track
            <br />
            Syntac
          </h1>
          {/* Rating and count together, always. Three reviews is self-evidently a demonstration
              rather than a trading record, and the count is what makes that obvious. */}
          <div className="mt-4 flex items-center gap-2">
            <Stars n={Math.round(RATING.average)} />
            <span className="data text-sm">{RATING.average.toFixed(1)}</span>
            <span className="note">{RATING.count} reviews</span>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-muted">
            Four colourways, one price, and no more coming. Lightweight mesh upper, memory foam
            sockliner, and a moulded sole that has outlasted its own product line.
          </p>
        </div>

        <div className="shrink-0 text-right">
          {/* The saving stated outright, which is what a clearance listing is for. Both figures
              come from the product record, so the badge cannot drift from the price. */}
          <span
            className="data mb-2 inline-block px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em]"
            style={{ background: 'var(--color-accent)', color: 'var(--color-ink)' }}
          >
            Save {usd(SAVING)} · {SAVING_PERCENT}% off
          </span>
          <div className="data text-4xl font-semibold leading-none tracking-[-0.03em]">
            {usd(PRODUCT.price)}
          </div>
          <div className="label mt-2">
            Was <span className="line-through">{usd(PRODUCT.rrp)}</span> · UK {SIZE_RUN.from} to{' '}
            {SIZE_RUN.to}
          </div>
        </div>
      </div>

      <ul className="grid grid-cols-1 gap-x-6 gap-y-10 pt-10 sm:grid-cols-2 lg:grid-cols-4">
        {COLOURWAYS.map((c, i) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onSelect(c.id)}
              className="group block w-full text-left"
              style={{ ['--plate-accent' as string]: c.accent }}
            >
              <div className="relative aspect-[3/2] w-full border border-rule bg-plate transition-colors group-hover:border-ink">
                <Image
                  src={plateSrc(c.id, 'lateral')}
                  alt={`${PRODUCT.name} in ${c.name}`}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                  priority={i < 4}
                  className="object-contain p-2 transition-transform duration-300 group-hover:scale-[1.04]"
                />

                <span className="data absolute left-3 top-3 text-xs text-faint">
                  {String(i + 1).padStart(2, '0')}
                </span>

                <span
                  className="data absolute left-3 top-9 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]"
                  style={{ background: 'var(--color-ink)', color: 'var(--color-plate)' }}
                >
                  -{SAVING_PERCENT}%
                </span>

                {/* The colourway's own accent, used once per card, the same rule the shop uses. */}
                <span
                  className="absolute right-3 top-3 h-6 w-6 border"
                  style={{ background: c.swatch, borderColor: 'var(--color-rule)' }}
                  aria-hidden
                />

                <span className="label absolute bottom-3 left-3">{c.ref}</span>

                <span
                  className="absolute bottom-0 left-0 h-1 w-0 transition-all duration-300 group-hover:w-full"
                  style={{ background: c.accent }}
                  aria-hidden
                />
              </div>

              <div className="mt-3 flex items-baseline justify-between gap-3">
                <span className="text-base font-semibold leading-tight">{c.name}</span>
                <span className="data text-sm font-semibold">{usd(PRODUCT.price)}</span>
              </div>
              <div className="mt-0.5 flex items-baseline justify-between gap-3">
                {/* Derived, and honest about the gaps. A clearance run with two sizes gone is what
                    a clearance run looks like, and saying so beats advertising a size we cannot
                    sell. */}
                <span className="label">
                  UK {SIZE_RUN.from} to {SIZE_RUN.to}
                  {SIZE_RUN.soldOut > 0 ? ` · ${SIZE_RUN.soldOut} sold out` : ''}
                </span>
                <span className="data text-xs text-faint line-through">{usd(PRODUCT.rrp)}</span>
              </div>
            </button>
          </li>
        ))}
      </ul>

      {/* Both of these are true, which is the only reason they are here. The count comes from the
          same stock flags the size picker reads, and the cutoff is a statement about tomorrow, not
          a countdown pretending stock is running out while you watch. */}
      <p className="rule-t mt-10 pt-4 text-sm text-muted">
        <span className="font-medium text-ink">
          {SIZE_RUN.stocked} of {SIZE_RUN.stocked + SIZE_RUN.soldOut} sizes still in stock.
        </span>{' '}
        End of run, so once a size is gone it is gone. Order before 3pm for same day dispatch.
      </p>

      {/**
       * A spec sheet, not a feature grid.
       *
       * This band was three columns of label and sentence, which is the exact shape the brief rules
       * out and, worse, said almost nothing: two of the three were delivery terms every shop has.
       * The design language here is a technical drawing plate, so the honest version of a trust
       * band is the specification itself, numbered to match the callouts on the product page, with
       * the terms beside it as a compact table rather than a column of prose.
       */}
      <div className="rule-t mt-12 grid gap-x-16 gap-y-10 pt-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div>
          <div className="label mb-4">Specification</div>
          <dl>
            {SPEC.map(spec => (
              <div
                key={spec.n}
                className="rule-b flex items-baseline gap-4 py-2.5 first:border-t first:border-rule first:pt-2.5"
                style={{ borderTopColor: 'var(--color-rule)' }}
              >
                <span className="data w-7 shrink-0 text-xs text-faint">{spec.n}</span>
                <dt className="w-28 shrink-0 text-sm font-medium">{spec.label}</dt>
                <dd className="note min-w-0 flex-1">{spec.value}</dd>
              </div>
            ))}
          </dl>
          <p className="note mt-4">
            Every image on this page is a real photograph of the product, and the references are the
            supplier&apos;s own. One shoe in four colours, because that is what a clearance drop is.
          </p>
        </div>

        <div>
          <div className="label mb-4">Delivery, returns and payment</div>
          <dl>
            {[
              ['Delivery', 'Free, 2 to 4 days', 'No minimum spend'],
              ['Dispatch', 'Same day', 'Ordered before 3pm'],
              ['Returns', '30 days', 'Unworn, in the original box'],
              ['Card', 'Visa, Mastercard, Amex', 'Plus Apple Pay'],
              [
                'Crypto',
                `Settles in ${PRODUCT.settlement.symbol}`,
                'From an exchange account you already hold'
              ]
            ].map(([k, v, note]) => (
              <div
                key={k}
                className="rule-b py-2.5 first:border-t first:border-rule first:pt-2.5"
                style={{ borderTopColor: 'var(--color-rule)' }}
              >
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-sm font-medium">{k}</dt>
                  <dd className="data text-right text-sm">{v}</dd>
                </div>
                <div className="note">{note}</div>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  )
}
