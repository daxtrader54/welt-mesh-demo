# WELT — implementation plan

> **This is the plan as it was agreed, kept unedited as a record of what was decided and why.**
>
> The application has moved past it in several places, and where the two disagree the application
> is correct. The README describes what was actually built. The notable divergences: the shop
> starts on a listing page rather than the product page; card and Apple Pay open sheets rather than
> sitting disabled; the connect session shows Mesh's picker while the payment session is
> deep-linked, which is the reverse of what section 0c proposed; the merchant accepts three
> stablecoins rather than one; and there are now eight route handlers rather than six.
>
> Sections 0b and 0c are the part worth reading. They are the measured results of running the
> whole flow against the sandbox before any application code was written, and every number in them
> was observed rather than assumed.

Agreed 3 September 2026, revised 4 September.

## 0. Who this is for

A Solutions Architect showing a merchant how Mesh would fit into their product. So the audience in
the room is a merchant's product lead and their engineer, not a Mesh developer. Two consequences
that shape everything below.

The merchant's first question is whether their customers would actually use this, which is answered
by the shop and the payment route, not by the API. Their second question is how they know they got
paid, which is answered by the webhook, not by the browser. That second one is why the webhook stays
in scope. It is not an extra, it is the operational answer to the question a merchant always asks.

The integration itself should read as small. Four Mesh calls in a thin, obvious module. If the code
looks clever, it has failed.

## 0b. Step 0 findings (probe run 4 September 2026)

The full flow was run end to end against sandbox. Everything below is measured, not assumed.

**It works.** Connect, portfolio, and a $50 USDC payment to the Ethereum address all completed.
`transferCompleted` returned `txId`, `transferId`, `txHash`, `refundAddress` and `networkName`.

**Managed tokens skip re-auth, confirmed.** Passing the stored `tokenId` back as `accessTokens` took
the payment session from `pageLoaded` to `transferPreviewed` in twelve seconds with no login, no
integration picker and no OAuth. The two-step architecture holds, and the fallback wording is not
needed.

**The broker type is `sandboxCoinbase`, not `coinbase`.** It must be read from the connect payload
and passed through to `holdings/get`. Hardcoding `coinbase` would fail.

**There is a fee, and it is not zero.** `institutionTransferFee` was 0.01 USDC, gas was 0, and
`totalAmountInFiat` came back 50.01. The merchant receives $50, the customer pays $50.01. The
receipt shows both, because hiding it would be the kind of thing a merchant notices later.

**`transferId` equals `previewId`.** Both were `2cef93e9-…`. Convenient, but we should not depend on
it, and we key orders on our own `transactionId`.

**No explorer link.** The returned hash does not exist on Ethereum mainnet, Sepolia or Base. Checked
by `eth_getTransactionByHash` against public RPCs, all three returned null. The destination address
is real on mainnet but has a zero nonce and never received the payment. So the hash is a sandbox
reference, and we show it as a reference with a copy button and no link. This settles the open
question in section 12.

**Deep-link to Coinbase.** The Coinbase sandbox integration is
`721a5035-029f-4e05-bf3c-009da2fe381b`. During the probe the picker caused a wrong turn into Binance
before backing out, which is exactly the fumble a live demo does not need. We pass `integrationId`
so the button goes straight to Coinbase. The drawer notes that removing that one field shows the
full catalogue, which is where the breadth story belongs.

**Transfer MFA still fires** even when auth is skipped, so `123456` is always needed at payment.
It is needed at a point where the user has long since stopped looking at our page, so the sandbox
notice stays on screen through the payment step, not just at connect. This came straight out of the
second probe run, where the code was not to hand when Link asked for it.

## 0c. Second probe run: switching source mid-payment

**Correction to 0b.** The payment session does not jump straight to the preview. It opens on a source
step showing the connected account with the option to choose another. In the first run that was
accepted immediately, so no `integrationSelected` fired and it looked like a direct jump. In the
second run a different source was chosen and the flow branched. The behaviour is the same, the user
just did something different.

