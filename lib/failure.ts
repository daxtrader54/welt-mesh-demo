/**
 * One failure shape for the whole app.
 *
 * `title` is what the shopper reads. Plain English, no jargon, and specific enough to be worth
 * reading: "Coinbase turned down the connection" beats "Something went wrong".
 * `detail` and `reference` are the real values from Mesh and only ever appear in the technical view.
 */

export type FailureCode =
  | 'config'
  | 'link_token'
  | 'sdk_load'
  | 'connect_failed'
  | 'connect_declined'
  | 'connect_unavailable'
  | 'portfolio_failed'
  | 'no_eligible_assets'
  | 'preview_failed'
  | 'execution_failed'
  | 'transfer_declined'
  | 'session_expired'
  | 'abandoned'
  | 'timeout'
  | 'network'
  | 'rate_limited'
  | 'unknown'

export type Failure = {
  code: FailureCode
  /** Shopper-facing. One sentence, plain English. */
  title: string
  /** Shopper-facing. What to do next, if there is anything useful to say. */
  hint?: string
  /** Technical. The real message from Mesh or from us. Drawer only. */
  detail?: string
  /** Technical. Mesh errorHash or requestId. What support asks for. Drawer only. */
  reference?: string
  /** Whether offering a retry is honest. A used link token is not retryable, a timeout is. */
  retryable: boolean
}

const COPY: Record<FailureCode, { title: string; hint?: string; retryable: boolean }> = {
  config: {
    title: 'This store is not configured yet',
    hint: 'The Mesh credentials are missing on the server.',
    retryable: false
  },
  link_token: {
    title: 'We could not start the payment',
    hint: 'Mesh did not issue a session. Try again in a moment.',
    retryable: true
  },
  sdk_load: {
    title: 'The payment window would not open',
    hint: 'Check that nothing is blocking pop-ups or frames, then try again.',
    retryable: true
  },
  connect_failed: {
    title: 'Coinbase could not be connected',
    retryable: true
  },
  connect_declined: {
    title: 'The connection was turned down',
    hint: 'You need to approve access before you can pay from your account.',
    retryable: true
  },
  connect_unavailable: {
    title: 'That account is not available on this device',
    hint: 'Pick a different account to pay from.',
    retryable: true
  },
  portfolio_failed: {
    title: 'We connected, but could not read your balances',
    hint: 'You can still pay. We just cannot show your holdings first.',
    retryable: true
  },
  no_eligible_assets: {
    title: 'Nothing in that account can cover this',
    hint: 'This order settles in USDC on Ethereum. Try another account.',
    retryable: true
  },
  preview_failed: {
    title: 'We could not price the payment',
    hint: 'Mesh could not build a transfer preview. Try again.',
    retryable: true
  },
  execution_failed: {
    title: 'The payment did not go through',
    hint: 'Nothing has been taken. You can try again.',
    retryable: true
  },
  transfer_declined: {
    title: 'The payment was declined',
    retryable: true
  },
  session_expired: {
    title: 'That payment session expired',
    hint: 'Sessions last ten minutes. Start it again.',
    retryable: true
  },
  abandoned: {
    title: 'Payment cancelled',
    hint: 'Nothing has been taken.',
    retryable: true
  },
  timeout: {
    title: 'Mesh took too long to answer',
    hint: 'Try again.',
    retryable: true
  },
  network: {
    title: 'We could not reach Mesh',
    hint: 'Check your connection and try again.',
    retryable: true
  },
  rate_limited: {
    title: 'Too many attempts',
    hint: 'Wait a few seconds before trying again.',
    retryable: false
  },
  unknown: {
    title: 'The payment stopped unexpectedly',
    retryable: true
  }
}

export function failure(
  code: FailureCode,
  extra?: { detail?: string; reference?: string; title?: string; hint?: string }
): Failure {
  const base = COPY[code]
  return {
    code,
    title: extra?.title ?? base.title,
    hint: extra?.hint ?? base.hint,
    detail: extra?.detail,
    reference: extra?.reference,
    retryable: base.retryable
  }
}
