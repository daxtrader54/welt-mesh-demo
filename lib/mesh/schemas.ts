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
 */

/** The envelope every Mesh endpoint wraps its payload in. */
const envelope = z.object({
  status: z.string(),
  message: z.string().optional(),
  displayMessage: z.string().optional(),
  errorHash: z.string().optional(),
  teamCode: z.string().optional(),
  errorType: z.string().optional()
})

export const linkTokenResponse = envelope.extend({
  content: z
    .object({
      linkToken: z.string(),
      paymentLink: z.string().optional()
    })
    .optional()
})

/** One holding. `distribution` exists on the wire but we have no use for it, so it is dropped. */
export const cryptoPosition = z.object({
  name: z.string().optional(),
  symbol: z.string(),
  amount: z.number(),
  costBasis: z.number().optional(),
  marketValue: z.number().optional(),
  lastPrice: z.number().optional()
})

export const holdingsResponse = envelope.extend({
  content: z
    .object({
      status: z.string().optional(),
      errorMessage: z.string().optional(),
      displayMessage: z.string().optional(),
      type: z.string().optional(),
      accountId: z.string().optional(),
      institutionName: z.string().optional(),
      accountName: z.string().optional(),
      cryptocurrencyPositions: z.array(cryptoPosition).optional()
    })
    .optional()
})

export const holdingsValueResponse = envelope.extend({
  content: z
    .object({
      totalValue: z.number().optional(),
      cryptocurrenciesValue: z.number().optional(),
      fiatValue: z.number().optional()
    })
    .optional()
})

export type LinkTokenResponse = z.infer<typeof linkTokenResponse>
export type HoldingsResponse = z.infer<typeof holdingsResponse>
export type HoldingsValueResponse = z.infer<typeof holdingsValueResponse>
export type CryptoPosition = z.infer<typeof cryptoPosition>

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