**A customer can change their mind inside Link, and it works.** Starting from a Coinbase connection,
the second run selected MetaMask (which failed), then picked Binance, authenticated it fresh inside
the payment session, and paid from there. Second successful payment, same shape as the first:
`txId`, `transferId`, `txHash`, `totalAmountInFiat` 50.01.

So the merchant configures one price and one destination, and the customer funds it from whatever
they like. That is the abstraction argument, demonstrated rather than asserted.

**But do not build a source list.** Coinbase and Binance sandbox return byte-for-byte identical
portfolios, same 9,949.99 USDC, same 5 BTC, even the same `accountId`. Two sources side by side with
matching balances reads as a bug. So the page shows one connected source with its real balance and
a quiet "change" that hands off to Link. Whatever actually funded the payment is read back from
`transferPreviewed.integrationName` and shown on the manifest and receipt. If they switch, the
receipt says Binance. That is more interesting than a list, and it is less work.

**Self-custody wallets connect but hold nothing.** MetaMask and Phantom both connected and both
returned an empty `cryptocurrencyPositions` array and a zero total. They also return no `tokenId`,
just a long encrypted `accessToken`, so managed tokens do not apply and our types must allow
`tokenId` to be absent. They are a dead funding source here, which is worth showing rather than
hiding.

**Two real failure payloads captured.** `connectionUnavailable` with
`reason: "Wallet not installed on this device"` fired for MetaMask inside the payment session. Real
message, real shape, and it is what the failure state gets designed against.

**The sandbox balance is shared and it depletes.** USDC went from 10,000.00 to 9,949.99 across two
payments at 50.01 each. Roughly 199 runs left before it needs attention, and the same balance backs
both Coinbase and Binance.

**Link carries the client name in its header.** It currently reads "Chris Bailey Mesh Interview
Test". That is a dashboard setting under Configure Link and it should say WELT, so the overlay does
not break the shop's identity at the exact moment the customer is paying.

**The sandbox picker offers five, not ten.** Binance, Coinbase, MetaMask, Phantom, Rainbow. Link
already filters the catalogue to what is usable, so the picker is safer than section 0b implied.
Connect still deep-links to Coinbase for a predictable start, but the payment session deliberately
does not, so the customer keeps the choice.

**Sandbox has to be unmistakable.** During the probe, real Coinbase credentials were typed into the
sandbox login by mistake. If that can happen to the person building it, it will happen to someone
in a demo. So the app states plainly, at the point of connection and not only in a footer, that
this is the Mesh sandbox, that no real account is involved, and which test credentials to use. This
is a correctness requirement, not decoration.

## 1. Product

**WELT** is a single-product footwear retailer, not a manufacturer. It lists one real shoe, the
**Skechers Sport Track Syntac**, at $50. That price settles in USDC on Ethereum, funded from the
buyer's Coinbase account through Mesh.

WELT is a retailer in the same sense MandM Direct is, which is what the source material is. The
footer carries one plain line: demonstration store, not affiliated with Skechers or MandM Direct,
no orders are fulfilled. That is the whole of the disclosure and it does not intrude on the design.

Visual direction is a technical spec sheet. Off-white ground, graphite type, one acid green accent
used once per screen as the action. Display face Archivo, data face IBM Plex Mono. The shoe is
annotated like industrial equipment: callout lines onto the product, numbered parts, a price and
size block that reads as a datasheet.

### Product data

Four colourways, each with five consistent 800x800 plates supplied by the user.

| Ref | Colourway | Own accent |
|---|---|---|
| XS30329 | Charcoal | Lime |
| XS30322 | Navy | Orange |
| XS30330 | Stone | Navy |
| XS30325 | Black | Graphite |

Plates per colourway: `1` lateral, `2` outsole, `3` heel, `4` top-down, `5` medial. They copy into
`public/product/<colourway>/<plate>.webp` under those names. Charcoal is the default because its
lime accent sits closest to the shop's acid green.

