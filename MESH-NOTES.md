# Integrating with Mesh: what we learned

Notes from building this app against the Mesh sandbox, 3 to 4 September 2026, using
`@meshconnect/web-link-sdk@3.12.0` and `sandbox-integration-api.meshconnect.com`.

Everything here is marked by how we know it. **Measured** means we ran it and saw the response.
**Documented** means Mesh's docs or OpenAPI spec say so. **Unknown** means we looked and could not
find out. Several of the measured items contradict what we assumed at the start, which is why they
are written down.

---

## The thing that will cost you a day

**Three endpoints want three different names for the same connection.** Measured, all three.

| Endpoint | Wants | Refuses |
|---|---|---|
| `holdings/get`, `holdings/value` | `sandboxCoinbase` | `coinbase` |
| `transfers/managed/quote` | `coinbase` | `sandboxCoinbase` ("Broker SandboxCoinbase not supported.") |
| `transfers/managed/configure` | either | — |

The connect payload gives you `sandboxCoinbase`. Pass it straight to the quote endpoint and every
quote returns HTTP 400, forever, silently if you treat a failed quote as "not eligible". That is
exactly what happened here: the shop told a shopper holding 9,397 USDC that nothing in their account
could settle a $50 order. `lib/mesh/requests.ts` carries the mapping.

`binance` and `sandboxBinance` are not valid broker types anywhere. The sandbox Binance integration
reports itself as plain `sandbox`, and that is the only string any endpoint accepts for it.

---

## Errors do not arrive the way you expect

**A refused token comes back in two completely different shapes.** Measured.

1. A token Mesh cannot parse: **HTTP 400**, `errorType: invalidIntegrationToken`, message "Invalid
   integration token provided." or "Invalid token ID".
2. A token that is well formed and simply no longer accepted: **HTTP 200**, with
   `content.status` failed and `content.errorMessage: "Unauthorized token"`, and **no `errorType`
   at all**.

Neither is a 401. The status code tells you nothing and the second one only exists in the body. We
shipped a fix for the first shape, felt confident, and shipped the same bug again because a fake
token can only ever produce shape one. You need a real, expired token to see shape two, which means
you will meet it in a demo rather than in a test.

The same fault also reaches the SDK, as `transferConfigureError`, and the message there is not
reliable either: **"Please login again to continue."** once and **"An error has occurred."** the
next time, for the identical cause. What *is* reliable is whether you passed stored `accessTokens`
into that session, so use that to decide.

**`accessTokens` wants a populated account, not just a token id.** We sent the token id with empty
strings for `brokerName`, `accountId` and `accountName`, reasoning that the id was the only field
that identified anything. Link then failed intermittently about a second after opening, with
`transferConfigureError` and Mesh's least useful message, "An error has occurred.", on Mesh's own
"Unable to initiate the transfer" screen. Populate all of them from the connect payload, which means
capturing `account.accountId` at connect time.

**Do not replay a stored account into a session where the shopper asked for a different one.** Same
symptom. Link is being handed an account to restore at the exact moment it is being asked to find a
new one.

**Content-level failures are a general pattern, not a one-off.** `holdings/get` and
`transfers/managed/configure` both answer HTTP 200 with a `content.status` that is not `succeeded`.
Check the body, not the status line.

**Error responses are stable and worth surfacing.** `errorHash` is present on success too and is
what Mesh support asks for. `requestId` comes on SDK error events. Both belong in your technical
view.

---

## The Link token

`POST /api/v1/linktoken`, two shapes. Ten minute lifetime, single use, so mint on the click and
never on page load.

**Connect**: `userId`, `restrictMultipleAccounts: false`, no transfer options. Link connects the
account and stops, which is the only way to read holdings before asking anyone to pay.

**Payment**: adds `transferOptions` with `transactionId` (comes back on the webhook as
`TransactionId`), `transferType: 'payment'`, `isInclusiveFeeEnabled: false`, and `toAddresses`
carrying networkId, symbol, address, amount and `displayAmountInFiat`.

Details that are easy to get wrong:

- `amount` and `amountInFiat` are mutually exclusive on a payment.
- `clientFee` is a **0 to 1 ratio of the amount**, not a cash figure. The sandbox rejects `2` with
  "The field ClientFee must be between 0 and 1". Measured.
