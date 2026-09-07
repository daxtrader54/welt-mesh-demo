/**
 * Which of a connected account's holdings can actually settle this order, and whether we know.
 *
 * Extracted because three places on the checkout were each deciding this for themselves and they
 * did not agree. Connecting a wallet produced, in one column: "self-custody wallets cannot pay",
 * then "you can still pay, and Mesh will check the balance", then a live Pay button. Three
 * components, three answers, one of them an action that could not succeed.
 *
 * Pure and separate from the components so the answer is computed once and can be tested.
 */

export type SettleablePosition = {
  symbol?: string | null
  amount: number
}

export type SettleableQuote = {
  symbol: string
  /** Null when the quote could not be fetched. Unknown is not the same as ineligible. */
  eligible: boolean | null
}

/**
 * The assets a shopper can choose between.
 *
 * Two tiers, and the second one matters. Anything Mesh confirmed comes first. If Mesh confirmed
 * nothing, holdings whose quote never came back are offered instead, because a failed call is not
 * a refusal: a quote outage once produced "Nothing in this account can settle $50.00" beside 9,397
 * USDC, and the picker vanished because it only listed confirmed assets.
 */
export function choosableAssets<P extends SettleablePosition>(
  positions: P[],
  quotes: SettleableQuote[] | null
): P[] {
  const quoteFor = (symbol?: string | null) => quotes?.find(q => q.symbol === symbol) ?? null

  const confirmed = positions.filter(p => quoteFor(p.symbol)?.eligible === true)
  if (confirmed.length) return confirmed

  return positions.filter(p => quoteFor(p.symbol)?.eligible === null && p.amount > 0)
}

/**
 * Whether we know, rather than suspect, that this account cannot pay.
 *
 * Deliberately narrow. It is only true once Mesh has answered and the answer left nothing to
 * choose. While the quotes are still loading, or if the call failed, the honest state is unknown
 * and the shopper keeps the ability to try, because Mesh checks the balance again before it takes
 * anything and a store outage should never be the reason someone cannot pay.
 */
export function cannotSettle(
  positions: SettleablePosition[],
  quotes: SettleableQuote[] | null
): boolean {
  if (quotes === null) return false
  return choosableAssets(positions, quotes).length === 0
}
