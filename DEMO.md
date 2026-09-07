# Demoing WELT

A script for showing this to someone, and the honest answers to what they will ask.

Ten minutes for the walkthrough, five for questions. It works on a laptop at 1440x900, which is what
it was designed for. Demo from **https://welt-mesh-demo.vercel.app**, never from a preview URL: Mesh
validates the origin Link opens from, and every commit gets a new preview domain.

---

## Before you start

**Check the sandbox has money in it.** The Mesh sandbox accounts are shared with every other Mesh
sandbox user in the world, and each run through spends about $50, so a balance that was there
yesterday is not guaranteed to be there today.

So an hour before, connect an account and look at the portfolio panel. If it is full, demo the happy
path. If it is empty you have not lost the demo, you have a different one: an empty account produces
a real `transferNoEligibleAssets` and a designed failure state, and "here is what happens when it
goes wrong, and no, it is not mocked" is a strong five minutes in front of an engineer. Know which
demo you are giving before you open the laptop.

Check it **in the app**, not with a curl. An expired auth token does not fail the way you expect:
`holdings/get` answers HTTP 200 with an envelope status of `ok`, an empty positions array, and the
real answer buried in `content.status: notAuthorized`. Read it quickly and a live account looks like
a drained one. The app gets this right and prints an expired connection as an expired connection,
which is the whole reason to check there.

The rest of the pre-flight, in order:

- `/api/health` should return `ok: true`, `environment: sandbox`, `storage: redis`,
  `storageReachable: true`. If storage says `memory`, settlement will look broken on Vercel, because
  the webhook and the browser may not land on the same instance.
- Load the page once to warm it. A cold serverless start in front of an audience reads as slow
  software.
- If you pushed anything today, confirm the live page actually contains it. Vercel has queued deploys
  on this project anywhere from fifteen seconds to eleven minutes. A 200 means the site is up, not
  that it is your build.

### The sandbox logins

These are Mesh's own test accounts, reached through the Coinbase or Binance option inside Mesh Link.
They are not ours and there is no sign-up: Mesh provides them so integrations can be built against
real API behaviour. All use password `Pass123` and MFA code `123456`, and they are listed in the
panel's Demo tab so you do not have to remember them mid-demo.

| Username | What it holds | Use it to show |
|---|---|---|
| `Mesh` | A full portfolio | The happy path. This is your demo account. |
| `Mesh2` | Nothing at all | A real `transferNoEligibleAssets` and the designed empty state |
| `Mesh3` | Cash, no crypto | An account shaped for onramp rather than transfer |
| `Mesh4` | Large balances | Big numbers, if anyone wants to see them |
| `MeshBTC` | Bitcoin, no stablecoin | That conversion is switched off for this client |

---

## The walkthrough

**Bold** is what you do, the indented lines are what you say. Say them in your own words, but keep
the order: each beat answers the question the last one raises.

About nine minutes without questions.

---

### 1. The shop (30 seconds)

**Land on https://welt-mesh-demo.vercel.app.**

> This is WELT. Clearance retailer, one shoe, four colourways, fifty dollars. It is built as an
> ordinary shop front.

**Point at the "Crypto accepted: USDC · USDT · PYUSD" strip.**

> There's a mention of the names the assets accepted. But no wallet button, no connect-web3, no mention of Mesh anywhere.
> The customers should meet the Mesh infrastructure at checkout, experience remains as-is.

**Pick the charcoal colourway, then UK 9.**

> Stock is per colourway, so some of these sizes are genuinely gone.

### 2. Bag and delivery (30 seconds)

**Add to bag. Continue. On delivery, click Fill in a sample address.**

> Normal shop, normal checkout. Bag, address, pay.

### 3. Checkout (1 minute)

**Point at the three payment options.**

> Card and Apple Pay are for show, and the app says so if you click them. Everything from here is a
> real call against Mesh's sandbox.

**Point at the crypto button.**

> This button is Coinbase blue with the Coinbase mark, and neither is hardcoded. Mesh publishes a
> brand palette and a logo set for every integration it supports, light and dark, and the page reads
> it live. Connect a Binance account and the button turns Binance yellow. The button they press
> matches the screen it opens.

**Point at the sentence under the button. It reads something like "Coinbase and Binance can fund
this payment in USDC on Ethereum. Kraken, Robinhood, CashApp and Uphold can too, on a live
account."**

