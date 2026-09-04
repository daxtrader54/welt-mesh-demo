import type { LinkEventType } from '@meshconnect/web-link-sdk'
import type { Failure } from '@/lib/failure'
import { failure } from '@/lib/failure'
import { isDeadTokenEvent } from '@/lib/mesh/errors'

/**
 * One reducer drives the manifest, the receipt and the order status.
 *
 * Every row is stamped by a real event. Nothing is on a timer and nothing is inferred from
 * elapsed time. A step that never fires stays pending, visibly, because that is the honest
 * outcome and it is the interesting one to talk about.
 */

export type OrderStatus =
  | 'draft'
  | 'connecting'
  | 'connected'
  | 'paying'
  | 'paid'
  | 'settled'
  | 'failed'

export type StepId =
  | 'connected'
  | 'holdings'
  | 'asset'
  | 'network'
  | 'preview'
  | 'authorised'
  | 'settled'

export type StepState = 'pending' | 'active' | 'done' | 'failed'

/**
 * A fact on a manifest row.
 *
 * `technical` marks the ones a shopper has no use for: broker type strings, preview UUIDs,
 * transaction hashes. They stay in the state, so the panel and the copied log still carry them,
 * and they are filtered out of the shop, where they were the thing that made a checkout read as a
 * developer test.
 */
export type Fact = { label: string; value: string; technical?: boolean }

export type Step = {
  id: StepId
  label: string
  state: StepState
  at: number | null
  facts: Fact[]
}

export type PaymentDetail = {
  symbol: string | null
  amount: number | null
  amountInFiat: number | null
  totalAmountInFiat: number | null
  networkName: string | null
  toAddress: string | null
  refundAddress: string | null
  txId: string | null
  transferId: string | null
  txHash: string | null
  previewId: string | null
}

/**
 * One leg of how Mesh actually funded the payment.
 *
 * This is the thing the whole integration argues for, and until now the app threw it away.
 * `transferPreviewed` carries `cryptocurrencyFundingOptions`, and when the type is one of the
 * conversion values the shopper paid with an asset the merchant never asked for and never had to
 * think about. A shopper holding only BTC buying a $50 pair of trainers settled in USDC is the
 * demonstration; a receipt that does not mention it has hidden the point.
 */
export type FundingLeg = {
  type: string
  symbol: string | null
  amountInCrypto: number | null
  amountInFiat: number | null
  feeInFiat: number | null
}

export type FeeDetail = {
  institution: number | null
  institutionCurrency: string | null
  gas: number | null
  client: number | null
}

export type OrderState = {
  status: OrderStatus
  steps: Step[]
  /** The account that actually funded the payment, which may not be the one shown before Pay. */
  source: { name: string; type: string } | null
  /**
   * The provider chosen in Mesh's picker, captured before a connection exists. Without it a
   * failed Binance login reports "Coinbase could not be connected", which is worse than useless.
   */
  selectedProvider: string | null
  payment: PaymentDetail
  fees: FeeDetail
  /** How Mesh funded it, from the preview. Empty until Mesh says, and often one plain leg. */
  funding: FundingLeg[]
  failure: Failure | null
  /**
   * A problem that does not stop the payment. A failed balance read belongs here: the shopper can
   * still pay, they just do not get to see their holdings first, so it must not take over the
   * screen the way a `failure` does.
   */
  warning: Failure | null
  /**
   * The verified webhook delivery, once one arrives. Deliberately not in `log`, which is the SDK
   * event stream and must stay exactly that: this one never touched the browser.
   */
  webhook: {
    eventId: string | null
    transferStatus: string | null
    receivedAt: number
    txHash: string | null
  } | null
  /** Every SDK event, in order, for the technical view. */
  log: { at: number; type: string; payload: unknown }[]
}

const STEP_LABELS: Record<StepId, string> = {
  connected: 'Account connected',
  holdings: 'Balances read',
  asset: 'Asset selected',
  network: 'Network selected',
  preview: 'Payment priced',
  authorised: 'Payment authorised',
  settled: 'Settled'
}

