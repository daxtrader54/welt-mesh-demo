'use client'

import { useEffect, useState } from 'react'
import { clockTime, maskToken } from '@/lib/format'
import type { OrderState } from '@/lib/order/state'

/**
 * Behind the payment.
 *
 * Three audiences, one panel. The product lead already has the manifest in plain English on the
 * page. Here the engineer gets the real event stream and the six routes this app actually has,
 * stamped as the session hits them, which answers "what work is this for us" with data from the
 * run they just watched rather than with a diagram. And whoever is driving the demo gets the
 * sandbox accounts, because failure states should be shown for real rather than described.
 */

export type ServerCall = {
  at: number
  route: string
  mesh: string | null
  ms: number | null
  ok: boolean
}

export type ConnectionSummary = {
  brokerName: string
  brokerType: string
  accountName: string | null
  tokenId: string | null
  authTokenMasked: string
}

type Provider = {
  id: string
  name: string
  type: string
  canPay: boolean
  sandboxAvailable: boolean
  reason: string | null
}

/** Every route this app has. Six of them, which is the whole integration. */
const ROUTES: { route: string; does: string; mesh: string | null }[] = [
  { route: 'POST /api/mesh/link-token', does: 'Mints a Link token on the click', mesh: 'POST /api/v1/linktoken' },
  { route: 'POST /api/mesh/connection', does: 'Takes custody of the auth token', mesh: null },
  { route: 'GET /api/mesh/portfolio', does: 'Reads holdings for the connection', mesh: 'POST /api/v1/holdings/get + /value' },
  { route: 'PATCH /api/orders/:id', does: 'Records what the browser saw', mesh: null },
  { route: 'POST /api/mesh/webhook', does: 'Verifies signature, settles the order', mesh: 'inbound from Mesh' },
  { route: 'GET /api/mesh/providers', does: 'Who could fund this payment', mesh: 'GET /api/v1/transfers/managed/integrations' }
]

/**
 * The console bar.
 *
 * A rotated edge tab was the first attempt and it collapsed into an unreadable blob, which is a
 * fair verdict on trying to be clever with writing-mode. This is a bar pinned to the bottom of the
 * viewport that tickers Mesh events as they arrive. It advertises the panel by doing something,
 * and a live feed along the bottom of the screen is a shape everybody already understands.
 *
 * Content is centred rather than left-aligned, because the bottom-left corner is where dev
 * tools and framework badges sit, and the label was disappearing behind Next's own indicator.
 */
export function ConsoleBar({
  order,
  open,
  onToggle
}: {
  order: OrderState
  open: boolean
  onToggle: () => void
}) {
  // A short trail, newest last, so the bar visibly moves as events land rather than swapping one
  // word. Three is enough to read at a glance while a payment is running.
  const trail = order.log.slice(-3)

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-center gap-5 border-t border-rule bg-plate px-16 py-2.5 transition-colors hover:bg-ground"
    >
      <span className="flex shrink-0 items-center gap-2">
        <span
          className="h-2 w-2 rounded-full"
          style={{
            background: trail.length ? 'var(--color-accent-deep)' : 'var(--color-rule-strong)'
          }}
          aria-hidden
        />
        <span className="label">Behind the payment</span>
      </span>

      <span className="hidden min-w-0 items-baseline gap-4 sm:flex">
        {trail.length ? (
          trail.map((e, i) => (
            <span
              key={`${e.at}-${e.type}-${i}`}
              className="data stamp whitespace-nowrap text-xs"
              style={{ opacity: 0.4 + (i / Math.max(trail.length - 1, 1)) * 0.6 }}
            >
              <span className="text-faint">{clockTime(e.at)}</span> {e.type}
            </span>
          ))
        ) : (
          <span className="note whitespace-nowrap">
            Live Mesh events, the routes behind them, and the sandbox accounts.
          </span>
        )}
      </span>

      <span className="flex shrink-0 items-center gap-3">
        {order.log.length > 0 && (
          <span className="data text-xs text-muted">{order.log.length} events</span>
        )}
        <span className="label">{open ? 'Close' : 'Open'}</span>
      </span>
    </button>
  )
}

type Tab = 'events' | 'integration' | 'providers' | 'demo'

