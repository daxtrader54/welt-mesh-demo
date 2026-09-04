'use client'

import { useState } from 'react'
import { clockTime, token, usd } from '@/lib/format'
import { PRODUCT } from '@/lib/product'
import type { OrderState } from '@/lib/order/state'

/**
 * The manifest. The one thing in this build that is meant to be memorable.
 *
 * Every row is stamped by a real SDK event. Nothing runs on a timer, nothing is inferred from
 * elapsed time, and a row whose event never fires stays visibly blank with a dashed clock. That
 * is the honest outcome, and in a demo it is the interesting one, because it shows exactly where
 * a flow stopped rather than spinning until someone gives up.
 */

export type Funding = {
  provider: string
  accountName: string | null
  settlement: { symbol: string; amount: number; marketValue: number | null; covers: boolean } | null
}

export function FundingSource({
  funding,
  providerName,
  payingWith,
  onChangeAccount
}: {
  /** Null when the account connected but its balances could not be read. Not a failure. */
  funding: Funding | null
  providerName: string | null
  /** The asset the shopper chose, when they chose one. */
  payingWith?: string | null
  onChangeAccount: () => void
}) {
  const s = funding?.settlement ?? null

  return (
    <section className="rule-t pt-4">
      <div className="label mb-3">Paying from</div>

      <div className="flex items-start justify-between gap-6">
        <div>
          <div className="text-lg font-semibold leading-tight">
            {funding?.provider ?? providerName ?? 'Your account'}
          </div>
          {funding?.accountName && <div className="note">{funding.accountName}</div>}
        </div>

        {s && (
          <div className="text-right">
            <div className="data text-lg font-medium">{token(s.amount, s.symbol)}</div>
            {s.marketValue !== null && <div className="label">{usd(s.marketValue)}</div>}
          </div>
        )}
      </div>

      {s ? (
        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 border border-rule bg-plate px-4 py-3">
          <div>
            <div className="label">You hold</div>
            <div className="data text-sm">{token(s.amount, s.symbol)}</div>
          </div>
          <div aria-hidden className="data text-faint">
            →
          </div>
          <div className="text-right">
            <div className="label">Merchant receives</div>
            <div className="data text-sm">
              {usd(PRODUCT.price)} {payingWith ?? PRODUCT.settlement.symbol}
            </div>
            <div className="label">on {PRODUCT.settlement.network}</div>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">
          We could not read a {PRODUCT.settlement.symbol} balance for this account, so we cannot
          show what you hold. You can still pay, and Mesh will check the balance before it takes
          anything.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <p className="text-sm text-muted">
          {s?.covers
            ? `Enough ${s.symbol} to cover this order.`
            : `This account cannot cover ${usd(PRODUCT.price)} in ${PRODUCT.settlement.symbol}.`}
        </p>
        <button type="button" onClick={onChangeAccount} className="btn-quiet">
          Change account
        </button>
      </div>
    </section>
  )
}

const STATE_MARK: Record<string, string> = {
  pending: '·',
  active: '›',
  done: '✓',
  failed: '×'
}

/**
 * Full width, with a heading and a line of explanation. It sat at the tail of a narrow column in
 * the first pass and got read as an afterthought, which for the one memorable thing in the build
 * is the wrong outcome.
 */
export function Manifest({ order }: { order: OrderState }) {
  const done = order.steps.filter(s => s.state === 'done').length
  /**
   * Collapsed on a phone, open on anything wider.
   *
   * Seven rows of label, facts and timestamp is a reasonable block on a desktop and a wall under a
   * checkout on a 390px screen, which is what testers meant by busy. The count in the header is
   * the part that matters at a glance; the rows are there when someone wants them.
   */
  const [expanded, setExpanded] = useState(false)

  return (
    <section className="rule-t mt-14 pt-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Payment trace</h2>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Every row is stamped by a real Mesh event as it arrives. Nothing here runs on a timer,
            so a row that stays blank is a step that genuinely did not happen.
          </p>
        </div>
        <span className="data text-sm text-muted">
          {done} / {order.steps.length}
        </span>
      </div>

      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        className="btn-quiet mb-3 md:hidden"
      >
        {expanded ? 'Hide the steps' : `Show all ${order.steps.length} steps`}
      </button>

      <ol className={`rule-t ${expanded ? '' : 'hidden md:block'}`}>
        {order.steps.map((step, i) => {
          const isDone = step.state === 'done'
          const failed = step.state === 'failed'
          const active = step.state === 'active'

          return (
            <li
              key={step.id}
              className={`rule-b py-3 ${isDone || failed ? 'stamp' : ''}`}
              style={{ opacity: isDone || failed ? 1 : active ? 0.7 : 0.35 }}
            >
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5">
                <span className="data w-7 shrink-0 text-xs text-faint">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span
                  className="data w-4 shrink-0 text-sm"
                  style={{
                    color: failed ? 'var(--color-warn)' : isDone ? 'var(--plate-accent)' : undefined
                  }}
                  aria-hidden
                >
                  {STATE_MARK[step.state]}
                </span>
                <span
                  className={`min-w-0 flex-1 text-sm md:w-48 md:flex-none md:shrink-0 ${
                    isDone || failed ? 'font-medium' : ''
                  }`}
                >
                  {step.label}
                </span>

                {/* Shopper-facing facts only. Broker type strings, preview UUIDs and transaction
                    hashes live in the panel, where someone can do something with them. */}
                <dl className="flex min-w-0 flex-1 flex-wrap gap-x-6 gap-y-1">
                  {step.facts
                    .filter(f => !f.technical)
                    .map(f => (
                      <div key={f.label} className="flex min-w-0 items-baseline gap-1.5">
                        <dt className="label shrink-0">{f.label}</dt>
                        <dd className="data max-w-[26ch] truncate text-xs" title={f.value}>
                          {f.value}
                        </dd>
                      </div>
                    ))}
                </dl>

                <span className="data shrink-0 text-xs text-faint">
                  {step.at ? clockTime(step.at) : '--:--:--'}
                </span>
              </div>
            </li>
          )
        })}
      </ol>

      <p className={`note mt-3 ${expanded ? '' : 'hidden md:block'}`}>
        Transaction references and provider identifiers are in Behind the payment.
      </p>

      {order.status === 'paid' && (
        <p className="mt-4 max-w-2xl text-sm text-muted">
          {order.steps.at(-1)?.facts.some(f => f.label === 'Waiting on')
            ? 'Row seven is still open because no signed webhook has arrived. That is the point of it: the browser reporting a completed transfer means the provider acknowledged it, which is not the same as the merchant being paid. Until a webhook says so, this order is paid and not settled.'
            : 'Settled stays open until Mesh sends a signed webhook. The browser reporting a completed transfer means the provider acknowledged it, which is not the same as the merchant being paid, so it is not what marks the order settled.'}
        </p>
      )}
    </section>
  )
}