const STEP_ORDER: StepId[] = ['connected', 'holdings', 'asset', 'network', 'preview', 'authorised', 'settled']

export function initialOrderState(): OrderState {
  return {
    status: 'draft',
    steps: STEP_ORDER.map(id => ({ id, label: STEP_LABELS[id], state: 'pending', at: null, facts: [] })),
    source: null,
    selectedProvider: null,
    payment: {
      symbol: null,
      amount: null,
      amountInFiat: null,
      totalAmountInFiat: null,
      networkName: null,
      toAddress: null,
      refundAddress: null,
      txId: null,
      transferId: null,
      txHash: null,
      previewId: null
    },
    fees: { institution: null, institutionCurrency: null, gas: null, client: null },
    funding: [],
    failure: null,
    warning: null,
    webhook: null,
    log: []
  }
}

export type OrderEvent =
  | { type: 'connect:started'; at: number }
  /**
   * A returning shopper whose stored connection is being reused. No Link session opens, so no SDK
   * event will ever stamp this row and it has to be stamped here instead.
   */
  | { type: 'connect:reused'; at: number; institution: string | null }
  | { type: 'holdings:done'; at: number; institution: string | null; usdc: number | null; positions: number }
  | { type: 'holdings:failed'; at: number; failure: Failure }
  | { type: 'pay:started'; at: number }
  /**
   * `reusedTokens` records whether this Link session was opened with a stored Mesh token id.
   * `transferConfigureError` does not always say what went wrong, and that fact is what separates
   * "the token we handed it is dead" from "the session expired".
   */
  | { type: 'link'; at: number; event: LinkEventType; reusedTokens?: boolean }
  /**
   * The verified webhook, as it was received. Carried onto the manifest because "confirmed by Mesh
   * webhook" is a claim, and the EventId and status are the evidence for it. This is the only fact
   * in the whole trace that did not come through the browser.
   */
  | {
      type: 'settled'
      at: number
      txHash?: string | null
      webhook?: {
        eventId?: string
        transferStatus?: string
        receivedAt?: number
        txHash?: string
      } | null
    }
  | { type: 'settlement:timeout'; at: number; reason: string }
  /**
   * The order as the server has it, after a page reload lost the browser's copy.
   *
   * Everything else in this reducer is stamped by an event the browser watched happen. This one is
   * not, and it does not pretend otherwise: it restores what the server can prove (the reference,
   * the amount, the authorisation, the webhook) and leaves the rows that were only ever witnessed
   * in the previous page view pending, with a fact saying why. A receipt that returns is worth
   * more than a trace that lies.
   */
  | {
      type: 'restored'
      at: number
      status: OrderStatus
      payment: Partial<PaymentDetail>
      paidAt: number | null
      source: { name: string; type: string } | null
      webhook?: {
        eventId?: string
        transferStatus?: string
        receivedAt?: number
        txHash?: string
      } | null
    }
  | { type: 'failed'; at: number; failure: Failure }
  /** Dismiss a failure without discarding the trace, which is the interesting part after one. */
  | { type: 'clear:failure' }
  | { type: 'reset' }

function mark(steps: Step[], id: StepId, state: StepState, at: number, facts: Fact[] = []): Step[] {
  return steps.map(s =>
    s.id === id
      ? { ...s, state, at: at === 0 ? s.at : at, facts: facts.length ? facts : s.facts }
      : s
  )
}

function activate(steps: Step[], id: StepId): Step[] {
  return steps.map(s => (s.id === id && s.state === 'pending' ? { ...s, state: 'active' } : s))
}

const num = (v: number | null | undefined, suffix = '') =>
  v === null || v === undefined ? '—' : `${v}${suffix}`