> That sentence is generated, not written. Mesh publishes a list of every exchange and wallet it
> integrates with, and which assets and networks each one can send. We ask it who can send USDC on
> Ethereum to our address, and print the answer.

> It splits in two on purpose. The first group can do it here, today, in the sandbox. The second
> could do it on a live account. If Kraken dropped USDC on Ethereum tomorrow, this sentence would
> change on its own and nobody would have to remember to edit it.

### 4. Connect (1 minute)

**Press the button. Mesh Link opens.**

> This is Mesh Link and I have built none of it. One script tag, plus a token my server mints for
> the session. The same component handles every exchange and wallet in that list, so adding Kraken
> is not an integration, it is already here.

**Log in as `Mesh`, password `Pass123`, code `123456`.**

**While the login is on screen, point at the warning strip.**

> That login form is served by Mesh, not by Coinbase. Never type real exchange credentials into a
> sandbox.

### 5. The portfolio (2 minutes, and it is not about payments)

**Wait for the holdings to fill in. Let them read it.**

> One login, and we can see what this customer holds. Balances, fiat values, and a verdict per
> asset.

**Point at the three assets at the top, then at ALSO HELD.**

> The top three can settle this order. The eleven underneath say "cannot reach this merchant". We
> collect stablecoins at an address on Ethereum, and Bitcoin cannot arrive at an Ethereum address.

**If they ask about the Bitcoin, and someone always does:**

> Fair question, and the accurate answer is more interesting than the salesy one. Mesh has a feature
> called SmartFunding that converts one holding to fund a payment in another. It is in the API and in
> the docs. So in principle your customer could hold only Bitcoin and still pay you in USDC.

> Two things stop it here. First, it is switched off for this sandbox client, and I tested that
> rather than assuming it. I connected an account holding five Bitcoin and no stablecoin at all,
> asked Mesh what could fund a fifty dollar USDC payment, and got an empty list. Asked about a
> Bitcoin destination in the same minute, it returned the Bitcoin as eligible. Every response carries
> a field reading `transferBalanceFundingAvailability: disabled`.

> Second, and this one survives the switch being flipped: the customer never picks. There is no field
> anywhere in Mesh's API for the funding asset, so a merchant cannot offer "pay with Bitcoin" as a
> choice on a checkout. Mesh decides at payment time, spending the collected asset when the balance
> covers it and converting something else when it does not. If conversion were enabled here it would
> simply happen, and the receipt would name it afterwards.

> `MESH-NOTES.md` has the response bodies if you want them.

**Back to the main thread. Point at the verdicts again.**

> Those verdicts are Mesh's, not mine. The obvious way to build this is to compare a balance against
> a price, and it is wrong: it misses the exchange's withdrawal minimum, the fees, and the fact that
> Mesh can cover a shortfall from buying power or a card on file. One call per asset, and Mesh
> answers.

**Point at the struck-through line under Paying from: Copy a wallet address, Withdraw from your
exchange, Swap or move funds, Work out what we accept.**

> And this is the product. Four things your customer would normally have to do to pay you from an
> exchange balance, none of which happened. Mesh is not a wallet connect button. It is the layer that
> makes those four disappear.

### 6. Payment trace (1 minute)

**Scroll to the section headed Payment trace, below the checkout.**

> Seven rows, each stamped by a real Mesh event as it arrives. Nothing runs on a timer, there is no
> spinner, and a row that stays blank is a step that genuinely did not happen. If this stops halfway,
> that is information rather than a hang.

### 7. Pay (90 seconds)

**Press Pay.**

> Second Link session, opening straight on the account they already connected. No second picker,
> because being asked to choose your exchange twice in one checkout is confusing.

**MFA `123456`. Approve. Watch the trace fill in.**

> Preview. Initiated. Executed. Real events.

**The receipt prints and the product picture takes a YOURS stamp.**

> Fifty dollars in USDC, on Ethereum, from Coinbase, to our address.

### 8. Paid is not settled (1 minute)

**Point at the status on the receipt. It says Paid.**

> This is the part worth your attention, because it is the difference between a demo and a payment
> system.