- `integrationId` deep-links Link to one provider. **Omitting it restores Mesh's picker**, which is
  the whole of the switch.
- `accessTokens` goes to `createLink` in the browser, **not** into the token request. Passing stored
  `tokenId` values there lets a returning shopper skip the exchange login entirely. Measured: twelve
  seconds from `pageLoaded` to `transferPreviewed`, no OAuth.

**There is no way to say what a payment should be funded from.** Documented, checked against both
the OpenAPI spec and the prose docs. `GetLinkTokenRequest` and `LinkTokenTransferOptions` have no
funding or conversion field, and `fundingOptions` exists only as an *output* of the quote endpoint.
A merchant configures the destination; the shopper picks the source inside Link. Any source picker
on the merchant's own page is a control wired to nothing.

---

## Quotes, and what they are not

`POST /api/v1/transfers/managed/quote` takes `amountInFiat`, `fiatCurrency`, `symbol`, `networkId`,
`toAddress`, `brokerType`. **It takes no auth token, so it cannot know what anyone holds.** What it
returns is a broker's capability and its minimums. Mesh's own field description says "Summary of all
**possible** funding options".

We read it as a verdict on the shopper's account for a while. It is not one, and building a "which
of your assets can pay" UI on top of it is the wrong foundation.

Response shape, measured, and different from what looked plausible:

- Fees are `fees.inFiat.{minFeesFiat, maxFeesFiat, networkFeeFiat, tradingFeeMaxFiat, ...}`. There
  is **no** `fees.totalFeesInFiat`.
- Funding options are `fundingOptions[].fundingOption`. There is **no**
  `cryptocurrencyFundingOptionType` on this response, despite that being the name of the enum.

Both wrong names parsed cleanly through zod because every field was `.nullish()`, and returned null
forever. If you use zod here, consider being strict about the fields you actually depend on.

`minAmountFiat` versus `maxAmountFiat` is a range across funding paths, not a range of prices. The
onramp guide is explicit: `minAmountFiat` assumes the user already holds the token; the max assumes
Mesh has to buy it.

Documented as **Coinbase only** for `brokerType`.

---

## Configure: the only call that is about the account

`POST /api/v1/transfers/managed/configure` takes `fromAuthToken` and `fromType`, plus `toAddresses`,
and returns `content.holdings[]` with `eligibleForTransfer`, `eligibleForTransferWithFunding`,
`ineligibilityReason` and per-network fees.

**It reports on assets that can reach your destinations, not on the whole portfolio.** This is the
part we got wrong repeatedly. If the merchant collects USDC, a shopper's BTC does not appear in this
response even in the case where Mesh would convert that BTC to pay. What appears is the destination
asset, carrying `eligibleForTransferWithFunding`, which is Mesh saying it can cover a short balance
from other holdings.

So the conversion signal is one boolean on the asset you are collecting, not a list of the assets
the shopper could spend.

`transferBalanceFundingAvailability.status` exists in the OpenAPI spec with values
`disabled | available | requiresAmountLowering | notApplicable | unavailable`, but it is **not in
the documented response example** and we have not observed it. Treat it as optional.

---

## Conversion and SmartFunding

`CryptocurrencyFundingOptionType` has seven values, four of them conversion. Documented as an enum;
**none of the seven has a documented meaning**, and three have no example anywhere:

```
existingCryptocurrencyBalance    buyingPowerPurchase    paymentMethodDepositUsage
cryptocurrencyConversion         stableCoinNoFeeConversion
cryptocurrencyBuyingPowerConversion    cryptocurrencyMultiStepConversion
```

The one worked example converts BTC into WETH inside a single transfer, with `fromSymbol`,
`fromAmount`, `toSymbol` and a fee.

**SmartFunding** is a real named concept in both the docs and the API, not only marketing:
`TransferModel.isSmartFundingTransfer`, and
`PreviewTransferResult.totalEstimatedAmountPlusConversionFeesInFiat`. The docs describe it as Mesh
choosing the best source across a user's balances. **Whether it needs enabling per client is not
documented** anywhere; the phrase "clients with SmartFunding capabilities" is the entire published
basis. Marketing goes further than the docs do, claiming up to five combined funding sources and
"any supported asset" converted; treat that as a sales claim.

