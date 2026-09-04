/**
 * Pure builders for the two link token shapes this app needs. Kept apart from the HTTP layer so
 * they can be tested without a network, because getting the payment body wrong is the difference
 * between a working checkout and a 400 from Mesh.
 */

export type Destination = {
  networkId: string
  address: string
  symbol: string
}

export type ConnectTokenInput = {
  userId: string
  /** Deep-link straight to one provider. Omit to show the full picker. */
  integrationId?: string | null
}

export type PaymentTokenInput = {
  userId: string
  /**
   * Open the payment on the account the shopper already connected, rather than showing Mesh's
   * picker a second time. Null keeps the picker, which is what the "change account" route does.
   */
  integrationId?: string | null
  /** Our order id. Comes back on every transfer event as `clientTransactionId`. */
  transactionId: string
  /**
   * Every asset the merchant will take, all to the same address. Mesh's own guidance is to offer
   * all of them so a transfer has more ways to succeed; one entry is the minimum, not the target.
   * When the shopper has chosen an asset this is that one entry, so Link has nothing to ask.
   */
  destinations: Destination[]
  /** Exact asset amount. Mesh rejects `amount` and `amountInFiat` together on a payment. */
  amount: number
  /** Shown as the fiat equivalent in Link. Mesh validates it within 1% of its own pricing. */
  displayAmountInFiat: number
  /**
   * The merchant's own cut, in the same currency as `amount`. Mesh takes this as `clientFee`,
   * a ratio of the transfer amount rather than an absolute, so it is converted here and the
   * conversion is tested. Separate from the exchange's withdrawal fee, which Mesh quotes.
   */
  clientFee?: number
}

/** Mesh wants `clientFee` as a 0-1 proportion of the amount, not a cash figure. */
export function clientFeeRatio(fee: number, amount: number): number {
  if (!fee || !amount || fee <= 0) return 0
  // A fee larger than the order is a configuration mistake. Clamping it to 1 would silently
  // double what the customer pays, so it is refused instead.
  if (fee >= amount) return 0
  return fee / amount
}

export type LinkTokenBody = Record<string, unknown>

/**
 * Connect only. No transfer options, so Link connects the account and stops.
 * `restrictMultipleAccounts: false` because this is not a transfer flow and the shopper may
 * legitimately connect more than one account before paying.
 */
export function buildConnectTokenBody(input: ConnectTokenInput): LinkTokenBody {
  const body: LinkTokenBody = {
    userId: input.userId,
    restrictMultipleAccounts: false
  }
  if (input.integrationId) body.integrationId = input.integrationId
  return body
}

/**
 * Payment. Deep-linked to the account already connected, because being shown the same picker
 * twice in one checkout is confusing. Omitting `integrationId` restores the picker, which is what
 * the "change account" link does, and whatever is picked comes back on `transferPreviewed`.
 */
export function buildPaymentTokenBody(input: PaymentTokenInput): LinkTokenBody {
  const body: LinkTokenBody = {
    userId: input.userId,
    restrictMultipleAccounts: true,
    transferOptions: {
      transactionId: input.transactionId,
      transferType: 'payment',
      isInclusiveFeeEnabled: false,
      generatePayLink: false,
      ...(input.clientFee ? { clientFee: clientFeeRatio(input.clientFee, input.amount) } : {}),
      toAddresses: input.destinations.map(d => ({
        networkId: d.networkId,
        symbol: d.symbol,
        address: d.address,
        amount: input.amount,
        displayAmountInFiat: input.displayAmountInFiat
      }))
    }
  }
  if (input.integrationId) body.integrationId = input.integrationId
  return body
}

/**
 * The broker type `transfers/managed/quote` will accept.
 *
 * That endpoint takes production broker types only. A sandbox Coinbase connection reports itself
 * as `sandboxCoinbase` everywhere else in the API, and holdings/get requires exactly that string,
 * but the quote endpoint answers it with HTTP 400 "Broker SandboxCoinbase not supported."
 *
 * So every quote in every sandbox run failed. The shop then showed "Nothing in this account can
 * settle $50.00 on Ethereum" directly above a panel reading 9,397 USDC and "Enough USDC to cover
 * this order", and the asset picker never appeared at all, because it only lists assets Mesh has
 * confirmed. Stripping the prefix gives `coinbase`, which returns `isEligible: true`.
 *
 * Plain `sandbox`, which is what the sandbox Binance entry reports, has nothing underneath it and
 * is passed through unchanged. The quote endpoint does not accept `binance` either, so there is no
 * production name to map it to and an honest unknown is the right answer.
 */
export function quoteBrokerType(brokerType: string): string {
  // Only strip when a capital follows, which is the naming convention Mesh actually uses. A bare
  // `sandbox`, or any name that merely starts with those letters, is left exactly as it is.
  const stripped = brokerType.replace(/^sandbox(?=[A-Z])/, '')
  if (stripped === brokerType) return brokerType
  return stripped.charAt(0).toLowerCase() + stripped.slice(1)
}
