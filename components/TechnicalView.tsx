'use client'

import { useEffect, useState } from 'react'
import { clockTime, maskToken } from '@/lib/format'
import type { OrderState } from '@/lib/order/state'

/**
 * How many event types the SDK can emit, counted from
 * `LINK_EVENT_TYPE_KEYS` in @meshconnect/web-link-sdk@3.12.0.
 *
 * It matters because "only eleven events fired" reads like something is filtering them. Nothing
 * is: every event Mesh sends is logged unaltered. The other thirty-odd belong to flows this shop
 * does not use, such as wallet verification, onramp funding options and manual QR deposits, or to
 * steps that genuinely did not happen, like signing in again when a managed token skipped it.
 */
const SDK_EVENT_TYPES = 43

/**
 * Behind the payment.
 *
 * Three audiences, one panel. The product lead already has the manifest in plain English on the
 * page. Here the engineer gets the real event stream and the routes this app actually has,
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

/**
 * The routes that carry the integration.
 *
 * Nine route files exist. `GET /api/health` and `POST /api/session/reset` are demo scaffolding and
 * are left out, which leaves the seven below. Each is listed by the method that does the work, so
 * `/api/mesh/connection` appears as its POST (its GET is the returning-shopper check) and
 * `/api/orders/:id` as its PATCH (its GET is the settlement poll).
 */
const ROUTES: { route: string; does: string; mesh: string | null }[] = [
  { route: 'POST /api/mesh/link-token', does: 'Mints a Link token on the click', mesh: 'POST /api/v1/linktoken' },
  { route: 'POST /api/mesh/connection', does: 'Takes custody of the auth token', mesh: null },
  { route: 'GET /api/mesh/portfolio', does: 'Reads holdings for the connection', mesh: 'POST /api/v1/holdings/get + /value' },
  {
    route: 'GET /api/mesh/quotes',
    does: 'Per-asset eligibility, fees and funding source',
    mesh: 'POST /api/v1/transfers/managed/quote'
  },
  { route: 'PATCH /api/orders/:id', does: 'Records what the browser saw', mesh: null },
  { route: 'POST /api/mesh/webhook', does: 'Verifies signature, settles the order', mesh: 'inbound from Mesh' },
  {
    route: 'GET /api/mesh/providers',
    does: 'Who could fund this, and who Link will offer',
    mesh: 'GET /api/v1/transfers/managed/integrations + /integrations'
  }
]

/**
 * The handle that opens and closes the panel, sitting on the rule the panel opens along.
 *
 * Half on the page and half on the panel, so it reads as the seam between them rather than as
 * another control floating on the shop. The arrow points the way the panel will move.
 */
export function PanelHandle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={open ? 'Collapse the technical panel' : 'Open the technical panel'}
      title={open ? 'Collapse' : 'Behind the payment'}
      className="fixed top-1/2 z-40 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-rule-strong bg-plate text-ink shadow-sm transition-[right,border-color] duration-200 hover:border-ink lg:grid"
      style={{ right: open ? 'calc(26rem - 1.125rem)' : '0.75rem' }}
    >
      <span className="data text-sm leading-none" aria-hidden>
        {open ? '›' : '‹'}
      </span>
    </button>
  )
}

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
  onToggle,
  className = ''
}: {
  order: OrderState
  open: boolean
  onToggle: () => void
  className?: string
}) {
  // A short trail, newest last, so the bar visibly moves as events land rather than swapping one
  // word. Three is enough to read at a glance while a payment is running.
  const trail = order.log.slice(-3)

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      /* The bottom inset keeps the tap target clear of iOS Safari's toolbar and the home
         indicator, which were sitting on top of it. */
      style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}
      className={`group fixed inset-x-0 bottom-0 z-30 flex items-center justify-center gap-4 border-t-2 border-ink bg-plate px-4 pt-2 transition-colors hover:bg-ground sm:gap-5 sm:px-16 ${className}`}
    >
      <span className="flex shrink-0 items-center gap-2">
        <span
          className="h-2 w-2 rounded-full"
          style={{
            background: trail.length ? 'var(--color-accent-deep)' : 'var(--color-rule-strong)'
          }}
          aria-hidden
        />
        <span className="label text-ink">Behind the payment</span>
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
          <span className="note whitespace-nowrap text-ink">
            Live Mesh events, the routes behind them, and the sandbox accounts.
          </span>
        )}
      </span>

      <span className="flex shrink-0 items-center gap-3">
        {order.log.length > 0 && (
          <span className="data hidden text-xs text-muted sm:inline">
            {order.log.length} events
          </span>
        )}
        {/* The one accent on this bar, so it reads as the thing to press rather than a caption. */}
        <span
          className="data px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] transition-transform group-hover:translate-x-0.5"
          style={{ background: 'var(--color-accent)', color: 'var(--color-ink)' }}
        >
          {open ? 'Close' : 'Open'} →
        </span>
      </span>
    </button>
  )
}