**Unknown, and it matters:** whether conversion fires when the shopper holds *zero* of the
destination asset. The documented wording is about topping up an insufficient balance. The sandbox
account `MeshBTC` holds BTC and no stablecoin, which is the only way to settle this question.

Where it does happen, the SDK tells you: `transferPreviewed.payload.cryptocurrencyFundingOptions[]`
carries the type, the asset used, the amount and the fee, and `executeFundingStep` fires per leg
during execution with a status. Read them, or a conversion is invisible to your UI.

---

## Reading the portfolio

`POST /api/v1/holdings/get` with `{ authToken, type, includeMarketValue: true }` and
`POST /api/v1/holdings/value` for the total. `type` is the `brokerType` from the connect payload.

- The sandbox `totalValue` is dominated by roughly ten million dollars of simulated fiat. Use
  `cryptocurrenciesValue` for anything you put on screen next to a real price.
- `symbol` is nullable in Mesh's schema. Coerce rather than require, or one unnamed row takes down
  the whole read.
- Names come from Mesh and are sometimes surprising: BNB renders as "Build and Build", which is its
  actual post-2022 name. Print what arrives.
- Binance sandbox holdings are **intermittent**. One run answered "Could not get portfolio from
  Sandbox.", a later run returned all fourteen positions identical to Coinbase's. Payment still
  works when the read fails, so treat a failed portfolio read as a warning and not a blocker.

---

## Webhooks

`X-Mesh-Signature-256`, base64 HMAC-SHA256 over the **raw body**. Four things matter and all four
are easy to get wrong:

1. `await req.text()` before parsing. Re-serialising the JSON changes key order and whitespace, the
   digest changes, and every delivery fails in a way that looks like a key problem.
2. Deduplicate on **`EventId`**, which is stable across retries. `Id` changes per attempt.
3. Claim the idempotency key **after** the write succeeds. Claiming first means a delivery that
   arrives before its order exists burns the id, and Mesh's retry is answered "duplicate", losing
   the settlement silently and permanently.
4. Write settlement to its own key. If the browser also writes the order record, two writers doing
   read-modify-write without compare-and-swap will lose whichever lands in the gap.

The webhook body is **PascalCase**, unlike every other endpoint.

Register the callback under the **Sandbox** Transfer Webhook Callback URI, not the production one,
which never fires against a sandbox base URL. The secret is shown once.

**Sandbox delivery is not guaranteed and is visibly intermittent.** Measured across a single
afternoon: several payments settled within seconds of `transferCompleted`, and several never
received a delivery at all despite an endpoint proven correct by the local harness minutes earlier.
Design for it. The receipt must be complete and correct at `paid`, with settlement an upgrade that
may never arrive, or a demo will look broken for reasons entirely outside your code.

`scripts/webhook-check.mjs` in this repo proves the endpoint without waiting for Mesh: signed
delivery accepted, replay deduplicated, forged signature refused, unsigned refused, and the same
JSON re-serialised refused. If that passes and settlement still does not appear, nothing arrived.

---

## Link, the SDK and the browser

- The SDK touches `window` at module scope, so a static import crashes a server render. Import it
  dynamically, and preload the chunk before the click or the first payment pays for a 105KB
  download on top of the token round trip.
- **An unregistered origin fails silently.** No event, no exit, no console error, just a blank frame
  forever. This is the single most common first-run failure. Add every origin to Allowed Link URLs
  in the dashboard, allow up to ten minutes, and put a timeout in your own code that names the cause.
- **Preview deployments will not work**, because every commit gets a new URL and Mesh validates the
  origin. Demo from one fixed production domain.
- CSP: Link renders from `sandbox-web.meshconnect.com` and pulls logos from
  `file-cdn.meshconnect.com`. Allow `*.meshconnect.com` in `frame-src` and `connect-src` or the
  overlay is a blank grey box.
- Embedded rendering needs width. On a 375px viewport the embedded frame loaded, fired `pageLoaded`,
  and then showed white. Use the overlay below about 1024px.
- Close the session in `onExit`, or the frame keeps a dead session loaded and its listener attached.
- `SessionSummary.page` tells you exactly where someone abandoned. `selectedIntegration.id` on that
  summary is how you replay the shopper's provider choice into the payment session.
