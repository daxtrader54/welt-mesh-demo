'use client'

import Image from 'next/image'
import { usd } from '@/lib/format'
import { COLOURWAYS, PRODUCT, plateSrc, type ColourwayId } from '@/lib/product'

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
          <p className="mt-5 text-sm leading-relaxed text-muted">
            Four colourways, one price, and no more coming. Lightweight mesh upper, memory foam
            sockliner, and a moulded sole that has outlasted its own product line.
          </p>
        </div>

        <div className="text-right">
          <div className="data text-4xl font-semibold leading-none tracking-[-0.03em]">
            {usd(PRODUCT.price)}
          </div>
          <div className="label mt-2">Was {usd(PRODUCT.rrp)} · All sizes</div>
        </div>
      </div>

      <ul className="grid grid-cols-1 gap-x-6 gap-y-10 pt-10 sm:grid-cols-2 lg:grid-cols-4">
        {COLOURWAYS.map(c => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onSelect(c.id)}
              className="group block w-full text-left"
              style={{ ['--plate-accent' as string]: c.accent }}
            >
              <div className="relative aspect-[5/4] w-full border border-rule bg-plate transition-colors group-hover:border-ink">
                <Image
                  src={plateSrc(c.id, 'lateral')}
                  alt={`${PRODUCT.name} in ${c.name}`}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                  className="object-contain"
                />
                <span
                  className="absolute bottom-0 left-0 h-1 w-0 transition-all duration-200 group-hover:w-full"
                  style={{ background: c.accent }}
                  aria-hidden
                />
              </div>

              <div className="mt-3 flex items-baseline justify-between gap-3">
                <span className="text-sm font-semibold">{c.name}</span>
                <span className="label">{c.ref}</span>
              </div>
              <div className="mt-1 flex items-baseline gap-3">
                <span className="data text-sm font-semibold">{usd(PRODUCT.price)}</span>
                <span className="data text-xs text-faint line-through">{usd(PRODUCT.rrp)}</span>
              </div>
            </button>
          </li>
        ))}
      </ul>

      <p className="note mt-10">
        Every image here is a real photograph of the product. There is one shoe in this shop, in
        four colours, because that is what a clearance drop looks like.
      </p>
    </div>
  )
}
