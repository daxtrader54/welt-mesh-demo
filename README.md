# WELT

A single-product shoe shop where the checkout is powered by [Mesh](https://meshconnect.com).

You pick a size, hit pay, connect a Coinbase account, see what you actually hold, and pay $50 in
USDC on Ethereum. Underneath there is a second layer that shows what really happened: the real
Mesh event stream, the routes this app has, and the order record.

The point is not that an API call works. It is that the customer never copied an address, never
withdrew anything, and never had to find out what the merchant accepts. Mesh sat in the middle and
did it.

Built to be shown by a Solutions Architect to a merchant, so the two questions it is designed to
answer are "would my customers use this" and "how do I know I got paid".

---

## Contents

- [What it does](#what-it-does)
- [Architecture](#architecture)
- [The Mesh integration](#the-mesh-integration)
- [For the merchant's engineer](#for-the-merchants-engineer)
- [Local setup](#local-setup)
- [Sandbox](#sandbox)
- [Deployment](#deployment)
- [Security](#security)
- [Failure handling](#failure-handling)
- [Technical decisions](#technical-decisions)
- [Testing](#testing)
- [What is deliberately not here](#what-is-deliberately-not-here)

---

## What it does

WELT is a fictional clearance retailer listing one real product, a Skechers Sport Track Syntac, in
four colourways at $50. It is not affiliated with Skechers or with MandM Direct, where the product
images and the listing structure came from, and no orders are fulfilled.

The journey is an ordinary shop funnel with Mesh at the end of it:

1. **Product.** Pick a colourway and a size, add to bag.
2. **Bag.** Line item, summary, savings off RRP, checkout securely.
3. **Checkout.** Card, Apple Pay and a crypto account. The first two open real-looking sheets and
   then say they are for show. The third opens a Mesh Link session that connects an account and
   stops.
4. The page reads that account's real holdings and shows what you hold against what this costs.
5. **Pay.** A second Link session carries the payment, deep-linked to the account you already
   connected so you are not asked to choose twice. **Change account** puts the picker back.
6. The receipt prints and the bag empties. A verified webhook later upgrades paid to settled.

Running alongside is a manifest: seven rows, each stamped by a real SDK event with the time it
arrived. Nothing is on a timer. A row whose event never fires stays visibly blank.

---

## Architecture

```
Browser ──► Next.js route handlers ──► Mesh sandbox API
   ▲                  │
   │                  ▼
   │              Upstash Redis
   │                  ▲
   └── polls order    │
                 Mesh webhook (signed)
```

The client secret exists only inside route handlers. The browser receives a Link token and
normalised, redacted data, and nothing else.

```
app/
  page.tsx                        the shop
  api/mesh/link-token/route.ts    mints connect and payment tokens
  api/mesh/connection/route.ts    takes custody of the auth token
  api/mesh/portfolio/route.ts     holdings, normalised for the page
  api/mesh/webhook/route.ts       raw body, HMAC, idempotent settlement
  api/mesh/providers/route.ts     who could fund this payment
  api/orders/[id]/route.ts        order state, read and update
  api/session/reset/route.ts      start the demo again
  api/health/route.ts             config presence, no values
lib/
  mesh/        client, request builders, schemas, webhook verification
  order/       the event reducer that drives the manifest and receipt
  store/       Redis with a memory fallback, TTLs on everything
components/    shop, plate, checkout, manifest, receipt, technical view
```

Everything runs on the Node runtime, not edge. `crypto.createHmac` needs it and the Mesh calls are
simpler there.

---

## The Mesh integration

Four calls, all server side, all with `X-Client-Id` and `X-Client-Secret`.

### Link token

`POST /api/v1/linktoken`, twice, in two different shapes.

**Connect** carries no transfer options, so Link connects the account and stops. This is the only
way to read holdings before asking anyone to pay.

```jsonc
{
  "userId": "welt-<session>",
  "restrictMultipleAccounts": false
  // optional integrationId opens Link straight on one provider instead of the picker
}
```

**Payment** carries the transaction, deep-linked to the account the shopper already connected,
because being shown the same picker twice in one checkout is confusing. The integration id comes
from the connect session's exit summary. Dropping it restores the picker, which is what the
**Change account** link does.

```jsonc
{
  "userId": "welt-<session>",
  "restrictMultipleAccounts": true,
  "transferOptions": {
    "transactionId": "WELT-0042",        // comes back as clientTransactionId on every event
    "transferType": "payment",
    "isInclusiveFeeEnabled": false,      // fees sit on top, destination receives the full 50
    "clientFee": 0.04,                   // the merchant's own $2, as a ratio of the amount
    "toAddresses": [{
      "networkId": "e3c7fdd8-b1fc-4e51-85ae-bb276e075611",
      "symbol": "USDC",
      "address": "0x0Ff0000f0A0f0000F0F000000000ffFf00f0F0f0",
      "amount": 50,
      "displayAmountInFiat": 50
    }]
  }
}
```

`amount` and `amountInFiat` are mutually exclusive on a payment. Tokens last ten minutes and are
single use, so they are minted on the click and never on page load.

### The SDK

`@meshconnect/web-link-sdk@3.12.0`, imported dynamically inside the click because it touches
`window` at module scope and a static import breaks the server render.

Four callbacks are used. `onIntegrationConnected` for the auth token, `onTransferFinished` for the
settled payload, `onExit` for the session summary, and `onEvent` for everything else.

### Events we act on, and why

| Event | What it drives |
|---|---|
| `integrationConnected` | Connection state, provider name, the auth token handoff |
| `transferStarted` | Marks the funding source |
| `transferAssetSelected`, `transferNetworkSelected` | Manifest rows |
| `transferPreviewed` | Price, fee breakdown, preview id, and the source Mesh actually priced against |
| `transferExecuted` | Transaction id |
| `transferCompleted` | Receipt: hash, transfer id, refund address, total charged |
| `transferNoEligibleAssets` | Says what the account actually holds, from `arrayOfTokensHeld` |
| `connectionDeclined`, `connectionUnavailable`, `integrationConnectionError` | Designed connection failures |
| `transferPreviewError`, `transferExecutionError`, `transferConfigureError`, `transferDeclined` | Designed payment failures with the real message and `requestId` |
| `close` | `SessionSummary.page` tells us where someone bailed, so "cancelled while signing in" replaces a shrug |

Everything else is recorded in the technical view and acted on by nothing. Handling every event
for completeness would be noise.

### Portfolio

`POST /api/v1/holdings/get` with `{ authToken, type, includeMarketValue: true }`, and
`POST /api/v1/holdings/value` for the total.

`type` is the `brokerType` from the connect payload, not a hardcoded `"coinbase"`. The sandbox
returns `sandboxCoinbase` and `sandbox`, and passing the wrong one fails.

Only fields the API actually returns are rendered: name, symbol, amount, marketValue, lastPrice.
The headline uses the crypto value rather than `totalValue`, because in sandbox that is dominated
by ten million dollars of simulated fiat and looks absurd beside a fifty dollar pair of trainers.

### Webhook

`POST /api/mesh/webhook`. This is the only thing that moves an order to settled.

The browser's `transferCompleted` says the provider acknowledged the transfer. It does not say the
merchant has been paid, and a merchant should never take the customer's browser at its word for
that. So the receipt renders complete and says **paid**, and only a verified webhook makes it say
**settled**.

Three things matter and all three are easy to get wrong:

1. **Hash the raw bytes.** `await req.text()` first, parse after. Parsing and re-serialising the
   JSON changes key order and whitespace, the digest changes, and every delivery fails for reasons
   that look like a key problem. There is a test for exactly this.
2. **Deduplicate on `EventId`**, which is stable across retries. `Id` changes per attempt.
3. **Answer fast.** Mesh wants a 200 inside 200ms, so the route does one read and one write.

Because the receipt never depends on it, a sandbox that stays quiet cannot break the demo.

---

## For the merchant's engineer

What sits on your side, and what sits on Mesh's.

**Yours:** six route handlers, one of which is a webhook. A key/value store for the order and for
webhook idempotency. A page that reacts to SDK events. That is the whole integration.

**Mesh's:** the provider catalogue, OAuth and MFA for every exchange, asset and network
eligibility, pricing and fees, the transfer itself, and the entire UI between "connect" and
"done".

Three things worth knowing before you scope it:

**You do not build a provider picker.** Mesh matches the shopper's holdings against the asset and
network you configured, and hides anything that cannot fund it. Widening from Coinbase to the
whole catalogue is deleting one optional field from the link token. The technical view has a
Providers tab that pulls the live catalogue and marks which ones can fund this exact payment, so
you can see that rather than take it on trust.

**The auth token reaches the browser.** `onIntegrationConnected` hands it to client JavaScript.
That is how the SDK works and you cannot change it. What you control is what happens in the next
few milliseconds, which is covered under [Security](#security).

**There are two different fees and you should show both.** The exchange charges a withdrawal fee,
quoted by Mesh in the payment preview: 0.01 USDC in sandbox, with gas at 0. Separately, `clientFee`
on the link token is your own cut, taken as a ratio of the order rather than a cash figure, and
this build sets it to $2 handling via `NEXT_PUBLIC_MERCHANT_HANDLING_FEE`. Neither changes what
lands at the destination, which stays at exactly $50. The bag, the checkout and the receipt all
show the arithmetic. Hiding it is the kind of thing a merchant finds out about a week later.

**Two catalogues, two different questions.** `transfers/managed/integrations` tells you who *could*
settle USDC on Ethereum: 13 entries here, including Kraken, Robinhood, Uphold and CashApp.
`integrations` tells you who Link will actually *offer* right now: 5 in sandbox, because only
Coinbase and Binance have simulated accounts and the rest would open a real exchange login. The
Providers tab shows both, so "can we take Kraken" gets answered with data. Bybit is in neither
list for this client, so that one is a Mesh account question rather than a code change.

---

## Local setup

Requires Node 22 or newer.

```bash
npm install
cp .env.example .env.local   # then fill in the two Mesh values
npm run dev
```

Open http://localhost:3000. Add `?demo=1` to dock the technical panel and reveal the reset
controls.

| Variable | Required | Where it comes from |
|---|---|---|
| `MESH_CLIENT_ID` | yes | Mesh dashboard, Account > Get your API keys, top right |
| `MESH_API_KEY` | yes | Same page, Sandbox keys. Shown once at generation |
| `MESH_API_BASE_URL` | yes | `https://sandbox-integration-api.meshconnect.com` |
| `MERCHANT_ADDRESS` | yes | The destination wallet |
| `MERCHANT_NETWORK_ID` | yes | Ethereum, `e3c7fdd8-b1fc-4e51-85ae-bb276e075611` |
| `MESH_COINBASE_INTEGRATION_ID` | no | Blank (default) shows Mesh's picker. Set it to open straight on one provider |
| `NEXT_PUBLIC_MERCHANT_HANDLING_FEE` | no | Merchant fee in dollars, sent as Mesh's `clientFee`. `0` for none |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | no | Without these the app uses process memory |
| `MESH_WEBHOOK_SECRET` | no | Sandbox Transfer Webhook Callback URI. Shown once |

**Register your domain before your first run.** In the dashboard, Account > Get your API keys >
Allowed Link URLs, add `http://localhost:3000`. Mesh validates the origin the Link popup was opened
from, and an unregistered domain fails to render with no console error. Changes take up to ten
minutes to propagate. This is the single most common reason a first run shows a blank grey box.

`/api/health` reports which variables are present, without values, and whether the store is Redis
or memory.

---

## Sandbox

Every sandbox account uses password `Pass123` and code `123456`.

| Username | Portfolio | Shows |
|---|---|---|
| `Mesh` | Full | The happy path |
| `Mesh2` | Empty | A genuine `transferNoEligibleAssets` |
| `Mesh3` | Cash only | Onramp-shaped accounts |
| `Mesh4` | Large | Big balances |

These are listed in the technical view's Demo tab, because failure states should be shown for real
rather than described. Nothing in this app is mocked and no failure is simulated.

**The sandbox is not Coinbase.** The login form is served by Mesh, not by the exchange, and typing
real exchange credentials into it sends them somewhere they should not go. That is why the sandbox
notice is on the page at the point of connection and stays visible through the payment step,
rather than being a line in the footer. It happened during this build, which is how it got there.

Two more things observed in sandbox:

- The returned `txHash` is a Mesh reference, not a chain transaction. It was checked against
  Ethereum mainnet, Sepolia and Base with `eth_getTransactionByHash` and does not exist on any of
  them. So the receipt shows it as a reference with no explorer link, because a link to a 404 is
  worse than none.
- The balance is shared between the Coinbase and Binance sandbox accounts and it depletes. Each
  run spends 50.01 USDC from roughly 10,000.

---

## Deployment

Vercel, Node runtime, no edge.

1. Set every variable from the table above in the Vercel project.
2. Add your production domain to Allowed Link URLs in the Mesh dashboard.
3. Register `https://<your-domain>/api/mesh/webhook` under **Sandbox** Transfer Webhook Callback
   URI, not the production one. Copy the signing secret immediately, it is shown once.
4. Add an Upstash Redis integration and set `UPSTASH_REDIS_REST_URL` and
   `UPSTASH_REDIS_REST_TOKEN`.

**Preview deployments will not work.** Vercel gives every commit a new URL and Mesh validates the
origin, so Link will fail to render on a preview unless you register that exact URL. Demo from the
production domain.

Without Redis the app falls back to process memory. Locally that is fine. On Vercel it is not: the
webhook and the browser may land on different instances, so settlement will never appear. The
technical view says so in as many words when it detects it.

Content Security Policy is set in `next.config.ts` and allows `*.meshconnect.com` in `frame-src`
and `file-cdn.meshconnect.com` for integration logos. Without those the Link overlay is a blank
grey box.

---

## Security

**The API key never leaves the server.** It exists only inside route handlers.

**The Client ID does reach the browser**, unavoidably. The link token is base64 of the Link iframe
URL and the Client ID is inside it. It is an identifier rather than a credential and Mesh intends
this, but it is worth stating accurately rather than claiming both values stay server side.

**The auth token is handled, not avoided.** `onIntegrationConnected` hands it to client
JavaScript. It is posted straight to `/api/mesh/connection`, held against an httpOnly session
cookie, and never sent back down. It is not kept in React state beyond the handoff, never
rendered, and never logged. The technical view shows the `tokenId` and a masked prefix so you can
see one arrived, not what it is.

**Webhook signatures are verified** with a timing-safe comparison over the raw body, and an
unsigned or wrongly signed delivery is rejected with a 401.

**The browser cannot name its own price.** The amount, asset, network and destination all come
from server configuration. The client sends a colourway and a size and nothing else. The browser
can move an order to `paid`; only the webhook writes `settled`.

**Responses are parsed through Zod**, so an unexpected shape fails closed rather than rendering.
Event payloads and error strings are rendered as text, never as HTML.

**Link token minting is rate limited** per session, because those are real Mesh resources.

**Minimal data.** No accounts, no login, no personal data. One opaque session id in an httpOnly
cookie, and TTLs on everything in the store.

---

## Failure handling

Every failure has designed copy: a plain sentence for the shopper, one action, and the real
message plus the Mesh reference kept for the technical view. Retry is offered only where retrying
is honest, which means minting a fresh token rather than reusing a spent one.

Covered: missing configuration, link token failure, the SDK failing to load, the shopper closing
Link (naming the page they left from), connection failure, connection declined, a wallet not
present on the device, no eligible assets (listing what the account actually holds), a failed
balance read, preview failure, execution failure, a declined transfer, an expired session, an
expired auth token, Mesh timeouts, and repeated clicks.

Two of those are non-obvious and worth calling out:

- **A failed balance read is not fatal.** The shopper can still pay, they just do not get to see
  their holdings first. The manifest marks that row failed and the flow continues.
- **Closing Link on the success page is not a failure.** It is the end of a completed payment, and
  treating it as an error is a classic way to make a working demo look broken.

---

## Technical decisions

**Two Link sessions, not one.** The portfolio can only be read once a connection exists, so
showing holdings before asking for money requires connecting first and paying second. Passing the
stored `tokenId` back as `accessTokens` means the second session skips the Coinbase login
entirely: measured at twelve seconds from load to priced payment, with no sign-in.

**Let Mesh do the choosing.** An earlier pass replaced Mesh's account picker with a grid of
provider buttons in the merchant's own UI. It read as a half-built form, buried the pay button,
and duplicated something Mesh already does well. The merchant's job is one sentence, before the
customer commits, saying this is not a one-exchange checkout. `MESH_COINBASE_INTEGRATION_ID` will
deep-link past the picker if a merchant wants that, and it is off by default.

**No source list, despite multiple accounts working.** Coinbase and Binance sandbox return
byte-for-byte identical portfolios, down to the account id. Two accounts side by side with
matching balances reads as a bug. So the page shows one source and hands the choice to Link, then
reports on the receipt whichever one actually paid.

**Redis, and only for two things.** Webhook idempotency needs a write that survives across
serverless invocations, and the order the browser polls has to be the order the webhook wrote.
Neither works in process memory on Vercel. Nothing else needs a database.

**No state management library.** One reducer over SDK events produces the order status, the
manifest and the receipt. That reducer is the most tested thing in the codebase because it is
where a regression would actually cost something.

**One pair, free delivery, and both for the same reason.** The Mesh payment is for a fixed amount,
so a quantity control or a delivery charge would put the bag total and the money that actually
moves out of step. A checkout whose total disagrees with its payment is the one thing that cannot
happen, so the constraint is designed in rather than papered over.

**The bag lives in sessionStorage.** It survives a refresh and dies with the tab. A shop that
remembers your bag next week is right for a shop and wrong for a demo that should open clean.

**Tailwind with tokens, no component library.** The design is bespoke enough that a component
library would be fought rather than used.

**The `BrokerType` union in the SDK is behind the API.** It lists `sandbox` but not
`sandboxCoinbase`, which is exactly what a sandbox Coinbase connection returns. Broker type is
carried as a string and asserted at one boundary, with a comment, rather than narrowed to a union
that would reject a value Mesh itself sent.

---

## Testing

```bash
npm test
```

53 tests over the logic where a regression would cost something: webhook HMAC verification
including the re-serialisation trap, `EventId` idempotency, both link token request builders, the
merchant fee ratio and the guarantee that it never changes the destination amount, the event to
order reducer, and money formatting. Runs in under a second and needs no secrets.

The reducer tests use trimmed copies of real sandbox payloads captured during the build, including
the two failures that actually happened: a MetaMask wallet not present on the device, and an
account with nothing eligible.

There are no tests against live Mesh. They would be slow, flaky, need secrets in CI, and spend the
sandbox balance.

---

## What is deliberately not here

No catalogue, cart, accounts or login. No architecture diagram, because the manifest does that job
with real data. No second Mesh flow. No explorer link, because the sandbox hash is not on a chain.
No confetti. No database beyond the one Redis instance the webhook needs. No component or state
library. No mocked success states of any kind.

If this were going to production the list of what to add next would start with: real order
persistence and fulfilment, an `Expected` amount check against the webhook before marking anything
settled, refund handling using the `refundAddress` Mesh returns, multiple `toAddresses` so the
shopper can settle in something other than USDC, and the `Pending` webhook state, which sandbox
does not guarantee.
