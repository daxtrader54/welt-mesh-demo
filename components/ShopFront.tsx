'use client'

import Image from 'next/image'
import { usd } from '@/lib/format'
import { RATING, Stars } from './Reviews'
import {
  ACCEPTED_ASSETS,
  COLOURWAYS,
  PRODUCT,
  SAVING,
  SAVING_PERCENT,
  SIZE_RUN,
  SPEC,
  plateSrc,
  sizeRunFor,
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
      {/**
       * Compact enough that the products are the first thing on a phone.
       *
       * This was a heading, a rating, a paragraph, a bordered payment panel with its own
       * explanatory sentence, a badge, a price and a size line, stacked. On a 390px screen that
       * filled the entire first viewport and a shopper's first load of a shoe shop contained no
       * shoes. Everything that is not name, price or payment method now sits below the grid or
       * behind a breakpoint.
       */}
      <div className="rule-b pb-5 sm:pb-8">
        <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-3">
          <div className="min-w-0">
            <p className="label mb-1.5">{PRODUCT.brand} · End of run</p>
            <h1 className="text-[1.5rem] font-bold leading-[1.05] tracking-[-0.02em] sm:text-[2.25rem]">
              {PRODUCT.brand} {PRODUCT.name}
            </h1>
            {/* Rating and count together, always. Three reviews is self-evidently a demonstration
                rather than a trading record, and the count is what makes that obvious. */}
            <div className="mt-2 flex items-center gap-2">
              <Stars n={Math.round(RATING.average)} />
              <span className="data text-sm">{RATING.average.toFixed(1)}</span>
              <span className="note">{RATING.count} reviews</span>
            </div>
          </div>

          {/* The saving stated outright, which is what a clearance listing is for. Both figures
              come from the product record, so the badge cannot drift from the price. */}
          <div className="flex items-end gap-3 sm:block sm:text-right">
            <div className="data text-3xl font-semibold leading-none tracking-[-0.03em] sm:text-4xl">
              {usd(PRODUCT.price)}
            </div>
            <div className="flex items-center gap-2 pb-0.5 sm:mt-2 sm:justify-end sm:pb-0">
              <span className="label">
                Was <span className="line-through">{usd(PRODUCT.rrp)}</span>
              </span>
              <span
                className="data px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]"
                style={{ background: 'var(--color-accent)', color: 'var(--color-ink)' }}
              >
                -{SAVING_PERCENT}%
              </span>
            </div>
          </div>
        </div>

        {/**
         * One line, not a panel.
         *
         * It is the one thing about this shop a customer would not assume, so it stays at the top
         * where a shop puts the payment methods it wants known. But it was a bordered box with a
         * heading, three symbols and a sentence of explanation, which is a lot of the first screen
         * spent on a claim the checkout has to make good on anyway. Named assets, because "crypto
         * accepted" on its own is the vague sort of claim the brief warns against.
         */}
        <div className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 border border-ink bg-plate px-3 py-2">
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: 'var(--color-accent-deep)' }}
            aria-hidden
          />
          <span className="label text-ink">Crypto accepted</span>
          <span className="data text-sm font-semibold">
            {ACCEPTED_ASSETS.map(a => a.symbol).join(' · ')}
          </span>
        </div>
      </div>

      {/* Two across on a phone, so the first screen of a shoe shop has four shoes on it. The
          cards were one per row, which pushed three of the four products below the fold and made
          the listing scroll like a feed. */}
      <ul className="grid grid-cols-2 gap-x-3 gap-y-6 pt-5 sm:gap-x-6 sm:gap-y-10 sm:pt-10 lg:grid-cols-4">
        {COLOURWAYS.map((c, i) => {
          const run = sizeRunFor(c.id)
          return (
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

              <div className="mt-2.5 flex items-baseline justify-between gap-2 sm:mt-3 sm:gap-3">
                <span className="text-sm font-semibold leading-tight sm:text-base">{c.name}</span>
                <span className="data shrink-0 text-sm font-semibold">{usd(PRODUCT.price)}</span>
              </div>
              {/**
               * This colourway's own run, not the shop's.
               *
               * Every card used to print the same "UK 7 to 12 · 2 sold out" off one global size
               * list, so four products advertised identical availability. Stock is per colourway
               * now, and this reads the same numbers the size picker and the link token do.
               */}
              <div className="mt-0.5 flex items-baseline justify-between gap-2 sm:gap-3">
                {/* Wraps rather than truncates. At two cards across on a 390px screen this line
                    is close to the card width, and clipping it would drop "4 of 6 sizes", which is
                    the half that tells a shopper anything. Grid rows align, so a second line on
                    one card does not stagger the others. */}
                <span className="label">
                  {run.stocked === 0
                    ? 'Sold out'
                    : run.stocked === run.total
                      ? `UK ${run.from} to ${run.to} · full run`
                      : `UK ${run.from} to ${run.to} · ${run.stocked} of ${run.total} sizes`}
                </span>
                <span className="data hidden shrink-0 text-xs text-faint line-through sm:inline">
                  {usd(PRODUCT.rrp)}
                </span>
              </div>
              {/* Only when it is nearly gone, and only because it is true. A stock count on every
                  card is decoration; a stock count on the one with three pairs left is a fact. */}
              {run.units > 0 && run.units <= 5 && (
                <div className="label mt-0.5" style={{ color: 'var(--color-warn)' }}>
                  Only {run.units} left
                </div>
              )}
            </button>
          </li>
          )
        })}
      </ul>

      {/* Every number here is derived from the same stock the size picker reads, and the cutoff
          is a statement about tomorrow rather than a countdown pretending stock is running out
          while you watch. The description sits here rather than above the grid, because on a phone
          it was the thing standing between a shopper and the products. */}
      <div className="rule-t mt-8 pt-4 sm:mt-10">
        <p className="text-sm text-muted">
          <span className="font-medium text-ink">
            {SIZE_RUN.units} pairs left across {COLOURWAYS.length} colourways.
          </span>{' '}
          Sizes UK {SIZE_RUN.from} to {SIZE_RUN.to}, though not every size in every colour. End of
          run, so once one is gone it is gone. Order before 3pm for same day dispatch.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Lightweight mesh upper, memory foam sockliner, and a moulded sole that has outlasted its
          own product line.
        </p>
      </div>

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