type Tab = 'events' | 'integration' | 'providers' | 'build' | 'demo'

/**
 * How the thing was put together, for the person who asks after the demo rather than during it.
 * Decisions and their reasons, not a feature list, because the reasons are the transferable part.
 */
const BUILD_NOTES: { heading: string; body: string }[] = [
  {
    heading: 'Two Link sessions, not one',
    body: 'Holdings can only be read once a connection exists, so showing what you hold before asking you to pay means connecting first and paying second. The second session is deep-linked to the account you already chose, so the picker appears once in a checkout rather than twice.'
  },
  {
    heading: 'The browser cannot settle an order',
    body: 'transferCompleted in the browser means the exchange acknowledged the withdrawal. It runs on the customer machine, it can be lost or forged, and exchanges can fail a transfer hours later. It sets the order to paid. Only a signature-verified webhook sets it to settled.'
  },
  {
    heading: 'The auth token is handled, not avoided',
    body: 'The SDK hands the Coinbase token to client JavaScript and that cannot be changed. It is posted to the server immediately, held against an httpOnly session cookie, and never sent back down. Nothing renders it and nothing logs it.'
  },
  {
    heading: 'Nothing in the trace is on a timer',
    body: 'Every manifest row is stamped by a real SDK event. A row that stays blank is a step that did not happen, which is more useful in a demo than a spinner that always completes.'
  },
  {
    heading: 'The price is set on the server',
    body: 'Amount, network and destination all come from server configuration. The browser sends a colourway, a size, and which of the three accepted stablecoins to pay in, and that choice is validated against the merchant list before it reaches Mesh. A checkout that lets the client name its own price is not a checkout.'
  },
  {
    heading: 'Redis, for two things only',
    body: 'Webhook idempotency needs a write that survives across serverless invocations, and the order the page polls has to be the order the webhook wrote. Neither works in process memory on Vercel. Nothing else here needs a database.'
  },
  {
    heading: 'Eligibility is Mesh’s answer, not arithmetic',
    body: 'Comparing a balance against a price is the obvious version and it is wrong: it misses the withdrawal minimum, the fees, and the fact that Mesh can cover a shortfall. One quote call per accepted asset returns eligibility, the fee, and where the money would come from, so the page can say balance, buying power or a card on file.'
  },
  {
    heading: 'Findings that changed the build',
    body: 'The SDK type union omits sandboxCoinbase, which is what the sandbox actually returns. The SDK touches window at module scope, so it is imported inside the click. Coinbase and Binance sandbox return identical portfolios, so a two-account view would have looked like a bug. And the returned hash exists on no chain we could find, so there is no explorer link.'
  },
  {
    heading: 'What is real and what is not',
    body: 'Real: the product photographs, the Mesh calls, the events, the fees, the holdings, the provider catalogue. Not real: the shop, the reviews, the delivery promise, and the shoes.'
  }
]

