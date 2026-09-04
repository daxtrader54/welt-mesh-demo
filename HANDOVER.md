# Where this is up to

Written 4 September 2026. Delete this file before the work is submitted.

Everything is committed and pushed to `daxtrader54/welt-mesh-demo`, deployed at
https://welt-mesh-demo.vercel.app. Working tree is clean. 72 tests pass, typecheck and build are
clean.

The README is the real documentation: what it does, how it is put together, and a Decisions and
tradeoffs section covering every fork worth explaining. This file is only the to-do list.

---

## Do this first

**Set `MESH_WEBHOOK_SECRET` in Vercel and redeploy.** Live `/api/health` still reports
`webhookSecret: false`. Until it is set, every webhook delivery is refused, orders stop at **paid**
and never reach **settled**, and row seven of the payment trace stays open. The webhook is
registered on the **Sandbox** row in the Mesh dashboard, so it is only the environment variable
that is missing. Vercel does not pick up environment changes without a redeploy.

The secret shown during registration earlier in this build was pasted into a chat window, so treat
it as burnt: delete that webhook in Mesh, register it again, and use the new secret.

Check it worked:

```bash
curl https://welt-mesh-demo.vercel.app/api/health          # webhookSecret: true, storage: redis
node scripts/webhook-check.mjs https://welt-mesh-demo.vercel.app   # 5/5
```

---

## Outstanding

**Full review of the app against the original spec.** Asked for, never done. `initial-spec.md`,
`appendix.md` and `additional-context.md` are in the working directory and gitignored, because the
repo is public and publishing a company's take-home exercise hands it to every future candidate.
The review should go requirement by requirement and say plainly what is covered, what is
deliberately not, and what was missed. `PLAN.md` is the record of what was agreed, with a header
naming where the build diverged from it.

**Test the six fixes from the last round on a real phone and a real second visit.** They are built,
typechecked and deployed, but only the deployment was verified, not the click-through:

- returning shopper reaching checkout, seeing card and Apple Pay, picking crypto, and getting the
  portfolio without a Link session
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
