'use client'

import { useState } from 'react'
import type { Failure } from '@/lib/failure'

/**
 * Failure states are designed here rather than left to whatever string an SDK produced.
 * The shopper reads a plain sentence and gets one action. The real message and the Mesh
 * reference are kept for the technical view, where someone can do something with them.
 */
export function FailureNotice({
  failure,
  onRetry,
  onDismiss,
  dismissLabel = 'Back to the shop'
}: {
  failure: Failure
  onRetry?: () => void
  onDismiss?: () => void
  dismissLabel?: string
}) {
  return (
    <div
      role="alert"
      className="border border-rule bg-plate p-5"
      style={{ borderLeft: '3px solid var(--color-warn)' }}
    >
      <div className="label" style={{ color: 'var(--color-warn)' }}>
        {failure.code.replace(/_/g, ' ')}
      </div>
      <p className="mt-1.5 text-base font-medium">{failure.title}</p>
      {failure.hint && <p className="mt-1 text-sm text-muted">{failure.hint}</p>}

      <div className="mt-4 flex items-center gap-5">
        {failure.retryable && onRetry && (
          <button type="button" onClick={onRetry} className="btn-primary px-4 py-2 text-xs">
            Try again
          </button>
        )}
        {onDismiss && (
          <button type="button" onClick={onDismiss} className="btn-quiet">
            {dismissLabel}
          </button>
        )}
      </div>

      {(failure.detail || failure.reference) && (
        <p className="note mt-4">
          {failure.detail}
          {failure.reference ? ` · ref ${failure.reference}` : ''}
        </p>
      )}
    </div>
  )
}

/**
 * Sandbox has to be unmistakable, and it has to stay on screen through the payment step.
 *
 * This is not decoration. During the build probe, real Coinbase credentials were typed into the
 * Mesh sandbox login by mistake, and the confirmation code was not to hand at the point Link
 * asked for it. If that can happen to the person building it, it will happen to someone watching
 * a demo.
 */
export function SandboxNotice({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`border border-rule bg-plate ${compact ? 'px-4 py-3' : 'p-5'}`}>
      <div className="label">Mesh sandbox · no real account, no real money</div>
      <p className="mt-1.5 text-sm">
        Sign in with the test account below. Do not use real exchange credentials.
      </p>
      <dl className="data mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <div className="flex gap-2">
          <dt className="label">User</dt>
          <dd>Mesh</dd>
        </div>
        <div className="flex gap-2">
          <dt className="label">Pass</dt>
          <dd>Pass123</dd>
        </div>
        <div className="flex gap-2">
          <dt className="label">Code</dt>
          <dd>123456</dd>
        </div>
      </dl>
      <p className="note mt-2">
        The same code is asked for again when you confirm the payment.
      </p>
    </div>
  )
}

/**
 * The disclaimer, which is entirely true and also the only place in the build allowed to enjoy
 * itself. Every line is a real limitation stated plainly; the comedy is that there are so many.
 */
const SMALL_PRINT = [
  'WELT is not a company. It is a shop-shaped explanation of a payments integration.',
  'Not affiliated with, endorsed by, or known to Skechers, MandM Direct, Coinbase, Binance or anyone with a legal department.',
  'No orders are fulfilled. No goods are shipped. No shoes exist. The photographs are of a real shoe that exists somewhere, just not here.',
  'The reviews are written. Nobody bought a second pair. There is no first pair.',
  'Free delivery is free in the sense that nothing is delivered.',
  'UK 10 and 11 are out of stock in the sense that they were never in stock.',
  'Payments run against the Mesh sandbox. The exchange is simulated, the balance is simulated, and the ten million dollars of cash in it belongs to nobody.',
  'The transaction reference is issued by Mesh and resolves to nothing on Ethereum mainnet, Sepolia or Base. We checked all three before deciding not to link to an explorer.',
  'The one cent fee is real, in the sense that a simulated exchange genuinely calculated it.',
  'For educational purposes only, where the education is how a Mesh integration fits together.',
  'Any resemblance to a functioning retailer is deliberate and not legally binding.'
]

export function Footer() {
  const [open, setOpen] = useState(false)

  return (
    <footer className="rule-t mt-16 py-6">
      <p className="note">
        Demonstration store. Not affiliated with Skechers or MandM Direct. No orders are fulfilled
        and no goods are shipped. Payments run against the Mesh sandbox.
      </p>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="btn-quiet mt-3"
      >
        {open ? 'Enough small print' : 'Read the small print'}
      </button>

      {open && (
        <ul className="mt-4 max-w-3xl space-y-1.5">
          {SMALL_PRINT.map((line, i) => (
            <li key={i} className="flex gap-3">
              <span className="data text-[10px] text-faint">{String(i + 1).padStart(2, '0')}</span>
              <span className="note">{line}</span>
            </li>
          ))}
        </ul>
      )}
    </footer>
  )
}
