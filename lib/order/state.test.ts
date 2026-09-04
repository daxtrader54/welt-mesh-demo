import type { LinkEventType } from '@meshconnect/web-link-sdk'
import { describe, expect, it } from 'vitest'
import {
  chargedTotal,
  initialOrderState,
  meshTotalDisagrees,
  reduceOrder,
  type OrderState,
  type StepId
} from './state'

/** Payloads below are trimmed copies of real sandbox events captured during the step-0 probe. */

const T = 1_700_000_000_000

const link = (event: LinkEventType, at = T): Parameters<typeof reduceOrder>[1] => ({
  type: 'link',
  at,
  event
})

const connected: LinkEventType = {
  type: 'integrationConnected',
  payload: {
    accessToken: {
      accountTokens: [
        {
          account: { accountId: '75bd3e8b', accountName: 'Sandbox Account' },
          accessToken: 'e9267024-6a3e-403a-989e-098d13d17045',
          tokenId: 'e9267024-6a3e-403a-989e-098d13d17045'
        }
      ],
      brokerType: 'sandboxCoinbase',
      brokerName: 'Coinbase',
      brokerBrandInfo: { brokerLogo: '' }
    }
  }
} as unknown as LinkEventType

const previewed: LinkEventType = {
  type: 'transferPreviewed',
  payload: {
    amount: 50,
    symbol: 'USDC',
    toAddress: '0x0Ff0000f0A0f0000F0F000000000ffFf00f0F0f0',
    networkId: 'e3c7fdd8-b1fc-4e51-85ae-bb276e075611',
    previewId: '2cef93e9-329a-4b99-a13d-d15b17d1d80a',
    networkName: 'Ethereum',
    amountInFiat: 50,
    integrationName: 'Coinbase',
    integrationType: 'sandboxCoinbase',
    estimatedNetworkGasFee: { fee: 0, feeInFiat: 0 },
    institutionTransferFee: { fee: 0.01, feeCurrency: 'USDC', feeInFiat: 0.01 },
    customClientFee: { fee: 0, feeCurrency: 'USDC', feeInFiat: 0 }
  }
} as unknown as LinkEventType

const completed: LinkEventType = {
  type: 'transferCompleted',
  payload: {
    status: 'success',
    txId: '3655ccb3-f534-4e7d-abf1-235cfe9f935e',
    transferId: '2cef93e9-329a-4b99-a13d-d15b17d1d80a',
    txHash: '599f887207b2cf9b434fd692a7b72e98b0e936669ebc5b3e1d32669c867a00dc',
    toAddress: '0x0Ff0000f0A0f0000F0F000000000ffFf00f0F0f0',
    symbol: 'USDC',
    amount: 50,
    amountInFiat: 50,
    totalAmountInFiat: 50.01,
    networkId: 'e3c7fdd8-b1fc-4e51-85ae-bb276e075611',
    networkName: 'Ethereum',
    refundAddress: '0x5307a6c91bb24707a133721d5051eb5e34b5f955'
  }
} as unknown as LinkEventType

const step = (state: OrderState, id: StepId) => state.steps.find(s => s.id === id)!

const happyPath = (): OrderState => {
  let s = initialOrderState()
  s = reduceOrder(s, { type: 'connect:started', at: T })
  s = reduceOrder(s, link(connected, T + 1000))
  s = reduceOrder(s, { type: 'holdings:done', at: T + 2000, institution: 'Coinbase', usdc: 9949.99, positions: 14 })
  s = reduceOrder(s, { type: 'pay:started', at: T + 3000 })
  s = reduceOrder(s, link(previewed, T + 4000))
  s = reduceOrder(s, link(completed, T + 5000))
  return s
}

describe('the happy path', () => {
  it('ends paid, not settled, because the browser is not the authority on settlement', () => {
    expect(happyPath().status).toBe('paid')
  })

  it('stamps every step with the time its real event arrived', () => {
    const s = happyPath()
    expect(step(s, 'connected').at).toBe(T + 1000)
    expect(step(s, 'holdings').at).toBe(T + 2000)
    expect(step(s, 'preview').at).toBe(T + 4000)
    expect(step(s, 'authorised').at).toBe(T + 5000)
  })

  it('leaves settled pending until a webhook says otherwise', () => {
    expect(step(happyPath(), 'settled').state).toBe('pending')
    expect(step(happyPath(), 'settled').at).toBeNull()
  })

  it('records the fee, so the receipt can show what the customer actually paid', () => {
    const s = happyPath()
    expect(s.fees.institution).toBe(0.01)
    expect(s.fees.institutionCurrency).toBe('USDC')
    expect(s.payment.amountInFiat).toBe(50)
    expect(s.payment.totalAmountInFiat).toBe(50.01)
  })

  it('captures the transaction references from the completion payload', () => {
    const s = happyPath()
    expect(s.payment.txHash).toBe('599f887207b2cf9b434fd692a7b72e98b0e936669ebc5b3e1d32669c867a00dc')
    expect(s.payment.transferId).toBe('2cef93e9-329a-4b99-a13d-d15b17d1d80a')
    expect(s.payment.refundAddress).toBe('0x5307a6c91bb24707a133721d5051eb5e34b5f955')
  })

  it('fills asset and network from the preview when Link picked them without an event', () => {
    const s = happyPath()
    expect(step(s, 'asset').facts).toContainEqual({ label: 'Asset', value: 'USDC' })
    expect(step(s, 'network').facts).toContainEqual({ label: 'Network', value: 'Ethereum' })
  })

  it('only reaches settled on a webhook, and says who confirmed it', () => {
    const s = reduceOrder(happyPath(), { type: 'settled', at: T + 9000, txHash: null })
    expect(s.status).toBe('settled')
    expect(step(s, 'settled').state).toBe('done')
    expect(step(s, 'settled').facts).toContainEqual({ label: 'Confirmed by', value: 'Mesh webhook' })
  })
})

