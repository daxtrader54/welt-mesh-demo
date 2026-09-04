'use client'

import { useState } from 'react'

/**
 * Reviews, delivery and product information: the furniture a shoe shop has and a payment demo
 * usually does not. Without it the page reads as a checkout with a photograph attached.
 *
 * Marked as sample content, in the open. The brief rules out fake metrics, and a made-up star
 * rating presented as real would be exactly that. Labelled, it is set dressing, which is a
 * different thing.
 */

const REVIEWS = [
  {
    stars: 5,
    title: 'Wider than I expected, in a good way',
    body: 'Ordered a nine and they fit straight out of the box. The mesh gives a bit across the top which suits me.',
    by: 'Verified buyer'
  },
  {
    stars: 4,
    title: 'Good for the money',
    body: 'Light and comfortable for standing all day. Sole is a touch soft on wet ground.',
    by: 'Verified buyer'
  },
  {
    stars: 5,
    title: 'Second pair',
    body: 'Bought the navy last year and wore them out, so back for the charcoal.',
    by: 'Verified buyer'
  }
]

const AVERAGE = 4.7

/**
 * Filled against outline, not colour against colour. The previous version drew filled stars in the
 * colourway accent and empty ones in faint grey, which on the default colourway is 1.18:1 between
 * the two: four stars and five stars were indistinguishable, and identical outright to anyone with
 * a red-green deficiency.
 */
function Stars({ n }: { n: number }) {
  return (
    <span
      role="img"
      aria-label={`${n} out of 5`}
      className="data text-sm tracking-[0.15em] text-ink"
    >
      {'★'.repeat(n)}
      <span className="text-muted">{'☆'.repeat(5 - n)}</span>
    </span>
  )
}

function Panel({
  title,
  count,
  defaultOpen = false,
  children
}: {
  title: string
  count?: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rule-b">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 py-4 text-left"
      >
        <span className="flex items-baseline gap-3">
          <span className="text-base font-semibold">{title}</span>
          {count && <span className="label">{count}</span>}
        </span>
        <span className="data text-sm text-muted" aria-hidden>
          {open ? '−' : '+'}
        </span>
      </button>
      {open && <div className="pb-6">{children}</div>}
    </div>
  )
}

export function ProductPanels() {
  return (
    <section className="rule-t mt-12">
      <Panel title="Reviews" count={`${AVERAGE} out of 5`} defaultOpen>
        <div className="mb-5 flex items-baseline gap-4">
          <span className="data text-3xl font-semibold">{AVERAGE}</span>
          <div>
            <Stars n={5} />
            <div className="note">Based on {REVIEWS.length} reviews</div>
          </div>
        </div>

        {/* One column. These live in the product page's right-hand rail, so the three-column grid
            gave each card about 109px, and it went to one column at exactly the width where the
            container was widest. A sidebar holds a stacked list. */}
        <ul className="grid gap-5">
          {REVIEWS.map(r => (
            <li key={r.title} className="rule-t pt-3">
              <Stars n={r.stars} />
              <p className="mt-1.5 text-sm font-semibold">{r.title}</p>
              <p className="note mt-1">{r.body}</p>
              <p className="label mt-2">{r.by}</p>
            </li>
          ))}
        </ul>

        <p className="note mt-5">
          Sample content for this demonstration. Not real customer reviews.
        </p>
      </Panel>

      <Panel title="Delivery and returns">
        <dl className="grid gap-3">
          {[
            ['Standard delivery', 'Free on this drop'],
            ['Dispatch', 'Next working day'],
            ['Returns', '30 days, unworn, in the original box'],
            ['Where', 'UK and Ireland']
          ].map(([k, v]) => (
            <div key={k} className="rule-t pt-2">
              <dt className="label">{k}</dt>
              <dd className="text-sm">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="note mt-4">
          Demonstration store, so nothing is actually dispatched.
        </p>
      </Panel>

      <Panel title="Product information">
        <p className="text-sm leading-relaxed text-muted">
          A lightweight lace-up trainer built on a moulded midsole with a memory foam sockliner.
          Mesh upper with synthetic overlays across the toe and heel. Runs true to size. Four
          colourways, and this drop is the end of the run, which is where the price comes from.
        </p>
      </Panel>
    </section>
  )
}