Two accent roles, kept apart so the rule stays meaningful. The **shop** accent is fixed acid green
and only ever marks the action. The **plate** accent is the selected colourway's own, and it drives
the callout lines and the selected swatch ring. Choosing black therefore never turns the pay button
grey.

The plates have pure white backgrounds, so the product sits on a white plate with a hairline rule
against the warm ground. In a spec sheet that reads as a technical drawing plate rather than a
floating rectangle, and it avoids knocking out backgrounds.

Price block follows the source page structure so that $50 reads as a real price rather than a demo
number: RRP $64.00, save $14.00, **$50.00**. Free standard delivery on this drop, because the Mesh
payment has to be exactly $50 and a delivery charge would contradict it. No countdown timer.

Sizes carry the source page's real gaps, which is what a clearance retailer actually looks like:
UK 6 / EU 39.5, UK 7 / EU 41, UK 8 / EU 42, UK 9 / EU 43 and UK 12 / EU 47.5 in stock, UK 10 and
UK 11 shown and disabled as out of stock. The chosen size is written to the order record and
printed on the receipt, so the selector is not decoration.

Guardrails so it does not become a developer tool: technical vocabulary on the shop surface is about
the shoe, not the payment rails. Monospace is for data only, never prose. Consumer copy is plain
English. "Pay $50", "Payment complete", never "initiate transfer".

The required transaction is fixed and never varies: $50, USDC, Coinbase source, Ethereum network
`e3c7fdd8-b1fc-4e51-85ae-bb276e075611`, destination `0x0Ff0000f0A0f0000F0F000000000ffFf00f0F0f0`,
sandbox MFA `123456`.

## 2. User journey

Land on the product page. A large plate of the shoe with the other four angles as a thumbnail strip
beneath it, four working colourway swatches, the size selector, the price block and the spec table.
Switching colourway swaps all five plates and the plate accent. The outsole and top-down views are
the annotated ones, because they take callout lines best. Payment method row shows card and Apple
Pay visibly disabled and labelled as out of scope, with **Pay with crypto** live.

Press it and a read-only Mesh Link session opens. Connect Coinbase. Link closes.

The page now shows the real Coinbase portfolio, total value and positions, and beneath it the
payment route: what you hold, what this costs, what the merchant receives. This is the moment the
demo exists for.

Press **Pay $50**. A second Link session opens carrying the payment options, reusing the stored
tokenId so Coinbase authentication is skipped. Preview, MFA, execute.

Link closes on success. The receipt prints down the screen as a docket. The product state changes
to YOURS. A small link opens **Behind the payment**.

## 3. Architecture

Browser, then Next.js route handlers, then the Mesh sandbox API. The client secret exists only in
route handlers. The browser receives a link token and normalised, redacted data. Nothing else.

    app/
      page.tsx                     product, checkout, portfolio, manifest, receipt
      api/mesh/link-token/route.ts mints read-only or payment tokens
      api/mesh/connection/route.ts receives the auth token from the client, stores it server-side
      api/mesh/portfolio/route.ts  holdings/get and holdings/value, normalised
      api/mesh/webhook/route.ts    raw body, HMAC, idempotent order update
      api/orders/[id]/route.ts     order state for polling
      api/health/route.ts          config presence, no values
    lib/mesh/                      typed client, zod schemas, error mapping
    lib/order/                     state machine, event reducer
    lib/store/                     Redis access, TTLs
    components/                    product, route manifest, receipt, drawer, failure states

Node runtime on every route. `crypto.createHmac` needs it and the Mesh calls are simpler there.

## 4. Mesh interactions

Four calls, all server side, all with `X-Client-Id` and `X-Client-Secret` against
`sandbox-integration-api.meshconnect.com`.

`POST /api/v1/linktoken` twice. First with `userId` and `restrictMultipleAccounts: false` and no
transfer options, to connect only. Second with `transferOptions` of type `payment`,
`isInclusiveFeeEnabled: false`, `transactionId` set to our order id, and one `toAddresses` entry
carrying the Ethereum network id, `USDC`, our address, `amount: 50` and `displayAmountInFiat: 50`.
Minted on the click, never on page load, because tokens last ten minutes and are single use.

