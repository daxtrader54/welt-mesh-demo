'use client'

import { useState } from 'react'
import { PRODUCT } from '@/lib/product'
import type { BagItem } from './Bag'

/**
 * Where it goes.
 *
 * A checkout that jumps from bag to payment is not a checkout anyone recognises, and testers said
 * so: the first thing a shopper expects after the bag is being asked for a name and an address.
 *
 * It never leaves the browser. Nothing here is posted to a route, written to Redis or sent to
 * Mesh, because nothing ships and the alternative is a demo that collects real postal addresses
 * from whoever clicks through it. It lives in sessionStorage, so it survives a refresh and dies
 * with the tab. The receipt reads it from the same place.
 */

export type Address = {
  name: string
  email: string
  line1: string
  town: string
  postcode: string
}

export const EMPTY_ADDRESS: Address = { name: '', email: '', line1: '', town: '', postcode: '' }

/** Filled in one click, because a live demo should not be someone typing a postcode. */
const SAMPLE: Address = {
  name: 'Alex Whitfield',
  email: 'alex.whitfield@example.com',
  line1: '14 Cheapside',
  town: 'London',
  postcode: 'EC2V 6AA'
}

const FIELDS: { key: keyof Address; label: string; type?: string; autoComplete: string }[] = [
  { key: 'name', label: 'Full name', autoComplete: 'name' },
  { key: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
  { key: 'line1', label: 'Address', autoComplete: 'address-line1' },
  { key: 'town', label: 'Town or city', autoComplete: 'address-level2' },
  { key: 'postcode', label: 'Postcode', autoComplete: 'postal-code' }
]

export function isComplete(a: Address): boolean {
  return FIELDS.every(f => a[f.key].trim().length > 0)
}

/** One line, the way a shop prints it back at you. */
export function formatAddress(a: Address): string {
  return [a.line1, a.town, a.postcode].filter(Boolean).join(', ')
}

export function DeliveryForm({
  item,
  value,
  onChange,
  onContinue,
  onBack
}: {
  item: BagItem
  value: Address
  onChange: (next: Address) => void
  onContinue: () => void
  onBack: () => void
}) {
  const [touched, setTouched] = useState(false)
  const set = (key: keyof Address, v: string) => onChange({ ...value, [key]: v })
  const missing = (key: keyof Address) => touched && value[key].trim().length === 0

  return (
    <main className="mx-auto w-full max-w-lg py-8">
      <button type="button" onClick={onBack} className="btn-quiet">
        Back to the bag
      </button>

      <h1 className="mt-5 text-[2rem] font-bold leading-[1] tracking-[-0.02em]">Where is it going?</h1>
      <p className="note mt-2">
        Stays in this browser. Nothing is sent to our servers, nothing is stored, and nothing ships,
        because this is a demonstration store.
      </p>

      <form
        className="mt-7 flex flex-col gap-4"
        onSubmit={e => {
          e.preventDefault()
          setTouched(true)
          if (isComplete(value)) onContinue()
        }}
        noValidate
      >
        {FIELDS.map(f => (
          <div key={f.key}>
            <label htmlFor={`d-${f.key}`} className="label block">
              {f.label}
            </label>
            <input
              id={`d-${f.key}`}
              type={f.type ?? 'text'}
              autoComplete={f.autoComplete}
              value={value[f.key]}
              onChange={e => set(f.key, e.target.value)}
              aria-invalid={missing(f.key) || undefined}
              aria-describedby={missing(f.key) ? `d-${f.key}-err` : undefined}
              className="mt-1.5 w-full border bg-plate px-3 py-3 text-sm outline-none focus:border-ink"
              style={{ borderColor: missing(f.key) ? 'var(--color-warn)' : 'var(--color-rule)' }}
            />
            {missing(f.key) && (
              <p id={`d-${f.key}-err`} className="note mt-1" style={{ color: 'var(--color-warn)' }}>
                {f.label} is needed to deliver the order.
              </p>
            )}
          </div>
        ))}

        <div className="rule-t mt-2 flex items-baseline justify-between gap-4 pt-4">
          <span className="text-sm text-muted">
            {PRODUCT.name} · {item.colourway.name} · UK {item.size}
          </span>
          <span className="note">Free delivery, 2 to 4 days</span>
        </div>

        <button type="submit" className="btn-primary w-full py-4 text-sm">
          Continue to payment
        </button>

        <button type="button" onClick={() => onChange(SAMPLE)} className="btn-quiet self-start">
          Fill in a sample address
        </button>
      </form>
    </main>
  )
}

/** The confirmed address, shown back on the checkout so it can be corrected before paying. */
export function DeliverySummary({ address, onEdit }: { address: Address; onEdit: () => void }) {
  return (
    <div className="rule-t flex items-start justify-between gap-4 pt-3">
      <div className="min-w-0">
        <div className="label">Delivering to</div>
        <p className="mt-1 truncate text-sm">{address.name}</p>
        <p className="note truncate">{formatAddress(address)}</p>
      </div>
      <button type="button" onClick={onEdit} className="btn-quiet shrink-0">
        Edit
      </button>
    </div>
  )
}
