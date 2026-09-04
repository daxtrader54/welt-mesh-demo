'use client'

import { useEffect } from 'react'
import { BRAND } from '@/lib/product'

/**
 * The one failure the app had nothing for.
 *
 * Sixteen named failure states cover everything Mesh can do, and an unhandled render error inside
 * the client tree replaced all of it with React's stock "Application error: a client-side exception
 * has occurred" — no branding, no explanation, and a reload as the only way out, which then loses
 * the run.
 */
export default function Error({
  error,
  reset
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[welt] unhandled render error', error)
  }, [error])

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col justify-center px-6">
      <span className="text-xl font-extrabold tracking-[0.2em]">{BRAND}</span>

      <div className="rule-t mt-8 pt-8">
        <h1 className="text-[2rem] font-bold leading-[1.05] tracking-[-0.02em]">
          Something in the page stopped working.
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          No payment was affected by this. If an order was already placed it is safe on the server,
          and nothing here can take money.
        </p>

        <div className="mt-7 flex flex-wrap items-center gap-5">
          <button type="button" onClick={reset} className="btn-primary px-6 py-3.5 text-sm">
            Try again
          </button>
          <a href="/" className="btn-quiet">
            Back to the shop
          </a>
        </div>

        {error.digest && <p className="note mt-6">Reference {error.digest}</p>}
      </div>
    </main>
  )
}