`POST /api/v1/holdings/get` with `{ authToken, type: "coinbase", includeMarketValue: true }`.
We render only `cryptocurrencyPositions[]` fields that exist: name, symbol, amount, marketValue,
lastPrice. `POST /api/v1/holdings/value` gives `totalValue`. No invented fields.

Client side, `createLink` from `@meshconnect/web-link-sdk@3.12`. We use `onIntegrationConnected` to
capture and immediately ship the auth token, `onTransferFinished` for the settled payload,
`onExit` for the session summary, and `onEvent` for the lifecycle.

Events we act on, and why. `integrationSelected`, `integrationMfaRequired`, `integrationConnected`
drive the connection state. `transferStarted`, `transferAssetSelected`, `transferNetworkSelected`,
`transferPreviewed`, `transferInitiated`, `transferExecuted`, `transferCompleted` drive the manifest
and the order state. `transferNoEligibleAssets` gives us `arrayOfTokensHeld` so we can say what the
user actually holds instead of a shrug. `integrationConnectionError`, `connectionDeclined`,
`connectionUnavailable`, `transferPreviewError`, `transferExecutionError`, `transferConfigureError`,
`transferDeclined` drive designed failure states with the real `errorMessage` and `requestId`.
`close` gives `SessionSummary.page`, which tells us exactly where someone bailed. Everything else is
recorded in the drawer and acted on by nothing.

Webhooks at `/api/mesh/webhook`. Read the raw body with `req.text()` before any parsing. Verify
`X-Mesh-Signature-256` as base64 HMAC-SHA256 with timing-safe comparison. Dedupe on `EventId`, not
`Id`. Write, return 200, do nothing slow first. The webhook only ever upgrades an order from paid to
settled. The receipt is complete without it, so a silent sandbox cannot break the demo.

## 5. The manifest

The one wow moment. A numbered docket with rows for connection, holdings read, asset selected,
network selected, preview created, payment authorised, settled. Each row sits dim with a dashed
timestamp until its real event fires, then stamps with the actual time and its data. Nothing is
faked and nothing is on a timer. A row that never fires stays visibly blank, which is the honest
outcome and also the most interesting one to talk about.

## 5a. The technical view

Two audiences, one drawer, opened from the receipt or a keyboard shortcut. `?demo=1` promotes it to
a docked panel and reveals the demo controls.

For the merchant's product lead: the manifest, in plain English, showing what happened and when.

For their engineer: the live event log with real payloads, and a short list of the routes we
actually built, each with what it does, which Mesh call it makes, and a timestamp stamped in as the
session hits it. Six routes, one screen. It answers "what work is this for us" with data from the
session they just watched, rather than with a diagram. If anything here turns out to be scope, this
route list is the first thing to cut.

For the person driving the demo: the sandbox account cheatsheet. `Mesh` for the full portfolio and
the happy path, `Mesh2` for an empty account which genuinely produces `transferNoEligibleAssets`,
`Mesh3` for cash only, `Mesh4` for a large balance. Password and MFA alongside. This matters because
an SA needs to show failure states on demand, and these accounts produce them for real. Nothing is
mocked and no failure is simulated. Credentials get confirmed in step 0 before they go on screen,
because printing wrong ones live would be worse than not printing them.

## 6. State

Server side in Upstash Redis, everything with a TTL.
`session:{sid}` holds userId, brokerType, tokenId and the Coinbase auth token, TTL matched to the
SDK's `expiresInSeconds`. `order:{orderId}` holds the order record, 24 hours.
`webhook:{eventId}` is a dedupe marker, 24 hours. Session id lives in an httpOnly cookie.

Client side, one reducer over SDK events producing an order status of
`draft | connecting | connected | paying | paid | settled | failed`, plus the event log for the
drawer. No state library.

## 7. Errors

