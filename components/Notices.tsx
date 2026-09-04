'use client'

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

export function Footer() {
  return (
    <footer className="rule-t mt-16 py-6">
      <p className="note">
        Demonstration store. Not affiliated with Skechers or MandM Direct. No orders are fulfilled
        and no goods are shipped. Payments run against the Mesh sandbox.
      </p>
    </footer>
  )
}
