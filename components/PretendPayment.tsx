'use client'

import { useEffect } from 'react'

/**
 * Card and Apple Pay open, and then say what they are.
 *
 * A checkout with one live method and two greyed-out rows reads as a payment demo. A checkout
 * where every method opens something reads as a shop. What matters is that these two do not
 * pretend to work: the sheet appears, looks like the real thing, and tells you plainly that this
 * build only wires up the crypto route. Set dressing, clearly labelled, rather than a fake form
 * that collects a card number.
 */

export function PretendPaymentModal({
  method,
  amount,
  onClose,
  onUseCrypto
}: {
  method: 'card' | 'applePay' | null
  amount: string
  onClose: () => void
  onUseCrypto: () => void
}) {
  useEffect(() => {
    if (!method) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [method, onClose])

  if (!method) return null

  const isApple = method === 'applePay'

  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} aria-hidden />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={isApple ? 'Apple Pay' : 'Card payment'}
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
        className="stamp relative w-full max-w-md border border-rule bg-plate p-6 sm:mb-0 sm:w-auto sm:min-w-[26rem]"
      >
        <div className="rule-b flex items-center justify-between pb-3">
          <span className="text-base font-semibold">{isApple ? 'Apple Pay' : 'Pay by card'}</span>
          <button type="button" onClick={onClose} className="btn-quiet border-0">
            Close
          </button>
        </div>

        <div className="rule-b flex items-baseline justify-between py-4">
          <span className="label">Total</span>
          <span className="data text-2xl font-semibold">{amount}</span>
        </div>

        {isApple ? (
          <div className="py-6 text-center">
            {/* Drawn, not typed. The Apple glyph lives in a private-use codepoint that renders as
                tofu on Windows and Android, which is most of the machines this will be shown on. */}
            <svg
              viewBox="0 0 24 24"
              className="mx-auto h-14 w-14"
              fill="currentColor"
              aria-hidden
            >
              <path d="M16.3 12.7c0-2.2 1.8-3.3 1.9-3.4-1-1.5-2.6-1.7-3.2-1.7-1.4-.1-2.7.8-3.3.8-.7 0-1.7-.8-2.8-.8-1.5 0-2.8.8-3.6 2.1-1.5 2.6-.4 6.5 1.1 8.6.7 1 1.6 2.2 2.7 2.2 1.1 0 1.5-.7 2.8-.7 1.3 0 1.6.7 2.8.7 1.2 0 1.9-1 2.6-2.1.8-1.2 1.2-2.3 1.2-2.4-.1 0-2.2-.9-2.2-3.3zM14.1 6.2c.6-.7 1-1.7.9-2.7-.9 0-2 .6-2.6 1.3-.6.6-1.1 1.7-.9 2.6 1 .1 2-.5 2.6-1.2z" />
            </svg>
            <p className="mt-4 text-sm font-medium">Double-click the side button to pay</p>
          </div>
        ) : (
          <div className="space-y-3 py-5" aria-hidden>
            {[
              ['Card number', '•••• •••• •••• ••••'],
              ['Expiry', 'MM / YY'],
              ['Security code', '•••']
            ].map(([label, placeholder]) => (
              <div key={label}>
                <div className="label mb-1">{label}</div>
                <div className="data border border-rule bg-ground px-3 py-2.5 text-sm text-faint">
                  {placeholder}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="rule-t pt-4">
          <p className="text-sm font-medium">This one is for show.</p>
          <p className="note mt-1">
            {isApple ? 'Apple Pay' : 'Card payments'} would sit alongside the crypto route in a real
            build. Only the crypto route is wired up here, because that is the part worth
            demonstrating.
          </p>
          <button type="button" onClick={onUseCrypto} className="btn-primary mt-4 w-full py-3 text-sm">
            Pay with crypto instead
          </button>
        </div>
      </div>
    </div>
  )
}
