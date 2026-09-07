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
  | 'connection_expired'
  | 'no_eligible_assets'
  | 'preview_failed'
  | 'execution_failed'
  | 'transfer_pending'
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
  /**
   * Who produced this state. Shown on the notice, because the first thing anyone reviewing a demo
   * wonders about a tidy failure screen is whether it was staged.
   *
   * `mesh` is Mesh refusing or reporting something, and the Events tab will have the event that
   * carried it. `you` is the shopper's own action, closing Link or declining access. `app` is our
   * own code or configuration. `network` is neither of us.
   */
  source: 'mesh' | 'app' | 'you' | 'network'
}

const COPY: Record<
  FailureCode,
  { title: string; hint?: string; retryable: boolean; source: Failure['source'] }
> = {
  config: {
    title: 'This store is not configured yet',
    hint: 'The Mesh credentials are missing on the server.',
    retryable: false,
    source: 'app'
  },
  link_token: {
    title: 'We could not start the payment',
    hint: 'Mesh did not issue a session. Try again in a moment.',
    retryable: true,
    source: 'mesh'
  },
  sdk_load: {
    title: 'The payment window would not open',
    hint: 'Check that nothing is blocking pop-ups or frames, then try again.',
    retryable: true,
    source: 'app'
  },
  connect_failed: {
    title: 'Coinbase could not be connected',
    retryable: true,
    source: 'mesh'
  },
  connect_declined: {
    title: 'The connection was turned down',
    hint: 'You need to approve access before you can pay from your account.',
    retryable: true,
    source: 'you'
  },
  connect_unavailable: {
    title: 'That account is not available on this device',
    hint: 'Pick a different account to pay from.',
    retryable: true,
    source: 'mesh'
  },
  portfolio_failed: {
    title: 'We connected, but could not read your balances',
    hint: 'You can still pay. We just cannot show your holdings first.',
    retryable: true,
    source: 'mesh'
  },
  /**
   * Distinct from `portfolio_failed` because the cure is different and so is the honest copy.
   * A portfolio failure is a bad moment on a live connection and "carry on" is fair advice. This
   * is the stored token no longer being accepted, where carrying on means paying against a
   * connection we have just thrown away. The only way forward is to connect again.
   */
  connection_expired: {
    title: 'Your account connection has expired',
    hint: 'Connect again to see your balances and pay.',
    retryable: true,
    source: 'mesh'
  },
  no_eligible_assets: {
    title: 'Nothing in that account can cover this',
    hint: 'This order settles in USDC on Ethereum. Try another account.',
    retryable: true,
    source: 'mesh'
  },
  preview_failed: {
    title: 'We could not price the payment',
    hint: 'Mesh could not build a transfer preview. Try again.',
    retryable: true,
    source: 'mesh'
  },
  execution_failed: {
    title: 'The payment did not go through',
    hint: 'Nothing has been taken. You can try again.',
    retryable: true,
    source: 'mesh'
  },
  /**
   * Authorised, not finished, and emphatically not retryable.
   *
   * A pending transfer used to be reported as `execution_failed`, which is retryable, so a
   * "Try again" button appeared directly under the words "Nothing else is needed from you" and
   * the retry it offered was a second $50 payment. Mesh's own delivery log shows settlement
   * taking up to 34 seconds, so this is a state a demo will actually reach.
   */
  transfer_pending: {
    title: 'Your payment is still being confirmed',
    hint: 'Your account has authorised it and the exchange has not finished. Nothing else is needed from you.',
    retryable: false,
    source: 'mesh'
  },
  transfer_declined: {
    title: 'The payment was declined',
    retryable: true,
    source: 'mesh'
  },
  session_expired: {
    title: 'That payment session expired',
    hint: 'Sessions last ten minutes. Start it again.',
    retryable: true,
    source: 'app'
  },
  abandoned: {
    title: 'Payment cancelled',
    hint: 'Nothing has been taken.',
    retryable: true,
    source: 'you'
  },
  timeout: {
    title: 'Mesh took too long to answer',
    hint: 'Try again.',
    retryable: true,
    source: 'network'
  },
  network: {
    title: 'We could not reach Mesh',
    hint: 'Check your connection and try again.',
    retryable: true,
    source: 'network'
  },
  rate_limited: {
    title: 'Too many attempts',
    hint: 'Wait a few seconds before trying again.',
    retryable: false,
    source: 'mesh'
  },
  unknown: {
    title: 'The payment stopped unexpectedly',
    retryable: true,
    source: 'app'
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
    retryable: base.retryable,
    source: base.source
  }
}
