import type { LinkEventType } from '@meshconnect/web-link-sdk'
import type { Failure } from '@/lib/failure'
import { failure } from '@/lib/failure'

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

export type Fact = { label: string; value: string }

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
  failure: Failure | null
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
    failure: null,
    log: []
  }
}

export type OrderEvent =
  | { type: 'connect:started'; at: number }
  | { type: 'holdings:done'; at: number; institution: string | null; usdc: number | null; positions: number }
  | { type: 'holdings:failed'; at: number; failure: Failure }
  | { type: 'pay:started'; at: number }
  | { type: 'link'; at: number; event: LinkEventType }
  | { type: 'settled'; at: number; txHash?: string | null }
  | { type: 'settlement:timeout'; at: number; reason: string }
  | { type: 'failed'; at: number; failure: Failure }
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
      return { ...state, status: 'connecting', failure: null, steps: activate(state.steps, 'connected') }

    case 'holdings:done':
      return {
        ...state,
        status: state.status === 'paid' || state.status === 'settled' ? state.status : 'connected',
        steps: mark(state.steps, 'holdings', 'done', action.at, [
          { label: 'Institution', value: action.institution ?? '—' },
          { label: 'Positions', value: String(action.positions) },
          { label: 'USDC', value: num(action.usdc) }
        ])
      }

    case 'holdings:failed':
      // Not fatal. The shopper can still pay, they just do not get to see holdings first.
      return {
        ...state,
        steps: mark(state.steps, 'holdings', 'failed', action.at, [
          { label: 'Reason', value: action.failure.detail ?? action.failure.title }
        ])
      }

    case 'pay:started':
      return { ...state, status: 'paying', failure: null, steps: activate(state.steps, 'asset') }

    case 'failed':
      return { ...state, status: 'failed', failure: action.failure }

    case 'settled':
      return {
        ...state,
        status: 'settled',
        payment: { ...state.payment, txHash: action.txHash ?? state.payment.txHash },
        steps: mark(state.steps, 'settled', 'done', action.at, [
          { label: 'Confirmed by', value: 'Mesh webhook' }
        ])
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
      return applyLinkEvent(state, action.event, action.at)
  }
}

function applyLinkEvent(state: OrderState, event: LinkEventType, at: number): OrderState {
  const next: OrderState = {
    ...state,
    log: [...state.log, { at, type: event.type, payload: 'payload' in event ? event.payload : null }]
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
          { label: 'Type', value: token.brokerType },
          { label: 'Accounts', value: String(token.accountTokens?.length ?? 0) }
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
        // Asset and network do not always fire their own events when Link picks them for you.
        steps: mark(
          mark(
            mark(next.steps, 'asset', 'done', at, [{ label: 'Asset', value: p.symbol }]),
            'network',
            'done',
            at,
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
            { label: 'Preview', value: p.previewId }
          ]
        )
      }
    }

    case 'transferExecuted':
      return {
        ...next,
        payment: { ...next.payment, txId: event.payload.txId },
        steps: mark(next.steps, 'authorised', 'done', at, [
          { label: 'Status', value: event.payload.status },
          { label: 'Transaction', value: event.payload.txId }
        ])
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
          { label: 'Transfer', value: p.transferId ?? '—' },
          { label: 'Reference', value: p.txHash ?? '—' }
        ])
      }
    }

    case 'transferNoEligibleAssets': {
      const held = event.payload.arrayOfTokensHeld ?? []
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

    case 'transferConfigureError':
      return {
        ...next,
        status: 'failed',
        failure: failure('session_expired', {
          detail: event.payload.errorMessage,
          reference: event.payload.requestId
        })
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
