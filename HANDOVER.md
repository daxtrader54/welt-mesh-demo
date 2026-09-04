# Where this is up to

Written 4 September 2026, updated the same day. Delete this file before the work is submitted.

Everything is committed and pushed to `daxtrader54/welt-mesh-demo`, deployed at
https://welt-mesh-demo.vercel.app. Working tree clean. 91 tests pass, typecheck and build are clean.

The README is the real documentation: what it does, how it is put together, and a Decisions and
tradeoffs section covering every fork worth explaining. This file is only the to-do list.

---

## Settled since this file was written

**The webhook secret is set and settlement works.** Live `/api/health` reports `webhookSecret: true`
and `storage: redis`. `scripts/webhook-check.mjs` passes 5/5 against production, and several real
payments have settled on a verified delivery. Sandbox delivery is intermittent though: some runs
settle in seconds, some never arrive. The receipt is complete at `paid` by design.

**The audit is done.** `AUDIT.md`, gitignored alongside the brief. Every hard requirement in the
brief is met, verified against a real settled run: $50, USDC, Coinbase, `0x0Ff0…0f0`, Ethereum,
Link UI, MFA, webhook.

**The integration log is written.** `MESH-NOTES.md`, committed and linked from the README. Every
restriction and wrong turn, tagged measured, documented, or unknown.

**23 commits on 4 September**, all pushed and deployed. The big ones:

- The expired-connection dead end, in three parts: a refused token arrives in two unrelated shapes,
  the same fault reaches the SDK with an unreliable message, and the recovery was hidden behind
  Mesh's own error screen.
- **The root cause of "Unable to initiate the transfer"**: we replayed a stored account into connect
  sessions, whose entire purpose is to find one. Fixed by never sending `accessTokens` on connect.
- The quote endpoint had never worked in sandbox. It wants production broker types, and its
  response fields were being read under invented names.
- `transfers/managed/configure` added, which is the only call that answers about the account.
- Checkout and confirmation both rebuilt: centred column, itemised, classic confirmation.
- Metadata, noindex three ways, documentation drift.

## Outstanding

**The exercise files stay unpublished.** `initial-spec.md`, `appendix.md`,
`additional-context.md` and `AUDIT.md` are in the working directory and gitignored, because
the repo is public and publishing a company's take-home hands it to every future candidate.
`PLAN.md` is the record of what was agreed, with a header naming where the build diverged from it.

**A real phone.** Everything below has been exercised on a desktop browser many times over and
never on a handset:

- the console bar, the added-to-bag sheet and the pretend payment sheet clearing iOS Safari's own
  toolbar
- the payment trace collapsing to a count on a narrow screen
- Mesh Link rendering as an overlay rather than embedded below 1024px, which is the thing most
  likely to be wrong

**The `MeshBTC` run.** See the open question at the bottom. One connect and one payment settles
whether the headline capability can be demonstrated at all.

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

## Where it stands

Working tree clean, everything pushed and live. 91 tests, typecheck and build clean.

## Known, not fixed

- Three dead exports left over from the change that made reset keep the connection:
  `clearSession` in `lib/store/records.ts`, `clearSessionCookie` in `lib/session.ts`, and
  `colourwayFor` in `lib/product.ts`. None are referenced anywhere.
- `SettlementRecord.transferId` is written by the webhook and never read.
- `components/Shop.tsx` is past 1,100 lines. Named in the audit, deliberately not touched before a
  demo.

## The open question

**Can a shopper choose what they pay with?** Not from a merchant's page: Mesh's link token has no
field for the funding asset, so it cannot be offered. Mesh decides, spending the collected asset
when the balance covers it and converting another holding when it does not.

Which means an account holding plenty of USDC will never show conversion. Connect **`MeshBTC`**
(BTC, no stablecoin) and watch the panel's Integration tab: if USDC comes back
`eligible with funding`, Mesh converts the BTC and the receipt names it. That single run either
proves the headline capability or shows it is not enabled for this sandbox client.

Also untested, and quick: whether the `Pay with` row on Mesh's own payment sheet is tappable. If it
is, that is where a shopper's choice actually lives.