export function reduceOrder(state: OrderState, action: OrderEvent): OrderState {
  switch (action.type) {
    case 'reset':
      return initialOrderState()

    case 'connect:started':
      return {
        ...state,
        status: 'connecting',
        failure: null,
        warning: null,
        steps: activate(state.steps, 'connected')
      }

    case 'connect:reused':
      return {
        ...state,
        status: 'connecting',
        failure: null,
        warning: null,
        steps: mark(state.steps, 'connected', 'done', action.at, [
          { label: 'Provider', value: action.institution ?? '—' },
          { label: 'Source', value: 'Stored connection' },
          { label: 'Sign-in', value: 'Skipped' }
        ])
      }

    case 'holdings:done':
      return {
        ...state,
        status: state.status === 'paid' || state.status === 'settled' ? state.status : 'connected',
        steps: mark(state.steps, 'holdings', 'done', action.at, [
          { label: 'Institution', value: action.institution ?? '—' },
          { label: 'Positions', value: String(action.positions) },
          { label: 'Balance', value: num(action.usdc) }
        ])
      }

    case 'holdings:failed':
      // Not fatal, and now actually visible. Previously this wrote a manifest row and nothing
      // else, so the shopper saw no explanation at all and the copy promising one was dead code.
      return {
        ...state,
        status: state.status === 'connecting' ? 'connected' : state.status,
        warning: action.failure,
        steps: mark(state.steps, 'holdings', 'failed', action.at, [
          { label: 'Reason', value: action.failure.detail ?? action.failure.title }
        ])
      }

    case 'pay:started':
      return { ...state, status: 'paying', failure: null, steps: activate(state.steps, 'asset') }

    case 'failed':
      return { ...state, status: 'failed', failure: action.failure }

    case 'clear:failure':
      return {
        ...state,
        failure: null,
        status: state.status === 'failed' ? (state.source ? 'connected' : 'draft') : state.status
      }

    case 'settled': {
      const w = action.webhook
      return {
        ...state,
        status: 'settled',
        webhook: w
          ? {
              eventId: w.eventId ?? null,
              transferStatus: w.transferStatus ?? null,
              receivedAt: w.receivedAt ?? action.at,
              txHash: w.txHash ?? null
            }
          : state.webhook,
        payment: { ...state.payment, txHash: action.txHash ?? state.payment.txHash },
        steps: mark(state.steps, 'settled', 'done', action.at, [
          { label: 'Confirmed by', value: 'Mesh webhook, server to server' },
          ...(w?.transferStatus ? [{ label: 'TransferStatus', value: w.transferStatus }] : []),
          ...(w?.eventId ? [{ label: 'EventId', value: w.eventId, technical: true }] : []),
          ...(w?.receivedAt
            ? [{ label: 'Received', value: new Date(w.receivedAt).toISOString(), technical: true }]
            : [])
        ])
      }
    }

    case 'restored': {
      const w = action.webhook
      const settled = action.status === 'settled'
      const withAuth = mark(state.steps, 'authorised', 'done', action.paidAt ?? action.at, [
        { label: 'Restored from', value: 'the order record on the server' },
        ...(action.payment.transferId
          ? [{ label: 'TransferId', value: action.payment.transferId, technical: true }]
          : [])
      ])
      return {
        ...state,
        status: action.status,
        source: action.source ?? state.source,
        payment: { ...state.payment, ...action.payment },
        webhook: w
          ? {
              eventId: w.eventId ?? null,
              transferStatus: w.transferStatus ?? null,
              receivedAt: w.receivedAt ?? action.at,
              txHash: w.txHash ?? null
            }
          : state.webhook,
        steps: settled
          ? mark(withAuth, 'settled', 'done', w?.receivedAt ?? action.at, [
              { label: 'Confirmed by', value: 'Mesh webhook, server to server' },
              ...(w?.transferStatus ? [{ label: 'TransferStatus', value: w.transferStatus }] : []),
              ...(w?.eventId ? [{ label: 'EventId', value: w.eventId, technical: true }] : [])
            ])
          : withAuth
      }
    }

    case 'settlement:timeout':
      // Not a failure. The order is paid. This says plainly why row seven is still open, which
      // beats a blank line that sits there forever looking broken.
      return {
        ...state,
        steps: mark(state.steps, 'settled', 'pending', 0, [
          { label: 'Waiting on', value: 'Mesh webhook' },
          { label: 'Status', value: action.reason }
        ])
      }

    case 'link':
      return applyLinkEvent(state, action.event, action.at, action.reusedTokens ?? false)
  }
}

