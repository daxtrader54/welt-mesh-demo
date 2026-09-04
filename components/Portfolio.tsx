'use client'

import { token, usd } from '@/lib/format'
import { PRODUCT } from '@/lib/product'

/**
 * What the shopper holds, and which of it can pay for this order.
 *
 * The brief calls this a first-class requirement and gives the reason: it is what shows Mesh does
 * more than move money. A merchant who does not care about crypto does not need to see a payment
 * work, they need to see that connecting an account tells you something. So this is the whole
 * portfolio, not just the one line that funds the order.
 *
 * Eligibility is Mesh's answer, not ours. Comparing a balance against a price would miss the
 * exchange's withdrawal minimum, its fees, and the fact that Mesh can fund a payment from buying
 * power or a card when the balance alone is short. That last one is the part merchants do not
 * expect, so it is said out loud rather than left in the fee breakdown.
 */

export type Position = {
  name?: string | null
  symbol?: string | null
  amount: number
  marketValue?: number | null
  lastPrice?: number | null
}

export type Quote = {
  symbol: string
  name: string
  primary: boolean
  /** Null when the quote could not be fetched. Unknown is not the same as ineligible. */
  eligible: boolean | null
  reason: string | null
  feesInFiat: number | null
  funding: { type: string; method: string | null }[]
}

/** Mesh's reason codes, in the shopper's words. */
const REASONS: Record<string, string> = {
  balanceBelowRequestedAmount: 'not enough of it',
  requestedAmountBelowMinimum: 'below the withdrawal minimum',
  requestedAmountAboveMaximum: 'above the withdrawal maximum',
  assetNotSupported: 'not supported on this network'
}

/** What Mesh would draw on. The second and third are the interesting ones. */
const FUNDING: Record<string, string> = {
  existingCryptocurrencyBalance: 'from your balance',
  buyingPowerPurchase: 'from your buying power',
  paymentMethodDepositUsage: 'from a payment method on file'
}

function describeFunding(q: Quote): string | null {
  const kinds = [...new Set(q.funding.map(f => FUNDING[f.type]).filter(Boolean))]
  if (!kinds.length) return null
  return kinds.join(', then ')
}

