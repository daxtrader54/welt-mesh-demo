# Where this is up to

Written 4 September 2026, updated the same day. Delete this file before the work is submitted.

Everything through `ca71586` is committed and pushed to `daxtrader54/welt-mesh-demo`, deployed at
https://welt-mesh-demo.vercel.app. There are uncommitted changes on top of it, listed at the bottom.
83 tests pass, typecheck and build are clean.

The README is the real documentation: what it does, how it is put together, and a Decisions and
tradeoffs section covering every fork worth explaining. This file is only the to-do list.

---

## Settled since this file was written

**The webhook secret is set and settlement works.** Live `/api/health` reports
`webhookSecret: true` and `storage: redis`. `scripts/webhook-check.mjs` passes 5/5 against
production, and a real order created through the live link-token route was moved from `created` to
`settled` by a signed delivery. Row seven of the payment trace is closed.

**The spec review is done.** `SPEC-REVIEW.md`, gitignored alongside the brief for the same reason.
Every hard requirement is met. What is missing is the onramp flow, a decision on
`integrationMfaRequired`, and the click-through testing below.

---

## Outstanding

**The exercise files stay unpublished.** `initial-spec.md`, `appendix.md`,
`additional-context.md` and `SPEC-REVIEW.md` are in the working directory and gitignored, because
the repo is public and publishing a company's take-home hands it to every future candidate.
`PLAN.md` is the record of what was agreed, with a header naming where the build diverged from it.

**Test the six fixes from the last round on a real phone and a real second visit.** They are built,
typechecked and deployed, but only the deployment was verified, not the click-through:

- returning shopper reaching checkout, seeing card and Apple Pay, picking crypto, and getting the
  portfolio without a Link session. This one already produced a bug, found and fixed 4 September:
  a stored token Mesh had stopped accepting left the shopper on "could not read your balances" with
  only a Continue anyway button and no way to reconnect. Retest it anyway
- delivery step, including the sample address button and the address on the receipt
- confirmation and receipt agreeing on $50.01
- the Coinbase deep-link, and the catalogue behind "Use a different exchange or wallet"
- iOS Safari: the console bar, the added-to-bag sheet and the pretend payment sheet clearing the
  browser toolbar
- the payment trace collapsing on a narrow screen

**Onramp flow.** Offered, never decided on. `transferType: 'onramp'` would let a shopper holding no
crypto at all pay by card through their exchange. It is the one obvious Mesh capability this build
does not show.

---

## What the last few sessions did

**Documentation and repo review.** README rewritten from scratch against the code: the old one had
drifted in eight verifiable places, including a Node floor that fails `npm test` and a claim there
was no architecture diagram directly above one. Added the Decisions and tradeoffs section, a
LICENSE (MIT for the code, product photographs and Mesh's marks carved out) and repo topics. Fixed
the same drift in the in-app panel, and put the webhook secret status on the Demo tab so a missing
secret is visible from the app rather than only from curl.

**Six fixes from testing**, in the order they hurt:

1. A returning shopper hit "Reading your account" and stayed there. The portfolio was only ever
   read from the SDK's connect callback, which never fires for someone whose connection survived
   the reset. Same root cause: holding a token and having chosen how to pay were one flag, so a
   returning shopper also lost the card and Apple Pay options. Both fixed, plus a 20 second abort
   so a hung request cannot recreate the spinner.
2. The confirmation said $50.00 and the receipt said $50.01 on the same screen. `chargedTotal` in
   `lib/order/state.ts` is now the single answer.
3. A non-crypto tester could not tell which entry in Mesh's catalogue was theirs. The checkout now
   names a provider and deep-links to it, catalogue one click away. That surfaced a second thing:
   alphabetical sorting put Binance first, because the sandbox Binance entry is typed `sandbox` and
   named "Binance", so an accident of the catalogue was choosing the default.
4. Added a delivery step. Never leaves the browser.
5. `viewport-fit=cover` and safe-area insets, because the console bar and both bottom sheets were
   sitting under iOS Safari's own toolbar.
6. The payment trace collapses to a count on a narrow screen.

---

## Facts worth not rediscovering

- Sandbox accounts: `Mesh`, `Mesh2` (empty), `Mesh3` (cash only), `Mesh4` (large). Password
  `Pass123`, code `123456`. In the panel's Demo tab.
- The sandbox balance is shared with every other Mesh sandbox user and each run spends about $50.
- Preview deployments will not work. Mesh validates the Link origin and every commit gets a new
  URL, so demo from the production domain.
- `docs.meshconnect.com` is still canonical and `docs.meshpay.com` does not resolve, which is why
  the docs links and API hosts still say meshconnect while the marketing site is meshpay.
- A stale global TypeScript 4.8 on PATH breaks `npx tsc --noEmit`. Use `npm run typecheck`.

---

## Uncommitted, 4 September

Not yet committed or deployed, so the live site still has the connection bug.

- **The expired-connection fix, both paths.** `lib/mesh/errors.ts` (new, with tests) tells a dead
  token apart from an ordinary holdings failure, on the API response and on the Link event.
  `connection_expired` in `lib/failure.ts`, `dropConnection` in `lib/store/records.ts`, a new
  `DELETE /api/mesh/connection`, the recovery in `app/api/mesh/portfolio/route.ts` and the single
  effect in `components/Shop.tsx` that acts on it wherever it is reported.
- **Two smaller bugs from the same session log.** An empty `transferNoEligibleAssets` no longer
  overwrites a more specific failure, and the funding card no longer says "cannot cover $50.00"
  about a balance it just said it could not read.
- **The events tab explains itself** when a reused connection means the SDK has emitted nothing.
- **Site metadata.** Title is now "WELT - Mocked Up Mini Shoe Shop", the description says plainly it
  runs on the Mesh sandbox with no real money, and noindex is enforced three ways: the meta tag,
  `X-Robots-Tag` in `next.config.ts`, and a new `app/robots.ts`.
- **Documentation drift fixed.** Test count 72 to 83, the route count contradiction between the
  README and the technical panel, the stale claim that a blank `MESH_COINBASE_INTEGRATION_ID` shows
  Mesh's picker, and the failure-handling section which the fix above made incomplete.

## Known, not fixed

- Three dead exports left over from the change that made reset keep the connection:
  `clearSession` in `lib/store/records.ts`, `clearSessionCookie` in `lib/session.ts`, and
  `colourwayFor` in `lib/product.ts`. None are referenced anywhere.
- `SettlementRecord.transferId` is written by the webhook and never read.
