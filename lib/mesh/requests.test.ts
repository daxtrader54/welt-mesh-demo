import { describe, expect, it } from 'vitest'
import { buildConnectTokenBody, buildPaymentTokenBody, quoteBrokerType } from './requests'

const ETHEREUM = 'e3c7fdd8-b1fc-4e51-85ae-bb276e075611'
const MERCHANT = '0x0Ff0000f0A0f0000F0F000000000ffFf00f0F0f0'

const payment = () =>
  buildPaymentTokenBody({
    userId: 'welt-abc',
    transactionId: 'WELT-0042',
    destinations: [{ networkId: ETHEREUM, address: MERCHANT, symbol: 'USDC' }],
    amount: 50,
    displayAmountInFiat: 50
  })

describe('buildConnectTokenBody', () => {
  it('sends no transfer options, so Link connects and stops', () => {
    const body = buildConnectTokenBody({ userId: 'welt-abc' })
    expect(body).not.toHaveProperty('transferOptions')
  })

  it('allows more than one account, because this is not a transfer flow', () => {
    expect(buildConnectTokenBody({ userId: 'welt-abc' }).restrictMultipleAccounts).toBe(false)
  })

  it('deep-links when given an integration, and omits the field when not', () => {
    expect(buildConnectTokenBody({ userId: 'u', integrationId: 'abc' }).integrationId).toBe('abc')
    expect(buildConnectTokenBody({ userId: 'u', integrationId: null })).not.toHaveProperty('integrationId')
    expect(buildConnectTokenBody({ userId: 'u' })).not.toHaveProperty('integrationId')
  })
})

describe('buildPaymentTokenBody', () => {
  it('builds the exact transaction this store sells', () => {
    const body = payment() as Record<string, any>
    expect(body.transferOptions.transferType).toBe('payment')
    expect(body.transferOptions.toAddresses).toHaveLength(1)
    expect(body.transferOptions.toAddresses[0]).toEqual({
      networkId: ETHEREUM,
      symbol: 'USDC',
      address: MERCHANT,
      amount: 50,
      displayAmountInFiat: 50
    })
  })

  /** Mesh rejects a payment that carries both. `amount` is the required one. */
  it('never sends amountInFiat alongside amount', () => {
    const body = payment() as Record<string, any>
    expect(body.transferOptions).not.toHaveProperty('amountInFiat')
    expect(body.transferOptions.toAddresses[0].amount).toBe(50)
  })

  /** Fees sit on top of the payment, so the merchant receives the full 50. */
  it('keeps fees exclusive', () => {
    expect((payment() as Record<string, any>).transferOptions.isInclusiveFeeEnabled).toBe(false)
  })

  /** Comes back on every transfer event as clientTransactionId, which is how we match an order. */
  it('carries our order id through to Mesh', () => {
    expect((payment() as Record<string, any>).transferOptions.transactionId).toBe('WELT-0042')
  })

  /** Deliberate: the shopper keeps the choice of funding source inside Link. */
  it('does not deep-link the payment session to one provider', () => {
    expect(payment()).not.toHaveProperty('integrationId')
  })
})

/**
 * Measured against the sandbox on 4 September. `transfers/managed/quote` is the one endpoint that
 * will not take a sandbox broker type, and passing one through meant every quote in every sandbox
 * run returned 400 and the shop reported an account holding 9,397 USDC as unable to pay.
 */
describe('quoteBrokerType', () => {
  it('maps a sandbox broker to the production name the quote endpoint accepts', () => {
    // sandboxCoinbase -> 400 "Broker SandboxCoinbase not supported."; coinbase -> isEligible true.
    expect(quoteBrokerType('sandboxCoinbase')).toBe('coinbase')
  })

  it('leaves a production broker type alone', () => {
    expect(quoteBrokerType('coinbase')).toBe('coinbase')
    expect(quoteBrokerType('kraken')).toBe('kraken')
  })

  /**
   * The sandbox Binance entry reports itself as plain `sandbox`, with no broker name underneath.
   * There is nothing to map it to, and the quote endpoint rejects `binance` as well, so it goes
   * through unchanged and the answer comes back as an honest unknown.
   */
  it('passes through a bare sandbox type rather than inventing one', () => {
    expect(quoteBrokerType('sandbox')).toBe('sandbox')
  })

  it('does not mangle a name that merely starts with the same letters', () => {
    expect(quoteBrokerType('sandboxed')).toBe('sandboxed')
  })
})
