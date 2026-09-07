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
- Have the sandbox logins to hand: `Mesh`, `Mesh2` (empty), `Mesh3` (cash only), `Mesh4` (large),
  `MeshBTC` (BTC only). Password `Pass123`, code `123456`. They are in the panel's Demo tab too.

---

## The walkthrough

### 1. The shop, before any of this is about crypto (30 seconds)

Land on the listing. Say almost nothing. Let them see a shoe shop.

The point being made here is one you make by not making it: no wallet button, no "connect web3", no
mention of Mesh anywhere. A merchant's first question is whether this will look like a crypto product
to their customers, and the answer should arrive before they ask it.

Pick a colourway and a size. Stock is per colourway, so some sizes are genuinely unavailable.

### 2. Bag and delivery (30 seconds)

Add to bag. On delivery, use **Fill in a sample address**. Do not type an address live. It is dead
air and nobody is watching you type.

### 3. Checkout, and the moment it turns (1 minute)

The checkout offers card, Apple Pay and a crypto account. Card and Apple Pay are honest about being
for show. Say that out loud, because the alternative is someone discovering it and then wondering
what else is pretend.

The crypto option leads. Point at the button.

**It is wearing Coinbase's blue and Coinbase's mark, and none of that is hardcoded.** Mesh publishes
a brand palette and a logo set for every integration in its catalogue, light and dark, and this app
reads it live. Connect Binance instead and the button turns Binance yellow. Small thing, real
benefit: the button a customer presses looks like the screen it opens, so the handoff stops feeling
like leaving the site.

Underneath it, a line naming who can actually fund this payment. Also live, also from the catalogue,
and it separates who can pay here from who could pay on a production account.

### 4. Connect (1 minute)

Press it. Mesh Link opens, embedded on a desktop.

Log in as `Mesh`, password `Pass123`, code `123456`.

While it is open, point at the strip warning that this login is served by Mesh rather than by
Coinbase, so real exchange credentials do not belong in it. Someone will otherwise ask, and it is
better volunteered than extracted.

### 5. The payment route (2 minutes, and this is the one)

This is the moment worth slowing down for.

Coinbase connects and the page fills in what the customer holds, what the merchant wants, and how one
becomes the other. Balances, asset, network, destination.

Then say the sentence that is actually the product: **the customer did not copy an address, did not
withdraw, did not swap, and did not need to know what the merchant accepts.**

Point at the route. Every row is stamped by a real Mesh event as it arrives. Nothing is on a timer. A
row that stays blank is a step that did not happen. Say that explicitly, because every other demo
they have been shown has a spinner that always completes.

### 6. Pay (2 minutes)

Press Pay. Link reopens on the account already connected, so there is no second picker.

MFA is `123456`. Approve.

Watch the route fill in: preview, initiated, executed. The receipt prints down the screen and the
product picture takes a YOURS stamp.

### 7. Settlement, which is the part merchants care about (1 minute)

The receipt says paid. Wait for it to say settled. Between six and thirty-four seconds, measured over
seventeen transfers.

This is the merchant's real question, so answer it before it is asked: **the browser saying the
payment worked is not the merchant getting paid.** `transferCompleted` runs on the customer's
machine, it can be lost, and exchanges can fail a transfer hours later. It sets the order to paid.
Only a signature-verified webhook sets it to settled. That distinction is the difference between a
demo and a payment system.

### 8. Behind the payment (2 minutes, only if the room is technical)

Open the panel. Six tabs.

**Events** is the real SDK lifecycle, in order, with timings. **Integration** is what Mesh said about
this account: holdings, eligibility per asset, and whether each could fund the payment. **Ledger** is
the order and its webhook deliveries, including the second delivery Mesh sends about twenty-four
seconds after the first. **Providers** answers "could you take Kraken too" with the live catalogue
rather than a promise. **Build** is the decisions and why, and it is the tab to leave open if someone
wants to read afterwards.

`?demo=1` opens the panel docked, if you would rather start there.

---

## When it goes wrong

Most of these are worth showing on purpose if you have the time.

| What happens | What to do |
|---|---|
| Portfolio is empty | Connect `Mesh2` and show the designed empty state. It is real, not mocked. |
| Link is a blank grey box | The origin is not registered with Mesh. You are on a preview URL. Move to the production domain. |
| Balance too low to pay | Say so. The sandbox is shared and it drains. Then show the failure state, which is the honest version of this. |
| No settlement | Give it 45 seconds before saying anything. Quicker than that reports "no webhook" for payments that settled. |
| Everything is slow | Cold start. Reload once and carry on. |

There is a reset in the panel's Demo tab. It clears the order and keeps the connection, so a second
run does not need another sign-in.

---

## The questions you will get

**"Can my customer choose to pay in Bitcoin?"**

No, and be precise about why, because there are two reasons and only one of them is a switch.

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

- **Never run on a real handset.** Exercised at phone widths in a desktop browser, and Link switches
  from embedded to overlay below 1024px, which is the part most likely to be wrong.
- **No onramp.** `transferType: 'onramp'` would let someone holding no crypto pay by card through
  their exchange. It is the obvious Mesh capability this build does not show.
- **Three capabilities are switched off for this sandbox client**: conversion, pay links, and the
  identity endpoint that returns the address the exchange already holds. All three would have made
  this better and none of them are ours to enable.