describe('changing funding source mid-payment', () => {
  /** Observed in the second probe run: connected Coinbase, paid from Binance. */
  it('reports the source that actually paid, not the one that was connected', () => {
    let s = initialOrderState()
    s = reduceOrder(s, link(connected))
    expect(s.source?.name).toBe('Coinbase')

    const fromBinance = {
      ...previewed,
      payload: { ...(previewed as any).payload, integrationName: 'Binance', integrationType: 'sandbox' }
    } as unknown as LinkEventType

    s = reduceOrder(s, link(fromBinance, T + 4000))
    expect(s.source?.name).toBe('Binance')
  })
})

describe('failure states', () => {
  it('says what the account actually holds when nothing is eligible', () => {
    const event: LinkEventType = {
      type: 'transferNoEligibleAssets',
      payload: {
        integrationName: 'Coinbase',
        arrayOfTokensHeld: [{ symbol: 'DOGE', amount: 5000.02, ineligibilityReason: 'unsupported network' }]
      }
    } as unknown as LinkEventType

    const s = reduceOrder(initialOrderState(), link(event))
    expect(s.status).toBe('failed')
    expect(s.failure?.code).toBe('no_eligible_assets')
    expect(s.failure?.detail).toContain('5000.02 DOGE')
    expect(s.failure?.detail).toContain('unsupported network')
  })

  /** Real payload from the probe, MetaMask inside a payment session. */
  it('names the provider when a wallet is not on the device', () => {
    const event: LinkEventType = {
      type: 'connectionUnavailable',
      payload: {
        integrationType: 'deFiWallet',
        integrationName: 'MetaMask',
        reason: 'Wallet not installed on this device'
      }
    } as unknown as LinkEventType

    const s = reduceOrder(initialOrderState(), link(event))
    expect(s.failure?.title).toContain('MetaMask')
    expect(s.failure?.detail).toBe('Wallet not installed on this device')
    expect(s.failure?.retryable).toBe(true)
  })

  it('keeps the Mesh requestId so support has something to chase', () => {
    const event: LinkEventType = {
      type: 'transferExecutionError',
      payload: { errorMessage: 'Insufficient balance', requestId: 'req_991' }
    } as unknown as LinkEventType

    const s = reduceOrder(initialOrderState(), link(event))
    expect(s.failure?.code).toBe('execution_failed')
    expect(s.failure?.reference).toBe('req_991')
    expect(step(s, 'authorised').state).toBe('failed')
  })

  it('treats a failed balance read as non-fatal, because the shopper can still pay', () => {
    let s = reduceOrder(initialOrderState(), link(connected))
    s = reduceOrder(s, {
      type: 'holdings:failed',
      at: T,
      failure: { code: 'portfolio_failed', title: 'x', retryable: true }
    })
    expect(s.status).not.toBe('failed')
    expect(step(s, 'holdings').state).toBe('failed')
  })

  it('maps an expired configure error to a session that can be restarted', () => {
    const event: LinkEventType = {
      type: 'transferConfigureError',
      payload: { errorMessage: 'Session expired' }
    } as unknown as LinkEventType
    const s = reduceOrder(initialOrderState(), link(event))
    expect(s.failure?.code).toBe('session_expired')
    expect(s.failure?.retryable).toBe(true)
  })

  /**
   * Real payload, 4 September. The same dead stored token, on a connect session this time, and
   * Mesh gave no useful message at all. Nothing in the text identifies it, so the fact that we
   * handed Link a stored token id is what makes it diagnosable.
   */
  it('treats a bare configure error as a dead token when a stored one was passed in', () => {
    const event: LinkEventType = {
      type: 'transferConfigureError',
      payload: { errorMessage: 'An error has occurred.', requestId: 'bef17c55' }
    } as unknown as LinkEventType

    const reused = reduceOrder(initialOrderState(), {
      type: 'link',
      at: T,
      event,
      reusedTokens: true
    })
    expect(reused.failure?.code).toBe('connection_expired')

    // Without a stored token there is nothing to blame, so it stays an expired session.
    const fresh = reduceOrder(initialOrderState(), {
      type: 'link',
      at: T,
      event,
      reusedTokens: false
    })
    expect(fresh.failure?.code).toBe('session_expired')
  })

  /**
   * Real sequence, captured 4 September, from a payment session opened with a stored token Mesh
   * had stopped accepting. Both events arrived in the same millisecond, in this order.
   */
  it('does not let an empty no-eligible-assets overwrite the real reason', () => {
    const configureError: LinkEventType = {
      type: 'transferConfigureError',
      payload: {
        errorMessage: 'Please login again to continue.',
        requestId: '809f51953dcaca3d83f0e273f6a8da9d'
      }
    } as unknown as LinkEventType

    const noAssets: LinkEventType = {
      type: 'transferNoEligibleAssets',
      payload: {
        integrationType: 'sandboxCoinbase',
        integrationName: 'Coinbase',
        arrayOfTokensHeld: [],
        noAssetsType: 'noAssets'
      }
    } as unknown as LinkEventType

    let s = reduceOrder(initialOrderState(), link(configureError))
    // The stored token is dead, so the cure is reconnecting, not restarting the session.
    expect(s.failure?.code).toBe('connection_expired')

    s = reduceOrder(s, link(noAssets, T + 1))
    // The account holds ~10,000 USDC. An empty array here means Mesh could not read it at all,
    // and telling the shopper their account is empty would be a wrong diagnosis.
    expect(s.failure?.code).toBe('connection_expired')
    expect(s.status).toBe('failed')
    // Still logged, because the panel should show everything that actually fired.
    expect(s.log.map(e => e.type)).toContain('transferNoEligibleAssets')
  })

  it('still reports no eligible assets when it knows what is held', () => {
    const noAssets: LinkEventType = {
      type: 'transferNoEligibleAssets',
      payload: {
        integrationName: 'Coinbase',
        arrayOfTokensHeld: [{ symbol: 'DOGE', amount: 12, ineligibilityReason: 'unsupported network' }]
      }
    } as unknown as LinkEventType

    const earlier = reduceOrder(initialOrderState(), link({
      type: 'transferPreviewError',
      payload: { errorMessage: 'something else' }
    } as unknown as LinkEventType))

    const s = reduceOrder(earlier, link(noAssets, T + 1))
    expect(s.failure?.code).toBe('no_eligible_assets')
    expect(s.failure?.detail).toContain('12 DOGE')
  })
})