/**
 * What goes in the event log.
 *
 * `integrationConnected` carries the exchange's `accessToken` and `refreshToken`, and the log is
 * rendered in the technical view and copied to the clipboard by the Copy log button. Redacting
 * here rather than at the point of display means the renderer and the copy button cannot drift
 * apart, and a credential cannot reach a projector or a paste buffer. The base64 logo blob is
 * dropped at the same time because it is several kilobytes of noise.
 */
function redactPayload(event: LinkEventType): unknown {
  if (!('payload' in event) || event.payload === null || event.payload === undefined) return null
  if (event.type !== 'integrationConnected') return event.payload

  const token = event.payload.accessToken
  if (!token) return { redacted: 'no accessToken in payload' }

  return {
    brokerType: token.brokerType,
    brokerName: token.brokerName,
    expiresInSeconds: token.expiresInSeconds,
    accountTokens: (token.accountTokens ?? []).map(t => ({
      tokenId: t.tokenId ?? null,
      accountName: t.account?.accountName ?? null,
      accessToken: '[redacted before logging]',
      refreshToken: t.refreshToken ? '[redacted before logging]' : undefined
    })),
    brokerBrandInfo: '[dropped: base64 logo]'
  }
}

/**
 * Mesh's funding option types in plain English. Four of the seven are conversion, which is the
 * capability that lets someone pay for a dollar-priced order out of an asset that is not dollars.
 */
const FUNDING_TYPES: Record<string, string> = {
  existingCryptocurrencyBalance: 'balance in',
  buyingPowerPurchase: 'buying power, bought as',
  paymentMethodDepositUsage: 'a payment method, deposited as',
  cryptocurrencyConversion: 'converting',
  stableCoinNoFeeConversion: 'converting, no fee,',
  cryptocurrencyBuyingPowerConversion: 'converting buying power from',
  cryptocurrencyMultiStepConversion: 'converting, in steps, from'
}

export function describeFundingType(type: string | null | undefined): string {
  if (!type) return 'an unnamed source'
  return FUNDING_TYPES[type] ?? type
}

