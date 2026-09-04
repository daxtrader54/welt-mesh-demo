/**
 * Reading Mesh's error answers.
 *
 * Pure, and kept apart from the HTTP layer for the same reason the request builders are: this is
 * the logic that decides whether a shopper gets sent back to reconnect, and it should be testable
 * without a network.
 */

/**
 * Does this answer mean the stored token is finished?
 *
 * Mesh says so in two different ways and neither is a 401. `invalidIntegrationToken` is a token it
 * does not recognise at all. "Unauthorized token" is one it recognises and will no longer accept,
 * which is what an expired connection looks like from our side. Both arrive as a 400, so the
 * status alone tells you nothing and the message has to be read.
 *
 * Matched on both `errorType` and the message text on purpose. `errorType` is the stable field,
 * but only one of the two observed cases carried a useful value in it, so the text is the belt to
 * its braces. Erring towards "dead" costs a reconnect. Erring the other way leaves the shopper in
 * the loop this was written to end.
 */
export function isDeadToken(
  status: number | undefined,
  errorType: string | null | undefined,
  message: string | null | undefined
): boolean {
  if (status === 401) return true

  const type = (errorType ?? '').toLowerCase()
  if (type.includes('unauthorized') || type.includes('expired') || type === 'invalidintegrationtoken') {
    return true
  }

  return /unauthori[sz]ed token|expired token|token (has )?expired|invalid integration token|(please )?log ?in again/i.test(
    message ?? ''
  )
}

/**
 * Which failure a holdings read should report, from whichever shape the answer arrived in.
 *
 * There are two, and having classified only one of them is what shipped the bug twice. A token
 * Mesh cannot parse is rejected by the API with HTTP 400 and an `errorType`. A token that is well
 * formed and simply no longer accepted gets past the API into the integration, which answers
 * HTTP 200 with a failed `content.status` and `content.errorMessage: "Unauthorized token"` and no
 * `errorType` at all.
 *
 * Both callers ask this one function so a third shape cannot quietly get a different answer.
 */
export function holdingsFailureCode(input: {
  httpStatus?: number
  errorType?: string | null
  message?: string | null
}): 'connection_expired' | 'portfolio_failed' {
  return isDeadToken(input.httpStatus, input.errorType, input.message)
    ? 'connection_expired'
    : 'portfolio_failed'
}

/**
 * The same question, asked of a Link event rather than an API response.
 *
 * A stored token that Mesh will not accept fails on both paths, and this is the one that proves it.
 * Passing dead `accessTokens` into a payment session produces `transferConfigureError` with
 * "Please login again to continue." three seconds in, before the shopper touches anything. So
 * "you can still pay, we just cannot show your holdings" was never true for this case: the payment
 * was already broken by the same cause, and the shopper found out one screen later.
 */
export function isDeadTokenEvent(errorMessage: string | null | undefined): boolean {
  return isDeadToken(undefined, null, errorMessage)
}
