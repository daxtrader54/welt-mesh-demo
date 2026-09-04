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
  destination: Destination
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
  // Guard the upper bound: Mesh rejects anything outside 0-1, and a fee larger than the order
  // is a configuration mistake rather than something to pass along.
  return Math.min(fee / amount, 1)
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
      toAddresses: [
        {
          networkId: input.destination.networkId,
          symbol: input.destination.symbol,
          address: input.destination.address,
          amount: input.amount,
          displayAmountInFiat: input.displayAmountInFiat
        }
      ]
    }
  }
  if (input.integrationId) body.integrationId = input.integrationId
  return body
}
