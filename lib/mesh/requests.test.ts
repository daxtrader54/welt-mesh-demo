import { describe, expect, it } from 'vitest'
import { buildConnectTokenBody, buildPaymentTokenBody } from './requests'

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
