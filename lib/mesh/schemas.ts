import { z } from 'zod'

/**
 * Every field here was observed on a live sandbox response during the step-0 probe.
 * Nothing is invented. Unknown keys are stripped rather than rejected, because Mesh adds fields
 * over time and a new one should not take the checkout down.
 *
 * Observed quirks worth keeping in mind:
 *  - `message` and `errorType` come back as empty strings on success, not absent.
 *  - `displayMessage` is absent on some errors, so it is optional.
 *  - `errorHash` is present on success too. It is what Mesh support asks for.
 *
 * Everything Mesh's OpenAPI marks nullable uses `.nullish()` rather than `.optional()`. Zod's
 * `.optional()` accepts `undefined` but rejects an explicit `null`, and a single null anywhere in
 * the envelope would fail the parse and take the checkout down. The sandbox does not send nulls
 * today; the published contract says it may.
 */

/** The envelope every Mesh endpoint wraps its payload in. */
const envelope = z.object({
  status: z.string(),
  message: z.string().nullish(),
  displayMessage: z.string().nullish(),
  errorHash: z.string().nullish(),
  teamCode: z.string().nullish(),
  errorType: z.string().nullish()
})

export const linkTokenResponse = envelope.extend({
  content: z
    .object({
      linkToken: z.string(),
      paymentLink: z.string().nullish()
    })
    .nullish()
})

/** One holding. `distribution` exists on the wire but we have no use for it, so it is dropped. */
export const cryptoPosition = z.object({
  name: z.string().nullish(),
  // Nullable in Mesh's schema, so it is coerced rather than required: a null symbol should cost
  // one unnamed row, not the whole portfolio read.
  symbol: z.string().nullish(),
  amount: z.number(),
  costBasis: z.number().nullish(),
  marketValue: z.number().nullish(),
  lastPrice: z.number().nullish()
})

export const holdingsResponse = envelope.extend({
  content: z
    .object({
      status: z.string().nullish(),
      errorMessage: z.string().nullish(),
      displayMessage: z.string().nullish(),
      type: z.string().nullish(),
      accountId: z.string().nullish(),
      institutionName: z.string().nullish(),
      accountName: z.string().nullish(),
      cryptocurrencyPositions: z.array(cryptoPosition).nullish()
    })
    .nullish()
})

export const holdingsValueResponse = envelope.extend({
  content: z
    .object({
      totalValue: z.number().nullish(),
      cryptocurrenciesValue: z.number().nullish(),
      fiatValue: z.number().nullish()
    })
    .nullish()
})

export type LinkTokenResponse = z.infer<typeof linkTokenResponse>
export type HoldingsResponse = z.infer<typeof holdingsResponse>
export type HoldingsValueResponse = z.infer<typeof holdingsValueResponse>
export type CryptoPosition = z.infer<typeof cryptoPosition>

/**
 * A transfer quote, per asset.
 *
 * This is what turns "we think you can pay with this" into Mesh's own answer. It reports whether
 * a given asset can actually fund a given destination, why not when it cannot, and what it would
 * cost — including whether the money comes from a balance the shopper already holds, from buying
 * power, or from a card they have on file at the exchange.
 */
const feeAmount = z.object({
  amountInFiat: z.number().nullish(),
  amountInCryptocurrency: z.number().nullish(),
  cryptocurrencySymbol: z.string().nullish()
})

export const quoteResponse = envelope.extend({
  content: z
    .object({
      isEligible: z.boolean().nullish(),
      ineligibilityReason: z.string().nullish(),
      minEligibleAmountFiat: z.number().nullish(),
      maxAmountFiat: z.number().nullish(),
      fees: z
        .object({
          totalFeesInFiat: z.number().nullish(),
          networkFee: feeAmount.nullish(),
          institutionFee: feeAmount.nullish(),
          tradingFee: feeAmount.nullish(),
          partnerFee: feeAmount.nullish()
        })
        .nullish(),
      fundingOptions: z
        .array(
          z.object({
            cryptocurrencyFundingOptionType: z.string().nullish(),
            paymentMethodType: z.string().nullish(),
            name: z.string().nullish(),
            usedAmountInFiat: z.number().nullish()
          })
        )
        .nullish()
    })
    .nullish()
})

export type QuoteResponse = z.infer<typeof quoteResponse>

/**
 * The webhook body. Mesh sends PascalCase here, unlike every other endpoint.
 * `EventId` is stable across retries and is the idempotency key. `Id` changes per delivery.
 */
export const webhookPayload = z.object({
  EventId: z.string().optional(),
  Id: z.string().optional(),
  SentTimestamp: z.number().optional(),
  TransferId: z.string().optional(),
  TransferStatus: z.string().optional(),
  TransactionId: z.string().optional(),
  TxHash: z.string().optional(),
  UserId: z.string().optional(),
  SourceAmount: z.number().optional(),
  DestinationAmount: z.number().optional(),
  Chain: z.string().optional(),
  Token: z.string().optional(),
  SourceAddress: z.string().optional(),
  DestinationAddress: z.string().optional(),
  SourceAccountProvider: z.string().optional()
})

export type WebhookPayload = z.infer<typeof webhookPayload>