describe('the event log', () => {
  it('keeps every event in order for the technical view', () => {
    const s = happyPath()
    expect(s.log.map(e => e.type)).toEqual(['integrationConnected', 'transferPreviewed', 'transferCompleted'])
  })

  it('records events it does not act on, without changing state', () => {
    const before = initialOrderState()
    const after = reduceOrder(before, link({ type: 'pageLoaded' } as LinkEventType))
    expect(after.status).toBe(before.status)
    expect(after.log).toHaveLength(1)
  })
})

describe('reset', () => {
  it('returns a clean slate so the next demo starts from the beginning', () => {
    expect(reduceOrder(happyPath(), { type: 'reset' })).toEqual(initialOrderState())
  })
})

/**
 * The confirmation headline and the receipt total used to be worked out separately, and a real
 * run put $50.00 next to $50.01 on the same screen. Both now call chargedTotal, and these are the
 * tests that keep them honest.
 */
describe('what the customer was charged', () => {
  const withPayment = (amount: number | null, institution: number | null, reported: number | null) => {
    const s = initialOrderState()
    return {
      ...s,
      payment: { ...s.payment, amount, totalAmountInFiat: reported, symbol: 'USDC' },
      fees: { ...s.fees, institution, institutionCurrency: 'USDC' }
    } as OrderState
  }

  it('adds the fees to the amount rather than trusting Mesh', () => {
    // The real sandbox case: Mesh reported 50, the withdrawal fee was 0.01.
    expect(chargedTotal(withPayment(50, 0.01, 50), 50)).toBeCloseTo(50.01, 5)
  })

  it('says so when Mesh disagrees with the arithmetic', () => {
    expect(meshTotalDisagrees(withPayment(50, 0.01, 50), 50)).toBe(true)
    expect(meshTotalDisagrees(withPayment(50, 0.01, 50.01), 50)).toBe(false)
  })

  it('falls back to the order total before a payment exists', () => {
    expect(chargedTotal(withPayment(null, null, null), 50)).toBe(50)
    expect(meshTotalDisagrees(withPayment(null, null, 999), 50)).toBe(false)
  })

  it('never reports less than the merchant receives', () => {
    for (const fee of [0, 0.01, 0.5, 2]) {
      expect(chargedTotal(withPayment(50, fee, 50), 50)).toBeGreaterThanOrEqual(50)
    }
  })
})
