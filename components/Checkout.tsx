'use client'

import { usd } from '@/lib/format'
import {
  COLOURWAYS,
  PRODUCT,
  SAVING,
  SAVING_PERCENT,
  sizesFor,
  type ColourwayId
} from '@/lib/product'

/** Price, colour and size: the parts of the product page a customer actually operates. */

export function PriceBlock() {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
      <span className="data text-5xl font-semibold leading-none tracking-[-0.03em]">
        {usd(PRODUCT.price)}
      </span>
      <span className="data text-base text-faint line-through decoration-1">{usd(PRODUCT.rrp)}</span>
      <span
        className="data px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.1em]"
        style={{ background: 'var(--color-ink)', color: 'var(--color-ground)' }}
      >
        Save {usd(SAVING)} · {SAVING_PERCENT}%
      </span>
    </div>
  )
}

export function ColourwayPicker({
  value,
  onChange,
  disabled
}: {
  value: ColourwayId
  onChange: (id: ColourwayId) => void
  disabled?: boolean
}) {
  const current = COLOURWAYS.find(c => c.id === value)

  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        <span className="label">Colour</span>
        <span className="text-sm font-medium">{current?.name}</span>
      </div>
      <div className="flex gap-2">
        {COLOURWAYS.map(c => {
          const active = c.id === value
          return (
            <button
              key={c.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(c.id)}
              aria-pressed={active}
              aria-label={c.name}
              title={`${c.name} · ${c.ref}`}
              className="relative h-11 w-11 border-2 transition-transform disabled:opacity-40"
              style={{
                borderColor: active ? 'var(--color-ink)' : 'transparent',
                padding: 3
              }}
            >
              <span
                className="block h-full w-full border"
                style={{ background: c.swatch, borderColor: 'var(--color-rule)' }}
              />
              {active && (
                <span
                  className="absolute -bottom-0.5 left-1/2 h-1 w-4 -translate-x-1/2"
                  style={{ background: c.accent }}
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Sizes for the colour that is actually selected.
 *
 * Availability is a property of the colourway, not of the shoe: Black still has the full run,
 * Stone is down to two pairs. Reading one global list meant every colour offered the same sizes
 * and the same gaps, which is the one thing an end-of-line drop never looks like.
 */
export function SizePicker({
  colourway,
  value,
  onChange,
  disabled
}: {
  colourway: ColourwayId
  value: string | null
  onChange: (uk: string) => void
  disabled?: boolean
}) {
  const sizes = sizesFor(colourway)
  const gone = sizes.filter(s => !s.inStock)
  const low = sizes.filter(s => s.inStock && s.units <= 2)

  return (
    <div>
      <div className="label mb-2">Size · UK</div>
      <div className="flex flex-wrap gap-2">
        {sizes.map(s => {
          const active = s.uk === value
          return (
            <button
              key={s.uk}
              type="button"
              disabled={disabled || !s.inStock}
              onClick={() => onChange(s.uk)}
              aria-pressed={active}
              aria-label={
                s.inStock
                  ? `UK ${s.uk}, EU ${s.eu}, ${s.units} left`
                  : `UK ${s.uk}, out of stock in this colour`
              }
              title={
                s.inStock ? `UK ${s.uk} · EU ${s.eu} · ${s.units} left` : `UK ${s.uk} · sold out`
              }
              className={`data relative h-10 min-w-[3rem] border px-3 text-sm transition-colors ${
                active
                  ? 'border-ink bg-ink text-ground'
                  : s.inStock
                    ? 'border-rule hover:border-ink'
                    : 'border-rule text-faint line-through decoration-1'
              } disabled:cursor-not-allowed`}
            >
              {s.uk}
            </button>
          )
        })}
      </div>

      {/* Both lines are derived from the same numbers the buttons are, so neither can advertise
          a size the checkout would then refuse. */}
      <p className="note mt-2">
        {gone.length > 0 && (
          <>
            {gone.map(s => `UK ${s.uk}`).join(', ')} sold out in this colour
            {low.length > 0 ? '. ' : '.'}
          </>
        )}
        {low.length > 0 && (
          <>
            {low.map(s => `${s.units === 1 ? 'One' : String(s.units)} left in UK ${s.uk}`).join(', ')}.
          </>
        )}
        {gone.length === 0 && low.length === 0 && <>Full run still available in this colour.</>}
      </p>
    </div>
  )
}