export function TechnicalView({
  open,
  docked,
  onClose,
  order,
  calls,
  connection,
  funding,
  onReset
}: {
  open: boolean
  docked: boolean
  onClose: () => void
  order: OrderState
  calls: ServerCall[]
  connection: ConnectionSummary | null
  /** What `configure` said about funding this order from this account. */
  funding: { status: string | null; error: string | null; assets: number | null }
  onReset: () => void
}) {
  const [tab, setTab] = useState<Tab>('events')
  const [expanded, setExpanded] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)

  /** The probe harness had a copy button and it was the most used thing on it. */
  async function copySession(o: OrderState, c: ServerCall[]) {
    const at0 = o.log[0]?.at ?? c[0]?.at ?? Date.now()
    const rel = (t: number) => `+${String(t - at0).padStart(6)}ms`
    const lines = [
      `# WELT session, ${new Date().toISOString()}`,
      `# status=${o.status} source=${o.source?.name ?? '-'} transfer=${o.payment.transferId ?? '-'}`,
      '',
      '## Server calls',
      ...c.map(x => `${rel(x.at)}  ${x.route}${x.ms ? ` (${x.ms}ms)` : ''}${x.mesh ? ` -> ${x.mesh}` : ''}`),
      '',
      `## Mesh SDK events (${o.log.length} of ${SDK_EVENT_TYPES} possible types)`,
      ...o.log.map(e => `${rel(e.at)}  ${e.type}  ${JSON.stringify(e.payload ?? null)}`),
      '',
      '## Manifest',
      ...o.steps.map(
        st =>
          `${st.state.padEnd(7)} ${st.label.padEnd(20)} ${st.at ? clockTime(st.at) : '--:--:--'}  ` +
          st.facts.map(f => `${f.label}=${f.value}`).join(' ')
      )
    ]
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard can be refused without a user gesture or over plain http. Nothing to recover.
    }
  }
  const [providers, setProviders] = useState<Provider[] | null>(null)
  const [health, setHealth] = useState<{
    storage?: string
    config?: { environment?: string; optional?: { webhookSecret?: boolean } }
  } | null>(null)

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
        <button type="button" onClick={onClose} className="btn-quiet border-0">
          {docked ? 'Collapse' : 'Close'}
        </button>
      </div>

      <nav className="rule-b flex gap-4 px-5">
        {(['events', 'integration', 'providers', 'build', 'demo'] as Tab[]).map(t => (
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
            <div className="mb-3 flex items-start justify-between gap-4">
              <p className="note">
                Every event the Mesh SDK fired, in order, with its real payload. Nothing is
                filtered: {order.log.length} of the {SDK_EVENT_TYPES} types the SDK can emit have
                fired in this session. The rest belong to flows this shop does not use, or to steps
                that did not happen.
              </p>
              <button
                type="button"
                onClick={() => void copySession(order, calls)}
                className="btn-quiet shrink-0"
              >
                {copied ? 'Copied' : 'Copy log'}
              </button>
            </div>
            {/**
             * An empty log next to a manifest with stamped rows reads as a broken panel, and it
             * was the first thing a tester asked about. It is not broken: a returning shopper's
             * connection is reused from the session, no Link session opens, and the SDK therefore
             * emits nothing. The manifest rows above came from our own server calls. Saying so
             * turns a confusing blank into the more interesting fact.
             */}
            {order.log.length === 0 &&
              (order.steps.some(s => s.state !== 'pending') ? (
                <p className="text-sm text-muted">
                  Nothing yet, and that is correct. This session reused a stored connection, so no
                  Link session opened and the SDK had nothing to emit. The manifest rows above were
                  stamped by our own server calls. Events start arriving at Pay.
                </p>
              ) : (
                <p className="text-sm text-muted">Nothing yet. Start a payment.</p>
              ))}
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
            {/**
             * The answer to "why can I not pay with my BTC", in Mesh's own words.
             *
             * `transferBalanceFundingAvailability.status` is the switch. `available` means Mesh
             * will fund this order by converting other holdings, which is the capability the whole
             * product story rests on. `disabled` means it is off for this client, and no amount of
             * work in this codebase will turn it on: it is a conversation with Mesh. Guessing
             * between those two from a blank column is what this exists to stop.
             */}
            <div className="rule-b mb-3 pb-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="label">Funding availability</span>
                <span
                  className="data text-xs"
                  style={{
                    color:
                      funding.status === 'available'
                        ? 'var(--plate-accent)'
                        : funding.status
                          ? 'var(--color-warn)'
                          : undefined
                  }}
                >
                  {funding.status ?? (funding.error ? 'not answered' : '—')}
                </span>
              </div>
              <p className="note mt-1">
                {funding.status === 'available'
                  ? `Mesh will fund this order by converting other holdings. ${funding.assets ?? 0} assets assessed.`
                  : funding.status === 'disabled'
                    ? 'Conversion funding is switched off for this Mesh client, so only assets already held in an accepted currency can pay. Enabling it is a Mesh account change, not a code change.'
                    : funding.status
                      ? `Mesh reported "${funding.status}" for this account and order.`
                      : funding.error
                        ? `transfers/managed/configure did not answer: ${funding.error}`
                        : 'Not asked yet. Connect an account and reach the checkout.'}
              </p>
            </div>

            <p className="note mb-3">
              The seven routes that carry the integration. The client secret exists only inside
              them, and the browser only ever receives a Link token.
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

        {tab === 'build' && (
          <>
            <p className="note mb-4">
              Why it is put together the way it is. The reasons travel better than the features.
            </p>
            {BUILD_NOTES.map(n => (
              <div key={n.heading} className="rule-b py-3">
                <div className="text-sm font-semibold">{n.heading}</div>
                <p className="note mt-1">{n.body}</p>
              </div>
            ))}
            <p className="note mt-4">
              The README goes further: architecture, the Mesh calls one by one, security, failure
              handling, and what a production build would add.
            </p>
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
                ['Mesh4', 'Large balance.'],
                /**
                 * The single-asset accounts are the ones worth knowing about. `Mesh` holds plenty
                 * of USDC, so Mesh has no reason to convert anything and the most interesting
                 * capability never fires. `MeshBTC` holds BTC and no stablecoin at all, which is
                 * the only way to see whether a $50 order settled in USDC can be paid out of an
                 * asset that is not USDC.
                 */
                ['MeshBTC', 'BTC only. The conversion test: no stablecoin to fall back on.'],
                ['MeshETH', 'ETH only.'],
                ['MeshSOL', 'SOL only.'],
                ['MeshUSDC', 'USDC only.']
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
                <div className="flex items-baseline justify-between">
                  <dt className="label">Webhook secret</dt>
                  <dd className="data text-xs">
                    {health?.config ? (health.config.optional?.webhookSecret ? 'set' : 'missing') : '…'}
                  </dd>
                </div>
              </dl>
              {health?.config && !health.config.optional?.webhookSecret && (
                <p className="note mt-2" style={{ color: 'var(--color-warn)' }}>
                  No signing secret, so every webhook delivery is refused and orders stop at paid.
                  Set MESH_WEBHOOK_SECRET and redeploy.
                </p>
              )}
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
    return (
      <aside className="sticky top-0 hidden h-screen w-[26rem] shrink-0 border-l border-rule lg:block">
        {body}
      </aside>
    )
  }

  return (
    <div className="lg:hidden">
      <div className="fixed inset-0 z-40 bg-ink/30" onClick={onClose} aria-hidden />
      {/* A sheet, not a takeover. Full height on a phone meant the shop disappeared behind the
          panel and there was no way to see what the events were about. */}
      <aside
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[72dvh] flex-col border-t-2 border-ink shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-full sm:max-w-md sm:border-l sm:border-t-0 sm:border-rule sm:pb-0"
        role="dialog"
        aria-modal="true"
        aria-label="Behind the payment"
      >
        {body}
      </aside>
    </div>
  )
}
