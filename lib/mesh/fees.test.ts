import { describe, expect, it } from 'vitest'
import { buildPaymentTokenBody, clientFeeRatio } from './requests'

const ETHEREUM = 'e3c7fdd8-b1fc-4e51-85ae-bb276e075611'
const MERCHANT = '0x0Ff0000f0A0f0000F0F000000000ffFf00f0F0f0'

const build = (clientFee?: number) =>
  buildPaymentTokenBody({
    userId: 'welt-abc',
    transactionId: 'WELT-0042',
    destination: { networkId: ETHEREUM, address: MERCHANT, symbol: 'USDC' },
    amount: 50,
    displayAmountInFiat: 50,
    clientFee
  }) as Record<string, any>

describe('clientFeeRatio', () => {
  /** Mesh wants a proportion, merchants think in money. This is the whole conversion. */
  it('turns a $2 fee on a $50 order into the ratio Mesh expects', () => {
    expect(clientFeeRatio(2, 50)).toBe(0.04)
  })

  it('is zero when there is no fee', () => {
    expect(clientFeeRatio(0, 50)).toBe(0)
    expect(clientFeeRatio(-1, 50)).toBe(0)
  })

  /** Mesh rejects anything outside 0-1, and a fee bigger than the order is a config mistake. */
  it('never exceeds one, however badly it is configured', () => {
    expect(clientFeeRatio(500, 50)).toBe(1)
    expect(clientFeeRatio(50, 50)).toBe(1)
  })

  it('does not divide by zero', () => {
    expect(clientFeeRatio(2, 0)).toBe(0)
  })
})

describe('the payment body with a merchant fee', () => {
  it('sends clientFee as a ratio, not as dollars', () => {
    expect(build(2).transferOptions.clientFee).toBe(0.04)
  })

  it('omits clientFee entirely when the merchant takes nothing', () => {
    expect(build(0).transferOptions).not.toHaveProperty('clientFee')
    expect(build().transferOptions).not.toHaveProperty('clientFee')
  })

  /**
   * The important one. The merchant's fee must not change what lands at the destination, or the
   * receipt and the chain disagree about what the shop was actually paid.
   */
  it('leaves the destination amount at the order price', () => {
    expect(build(2).transferOptions.toAddresses[0].amount).toBe(50)
    expect(build(2).transferOptions.toAddresses[0].displayAmountInFiat).toBe(50)
  })

  it('keeps fees exclusive, so they sit on top rather than coming out of the payment', () => {
    expect(build(2).transferOptions.isInclusiveFeeEnabled).toBe(false)
  })
})
