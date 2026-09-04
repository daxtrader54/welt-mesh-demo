'use client'

import { useEffect, useState } from 'react'
import { clockTime, orderNumber, token, usd } from '@/lib/format'

/**
 * Payment history, read from Mesh rather than from us.
 *
 * Every other screen in this shop shows what one browser saw in one session. This one is the
 * merchant's view: every transfer Mesh has made for this integration, still there after the tab
 * closed, the order expired and the webhook was missed. It is the answer to the question a merchant
 * asks once the demo is over, which is not "did that work" but "where do I see what actually moved".
 *
 * The webhook column is the reason this earns a page rather than a panel tab. Mesh keeps its own
 * delivery log per transfer, and reading it separates three things that all look identical from our
 * side: Mesh never attempted a delivery, Mesh attempted one and we refused it, or it arrived and
 * settled. Across the first twenty-five transfers here, nine had no attempt at all, which is what
 * intermittent sandbox settlement actually looks like from the outside.
 */

export type Transfer = {
  id: string | null
  reference: string | null
  status: string
  amount: number | null
  symbol: string | null
  amountInFiat: number | null
  feesInFiat: number | null
  network: string | null
  hash: string | null
  at: number | null
  from: string | null
  funding: { type: string; from: string | null; to: string | null; fromAmount: number | null }[]
  webhooks: { code: string | null; uri: string | null; sentAt: number | null }[]
}

/** Three states, and they are genuinely different problems. */
function deliveryOf(t: Transfer) {
  if (!t.webhooks.length) return { label: 'never sent', tone: 'warn' as const }
  const ok = t.webhooks.some(w => w.code === 'OK')
  if (ok) return { label: 'delivered', tone: 'good' as const }
  return { label: t.webhooks[0]?.code ?? 'refused', tone: 'warn' as const }
}

const tone = (t: 'good' | 'warn') =>
  t === 'good' ? 'var(--color-positive)' : 'var(--color-warn)'

export function History({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<{ items: Transfer[]; total: number } | null>(null)
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/mesh/transfers')
      .then(r => r.json())
      .then(j => {
        if (cancelled) return
        if (j.ok) setData({ items: j.transfers ?? [], total: j.total ?? 0 })
        else setFailed(true)
      })
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
    }
  }, [])

  const items = data?.items ?? []
  const delivered = items.filter(t => deliveryOf(t).label === 'delivered').length
  const missing = items.filter(t => !t.webhooks.length).length

  return (
    <main className="mx-auto w-full max-w-[52rem] py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label">Merchant view</div>
          <h1 className="mt-1 text-xl font-bold leading-[1.1] tracking-[-0.02em] sm:text-2xl">
            Payment history
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
            Every transfer Mesh has made for this shop, read from Mesh rather than from this
            browser. It survives the tab closing, the order expiring and a webhook going missing,
            which is why it is the thing a merchant reconciles against.
          </p>
        </div>
        <button type="button" onClick={onBack} className="btn-quiet">
          Back to the shop
        </button>
      </div>

      {failed && (
        <p className="rule-t mt-6 pt-6 text-sm text-muted">
          Mesh did not return the ledger. Everything else still works: this page is a read of their
          records and nothing depends on it.
        </p>
      )}

      {!data && !failed && <p className="rule-t mt-6 pt-6 text-sm text-muted">Reading the ledger…</p>}

      {data && (
        <>
          <dl className="rule-t mt-6 grid grid-cols-2 gap-x-6 gap-y-4 pt-6 sm:grid-cols-4">
            {[
              ['Transfers', String(data.total)],
              ['Shown', String(items.length)],
              ['Webhook delivered', `${delivered} of ${items.length}`],
              ['Never attempted', String(missing)]
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="label">{k}</dt>
                <dd className="data mt-1 text-xl font-semibold">{v}</dd>
              </div>
            ))}
          </dl>

          {missing > 0 && (
            <p className="note mt-4">
              {missing} of these got no delivery attempt from Mesh at all, which is not the same as
              one we refused. Sandbox does not guarantee delivery, and this is what that looks like
              from the outside. The receipt is complete at paid for exactly this reason.
            </p>
          )}

          <ul className="rule-t mt-8 pt-2">
            {items.map((t, i) => {
              const d = deliveryOf(t)
              const converted = t.funding.some(f => f.from && f.to && f.from !== f.to)
              const isOpen = open === (t.id ?? String(i))
              return (
                <li key={t.id ?? i} className="rule-b">
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : (t.id ?? String(i)))}
                    aria-expanded={isOpen}
                    className="flex w-full flex-wrap items-baseline gap-x-4 gap-y-1 py-3 text-left"
                  >
                    <span className="data w-32 shrink-0 text-xs text-muted">
                      {t.at ? new Date(t.at).toISOString().slice(0, 16).replace('T', ' ') : '—'}
                    </span>
                    <span className="data w-28 shrink-0 text-sm font-medium">
                      {token(t.amount ?? 0, t.symbol ?? '')}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {t.from ?? '—'}
                      <span className="note"> · {t.network ?? '—'}</span>
                      {converted && (
                        <span className="note"> · converted</span>
                      )}
                    </span>
                    <span className="note shrink-0" style={{ color: tone(d.tone) }}>
                      {d.label}
                    </span>
                  </button>

                  {isOpen && (
                    <dl className="rule-t grid gap-x-6 gap-y-2 py-3 sm:grid-cols-2">
                      {[
                        ['Status', t.status],
                        ['Amount', `${token(t.amount ?? 0, t.symbol ?? '')} · ${usd(t.amountInFiat ?? 0)}`],
                        ['Fees', t.feesInFiat != null ? usd(t.feesInFiat) : '—'],
                        ['Network', t.network ?? '—'],
                        ['Funded by', t.funding.map(f => `${f.from ?? '?'} → ${f.to ?? '?'}`).join(', ') || '—'],
                        // Through `orderNumber` so this matches the WELT-XXXXXX on the receipt.
                        // It was printing the raw UUID, so the merchant's reconciliation screen
                        // could not be matched against the reference the customer reads out.
                        ['Order reference', t.reference ? orderNumber(t.reference) : '—'],
                        ['Mesh transfer id', t.id ?? '—'],
                        ['Reference hash', t.hash ?? '—']
                      ].map(([k, v]) => (
                        <div key={k} className="flex items-baseline justify-between gap-4">
                          <dt className="label shrink-0">{k}</dt>
                          <dd className="data truncate text-right text-xs" title={v}>
                            {v}
                          </dd>
                        </div>
                      ))}

                      <div className="sm:col-span-2">
                        <dt className="label">Webhook delivery</dt>
                        <dd className="mt-1">
                          {t.webhooks.length ? (
                            t.webhooks.map((w, n) => (
                              <div key={n} className="note">
                                {w.sentAt ? clockTime(w.sentAt) : '—'} · {w.code} · {w.uri}
                              </div>
                            ))
                          ) : (
                            <div className="note">
                              Mesh recorded no delivery attempt for this transfer.
                            </div>
                          )}
                        </dd>
                      </div>
                    </dl>
                  )}
                </li>
              )
            })}
          </ul>

          <p className="note mt-6">
            Read with this shop&apos;s own Mesh credentials, so it lists the whole integration rather
            than one shopper. That is right for a demonstration and would be wrong in a real shop,
            where this page would be scoped to the signed-in customer.
          </p>
        </>
      )}
    </main>
  )
}