export function TechnicalView({
  open,
  docked,
  onClose,
  order,
  calls,
  connection,
  onReset
}: {
  open: boolean
  docked: boolean
  onClose: () => void
  order: OrderState
  calls: ServerCall[]
  connection: ConnectionSummary | null
  onReset: () => void
}) {
  const [tab, setTab] = useState<Tab>('events')
  const [expanded, setExpanded] = useState<number | null>(null)
  const [providers, setProviders] = useState<Provider[] | null>(null)
  const [health, setHealth] = useState<{ storage?: string; config?: { environment?: string } } | null>(null)

  useEffect(() => {
    if (!open) return
    if (tab === 'providers' && !providers) {
      fetch('/api/mesh/providers')
        .then(r => r.json())
        .then(j => setProviders(j.providers ?? []))
        .catch(() => setProviders([]))
    }
    if (tab === 'demo' && !health) {
      fetch('/api/health').then(r => r.json()).then(setHealth).catch(() => setHealth({}))
    }
  }, [open, tab, providers, health])

  useEffect(() => {
    if (!open || docked) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, docked, onClose])

  if (!open) return null

  const body = (
    <div className="flex h-full flex-col bg-ground">
      <div className="rule-b flex items-center justify-between px-5 py-3">
        <span className="label">Behind the payment</span>
        {!docked && (
          <button type="button" onClick={onClose} className="btn-quiet border-0">
            Close
          </button>
        )}
      </div>

      <nav className="rule-b flex gap-4 px-5">
        {(['events', 'integration', 'providers', 'demo'] as Tab[]).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className="label border-b-2 py-2.5"
            style={{
              borderColor: tab === t ? 'var(--color-ink)' : 'transparent',
              color: tab === t ? 'var(--color-ink)' : undefined
            }}
          >
            {t}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-auto px-5 py-4">
        {tab === 'events' && (
          <>
            <p className="note mb-3">
              Every event the Mesh SDK fired, in order, with its real payload. {order.log.length} so far.
            </p>
            {order.log.length === 0 && <p className="text-sm text-muted">Nothing yet. Start a payment.</p>}
            <ol>
              {order.log.map((e, i) => (
                <li key={i} className="rule-b py-1.5">
                  <button
                    type="button"
                    onClick={() => setExpanded(expanded === i ? null : i)}
                    className="flex w-full items-baseline gap-3 text-left"
                  >
                    <span className="data text-xs text-faint">{clockTime(e.at)}</span>
                    <span className="data flex-1 text-xs">{e.type}</span>
                    {e.payload != null && <span className="label">{expanded === i ? '−' : '+'}</span>}
                  </button>
                  {expanded === i && e.payload != null && (
                    <pre className="data mt-1.5 max-h-64 overflow-auto bg-plate p-3 text-[11px] leading-relaxed text-muted">
                      {JSON.stringify(e.payload, null, 2)}
                    </pre>
                  )}
                </li>
              ))}
            </ol>
          </>
        )}

        {tab === 'integration' && (
          <>
            <p className="note mb-3">
              Six routes. The client secret exists only inside them, and the browser only ever
              receives a Link token.
            </p>
            <ul>
              {ROUTES.map(r => {
                const hits = calls.filter(c => c.route === r.route)
                const last = hits.at(-1)
                return (
                  <li key={r.route} className="rule-b py-2.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="data text-xs">{r.route}</span>
                      <span className="data text-xs text-faint">
                        {last ? `${clockTime(last.at)}${last.ms ? ` · ${last.ms}ms` : ''}` : '—'}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-baseline justify-between gap-3">
                      <span className="note">{r.does}</span>
                      {r.mesh && <span className="data text-[11px] text-faint">{r.mesh}</span>}
                    </div>
                  </li>
                )
              })}
            </ul>

            <div className="rule-t mt-5 pt-4">
              <div className="label mb-2">Connection</div>
              {connection ? (
                <dl className="space-y-1">
                  {[
                    ['Provider', connection.brokerName],
                    ['Broker type', connection.brokerType],
                    ['Account', connection.accountName ?? '—'],
                    ['Token id', connection.tokenId ?? 'none (self-custody wallet)'],
                    ['Auth token', connection.authTokenMasked]
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-baseline justify-between gap-4">
                      <dt className="label">{k}</dt>
                      <dd className="data text-xs">{v}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-sm text-muted">No account connected yet.</p>
              )}
              <p className="note mt-3">
                The auth token reaches the browser because the SDK hands it to
                onIntegrationConnected. It is posted to the server immediately and never sent back
                down. Masked here so you can see one arrived, not what it is.
              </p>

              <div className="rule-t mt-5 pt-4">
                <div className="label mb-2">Taking a merchant fee</div>
                <p className="note">
                  Mesh supports a merchant cut as `clientFee` on the link token, given as a
                  proportion of the order rather than a cash figure. It is wired up and tested
                  here, and set to zero: a $50 shop that charges $52 either advertises the wrong
                  price or reveals the fee at the last step, and the second one is drip pricing.
                  Set NEXT_PUBLIC_MERCHANT_HANDLING_FEE to see it flow through the bag, the
                  checkout and the receipt.
                </p>
              </div>
            </div>
          </>
        )}

        {tab === 'providers' && (
          <>
            <p className="note mb-3">
              Live from the Mesh catalogue, checked against USDC on Ethereum. Widening this is one
              optional field on the link token, not a project. Brands appear more than once because
              the catalogue carries several integration types per brand, and they behave
              differently: sandboxCoinbase has a test account, coinbase is the real OAuth flow, and
              coinbaseRamp is the onramp.
            </p>
            {!providers && <p className="text-sm text-muted">Loading…</p>}
            {providers?.map(p => (
              <div key={p.id} className="rule-b flex items-baseline justify-between gap-3 py-2">
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="text-sm">{p.name}</span>
                  <span className="data truncate text-[11px] text-faint">{p.type}</span>
                </span>
                <span className="note shrink-0">
                  {p.canPay ? (p.sandboxAvailable ? 'usable here' : 'production only') : p.reason}
                </span>
              </div>
            ))}
          </>
        )}

        {tab === 'demo' && (
          <>
            <div className="label mb-2">Sandbox accounts</div>
            <p className="note mb-3">
              Password Pass123, code 123456 for all of them. These produce real states, so failure
              can be shown rather than described.
            </p>
            <ul>
              {[
                ['Mesh', 'Full portfolio. The happy path.'],
                ['Mesh2', 'Empty. Produces a genuine no eligible assets.'],
                ['Mesh3', 'Cash only.'],
                ['Mesh4', 'Large balance.']
              ].map(([user, note]) => (
                <li key={user} className="rule-b flex items-baseline justify-between gap-3 py-2">
                  <span className="data text-sm">{user}</span>
                  <span className="note">{note}</span>
                </li>
              ))}
            </ul>

            <div className="rule-t mt-5 pt-4">
              <div className="label mb-2">This deployment</div>
              <dl className="space-y-1">
                <div className="flex items-baseline justify-between">
                  <dt className="label">Environment</dt>
                  <dd className="data text-xs">{health?.config?.environment ?? '…'}</dd>
                </div>
                <div className="flex items-baseline justify-between">
                  <dt className="label">Storage</dt>
                  <dd className="data text-xs">{health?.storage ?? '…'}</dd>
                </div>
              </dl>
              {health?.storage === 'memory' && (
                <p className="note mt-2" style={{ color: 'var(--color-warn)' }}>
                  In-memory store. Fine locally, unreliable on serverless: the webhook and the
                  browser may not be the same instance, so settlement will not appear.
                </p>
              )}
            </div>

            <button type="button" onClick={onReset} className="btn-primary mt-5 px-4 py-2 text-xs">
              Reset demo
            </button>
            <p className="note mt-2">
              Clears this store&apos;s session and order. Deliberately keeps the Mesh connection, so
              the next run does not have to sign in again.
            </p>
          </>
        )}
      </div>
    </div>
  )

  if (docked) {
    return <aside className="hidden h-screen w-[26rem] shrink-0 border-l border-rule lg:block">{body}</aside>
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-ink/20" onClick={onClose} aria-hidden />
      <aside
        className="fixed inset-y-0 right-0 z-50 w-full max-w-lg border-l border-rule shadow-2xl"
        role="dialog"
        aria-label="Behind the payment"
      >
        {body}
      </aside>
    </>
  )
}