export function Portfolio({
  provider,
  accountName,
  positions,
  cryptoValue,
  quotes,
  selected,
  onSelect
}: {
  provider: string
  accountName: string | null
  positions: Position[]
  cryptoValue: number | null
  /** Null while the quotes are still being fetched. */
  quotes: Quote[] | null
  selected: string | null
  onSelect: (symbol: string) => void
}) {
  const quoteFor = (symbol?: string | null) => quotes?.find(q => q.symbol === symbol) ?? null

  /**
   * Three answers, not two. Mesh says yes, says no with a reason, or does not answer at all.
   *
   * The quotes route is careful to report an unanswered quote as `eligible: null` rather than
   * false, precisely so a failed call cannot be read as a refusal. This component then treated
   * null as falsy and threw that away, so a quote outage produced "Nothing in this account can
   * settle $50.00" beside 9,397 USDC, and the asset picker vanished because it only lists
   * confirmed assets. Unknown now falls back to what the merchant accepts and the shopper actually
   * holds, which is choosable with the uncertainty stated rather than hidden.
   */
  const payable = positions.filter(p => quoteFor(p.symbol)?.eligible === true)
  const unpriced = positions.filter(
    p => quoteFor(p.symbol)?.eligible === null && p.amount > 0
  )
  const choosable = payable.length ? payable : unpriced
  const selectedQuote = quoteFor(selected)
  const chosenSymbols = new Set(choosable.map(p => p.symbol))
  const rest = positions.filter(p => !chosenSymbols.has(p.symbol))

  return (
    <section className="rule-t pt-5">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <div className="label">Held at</div>
          <div className="text-lg font-semibold leading-tight">{provider}</div>
          {accountName && <div className="note">{accountName}</div>}
        </div>
        {cryptoValue !== null && (
          <div className="text-right">
            <div className="label">Crypto value</div>
            <div className="data text-lg font-medium">{usd(cryptoValue)}</div>
          </div>
        )}
      </div>

      {choosable.length > 0 && (
        <>
          <p className="note mt-5">
            {payable.length
              ? `Pay with any of these. The merchant receives ${usd(PRODUCT.price)} on ${PRODUCT.settlement.network} either way.`
              : `Mesh could not price these in advance for this account, so eligibility is not confirmed here. Pick one and Mesh checks it before taking anything.`}
          </p>

          <ul className="mt-2">
            {choosable.map(p => {
              const q = quoteFor(p.symbol)!
              const active = selected === p.symbol
              const funding = describeFunding(q)
              return (
                <li key={p.symbol}>
                  <button
                    type="button"
                    onClick={() => onSelect(q.symbol)}
                    aria-pressed={active}
                    className={`flex w-full items-center gap-3 border px-4 py-3 text-left transition-colors ${
                      active ? 'border-2 border-ink bg-plate' : 'mb-px border-rule hover:border-ink'
                    }`}
                  >
                    <span
                      className="grid h-4 w-4 shrink-0 place-items-center rounded-full border"
                      style={{ borderColor: active ? 'var(--color-ink)' : 'var(--color-rule-strong)' }}
                      aria-hidden
                    >
                      {active && <span className="h-2 w-2 rounded-full bg-ink" />}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="data text-sm font-semibold">{p.symbol}</span>
                        <span className="note truncate">{p.name ?? q.name}</span>
                      </span>
                      {funding && <span className="note block">{funding}</span>}
                    </span>

                    <span className="shrink-0 text-right">
                      <span className="data block text-sm">{token(p.amount)}</span>
                      {p.marketValue != null && (
                        <span className="label block">{usd(p.marketValue)}</span>
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}

      {/**
       * The trap a live demo must not walk into.
       *
       * The merchant genuinely accepts three stablecoins and the quote says all three are eligible,
       * but that quote is priced against the production broker, not the sandbox one. Picking PYUSD
       * sent Mesh to an onramp with its own sign-in, which the demo test account does not open, and
       * the run ended on "Invalid credentials" with nothing on our side explaining why.
       */}
      {selectedQuote && !selectedQuote.primary && (
        <p className="note mt-3" style={{ color: 'var(--color-warn)' }}>
          Only {PRODUCT.settlement.symbol} has been run end to end in this sandbox. Mesh may route
          another asset through an onramp with its own sign-in, which the demo test account does not
          cover.
        </p>
      )}

      {quotes === null && (
        <p className="note mt-4">Checking which of these can pay for this order…</p>
      )}

      {/* Only when Mesh actually answered. An unanswered quote is not a refusal. */}
      {quotes !== null && choosable.length === 0 && (
        <p className="mt-4 text-sm text-muted">
          Nothing in this account can settle {usd(PRODUCT.price)} on {PRODUCT.settlement.network}.
          You can still continue and choose a different account.
        </p>
      )}

      {rest.length > 0 && (
        <details className="rule-t mt-5 pt-3">
          <summary className="btn-quiet list-none">
            Everything else in this account ({rest.length})
          </summary>
          <ul className="mt-3">
            {rest.slice(0, 12).map(p => {
              const q = quoteFor(p.symbol)
              const why = q?.reason ? REASONS[q.reason] ?? q.reason : null
              return (
                <li
                  key={p.symbol}
                  className="rule-b flex items-baseline justify-between gap-4 py-1.5"
                >
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="data text-xs font-medium">{p.symbol}</span>
                    <span className="note truncate">{p.name}</span>
                  </span>
                  <span className="flex shrink-0 items-baseline gap-3">
                    {why && <span className="note">{why}</span>}
                    <span className="data text-xs">{usd(p.marketValue)}</span>
                  </span>
                </li>
              )
            })}
          </ul>
          <p className="note mt-3">
            This shop settles in stablecoins, so the rest of the account cannot pay for it. Mesh
            read all of it from one connection.
          </p>
        </details>
      )}
    </section>
  )
}
