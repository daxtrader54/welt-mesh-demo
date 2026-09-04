# Where this is up to

Written 4 September 2026. Delete this file before the work is submitted.

Everything is committed and pushed to `daxtrader54/welt-mesh-demo`, deployed at
https://welt-mesh-demo.vercel.app. Working tree clean. 115 tests pass, typecheck and build are clean.

The README is the real documentation: what it does, how it is put together, and a Decisions and
tradeoffs section covering every fork worth explaining. `MESH-NOTES.md` is the integration log.
This file is only the to-do list.

---

## The adversarial review, and what came out of it

Ten independent reviewers went at the running app, the live deployment, the source, the Mesh SDK
source and Mesh's own documentation: solutions architect, visual design, UX, destructive QA, CTO,
security, Mesh DevRel, documentation, deployment and accessibility. Five blockers, twelve highs.
Four of the five blockers are fixed and each was verified rather than reasoned about.

**Fixed, with the evidence that proved it:**

- **The Link close recursion.** `closeLink()` in SDK 3.12.0 ends by calling `onExit`, and our
  `onExit` called `closeLink()` while leaving the session handle populated, so it called itself
  4,189 frames deep and the `RangeError` went into a bare `catch`. Every frame after the first
  re-entered with no arguments, so the real exit page was overwritten by a generic message
  thousands of times. Taking the handle and nulling the reference first gives it a base case:
  measured at depth 2, one app-level exit, carrying the page the shopper actually left from.
  **Mesh's own `llms-full.txt` causes this**, and that is worth saying out loud in a walkthrough
  rather than hiding.
- **A `null` in a webhook body lost the settlement for good.** Fifteen fields used `.optional()`
  where the rest of the file uses `.nullish()` 85 times and explains why in its header. Verified
  live: `"TxHash": null` went from 400 to 200.
- **A second delivery un-settled a settled order.** Reproduced on a real order, then fixed and
  re-verified: Succeeded settles, a later Pending leaves it settled, a RefundPending leaves it
  settled. All three used to knock it back to `created`.
- **The conversion claim.** Corrected in the README and in the shopper-facing copy. See the open
  question below.

**Not fixed, and both are decisions rather than work:**

- **The brief is still in the public git history.** `initial-spec.md`, `appendix.md` and
  `additional-context.md` went in with the first commit `4260894` and came out in `4403752`. Both
  are ancestors of `main`, so all three are still fetchable, unauthenticated, from
  `raw.githubusercontent.com`. `AUDIT.md` was never committed and is clean. Fixing it means
  `git filter-repo --invert-paths` on those three paths and a force push, which also rewrites the
  five commits below, so it is cheaper to do sooner than later.
- **`HANDOVER.md` is this file**, it is committed, and its second line tells you to delete it.

**Still on the list, none of it blocking:** the cookieless rate-limit bypass on `link-token`, no
timeout on the providers route, no `maxDuration` on any route, untyped route payloads duplicated
across four components, and no tests above `lib/`.

---

## The five commits since the last update

- `7f03150` the review fixes: settlement path, Link recursion, demo reliability, presenting layout,
  accessibility, and the documentation that blamed Mesh for our own webhook registration gap.
- `9750a20` the listing given a shop's shape on a phone, and stock made per colourway.
- `9d7a945` cards at half a row each, corner numbering removed.
- `ed9279e` the checkout quietened down to the decision it is asking for.
- `2621dbd` the drawer scroll bug and the floating specification.

---

## Outstanding

**A real phone.** Still the honest gap. Everything below has been exercised in a desktop browser at
phone widths and never on a handset:

- Mesh Link rendering as an overlay rather than embedded below 1024px, which is the thing most
  likely to be wrong and the one part of the journey this repo does not own
- the console bar, the added-to-bag sheet and the pretend payment sheet clearing iOS Safari's toolbar
- the sandbox credentials strip, which now renders over Mesh's own overlay at z-index 10001
- the panel drawer scrolling, which was genuinely broken until `2621dbd` and is fixed by reasoning
  about the flex chain rather than by touching it

**The `MeshBTC` run.** See the open question. One connect and one payment settles whether the
headline capability can be demonstrated at all.

**Onramp flow.** Offered, never decided on. `transferType: 'onramp'` would let a shopper holding no
crypto pay by card through their exchange. The one obvious Mesh capability this build does not show.

---

## Facts worth not rediscovering

- Sandbox accounts: `Mesh`, `Mesh2` (empty), `Mesh3` (cash only), `Mesh4` (large), `MeshBTC` (BTC,
  no stablecoin). Password `Pass123`, code `123456`. In the panel's Demo tab.
- The sandbox balance is shared with every other Mesh sandbox user and each run spends about $50.
- Preview deployments will not work. Mesh validates the Link origin and every commit gets a new URL,
  so demo from the production domain.
- **Vercel has been queuing badly.** Deploys in this session took fifteen seconds, then five
  minutes, then eight, then eleven. Nothing wrong with the builds. If you push before a demo, check
  the page actually contains your change; a 200 means the site is up, not that it is your build.
- When checking a deploy from a terminal, `grep -c` on served HTML counts matching **lines**, and
  the document is one line. Use `grep -o ... | wc -l`.
- `docs.meshconnect.com` is still canonical and `docs.meshpay.com` does not resolve.
- A stale global TypeScript 4.8 on PATH breaks `npx tsc --noEmit`. Use `npm run typecheck`.

---

## Known, not fixed

- Three dead exports left over from the change that made reset keep the connection: `clearSession`
  in `lib/store/records.ts`, `clearSessionCookie` in `lib/session.ts`, and `colourwayFor` in
  `lib/product.ts`. None are referenced anywhere.
- `components/Shop.tsx` is past 1,500 lines. Named in the audit; the CTO reviewer looked at it
  specifically and said **do not decompose it before a demo**, because the genuinely hard state is
  already out of it in a tested pure reducer. The one extraction worth making is the Mesh
  orchestration into a `useCheckout` hook, because that is what a Mesh engineer opens the repo to
  read and it currently sits behind a product page.

---

## The open question

**Can a shopper choose what they pay with?** Not from a merchant's page: Mesh's link token has no
field for the funding asset, so it cannot be offered. Mesh decides, spending the collected asset
when the balance covers it and converting another holding when it does not.

Which means an account holding plenty of USDC will never show conversion. **And it has never
happened here.** Every transfer on this client shows a same-asset funding leg; asked directly about
BTC against a $50 USDC-on-Ethereum destination, `configure` did not return it as eligible with
funding. The README and the portfolio copy now say only what has been measured, so this is no longer
a blocker, but it is still the headline.

Connect **`MeshBTC`** and watch the panel's Integration tab: if USDC comes back
`eligible with funding`, Mesh converts the BTC and the receipt names it. That single run either
proves the capability or confirms it is not enabled for this sandbox client.

Also untested, and quick: whether the `Pay with` row on Mesh's own payment sheet is tappable. If it
is, that is where a shopper's choice actually lives.