> It says paid, not settled. What happened is that the customer's browser told us the exchange
> acknowledged the withdrawal. That message ran on their machine. It can be lost, it can be forged,
> and exchanges can fail a transfer hours later.

**Wait. Six to thirty-four seconds. It flips to Settled.**

> That changed because a webhook arrived from Mesh, signature verified, server side. It is the only
> thing in this system allowed to say you have been paid. Never let the browser mark an order paid.

### 9. Behind the payment (2 minutes, only if the room is technical)

**Open the panel from the handle on the right edge, or start with `?demo=1` to have it docked.**

**Events tab.**

> The SDK lifecycle in order, with timings. What actually fired, unfiltered.

**Integration tab.**

> What Mesh said about this account. Eligibility per asset, and whether each could fund the payment.

**Ledger tab.**

> Mesh's own record rather than ours, so it survives the tab closing. Every transfer, with the
> funding legs each one used. If a conversion ever happened, it would be named on that row.

**Providers tab.**

> And when someone asks whether you could take Kraken as well, this answers from the live list rather
> than from a promise.

---

## When it goes wrong

Most of these are worth showing on purpose if you have the time.

| What happens | What to do |
|---|---|
| Portfolio is empty | Reconnect as `Mesh2`, the deliberately empty sandbox account, and show the designed empty state. It is real, not mocked. |
| Link is a blank grey box | The origin is not registered with Mesh. You are on a preview URL. Move to the production domain. |
| Balance too low to pay | Say so. The sandbox is shared and it drains. Then show the failure state, which is the honest version of this. |
| No settlement | Give it 45 seconds before saying anything. Quicker than that reports "no webhook" for payments that settled. |
| Everything is slow | Cold start. Reload once and carry on. |

There is a reset in the panel's Demo tab. It clears the order and keeps the connection, so a second
run does not need another sign-in.

---

## The questions you will get

**"Can my customer choose to pay in Bitcoin?"**

No, and there are two reasons. Only one of them is a switch.

Mesh's link token has no field for the funding asset, so a merchant cannot offer that choice at all.
Mesh decides at payment time.

And on this sandbox client Mesh never converts, because conversion is switched off for us. Connect
`MeshBTC`, which held 5 BTC and no stablecoin, ask Mesh what can fund a $50 USDC payment, and it
returns an empty list. Ask it about a BTC destination in the same minute and the BTC comes back
eligible. Every response carries `transferBalanceFundingAvailability: disabled`.

Say that plainly rather than talking around it. "We tested it, here is the response body, here is the
question we have put to Mesh" is a better answer than a hedge. `MESH-NOTES.md` has the full run.

**"What does it cost the merchant?"**

`clientFee` is wired up and tested and ships at zero. Set it to 2 and Mesh charges $52 at source and
delivers $50 to the destination. It is off because a shop advertising $50 and charging $52 is either
lying in the headline or dripping the fee at the last step, and the second one is now unlawful in the
UK.

**"Is the transaction hash real?"**

No, and we checked properly: mainnet, Sepolia and Base. Sandbox hashes exist on no public chain,
which is why there is no explorer link. Putting one there would have been the easy dishonest choice.

**"How much of this is mocked?"**

Card and Apple Pay, and they say so. Everything else is a real Mesh call against the sandbox. No
failure is simulated. Every row in the trace is stamped by an event that actually arrived.

**"How long would this take us to build?"**

The Mesh integration is small: a link token endpoint, the SDK, a portfolio call, a webhook. The work
is everywhere else. Two Link sessions rather than one, because holdings need a connection first.
Webhook precedence, because Mesh sends two deliveries per transfer and last-write-wins un-settles a
settled order. Nullable fields everywhere, because one explicit `null` in a body 400s the delivery
and Mesh does not resend. Those are in `MESH-NOTES.md` and they are the transferable part.

---

## What this does not do

Say these before someone finds them.

- **No onramp.** `transferType: 'onramp'` would let someone holding no crypto pay by card through
  their exchange. It is the obvious Mesh capability this build does not show.
- **Three capabilities are switched off for this sandbox client**: conversion, pay links, and the
  identity endpoint that returns the address the exchange already holds. All three would have made
  this better and none of them are ours to enable.

Mobile has been run on a real handset and works, including the switch from an embedded Link frame to
an overlay on a narrow screen, which is the part that had never been exercised outside a desktop
browser.
