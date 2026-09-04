# WELT

A single-product shoe shop where the checkout runs on [Mesh](https://www.meshpay.com).

**Live: https://welt-mesh-demo.vercel.app**

You pick a size, add to bag, check out, connect an exchange account, see what you actually hold,
choose which stablecoin the merchant is paid in, and pay. Underneath there is a second layer showing what really
happened: every Mesh event with its payload, the routes that produced them, and the reasoning behind
the whole thing.

The point is not that an API call works. It is that the customer never copied an address, never
withdrew anything, and never had to find out what the merchant accepts. Mesh sat in the middle and
did it.

Built to be shown by a Solutions Architect to a merchant, so the two questions it is designed to
answer are *would my customers use this* and *how do I know I got paid*.

---

## What it does

WELT is a fictional clearance retailer listing one real product, a Skechers Sport Track Syntac, in
four colourways at $50. Not affiliated with Skechers or MandM Direct, where the photographs and the
listing structure came from. No orders are fulfilled.

1. **Listing.** Four colourways, which are four real SKUs with their own supplier references.
2. **Product.** Colour, size, add to bag. Reviews, delivery and spec, as a shop has.
3. **Bag.** Line item, summary, savings off RRP, checkout securely.
4. **Delivery.** Name, email and address, because a checkout that jumps from bag to payment is not
   one anyone recognises. It never leaves the browser.
5. **Checkout.** Card and Apple Pay open real-looking sheets that then say they are for show. The
   crypto option opens a Mesh Link session that connects an account and stops.
6. **Portfolio.** Everything in the connected account, with Mesh's own answer on which of it can pay
   for this order and where the money would come from. Pick one.
7. **Pay.** A second Link session carries the payment, deep-linked to the account already connected
   so nobody is asked to choose twice. **Change account** puts the picker back.
8. **Confirmation.** The receipt prints, the bag empties, the product says *Yours*. A verified
   webhook later upgrades **paid** to **settled**.

Alongside it, a payment trace: seven rows, each stamped by a real Mesh event with the time it
arrived. Nothing runs on a timer, so a row that stays blank is a step that genuinely did not happen.

---

## Running it

Node 22.12 or newer. Built and deployed on Node 24. Earlier 22.x and odd-numbered majors fail
`npm test`, because vitest requires `^22.12 || ^24 || >=26`.

```bash
npm install
cp .env.example .env.local     # fill in the two Mesh values
npm run dev
```

**You need a Mesh sandbox Client ID and API key.** Without them the app starts and every route
returns a named configuration error, which `/api/health` spells out. To see it working without
credentials, use the deployment above.

**Register your domain before the first run.** Mesh dashboard, Account > Get your API keys > Allowed
Link URLs, add `http://localhost:3000`. Mesh validates the origin the Link popup was opened from and
an unregistered domain fails to render *with no console error*. Changes take up to ten minutes. This
is the most common reason a first run shows a blank grey box, and the app now detects it: if no SDK
event arrives within twelve seconds it says so and names the domain to register.

| Variable | Required | Where it comes from |
|---|---|---|
| `MESH_CLIENT_ID` | yes | Dashboard, Account > Get your API keys, top right |
| `MESH_API_KEY` | yes | Same page, Sandbox keys. Shown once at generation |
| `MESH_API_BASE_URL` | yes | `https://sandbox-integration-api.meshconnect.com` |
| `MERCHANT_ADDRESS` | yes | The destination wallet |
| `MERCHANT_NETWORK_ID` | yes | Ethereum, `e3c7fdd8-b1fc-4e51-85ae-bb276e075611` |
| `MESH_WEBHOOK_SECRET` | no | **Sandbox** Transfer Webhook Callback URI. Shown once. Without it settlement never arrives |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | no | Upstash directly. Without a store, settlement cannot reach the browser on serverless |
| `KV_REST_API_URL` / `_TOKEN` | no | What the Vercel Marketplace Upstash integration sets instead. Either pair works; set one, not both |
| `MESH_COINBASE_INTEGRATION_ID` | no | A server-side override. Leave it blank: `/api/mesh/providers` picks the default from the live catalogue, which is what you want. Set it only to pin one provider |
| `NEXT_PUBLIC_MERCHANT_HANDLING_FEE` | no | Merchant fee in dollars, sent as Mesh's `clientFee`. `0` by default, and see Decisions for why |

`?demo=1` opens the technical panel docked. `Ctrl/Cmd + Shift + D` toggles it. `/api/health` reports
which variables are present, without values, whether the store is Redis or memory, and in
`storageReachable` whether it actually answered. Those last two are not the same thing: constructing
the Upstash client makes no network call, so a health check that only reads environment variables
goes green with the database paused, which is the state that takes both the pay path and settlement
down.

### Scripts

```bash
npm test                                    # 115 tests, no secrets, under a second
npm run typecheck
node scripts/webhook-check.mjs <url>        # prove the webhook endpoint without waiting for Mesh
node scripts/crop-product-images.mjs        # re-frame the photographs from public/product-src
```

---

## Architecture

```
Browser ──────────────► Next.js route handlers ──────────► Mesh sandbox API
   │  │                          │                              ▲
   │  └── Mesh Link iframe ──────┼──────────────────────────────┘
   │      (direct, hence the CSP)│
   │                             ▼
   │                        Upstash Redis
   │                             ▲
   └── polls the order ──────────┴──── Mesh webhook (signed, server to server)
```

The browser talks to Mesh twice over: through our routes, and directly through the Link iframe. That
second edge is why the CSP allows `*.meshconnect.com` in `frame-src` and `connect-src`, and it is
why the exchange auth token reaches client JavaScript at all.

```
app/
  page.tsx                     the shop, one route, seven internal steps including history
  error.tsx  not-found.tsx     branded failure and 404
  api/mesh/link-token          mints connect and payment tokens
  api/mesh/connection          takes custody of the auth token; reports an existing one
  api/mesh/portfolio           holdings, normalised
  api/mesh/quotes              per-asset eligibility, fees and funding sources
  api/mesh/providers           who could fund this, who Link will offer, and which to default to
  api/mesh/transfers           Mesh's own ledger, with its webhook delivery logs
  api/mesh/webhook             raw body, HMAC, idempotent settlement, checked against the order
  api/orders/[id]              order state, owned by the session that created it
  api/session/reset            keeps the connection; the browser drops the order id
  api/health                   config presence and a real store round trip, no values
lib/
  mesh/     client, request builders, provider mapping, schemas, webhook verification
  order/    the event reducer that drives the manifest and the receipt
  store/    Redis with a memory fallback, TTLs on everything
components/ shop, listing, plate, checkout, portfolio, bag, receipt, history, technical panel
scripts/    webhook-check, crop-product-images, trim-logo
```

Ten route files. Eight carry the integration; `health` and `session/reset` exist for the demo.
Everything runs on the Node runtime, not edge: `crypto.createHmac` needs it and the Mesh calls are
simpler there.

---

## The Mesh integration

Eight endpoints, all server side, all with `X-Client-Id` and `X-Client-Secret`.

### Link token

`POST /api/v1/linktoken`, in two shapes. Tokens last ten minutes and are single use, so they are
minted on the click and never on page load.

**Connect** carries no transfer options, so Link connects the account and stops. This is the only
way to read holdings before asking anyone to pay.

```jsonc
{
  "userId": "welt-<session>",
  "restrictMultipleAccounts": false
  // accessTokens go to createLink, not here, so a returning shopper skips the login
}
```

**Payment** carries the transaction, deep-linked to the account already connected. The integration id
comes from the connect session's exit summary.

```jsonc
{
  "userId": "welt-<session>",
  "restrictMultipleAccounts": true,
  "integrationId": "<the one they just connected>",
  "transferOptions": {
    "transactionId": "<uuid>",           // comes back on the webhook as TransactionId
    "transferType": "payment",
    "isInclusiveFeeEnabled": false,      // fees sit on top; the destination receives the full 50
    "generatePayLink": false,
    "toAddresses": [                     // the asset they chose, or all three if they chose none
      { "networkId": "e3c7…", "symbol": "USDC", "address": "0x0Ff0…", "amount": 50, "displayAmountInFiat": 50 }
    ]
  }
}
```

`amount` and `amountInFiat` are mutually exclusive on a payment. `clientFee`, when set, is a 0-1
ratio of the amount rather than a cash figure, verified against the sandbox, which rejects `2` with
*"The field ClientFee must be between 0 and 1"*.

### The SDK

`@meshconnect/web-link-sdk@3.12.0`, imported dynamically inside the click because it touches
`window` at module scope, and preloaded when the shopper reaches checkout so the click does not pay
for a 105KB download.

Rendered **embedded** above 1024px, into an iframe the page owns inside the checkout column, so
paying happens in the shop rather than on top of it. Below that it renders as an **overlay**: on a
375px viewport the embedded frame loaded, fired `pageLoaded`, and then showed white, because Link's
layout needs more width than a phone's checkout column gives it.

`onIntegrationConnected` for the auth token, `onTransferFinished` for the settled payload, `onExit`
for the session summary and to close the session, `onEvent` for everything else.

### Events acted on

| Event | What it drives |
|---|---|
| `integrationSelected` | Names the provider before a connection exists, so a failed Binance login does not report Coinbase |
| `integrationConnected` | Connection state, provider, the auth token handoff |
| `transferStarted` | Marks the funding source |
| `transferAssetSelected`, `transferNetworkSelected` | Manifest rows |
| `transferPreviewed` | Price, fees, preview id, and the source Mesh actually priced against. Fires repeatedly as Mesh re-quotes, so the row keeps its first timestamp and counts requotes |
| `transferMfaRequired` | Marks the authorisation step active |
| `transferInitiated` | Stamps *payment authorised*. Mesh's reference marks `transferExecuted` obsolete, so that only fills in the transaction id |
| `transferCompleted` | Receipt: hash, transfer id, refund address, total charged |
| `transferNoEligibleAssets` | Says what the account actually holds, from `arrayOfTokensHeld` |
| `connectionDeclined`, `connectionUnavailable`, `integrationConnectionError`, `defiWalletError` | Designed connection failures |
| `transferPreviewError`, `transferExecutionError`, `transferConfigureError`, `transferDeclined` | Designed payment failures with the real message and `requestId` |

Everything else is recorded and acted on by nothing. The panel says how many of the SDK's 43 event
types have fired, so a low count reads as *this flow does not use them* rather than as filtering.

### Portfolio and quotes

`POST /api/v1/holdings/get` with `{ authToken, type, includeMarketValue: true }` and
`POST /api/v1/holdings/value` for the crypto total. `type` is the `brokerType` from the connect
payload, never a hardcoded `"coinbase"`. The sandbox returns `sandboxCoinbase` and `sandbox`, and
neither is in the SDK's published `BrokerType` union.

Then `POST /api/v1/transfers/managed/quote` per accepted asset. It returns `isEligible`, a reason
code, a fee range, and `fundingOptions`, which is the interesting one: `existingCryptocurrencyBalance`,
`buyingPowerPurchase`, `paymentMethodDepositUsage`. So the page can say a payment would come from a
balance, from buying power, or from a card on file. Comparing a balance against a price would have
missed the withdrawal minimum, the fees, and the fact that Mesh can cover a shortfall.

**This endpoint takes production broker types only, and it is the only one that does.** A sandbox
Coinbase connection is `sandboxCoinbase` everywhere else, and `holdings/get` requires exactly that
string, but the quote endpoint answers it with *"Broker SandboxCoinbase not supported."* So every
quote in every sandbox run returned 400 until `quoteBrokerType` was added to map it to `coinbase`.
The symptom was the shop reporting an account holding 9,397 USDC as unable to pay for a $50 order,
with no asset picker at all, because the picker only lists assets Mesh has confirmed. It is also
still Coinbase-only in the wider sense: `binance` is not a value this endpoint's `BrokerType` enum
accepts, so a Binance connection gets an honest unknown rather than an answer.

Fees are read but not printed as the amount charged, and that is deliberate. The quote is priced
against the production broker while the sandbox transfer charges its own fee, which was 0.01 USDC.
Quoting one and charging the other would be worse than saying nothing, so the checkout states that
the exchange adds a withdrawal fee without inventing a figure, and the receipt shows the real
arithmetic afterwards.

Then `POST /api/v1/transfers/managed/configure`, which is the only call that answers a question
about *this account*. The quote endpoint takes no auth token, so whatever it says is a property of
the broker and its minimums, and reading it as a verdict on the shopper's holdings is a mistake this
build made for a while. `configure` takes `fromAuthToken` and returns one entry per holding with
`eligibleForTransfer`, `eligibleForTransferWithFunding` and an `ineligibilityReason`. The second of
those is the interesting one: it is Mesh saying it could pay with that asset by converting it.

That is the mechanism. Whether it fires for this client is a separate question, and the honest
answer is that it has not yet. Across every transfer on this account, all funding legs are
same-asset: Mesh has never been observed converting one holding to settle in another. Asked
directly about BTC against a $50 USDC-on-Ethereum destination, `configure` did not return it as
eligible with funding. So the portfolio shows what Mesh actually says per holding rather than a
promise about conversion, and `MESH-NOTES.md` records the measurement.

**Three endpoints, three different names for the same connection.** `holdings/get` requires
`sandboxCoinbase` and rejects `coinbase`. `transfers/managed/quote` does the exact reverse. Only
`configure` accepts either. All three were measured, and `lib/mesh/requests.ts` carries the mapping.

Fetched *behind* the holdings, so these calls do not stand between the shopper and the first number
on screen, and every one of them fails soft: an unanswered call renders as silence, never as a
refusal.

### Webhook

`POST /api/mesh/webhook`, and the only thing that writes settlement.

The browser's `transferCompleted` says the provider acknowledged the transfer. It does not say the
merchant was paid: it runs on the customer's machine, it can be lost or forged, and exchanges can
fail a transfer hours later. So the receipt renders complete and says **paid**, and only a verified
webhook makes it say **settled**. That distinction is the whole operational argument, and it is why
row seven of the trace stays open until a signature arrives.

Four things matter and all four are easy to get wrong.

1. **Hash the raw bytes.** `await req.text()` first, parse after. Parsing and re-serialising changes
   key order and whitespace, the digest changes, and every delivery fails for reasons that look like
   a key problem. There is a test for exactly this.
2. **Deduplicate on `EventId`**, which is stable across retries. `Id` changes per attempt.
3. **Claim the key after the write succeeds**, not before. Claiming first meant a delivery arriving
   before its order existed burned the id, and Mesh's retry was answered *duplicate*, losing the
   settlement permanently and silently.
4. **Write to your own key.** Settlement lives at `settlement:{orderId}` and is merged on read. The
   browser also writes the order record, and two writers doing read-modify-write with no
   compare-and-swap meant a webhook landing between the browser's read and its write vanished.

`node scripts/webhook-check.mjs <url>` proves all of it without waiting for Mesh: a signed delivery
is accepted, a replay is deduplicated, a forged signature is refused, an unsigned one is refused, and
the same JSON re-serialised is refused because the bytes changed. If that passes and settlement still
does not appear, nothing arrived.

---

## For the merchant's engineer

**Yours:** eight route files, one of them a webhook. A key/value store for the order and for webhook
idempotency. A page that reacts to SDK events. That is the whole integration.

**Mesh's:** the provider catalogue, OAuth and MFA for every exchange, asset and network eligibility,
pricing and fees, the transfer itself, and the entire interface between *connect* and *done*.

Three things worth knowing before you scope it.

**You do not build a provider picker.** Mesh matches the shopper's holdings against the asset and
network you configured and hides anything that cannot fund it. Widening from one exchange to the
whole catalogue is deleting one optional field. The Providers tab pulls both catalogues live and
marks each entry *usable here*, *production only*, or the reason it cannot reach your network, so you
can check that rather than take it on trust.

**The auth token reaches the browser.** `onIntegrationConnected` hands it to client JavaScript. That
is how the SDK works and you cannot change it. What you control is the next few milliseconds, which
is covered under Security.

**There are two different fees and you should show both.** The exchange charges a withdrawal fee,
quoted by Mesh in the preview: 0.01 USDC in sandbox, with gas at 0. Separately, `clientFee` is your
own cut. Neither changes what lands at the destination. The receipt shows the arithmetic rather than
a total that does not add up.

---

### The ledger, and why a webhook did not arrive

`GET /api/v1/transfers/managed/mesh` is Mesh's own record of every transfer it has made for a
client, and it is the only view here that outlives a session. The **History** page in the shop's own
header reads it: date, amount, source, network, fees, the funding legs, and the reference.

Ask for it with `IncludeWebhooksLogs=true` and each transfer carries Mesh's delivery attempts, which
separates three things that look identical from a merchant's side:

| Delivery log | What it means |
|---|---|
| Absent | Mesh never attempted a delivery. Nothing to fix on your side |
| Present, `responseCode` not OK | It arrived and you refused it. Signature, or a missing secret |
| Present, `responseCode: OK` | Delivered and accepted |

Measured on this client, currently 16 delivered, 2 refused, 7 never attempted. The two refusals are
genuine 401s from before the webhook secret was set, which is the endpoint working.

The unattempted ones are ours, not Mesh's, and reading the log properly is what shows it: they are a
single contiguous block of the oldest transfers, and every transfer after a fixed point has a
delivery attempt. That point is when the webhook callback URI was registered. Not intermittency, an
unregistered endpoint. Worth wiring this in before spending an afternoon debugging an endpoint that
was never called, and worth reading the timestamps before blaming the sender.

---

## What we learned about Mesh

`MESH-NOTES.md` is the integration log: every restriction, undocumented shape and wrong turn found
building this, marked by whether it was measured, documented, or still unknown. The three endpoints
that want three different broker type names for the same connection, the two unrelated shapes a
refused token arrives in, the fee that is smaller than a cent, and the six questions the docs do not
answer. It is the part most likely to be useful to somebody else.

---

## Decisions and tradeoffs

The reasoning, because it is the part that transfers. Each of these was a real fork.

**Two Link sessions, not one.** Holdings can only be read once a connection exists, so showing what
someone holds before asking them to pay means connecting first and paying second. *Cost:* an extra
Link session and an extra click. *Bought:* the portfolio, which is what shows Mesh does more than
move money, and the ability to price the payment before anyone commits.

**A named default, with the catalogue one click away.** The connect session used to open Mesh's
full catalogue, and a tester who does not own crypto could not tell which of MetaMask, Phantom and
Rainbow was for them. So the checkout names a provider and deep-links to it: *Pay with Coinbase*,
with *Use a different exchange or wallet* underneath, which opens the whole catalogue. The name is
never hardcoded. `/api/mesh/providers` ranks the live catalogue by what can actually settle here
and returns the top entry, so the button follows the catalogue rather than a string in the source.
*Tradeoff:* the breadth argument is now one click in rather than the default, which is the right
trade when the default costs a shopper the checkout.

**The merchant ranks providers, not the alphabet.** Ranking alphabetically put Binance first,
because the sandbox's Binance entry is typed `sandbox` and named "Binance". That accident then
decided which provider the checkout deep-linked to. `PREFERRED_PROVIDERS` in `lib/product.ts` is
the merchant's own order, applied after "can actually settle here", so an unusable favourite never
outranks a working provider. Matched on brand name, because a merchant ranks Coinbase, not
`sandboxCoinbase`, `coinbase` and `coinbaseRamp` separately.

**Deep-link on pay too.** The payment session goes straight to whatever they connected, because
being asked the same question twice in one checkout reads as a bug. **Change account** drops the
deep-link and puts the picker back. *Tradeoff:* the sandbox catalogue offers three self-custody
wallets that hold testnet assets only, so they cannot reach Ethereum mainnet. They are labelled
before they are picked and produce designed failures when they are.

**Three stablecoins, not one, and not ETH.** The merchant accepts USDC, USDT and PYUSD to the same
address, and the shopper chooses. Mesh's own guidance is to offer every destination you can, so a
transfer has more ways to succeed. Stablecoins only, deliberately: all three sit at about a dollar,
so a $50 price stays $50. Accepting ETH would mean showing a converted amount that moves while it is
read, which is a different product decision. USDC remains the default and the required path.

**Eligibility is Mesh's answer, not arithmetic.** Comparing a balance against a price is the obvious
implementation and it is wrong: it misses the withdrawal minimum, the fees, and the fact that Mesh
can fund a shortfall from buying power or a card. *Cost:* one Mesh call per accepted asset. *Bought:*
the page can say where the money would come from, which is the thing a merchant does not expect.

**The browser can say paid. Only the webhook says settled.** Covered above. *Cost:* the demo needs a
publicly reachable URL and a registered callback, and sandbox does not guarantee delivery. *Bought:*
the one answer to *how do I know I got paid* that is actually true.

**Redis, for two things only.** Webhook idempotency needs a write that survives across serverless
invocations, and the order the browser polls has to be the order the webhook wrote. Neither works in
process memory on Vercel. Nothing else here needs a database. Without it the app runs on memory, says
so on `/api/health`, and warns in the panel.

**The handling fee ships at zero.** `clientFee` is wired up and tested, and the conversion from
dollars to Mesh's 0-1 ratio is verified against the API. It is set to 0 because a shop that
advertises $50 and charges $52 either has the wrong headline price or reveals the fee at the last
step, and the second is drip pricing, which is now unlawful in the UK. The capability is worth
demonstrating; the dark pattern is not. Set the variable to see it flow through the bag, the checkout
and the receipt.

**One pair, free delivery.** Both for the same reason: the Mesh payment is a fixed amount, so a
quantity control or a delivery charge would put the bag total and the money that actually moves out
of step. A checkout whose total disagrees with its payment is the one thing that cannot happen.

**Reset keeps the connection.** The browser drops the order it was working on and the account stays
connected, so a second run skips the exchange login. The order itself is not deleted server side and
does not need to be: it lives under its own key with a day's TTL and is unreachable the moment the
browser forgets the id. It never calls Mesh's remove-connection endpoint, which permanently revokes a
token id with no way back. *Tradeoff:* a genuinely fresh session needs a new browser profile, which
is the right cost for the rarer case.

**Holding a token is not the same as having chosen how to pay.** The two were one flag, so a
returning shopper, whose connection survives the reset by design, was dropped into a crypto-only
checkout with card and Apple Pay gone. Worse, nothing read their account: the portfolio was only
ever fetched from the SDK's connect callback, which never fires for someone already connected, so
the checkout sat on *Reading your account* and stayed there. The read is now its own function with
two callers, and the second runs when a returning shopper picks the crypto route. No Link session
opens at all for them, which makes the second purchase one click.

**The delivery address never leaves the browser.** Name, email and address are collected because a
checkout without them is not recognisable as one, and they are kept in `sessionStorage` and read
straight onto the receipt. Nothing is posted to a route, written to Redis or sent to Mesh. Nothing
ships, so collecting real postal addresses on a public demo would be storing personal data for no
reason. *Cost:* the address is gone when the tab closes, which for a demo is the right lifetime.
A **Fill in a sample address** button means a live demo is never someone typing a postcode.

**One function decides what the customer was charged.** The confirmation headline read Mesh's
`totalAmountInFiat` and said $50.00 while the receipt added the amount and the fees and said
$50.01, both on the same screen. `chargedTotal` in `lib/order/state.ts` is now the only answer, and
it is the arithmetic, because that field has returned both 50 and 50.01 for the same transfer.
Mesh's own figure is still shown beside it when the two disagree.

**The order id is a UUID; the reference is a label.** They used to be one string, a 32-bit hash
reduced modulo 10,000, which was simultaneously the display number, the store key and Mesh's
`transactionId`. Even odds of a collision after 118 orders, and a collision settled the wrong order.
`WELT-3F9A2C` is now derived from the id and nothing keys on it.

**Embedded above 1024px, overlay below.** Embedded puts the payment inside the checkout column, which
is the better experience and the one Mesh's polish guide is written for. It does not survive a phone:
the frame loads, fires `pageLoaded`, and renders white.

**The phone gets less of it.** `viewport-fit=cover` plus `env(safe-area-inset-bottom)` on the
console bar, both bottom sheets and the drawer, so they clear iOS Safari's own toolbar rather than
sitting under it. The seven-row payment trace collapses to a count on a narrow screen: the right
amount of detail beside a desktop checkout, a wall underneath a 390px one.

Stated as intent, not as measurement. All of it was built and checked in a desktop browser at
phone widths, and none of it has been run on a real handset. The thing most likely to be wrong is
Mesh Link itself, which switches to an overlay below 1024px and is the one part of this journey
this repo does not own.

**No state management library.** One reducer over SDK events produces the order status, the manifest
and the receipt, and it is the most tested thing here because it is where a regression would cost
something.

**No explorer link.** The returned hash does not exist on Ethereum mainnet, Sepolia or Base. Checked
with `eth_getTransactionByHash` against all three. It is a Mesh sandbox reference, shown as one. A
link to a 404 would be worse than none.

**The SDK's `BrokerType` union is behind the API.** It lists `sandbox` but not `sandboxCoinbase`,
which is exactly what a sandbox Coinbase connection returns. Broker type is carried as a string and
asserted at one boundary rather than narrowed to a union that would reject a value Mesh itself sent.

**On the Mesh domains.** `meshconnect.com` now redirects to `www.meshpay.com`, but
`docs.meshconnect.com` is still canonical and `docs.meshpay.com` does not resolve, so the docs links
and the API hosts here still say meshconnect. That is the current state of the rebrand, not an
oversight.

---

## Security

**The API key never leaves the server.** Verified by grepping every production chunk.

**The Client ID does reach the browser**, unavoidably: the link token is base64 of the Link iframe URL
and the id is inside it. An identifier, not a credential, but worth stating accurately rather than
claiming both stay server side.

**The auth token is handled, not avoided.** It arrives in client JavaScript because the SDK puts it
there. It is posted straight to `/api/mesh/connection`, held against an httpOnly session cookie, and
never sent back down. It is redacted **at capture** in the reducer, so neither the technical panel nor
the Copy log button can leak it, and the panel shows a masked prefix only.

**Orders are owned.** Both order routes read the session cookie and 404 on a mismatch, so a stranger
cannot read an order or stamp it paid with a fabricated hash. 404 rather than 403, so the endpoint
does not confirm which ids exist.

**The browser cannot name its own price.** Amount, asset, network and destination all come from server
configuration. The client sends a colourway, a size and an asset choice, and each is validated
server side: the asset against the merchant's accepted list, and the size against that colourway's
own stock, because availability differs by colour and a size that exists in Black does not exist in
Stone. It can move an order to `paid`; only the webhook writes `settled`.

**Webhook signatures** are verified with a timing-safe comparison over the raw body. A rejected
delivery gets an empty 401, so an unauthenticated caller cannot learn how the deployment is
configured.

**A signed delivery still has to describe the order it claims to.** The amount, token and
destination arrive on the payload and are compared against the order record before anything is
marked settled: a wrong destination or a wrong amount is recorded and refused. Not exploitable here,
because those three values are bound into the link token server side and only Mesh can sign a
delivery, but "so a $1 transfer against my $50 order marks it paid?" is the first question a
merchant's security person asks, and the answer should be no with the check visible in the panel.
An amount two orders of magnitude out is treated as our unit assumption being wrong rather than
fraud, and recorded instead of refused, because refusing a real settlement is the worse failure.

**Settlement has a precedence and never moves backwards.** Mesh sends two deliveries per transfer as
the norm and its own log shows them out of chronological order, so storing whichever landed last let
a late `Pending` un-settle a paid order while the browser's poll had already stopped looking. Refunds
are kept in their own key rather than overwriting the settlement they follow.

**Responses are parsed through Zod**, using `.nullish()` wherever Mesh's OpenAPI marks a field
nullable, so an unexpected shape fails closed rather than rendering and an explicit null does not take
the checkout down. Event payloads and error strings render as text, never as HTML.

**Link token minting is rate limited** per session, counted after validation so a malformed request
cannot lock out an honest client, and failing open so a store outage can never be the reason someone
cannot pay.

**Minimal data.** No accounts, no login, no personal data on the server. One opaque session id in
an httpOnly cookie, and TTLs on everything. The delivery address is collected in the browser and
stays there: no route receives it, nothing stores it, and it dies with the tab.

---

## Failure handling

Every failure has designed copy: a plain sentence for the shopper, one action, and the real message
plus the Mesh reference kept for the technical panel. Retry is only offered where retrying is honest,
which means minting a fresh token rather than reusing a spent one.

Covered: missing configuration, link token failure, the SDK failing to load *or silently never
loading*, the shopper closing Link (naming the page they left from), connection failure, declined, a
wallet not present, a wallet that timed out, no eligible assets (listing what the account holds), a
failed balance read, preview failure, execution failure, a declined transfer, an expired session, an
expired auth token, Mesh timeouts, and repeated clicks.

Three that are non-obvious:

- **A failed balance read is not fatal, unless the connection is dead.** Normally the shopper can
  still pay, they just do not get to see their holdings first, so it renders as a warning beside a
  live pay button. The exception is Mesh refusing the stored token, and it says so in two shapes
  that look nothing alike. A token it cannot parse is rejected by the API: HTTP 400,
  `errorType: invalidIntegrationToken`. A token that is well formed and simply not accepted any
  more gets past the API into the integration, which answers **HTTP 200** with a failed
  `content.status` and `content.errorMessage: "Unauthorized token"` and no `errorType` at all.
  Neither is a 401, so the status tells you nothing and both have to be read. They go through one
  function, `holdingsFailureCode`, because classifying one and not the other is how this shipped
  broken twice. There, *carry on* is not honest
  advice, and a session log settles why: passing the same token into a payment session produces
  `transferConfigureError` with *"Please login again to continue."* four seconds in, before the
  shopper touches anything. The payment was already broken by the same cause. So both paths now
  recognise it, the connection is dropped server side, and the shopper goes back to the payment
  options with a working connect button. Leaving it on file was a real dead end: the shop kept
  offering *already connected, no sign-in this time*, and every retry repeated the same failure.
- **An empty `transferNoEligibleAssets` does not overwrite a better answer.** It fires in the same
  millisecond as the configure error above, with an empty `arrayOfTokensHeld`, which is what an
  account Mesh could not read looks like as well as an empty one. Arriving second, it replaced the
  real reason with *Nothing in that account can cover this* about an account holding ten thousand
  USDC. An empty array now defers to a failure that is already set. A populated one still wins,
  because then it genuinely knows something the earlier event did not.
- **Closing Link on the success page is not a failure.** Treating it as one is a classic way to make
  a working demo look broken. Nor does closing Link after a failure overwrite the failure: the
  specific state survives, which is the only way the designed failures are reachable at all.
- **A transfer that is not `succeeded` is not `paid`.** Mesh documents `pending | succeeded | failed`
  and the SDK's type narrows it to `'success'`, which is wrong. The value is read, not assumed.

---

## Testing

115 tests over the logic where a regression costs something: webhook HMAC verification including the
re-serialisation trap, `EventId` idempotency, the settlement precedence that stops a late `Pending`
un-settling a paid order, the check that a delivery describes the order it claims to, both link
token builders, the merchant fee ratio and the guarantee it never changes the destination amount,
the provider catalogue mapping and the merchant ranking on top of it, what the customer was actually
charged, the event to order reducer, whether a Mesh error means the stored token is dead, per
colourway stock, and money formatting. Runs in under a second, needs no secrets.

The reducer fixtures are trimmed copies of real sandbox payloads, including two failures that actually
happened: a wallet not present on the device, and an account with nothing eligible.

The provider mapping has its own file because a wrong field name shipped there, reading
`content.integrations` from an endpoint that returns `content.items`, and a typecheck cannot see
that. `lib/product.test.ts` exists for the same class of problem: stock is per colourway and three
places read it, so a test holds the size picker, the listing card and the link token route to the
same numbers rather than trusting them to stay in step. No tests against live Mesh: slow, flaky, needs secrets in CI, and spends the sandbox balance.

---

## Deployment

Vercel, Node runtime, no edge.

1. Set every variable from the table above in the Vercel project.
2. Add your production domain to **Allowed Link URLs** in the Mesh dashboard.
3. Register `https://<your-domain>/api/mesh/webhook` under the **Sandbox** Transfer Webhook Callback
   URI, not the production one, which will never fire against a sandbox base URL. Copy the signing
   secret immediately; it is shown once. Put it in `MESH_WEBHOOK_SECRET` **and redeploy**, because
   Vercel does not pick up environment changes without one.
4. Add an Upstash Redis integration. It sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`, which the app
   accepts. Provisioning Upstash directly instead gives you `UPSTASH_REDIS_REST_*`.

**Preview deployments will not work.** Every commit gets a new URL and Mesh validates the origin, so
Link will not render unless you register that exact URL. Demo from production.

Content Security Policy is set in `next.config.ts` and allows `*.meshconnect.com` in `frame-src` and
`connect-src`, plus `file-cdn.meshconnect.com` for integration logos. Without those the Link overlay
is a blank grey box.

### Before you demo

```bash
curl https://<your-domain>/api/health                  # config.ok, webhookSecret, storageReachable: true
node scripts/webhook-check.mjs https://<your-domain>   # 5/5
```

Then: open the URL and click through to checkout a few minutes beforehand, because cold start is
about a second per route and each route warms independently. Stop pushing to main, since every push
rebuilds the alias cold. Use the bookmarked production domain rather than the Vercel dashboard's
Visit button, which opens a per-deployment URL that is not a registered Mesh origin. Check the venue
network reaches `*.meshconnect.com`. And check the sandbox balance still covers the payment: it is
shared with every other Mesh sandbox user and each run spends about $50.

### Going to production

Per Mesh's own checklist: register a **production** webhook URI separately, move to the latest SDK,
generate a production API key (which needs 2FA and business verification first), and change
`MESH_API_BASE_URL` to `https://integration-api.meshconnect.com`. Mesh ask for a joint testing session
before launch.

---

## Sandbox

Every sandbox account uses password `Pass123` and code `123456`.

| Username | Portfolio | Shows |
|---|---|---|
| `Mesh` | Full | The happy path |
| `Mesh2` | Empty | A genuine `transferNoEligibleAssets` |
| `Mesh3` | Cash only | Onramp-shaped accounts |
| `Mesh4` | Large | Big balances |
| `MeshBTC` | BTC, no stablecoin | Whether Mesh will convert to fund a USDC settlement |

These are in the panel's Demo tab, because failure states should be shown for real rather than
described. Nothing here is mocked and no failure is simulated.

Two things worth knowing before you use them. The balances are shared with every other Mesh sandbox
user, so an account that was funded yesterday may not be today, and each run through spends about
$50. And `MeshBTC` is the account that answers the conversion question above: connect it and watch
the panel's Integration tab to see what `configure` says about a BTC holding against a USDC
destination.

**The sandbox is not Coinbase.** The login form is served by Mesh, not the exchange, and typing real
exchange credentials into it sends them somewhere they should not go. That is why the warning sits on
the page at the point of connection *and stays visible while Link is open*, rather than being a line
in a footer. It happened during this build, which is how it got there.

The balance is shared between the Coinbase and Binance sandbox accounts and depletes with each run.

---

## What is deliberately not here

No cart beyond one item, no accounts, no second Mesh flow, no confetti, no database beyond the one
Redis instance the webhook needs, no component or state library, no mocked success states, no explorer
link.

What a production build would add, in order: real order persistence and fulfilment; refund handling
using the `RefundAddress` Mesh returns, and the `RefundPending` and `RefundSucceeded` statuses this
build records against the order but does not act on; a `userId` derived from a real user record rather than a four-hour cookie; and the onramp flow, so
a customer holding no crypto at all can still pay.

---

## Licence

MIT for the code. The product photographs are not mine and are not covered, see `LICENSE`. WELT is
fictional, nothing is for sale, and this is an independent demo built against Mesh's public sandbox
rather than an official example.
