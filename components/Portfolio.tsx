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

/** Mesh's per-holding answer for this account, from transfers/managed/configure. */
export type AssetFunding = {
  symbol: string
  eligible: boolean
  eligibleWithFunding: boolean
  reason: string | null
}

/** Mesh's reason codes, in the shopper's words. */
const REASONS: Record<string, string> = {
  balanceBelowRequestedAmount: 'not enough of it',
  requestedAmountBelowMinimum: 'below the withdrawal minimum',
  requestedAmountAboveMaximum: 'above the withdrawal maximum',
  assetNotSupported: 'not supported on this network'
}

/**
 * What Mesh would draw on, in the shopper's words.
 *
 * All seven values Mesh's `CryptocurrencyFundingOptionType` defines, not the three we happened to
 * have seen. The four conversion cases were missing, so anything Mesh offered to convert rendered
 * as a blank line, and the panel quietly implied it could only spend what was already in the right
 * asset. That is the opposite of the thing this integration exists to demonstrate.
 */
const FUNDING: Record<string, string> = {
  existingCryptocurrencyBalance: 'from your balance',
  buyingPowerPurchase: 'from your buying power',
  paymentMethodDepositUsage: 'from a payment method on file',
  cryptocurrencyConversion: 'by converting another asset you hold',
  stableCoinNoFeeConversion: 'by converting another stablecoin, no fee',
  cryptocurrencyBuyingPowerConversion: 'by converting from your buying power',
  cryptocurrencyMultiStepConversion: 'by converting through more than one step'
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
  funding,
  selected,
  onSelect
}: {
  provider: string
  accountName: string | null
  positions: Position[]
  cryptoValue: number | null
  /** Null while the quotes are still being fetched. */
  quotes: Quote[] | null
  /**
   * Mesh's answer for this account, per holding. Null when the call failed, which means unknown
   * and is rendered as silence rather than as a refusal.
   */
  funding: AssetFunding[] | null
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
          <div className="rule-t mt-5 flex items-baseline justify-between gap-4 pt-3">
            <span className="label">What the merchant receives</span>
            <span className="note">
              {payable.length
                ? `${usd(PRODUCT.price)} on ${PRODUCT.settlement.network}`
                : 'Not priced in advance'}
            </span>
          </div>

          {/**
           * Relabelled, because the old heading was the source of a fair complaint.
           *
           * These radio buttons pick what the MERCHANT is paid in. They were introduced by "Pay
           * with any of these", which reads as what the shopper spends, so a shopper holding
           * $398,000 of BTC quite reasonably asked why BTC was not among them. It never could be:
           * this list is the merchant's accepted assets, and the merchant settles in stablecoins.
           *
           * What the payment is funded from is a different question with a different owner, and
           * saying so here is cheaper than letting the picker imply an answer it does not have.
           */}
          <p className="note mt-2">
            Which asset the merchant is paid in. What funds it is decided at payment: Mesh spends
            your balance in that asset, or converts another of your holdings if you are short.
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
                    className={`flex w-full items-center gap-3 border px-3 py-2.5 text-left transition-colors ${
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

                    <span className="data w-16 shrink-0 text-sm font-semibold">{p.symbol}</span>
                    <span className="note min-w-0 flex-1 truncate">{p.name ?? q.name}</span>

                    <span className="shrink-0 text-right">
                      <span className="data block text-sm">{token(p.amount)}</span>
                      {p.marketValue != null && (
                        <span className="label block">{usd(p.marketValue)}</span>
                      )}
                    </span>
                  </button>

                  {/* Once, under the row it applies to. Repeated on every row it was six lines of
                      identical text, which read as noise rather than as the thing Mesh is doing. */}
                  {active && funding && <p className="note mt-1.5 pl-7">Funded {funding}.</p>}
                </li>
              )
            })}
          </ul>
        </>
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
          <summary className="flex cursor-pointer items-baseline justify-between gap-4 list-none">
            <span className="label">Also held ({rest.length})</span>
            <span className="note underline underline-offset-2">
              {usd(rest.reduce((t, p) => t + (p.marketValue ?? 0), 0))} more in this account
            </span>
          </summary>

          <ul className="mt-3">
            {rest.slice(0, 12).map(p => {
              /**
               * Mesh's verdict for this account, not ours and not the quote's. `eligible` means it
               * can be sent as it stands; `eligibleWithFunding` means Mesh would convert it to pay.
               * Either way this asset can buy the shoes, which is the whole argument and was
               * previously being denied on no evidence at all.
               */
              const f = funding?.find(x => x.symbol === p.symbol)
              const canPay = Boolean(f && (f.eligible || f.eligibleWithFunding))
              const why = f?.reason ? REASONS[f.reason] ?? f.reason : null
              return (
                <li
                  key={p.symbol}
                  className="rule-b flex items-baseline gap-3 py-1.5"
                >
                  <span className="data w-16 shrink-0 text-xs font-medium">{p.symbol}</span>
                  <span className="note min-w-0 flex-1 truncate">{p.name}</span>
                  {/**
                   * Three states again, and the middle one is the one that was missing. Mesh said
                   * yes, Mesh said no, or Mesh was never asked. Rendering "asked and refused" and
                   * "never asked" both as blank space is what made a failing configure call look
                   * like an account where nothing happens to be convertible.
                   */}
                  {canPay ? (
                    <span className="note shrink-0" style={{ color: 'var(--plate-accent)' }}>
                      {f!.eligible ? 'can pay' : 'can pay, converted'}
                    </span>
                  ) : f ? (
                    <span className="note shrink-0">{why ?? 'not eligible for this order'}</span>
                  ) : funding ? (
                    /**
                     * Mesh assessed the account and did not return this symbol, which means it did
                     * not consider it able to reach the merchant's address. Said plainly rather
                     * than left blank, because a blank was being read as a refusal and this is one.
                     */
                    <span className="note shrink-0 text-faint">cannot reach this merchant</span>
                  ) : null}
                  <span className="data shrink-0 text-xs">{usd(p.marketValue)}</span>
                </li>
              )
            })}
          </ul>

          {/**
           * This used to say the rest of the account could not pay for the order, which is both
           * unfounded and the opposite of the argument the integration exists to make.
           *
           * Unfounded because nothing here was ever asked. The quote endpoint prices the asset the
           * merchant RECEIVES, not the one the shopper spends, so quoting BTC would ask whether the
           * merchant can be paid in BTC. We only ever quote the merchant's own three assets, so we
           * hold no opinion on the other eleven and should not print one.
           */}
          {/**
           * The real reason, from Mesh's own answer, rather than a hedge.
           *
           * `configure` returns `eligibleForTransferWithFunding` against the asset being collected.
           * False means the balance covers the order on its own, so Mesh has no reason to touch
           * anything else, which is why an account holding $398,000 of BTC and 9,000 USDC pays in
           * USDC every time. It is not a limit, it is the absence of a problem.
           */}
          <p className="note mt-3">
            The merchant settles in {PRODUCT.settlement.symbol}, which does not mean these cannot
            pay for the order.{' '}
            {funding?.some(f => f.eligibleWithFunding)
              ? `Mesh has said it can fund this order by converting what you hold, and it does that at the payment step.`
              : `You hold enough ${PRODUCT.settlement.symbol} already, so Mesh has no reason to convert anything. On an account without it, Mesh funds the payment by converting one of these instead, and the receipt names which.`}{' '}
            All {positions.length} balances came from one connection.
          </p>
        </details>
      )}

    </section>
  )
}