- The published `BrokerType` union is behind the API. It lists `sandbox` but not `sandboxCoinbase`,
  which is what a sandbox Coinbase connection actually returns, so narrowing to the union rejects a
  value Mesh itself sent you.
- `transferExecuted` is marked "Do not use. Obsolete." in Mesh's event reference. `transferInitiated`
  is the event for the shopper proceeding from the preview.
- Mesh re-prices roughly every thirty seconds while the shopper sits on the confirm screen, so
  `transferPreviewed` fires repeatedly. Do not let each one restamp your timeline.
- The SDK defines **43 event types**. Most belong to flows you are not using.

---

## Money, fees and settlement

- **There is a fee and it is not zero.** `institutionTransferFee` was 0.01 USDC on a $50 order, gas
  0, and `totalAmountInFiat` came back 50.01. The merchant receives $50 and the customer pays
  $50.01.
- **The fee is per asset.** The same order in PYUSD had a 0.001 fee. That is smaller than a cent, so
  a fiat total rounds it away entirely: $50.00 price, 0.001 fee, $50.00 charged. Show the token
  figure or the arithmetic looks broken.
- **`totalAmountInFiat` is not reliable as the amount charged.** It returned 50, 50.01 and 49.98
  across three otherwise identical transfers. Compute the total from the amount and the quoted fees,
  and show Mesh's figure beside it when they disagree.
- `institutionTransferFee` has its own `feeCurrency`. Do not sum it into the transfer amount without
  checking it matches.
- `transferId` equalled `previewId` on every run we saw. Convenient, do not depend on it. Key orders
  on your own `transactionId`.
- **The returned `txHash` is not on a public chain.** Checked against Ethereum mainnet, Sepolia and
  Base with `eth_getTransactionByHash`: all three returned null. The destination address is real on
  mainnet with a zero nonce and never received anything. It is a sandbox reference, so show it as
  one and do not link to an explorer.
- The browser's `transferCompleted` says the provider acknowledged the transfer. It does not say the
  merchant was paid. Only a verified webhook should move an order to settled.

---

## Sandbox specifics

- Accounts: `Mesh` (full portfolio), `Mesh2` (empty, produces a genuine `transferNoEligibleAssets`),
  `Mesh3` (cash only), `Mesh4` (large balance), and the single-asset ones `MeshBTC`, `MeshETH`,
  `MeshSOL`, `MeshUSDC`. Password `Pass123`, MFA `123456`.
- **Transfer MFA fires even when authentication was skipped**, so `123456` is needed at payment even
  for a returning shopper who never saw a login. Keep the code on screen through the payment step,
  not just at connect.
- **The sandbox balance is shared with every other Mesh sandbox user** and depletes. It went from
  10,000.00 to 9,949.99 USDC across two runs at 50.01 each.
- The picker offers five integrations, not the full catalogue: Binance, Coinbase, MetaMask, Phantom,
  Rainbow. Link filters to what is usable.
- **Self-custody wallets connect but hold nothing.** MetaMask and Phantom both returned an empty
  `cryptocurrencyPositions` array and a zero total. They also return no `tokenId`, only a long
  encrypted `accessToken`, so managed tokens do not apply and your types must allow `tokenId` to be
  absent.
- The Mesh-hosted login form is styled like the exchange's own. Real credentials were typed into it
  by mistake during this build. Warn at the point of connection, on screen, not in a footer.
- `docs.meshconnect.com` is canonical. `docs.meshpay.com` does not resolve, and
  `workshop.meshconnect.com` currently serves a certificate for an Azure hostname and cannot be
  fetched at all.
- The OpenAPI spec at `integration-api.meshconnect.com/swagger/v1/swagger.json` is richer than the
  prose docs on funding and eligibility, but it lags them elsewhere: `accessTokens` is documented and
  absent from the spec. Authoritative on what exists, not exhaustive.

---

## Things we could not find out

- What any of the seven `CryptocurrencyFundingOptionType` values formally mean.
- Whether conversion is automatic in Link or gated per client, and what sets
  `transferBalanceFundingAvailability.status` to `disabled`.
- How SmartFunding is enabled for a client.
- Whether conversion fires when the shopper holds none of the destination asset.
- Which brokers support conversion, and whether the sandbox does at all.
- Whether the shopper sees a conversion choice or Mesh simply routes it.