Every failure gets a designed state in the docket language: a plain English headline, one action,
and the real detail in the drawer. Covered: missing or invalid config, link token failure, SDK
failing to load, user closing Link (naming the page they left from), Coinbase auth failure, MFA
failure, no eligible assets (listing what they hold), portfolio failure, preview failure, execution
failure, declined transfer, expired link token, expired auth token, Mesh timeout, and repeated
clicks. Retry is offered only where retrying is safe, which means minting a fresh token, never
reusing one.

## 8. Security

The client secret and webhook secret exist only in route handlers, and `.env.local` is gitignored.
The Coinbase auth token reaches the browser because the SDK hands it to `onIntegrationConnected`,
which we cannot change. So it goes straight to the server, is held against the session, and never
re-enters client state, the UI or the logs. The drawer shows the tokenId and a masked prefix only.
All Mesh responses are parsed through zod, so unexpected shapes fail closed rather than rendering.
Event payloads render as text, never as HTML. Request bodies are validated. The link token route is
rate limited per session so it cannot be used to mint tokens in bulk. The browser's report of
success sets the receipt, but only the verified webhook sets settled.

## 9. Testing

Vitest over the logic where a regression costs something: HMAC verification including the
raw-body trap, EventId idempotency, both link token request builders, the event to order reducer,
the holdings normaliser, money formatting. Roughly thirty tests, no secrets, runs in CI. No tests
against live Mesh.

## 10. Deployment

Vercel, Node runtime, no edge. Environment: `MESH_CLIENT_ID`, `MESH_API_KEY`, `MESH_API_BASE_URL`,
`MESH_WEBHOOK_SECRET`, `MERCHANT_ADDRESS`, `MERCHANT_NETWORK_ID`, `UPSTASH_REDIS_REST_URL`,
`UPSTASH_REDIS_REST_TOKEN`. `localhost:3000` and one fixed production domain registered in the Mesh
dashboard. Preview deployments will not work, because their URLs change per commit and Mesh
validates the origin. We demo from production only, and the README says so.

## 11. Order of work

0. Probe. Credentials in place, then a throwaway script that runs the payment flow once by hand and
   records: does the transfer to the Ethereum address complete, what hash or reference comes back,
   does a webhook arrive, does `holdings/get` work with the auth token, does the stored tokenId
   actually skip Coinbase re-auth. Explorer link, receipt copy and webhook design all depend on
   this. Nothing else starts first.
1. Scaffold. Next.js 15 App Router, TypeScript, Tailwind v4, Vitest, zod. Env validation and health.
2. Mesh server layer with schemas and error mapping, plus its tests.
3. Connect flow end to end, portfolio rendering.
4. Payment flow end to end, order records.
5. Manifest, receipt, print, YOURS state.
6. Webhook, idempotency, settled upgrade, polling.
7. Failure states, retries, double-click guards, reset, `?demo=1` panel.
8. Design pass at 1440x900, then mobile.
9. README, deploy, register domain, full run on the live URL.

The README is a merchant artefact, not just setup notes. Alongside architecture, security and
failure handling it carries a section written for the merchant's engineer: the four Mesh calls, what
sits on our side against what sits on Mesh's, and what a production build would add that this one
deliberately does not have.

## 12. Out of scope

Four colourways of one shoe is a product page, not a catalogue, and the swatches genuinely work, so
it is not fake functionality either. Beyond that: no catalogue, no cart, no accounts or login, no
architecture diagram (the manifest does that
job with real data), no second Mesh flow, no confetti, no database beyond Redis, no design system or
component library, no state management library, no E2E tests against Mesh, no mocked success states
of any kind. Explorer link only if step 0 returns a real hash on a chain with a working explorer,
otherwise the reference is shown with a copy button and no link. Reset clears our own state only and
deliberately does not revoke the Mesh connection, so repeat demos stay fast.

## Open items

1. Mesh sandbox Client ID, API key, dashboard access for domain registration and a webhook secret.
   In progress at time of writing.
2. Product images: settled. Twenty files at `C:\Users\Chris\Downloads\sketcher`, copied into
   `public/product/` on approval.
