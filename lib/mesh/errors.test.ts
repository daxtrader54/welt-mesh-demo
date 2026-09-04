import { describe, expect, it } from 'vitest'
import { isDeadToken, isDeadTokenEvent } from './errors'

/**
 * The two payloads below are real. `invalidIntegrationToken` was captured by posting a junk token
 * to holdings/get against the sandbox. "Unauthorized token" is what a shopper actually hit on a
 * second visit, with a stored connection Mesh had stopped accepting.
 */
describe('isDeadToken', () => {
  it('catches a token Mesh does not recognise', () => {
    expect(isDeadToken(400, 'invalidIntegrationToken', 'Invalid integration token provided.')).toBe(
      true
    )
  })

  it('catches the expired connection a returning shopper hits', () => {
    expect(isDeadToken(400, null, 'Unauthorized token')).toBe(true)
  })

  it('does not need the status to be 401, because Mesh sends 400', () => {
    expect(isDeadToken(400, null, 'Unauthorized token')).toBe(true)
    expect(isDeadToken(undefined, null, 'Unauthorized token')).toBe(true)
  })

  it('trusts a 401 on its own', () => {
    expect(isDeadToken(401, null, null)).toBe(true)
  })

  it('reads errorType even when the message says nothing useful', () => {
    expect(isDeadToken(400, 'unauthorizedToken', '')).toBe(true)
    expect(isDeadToken(400, 'tokenExpired', '')).toBe(true)
  })

  /**
   * The half that matters more. Treating a bad minute as an expired connection throws away a
   * working token and sends the shopper through a sign-in they did not need.
   */
  it('leaves a genuine holdings failure alone', () => {
    expect(isDeadToken(400, 'missingField', 'One or more validation errors occurred.')).toBe(false)
    expect(isDeadToken(429, 'rateLimited', 'Too many requests')).toBe(false)
    expect(isDeadToken(503, null, 'Service unavailable')).toBe(false)
    expect(isDeadToken(undefined, null, null)).toBe(false)
  })

  it('does not fire on the word token alone', () => {
    expect(isDeadToken(400, null, 'The link token was already used')).toBe(false)
  })

  /**
   * Real payload, captured 4 September. A dead stored token passed into a payment session as
   * `accessTokens` produced this three seconds in, before the shopper touched anything.
   */
  it('catches the Link event that reports the same dead token', () => {
    expect(isDeadTokenEvent('Please login again to continue.')).toBe(true)
  })

  it('leaves an ordinary expired payment session alone', () => {
    expect(isDeadTokenEvent('The transfer session has expired.')).toBe(false)
    expect(isDeadTokenEvent('')).toBe(false)
    expect(isDeadTokenEvent(null)).toBe(false)
  })
})