function applyLinkEvent(
  state: OrderState,
  event: LinkEventType,
  at: number,
  reusedTokens: boolean
): OrderState {
  const next: OrderState = {
    ...state,
    log: [...state.log, { at, type: event.type, payload: redactPayload(event) }]
  }

  switch (event.type) {
    case 'integrationConnected': {
      const token = event.payload.accessToken
      if (!token) return next
      return {
        ...next,
        status: next.status === 'paying' ? 'paying' : 'connected',
        source: { name: token.brokerName, type: token.brokerType },
        steps: mark(next.steps, 'connected', 'done', at, [
          { label: 'Provider', value: token.brokerName },
          { label: 'Type', value: token.brokerType, technical: true },
          { label: 'Accounts', value: String(token.accountTokens?.length ?? 0), technical: true }
        ])
      }
    }

    case 'integrationSelected':
      return { ...next, selectedProvider: event.payload.integrationName }

    case 'transferStarted':
      return {
        ...next,
        source: { name: event.payload.integrationName, type: event.payload.integrationType ?? '' },
        steps: activate(next.steps, 'asset')
      }

    case 'transferAssetSelected':
      return {
        ...next,
        steps: mark(next.steps, 'asset', 'done', at, [{ label: 'Asset', value: event.payload.symbol }])
      }

    case 'transferNetworkSelected':
      return {
        ...next,
        steps: mark(next.steps, 'network', 'done', at, [{ label: 'Network', value: event.payload.name }])
      }

    case 'transferPreviewed': {
      const p = event.payload
      const already = next.steps.find(s => s.id === 'preview')
      const firstPricedAt = already?.state === 'done' ? (already.at ?? at) : at
      const refreshes = (already?.facts.find(f => f.label === 'Requotes')?.value ?? '0') as string
      const requotes = already?.state === 'done' ? Number(refreshes) + 1 : 0
      return {
        ...next,
        // The source Mesh actually priced against. This is where a mid-flow switch shows up.
        source: p.integrationName
          ? { name: p.integrationName, type: p.integrationType ?? '' }
          : next.source,
        payment: {
          ...next.payment,
          symbol: p.symbol,
          amount: p.amount,
          amountInFiat: p.amountInFiat ?? null,
          networkName: p.networkName ?? null,
          toAddress: p.toAddress,
          previewId: p.previewId
        },
        fees: {
          institution: p.institutionTransferFee?.fee ?? null,
          institutionCurrency: p.institutionTransferFee?.feeCurrency ?? null,
          gas: p.estimatedNetworkGasFee?.fee ?? null,
          client: p.customClientFee?.fee ?? null
        },
        funding: (p.cryptocurrencyFundingOptions ?? []).map(f => ({
          type: f.cryptocurrencyFundingOptionType ?? 'unknown',
          symbol: f.cryptocurrencySymbol ?? null,
          amountInCrypto: f.usedAmountInCryptocurrency ?? null,
          amountInFiat: f.usedAmountInFiat ?? null,
          feeInFiat: f.fee?.amountInFiat ?? null
        })),
        // Asset and network do not always fire their own events when Link picks them for you.
        // `at: 0` keeps an existing timestamp. Mesh re-quotes every ~30s while the shopper sits on
        // the confirm screen, and without this the asset and network rows creep forward on each
        // requote until they read later than the row below them.
        steps: mark(
          mark(
            mark(next.steps, 'asset', 'done', already?.state === 'done' ? 0 : at, [
              { label: 'Asset', value: p.symbol }
            ]),
            'network',
            'done',
            already?.state === 'done' ? 0 : at,
            [{ label: 'Network', value: p.networkName ?? '—' }]
          ),
          'preview',
          'done',
          firstPricedAt,
          [
            { label: 'Amount', value: `${p.amount} ${p.symbol}` },
            {
              label: 'Exchange fee',
              value: `${p.institutionTransferFee?.fee ?? 0} ${p.institutionTransferFee?.feeCurrency ?? ''}`.trim()
            },
            // Mesh holds a quote for about 30 seconds and then re-prices. Showing the count is
            // more honest than silently advancing the timestamp on every refresh.
            ...(requotes ? [{ label: 'Requotes', value: String(requotes) }] : []),
            // Only shown when the merchant actually takes one, so a zero-fee shop is not
            // cluttered with a row that always reads nothing.
            ...(p.customClientFee?.fee
              ? [
                  {
                    label: 'Handling fee',
                    value: `${p.customClientFee.fee} ${p.customClientFee.feeCurrency ?? ''}`.trim()
                  }
                ]
              : []),
            /**
             * Named on the manifest, because a conversion is the most interesting thing that can
             * happen here and it would otherwise be invisible: the shopper spends BTC, the
             * merchant is paid USDC, and nothing on screen says so.
             */
            ...(p.cryptocurrencyFundingOptions?.length
              ? [
                  {
                    label: 'Funded by',
                    value: p.cryptocurrencyFundingOptions
                      .map(f =>
                        f.cryptocurrencySymbol
                          ? `${describeFundingType(f.cryptocurrencyFundingOptionType)} ${f.cryptocurrencySymbol}`
                          : describeFundingType(f.cryptocurrencyFundingOptionType)
                      )
                      .join(', then ')
                  }
                ]
              : []),
            { label: 'Preview', value: p.previewId, technical: true }
          ]
        )
      }
    }

    /**
     * Mesh's event reference marks `transferExecuted` "Do not use. Obsolete." and documents
     * `transferInitiated` as the event for the shopper proceeding from the preview. So the row is
     * stamped here, and `transferExecuted` below only fills in the transaction id it carries.
     */
    case 'transferInitiated':
      return {
        ...next,
        steps: mark(next.steps, 'authorised', 'done', at, [
          { label: 'Provider', value: event.payload.integrationName },
          { label: 'Status', value: event.payload.status }
        ])
      }

    case 'transferMfaRequired':
      return { ...next, steps: activate(next.steps, 'authorised') }

    case 'transferExecuted':
      return {
        ...next,
        payment: { ...next.payment, txId: event.payload.txId },
        steps: mark(next.steps, 'authorised', 'done', 0, [
          { label: 'Status', value: event.payload.status },
          { label: 'Transaction', value: event.payload.txId, technical: true }
        ])
      }

    /**
     * One funding leg running. Mesh emits this per leg, so a conversion that fails part way
     * through says which leg and why rather than surfacing as a bare execution error.
     */
    case 'executeFundingStep': {
      const p = event.payload
      if (p.status !== 'failed' && p.status !== 'error') return next
      return {
        ...next,
        status: 'failed',
        failure: failure('execution_failed', {
          title: `The ${describeFundingType(p.cryptocurrencyFundingOptionType).replace(/,$/, '')} step did not complete`,
          detail: p.errorMessage || `Funding step ${p.cryptocurrencyFundingOptionType}: ${p.status}`
        })
      }
    }

    /** A wallet that timed out or connected the wrong address. Otherwise this is silent. */
    case 'defiWalletError':
      return {
        ...next,
        status: 'failed',
        failure: failure('connect_failed', {
          title: `${event.payload.integrationName} could not be used`,
          detail: `${event.payload.errorType}: ${JSON.stringify(event.payload.details)}`
        })
      }

    case 'transferCompleted': {
      const p = event.payload
      return {
        ...next,
        status: 'paid',
        payment: {
          ...next.payment,
          symbol: p.symbol ?? next.payment.symbol,
          amount: p.amount ?? next.payment.amount,
          amountInFiat: p.amountInFiat ?? next.payment.amountInFiat,
          totalAmountInFiat: p.totalAmountInFiat ?? next.payment.totalAmountInFiat,
          networkName: p.networkName ?? next.payment.networkName,
          toAddress: p.toAddress ?? next.payment.toAddress,
          refundAddress: p.refundAddress ?? next.payment.refundAddress,
          txId: p.txId ?? next.payment.txId,
          transferId: p.transferId ?? next.payment.transferId,
          txHash: p.txHash ?? next.payment.txHash
        },
        steps: mark(next.steps, 'authorised', 'done', at, [
          { label: 'Status', value: p.status },
          { label: 'Transfer', value: p.transferId ?? '—', technical: true },
          { label: 'Reference', value: p.txHash ?? '—', technical: true }
        ])
      }
    }

    case 'transferNoEligibleAssets': {
      const held = event.payload.arrayOfTokensHeld ?? []

      /**
       * An empty holdings array is what an account with nothing in it looks like. It is also what
       * an account Mesh could not read looks like, and the two are indistinguishable from this
       * payload alone.
       *
       * Observed: a dead stored token produced `transferConfigureError` ("Please login again to
       * continue.") and this event in the same millisecond, and because this one arrived second it
       * overwrote the real reason with "Nothing in that account can cover this". The shopper was
       * told their account was empty when it holds ten thousand USDC.
       *
       * So an empty array never overwrites a failure that is already set. A populated one still
       * does, because then this event genuinely knows something the earlier one did not.
       */
      if (!held.length && next.failure) return { ...next, status: 'failed' }

      return {
        ...next,
        status: 'failed',
        failure: failure('no_eligible_assets', {
          detail: held.length
            ? `Held: ${held.map(t => `${t.amount} ${t.symbol}${t.ineligibilityReason ? ` (${t.ineligibilityReason})` : ''}`).join(', ')}`
            : 'The account reported no holdings at all.'
        })
      }
    }

    case 'connectionDeclined':
      return {
        ...next,
        status: 'failed',
        failure: failure('connect_declined', {
          detail: event.payload.errorMessage || event.payload.reason
        })
      }

    case 'connectionUnavailable':
      return {
        ...next,
        status: 'failed',
        failure: failure('connect_unavailable', {
          title: `${event.payload.integrationName || 'That account'} is not available on this device`,
          detail: event.payload.reason
        })
      }

    case 'integrationConnectionError':
      return {
        ...next,
        status: 'failed',
        failure: failure('connect_failed', {
          title: next.selectedProvider
            ? `${next.selectedProvider} could not be connected`
            : undefined,
          detail: event.payload.errorMessage,
          reference: event.payload.requestId
        })
      }

    case 'transferPreviewError':
      return {
        ...next,
        status: 'failed',
        failure: failure('preview_failed', {
          detail: event.payload.errorMessage,
          reference: event.payload.requestId
        }),
        steps: mark(next.steps, 'preview', 'failed', at, [
          { label: 'Reason', value: event.payload.errorMessage }
        ])
      }

    case 'transferExecutionError':
      return {
        ...next,
        status: 'failed',
        failure: failure('execution_failed', {
          detail: event.payload.errorMessage,
          reference: event.payload.requestId
        }),
        steps: mark(next.steps, 'authorised', 'failed', at, [
          { label: 'Reason', value: event.payload.errorMessage }
        ])
      }

    /**
     * Two different problems arrive on this event and they need different answers.
     *
     * "Please login again to continue." means the stored `accessTokens` we passed into the session
     * are dead, which is the same fault the holdings call reports as "Unauthorized token". The cure
     * is reconnecting, and the shop has to forget the connection to offer that. Anything else here
     * is an ordinary expired payment session, where starting again is enough.
     */
    case 'transferConfigureError':
      return {
        ...next,
        status: 'failed',
        failure: failure(
          /**
           * Mesh does not always say. A dead stored token produced "Please login again to
           * continue." once and a bare "An error has occurred." the next time, on a connect
           * session that had been handed the same dead token id. The message is not reliable, but
           * whether we passed a stored token is, so it decides when the text does not.
           *
           * Wrong in this direction costs one reconnect. Wrong in the other leaves the shopper in
           * a loop that nothing on screen can clear, which is the failure this keeps rediscovering.
           */
          isDeadTokenEvent(event.payload.errorMessage) || reusedTokens
            ? 'connection_expired'
            : 'session_expired',
          { detail: event.payload.errorMessage, reference: event.payload.requestId }
        )
      }

    case 'transferDeclined':
      return {
        ...next,
        status: 'failed',
        failure: failure('transfer_declined', {
          detail: `${event.payload.integrationName}: ${event.payload.status}`
        })
      }

    default:
      return next
  }
}

