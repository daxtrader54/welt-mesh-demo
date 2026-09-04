'use client'

import Image from 'next/image'
import { PLATES, SPEC, plateSrc, type ColourwayId, type PlateId } from '@/lib/product'

/**
 * The product sits on a white drawing plate against the warm ground, which is what makes the
 * photographs work without knocking out their backgrounds.
 *
 * Callouts are positioned as percentages of the plate and labelled in HTML rather than SVG text.
 * The previous version used a fixed 800-unit viewBox with 19-unit type, which scaled with the
 * container: 12.7px on a wide desktop and 6.4px on a phone, where it read as a rendering fault.
 * Percentages also survive the images being re-cropped, which the fixed coordinates did not.
 */

type Callout = {
  /** Matches an entry in SPEC, so the drawing and the table are the same numbered list. */
  n: string
  /** Where the dot sits on the shoe, as a percentage of the plate. */
  x: number
  y: number
  /** Which side the label sits on. */
  side: 'left' | 'right'
  /** Vertical position of the label, as a percentage. */
  ly: number
}

/**
 * One callout per spec entry, no more, so following a number from the drawing to the table always
 * lands somewhere. The profile carries the midsole because that is where the sidewall print is;
 * the sole and the top-down carry the rest. A side profile takes one leader line and no more.
 */
const CALLOUTS: Partial<Record<PlateId, Callout[]>> = {
  lateral: [{ n: '02', x: 52, y: 78, side: 'left', ly: 88 }],
  outsole: [{ n: '03', x: 34, y: 45, side: 'left', ly: 18 }],
  top: [
    { n: '01', x: 50, y: 17, side: 'right', ly: 10 },
    { n: '05', x: 50, y: 40, side: 'left', ly: 34 },
    { n: '04', x: 50, y: 72, side: 'right', ly: 80 }
  ]
}

const spec = (n: string) => SPEC.find(s => s.n === n)

export function ProductPlate({
  colourway,
  plate,
  onPlateChange
}: {
  colourway: ColourwayId
  plate: PlateId
  onPlateChange: (plate: PlateId) => void
  /** After payment the product state changes. Small thing, and the whole point of buying it. */
  owned?: boolean
}) {
  const callouts = CALLOUTS[plate] ?? []

  return (
    <div>
      {/* 3:2, matched to the profile shots after cropping. The source frames were square with the
          shoe in a middle band, which left a quarter of the plate empty above and below the hero. */}
      <div className="relative aspect-[3/2] w-full border border-rule bg-plate">
        <Image
          key={`${colourway}-${plate}`}
          src={plateSrc(colourway, plate)}
          alt={`${plate} view`}
          fill
          priority={plate === 'lateral'}
          sizes="(max-width: 1024px) 100vw, 46vw"
          className="object-contain"
        />

        {/* Hidden on narrow screens: the labels need room the plate does not have on a phone. */}
        {callouts.length > 0 && (
          <div className="pointer-events-none absolute inset-0 hidden sm:block" aria-hidden>
            <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
              {callouts.map(c => (
                <line
                  key={c.n}
                  x1={`${c.x}%`}
                  y1={`${c.y}%`}
                  x2={`${c.side === 'left' ? 8 : 92}%`}
                  y2={`${c.ly + 2}%`}
                  stroke="var(--plate-accent)"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>

            {callouts.map(c => (
              <span
                key={`${c.n}-dot`}
                className="absolute block h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{ left: `${c.x}%`, top: `${c.y}%`, background: 'var(--plate-accent)' }}
              />
            ))}

            {callouts.map(c => (
              <span
                key={`${c.n}-label`}
                className="label absolute whitespace-nowrap text-ink"
                style={{
                  top: `${c.ly}%`,
                  left: c.side === 'left' ? '8%' : undefined,
                  right: c.side === 'right' ? '8%' : undefined,
                  transform: c.side === 'left' ? undefined : 'translateX(0)'
                }}
              >
                {c.n} {spec(c.n)?.label ?? ''}
              </span>
            ))}
          </div>
        )}

        <span className="label absolute bottom-3 left-3">{plate}</span>
      </div>

      <div className="mt-2 grid grid-cols-5 gap-2">
        {PLATES.map(p => {
          const active = p.id === plate
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onPlateChange(p.id)}
              aria-pressed={active}
              aria-label={`${p.label} view`}
              className={`relative aspect-[3/2] border bg-plate transition-colors ${
                active ? 'border-ink' : 'border-rule hover:border-rule-strong'
              }`}
            >
              <Image
                src={plateSrc(colourway, p.id)}
                alt=""
                fill
                sizes="120px"
                className="object-contain p-1"
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}
