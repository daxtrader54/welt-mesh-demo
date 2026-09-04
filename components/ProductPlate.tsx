'use client'

import Image from 'next/image'
import { PLATES, plateSrc, type ColourwayId, type PlateId } from '@/lib/product'

/**
 * The product sits on a white drawing plate against the warm ground, which is what makes the
 * photographs work without knocking out their backgrounds.
 *
 * Two of the five views take annotation well. A side profile does not, because a leader line
 * across a shoe's flank just looks like a scratch. The sole and the top-down have real structure
 * to point at, so those are the ones that get callouts.
 */

type Callout = { n: string; label: string; x: number; y: number; tx: number; ty: number }

// Hand-placed against the 800x800 source frames, which are consistent across all four colourways.
const CALLOUTS: Partial<Record<PlateId, Callout[]>> = {
  outsole: [
    { n: '03', label: 'Flex grooves', x: 250, y: 330, tx: 62, ty: 208 },
    { n: '03', label: 'Heel pad', x: 640, y: 400, tx: 700, ty: 596 }
  ],
  top: [
    { n: '01', label: 'Mesh upper', x: 400, y: 150, tx: 640, ty: 92 },
    { n: '05', label: 'Lace closure', x: 400, y: 300, tx: 128, ty: 244 },
    { n: '04', label: 'Memory foam', x: 400, y: 560, tx: 656, ty: 640 }
  ]
}

export function ProductPlate({
  colourway,
  plate,
  onPlateChange,
  owned = false
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
      {/* Not square. The source frames put the shoe in a middle band, so a square plate leaves a
          quarter of its height empty above and below the hero view. */}
      <div className="relative aspect-[5/4] w-full border border-rule bg-plate">
        <Image
          key={`${colourway}-${plate}`}
          src={plateSrc(colourway, plate)}
          alt={`${plate} view`}
          fill
          priority={plate === 'lateral'}
          sizes="(max-width: 1024px) 100vw, 46vw"
          className="object-contain"
        />

        {callouts.length > 0 && (
          <svg
            viewBox="0 0 800 800"
            className="pointer-events-none absolute inset-0 h-full w-full"
            aria-hidden
          >
            {callouts.map((c, i) => (
              <g key={i} stroke="var(--plate-accent)" fill="var(--plate-accent)">
                <circle cx={c.x} cy={c.y} r="4" />
                <line x1={c.x} y1={c.y} x2={c.tx} y2={c.ty} strokeWidth="1" />
                <text
                  x={c.tx}
                  y={c.ty - 10}
                  textAnchor={c.tx > 400 ? 'end' : 'start'}
                  className="font-mono"
                  style={{ fontSize: 19, letterSpacing: '0.1em' }}
                  fill="var(--color-ink)"
                  stroke="none"
                >
                  {c.n} {c.label.toUpperCase()}
                </text>
              </g>
            ))}
          </svg>
        )}

        <span className="label absolute bottom-3 left-3">{plate}</span>

        {owned && (
          <span
            className="stamp data absolute right-5 top-5 border-2 px-3 py-1.5 text-sm font-bold uppercase tracking-[0.2em]"
            style={{
              borderColor: 'var(--plate-accent)',
              color: 'var(--plate-accent)',
              transform: 'rotate(-6deg)'
            }}
          >
            Yours
          </span>
        )}
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
              className={`relative aspect-square border bg-plate transition-colors ${
                active ? 'border-ink' : 'border-rule hover:border-rule-strong'
              }`}
            >
              <Image
                src={plateSrc(colourway, p.id)}
                alt=""
                fill
                sizes="90px"
                className="object-contain p-1"
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}