/** Where the shopper was when they closed Link. Turns an abandoned session into a useful state. */
export function describeExitPage(page: string | undefined): string | null {
  if (!page) return null
  const map: Record<string, string> = {
    integrationLoginPage: 'while signing in',
    integrationConnectedPage: 'just after connecting',
    transferExecutedPage: 'after the payment went through',
    transferPreviewPage: 'at the payment summary',
    transferMfaPage: 'at the confirmation code'
  }
  return map[page] ?? null
}

/**
 * What the customer's account was actually debited.
 *
 * One function, because this used to be worked out in two places that disagreed. The confirmation
 * headline read Mesh's `totalAmountInFiat` and said $50.00; the receipt added the amount and the
 * fees and said $50.01. Both were on screen at once.
 *
 * `totalAmountInFiat` is not trustworthy for this. The same transfer showed $50.01 in the Link
 * overlay and returned 50 in the completion payload, and earlier runs returned 50.01 in that same
 * field. The fee breakdown on `transferPreviewed` has been consistent every time, so the
 * arithmetic wins and Mesh's own figure is shown beside it when the two disagree.
 */
export function chargedTotal(order: OrderState, fallback: number): number {
  const { amount } = order.payment
  if (amount === null) return order.payment.totalAmountInFiat ?? fallback
  const fees = (order.fees.institution ?? 0) + (order.fees.client ?? 0) + (order.fees.gas ?? 0)
  return amount + fees
}

/** True when Mesh's own total contradicts the arithmetic, which is worth showing rather than hiding. */
export function meshTotalDisagrees(order: OrderState, fallback: number): boolean {
  const reported = order.payment.totalAmountInFiat
  if (reported === null || order.payment.amount === null) return false
  return Math.abs(reported - chargedTotal(order, fallback)) > 0.0001
}
