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

What follows is a script. **Bold** is what you do, the indented lines are what you say. Say them in
your own words, but the beats are in this order for a reason: each one answers the question the last
one raises.

Total is about nine minutes without questions.

---

### 1. The shop (30 seconds)

**Land on https://welt-mesh-demo.vercel.app. Do not touch anything yet.**

> This is WELT. Clearance retailer, one shoe, four colourways, fifty dollars. I want you to look at
> the whole page for a second and tell me what is missing.

**Pause. Let them look.**

> There is no wallet button. No "connect web3". The word crypto does not appear anywhere, and
> neither does Mesh. That is deliberate, and it is the first thing your customers would notice if we
> got it wrong.

**Pick the charcoal colourway, then UK 9.**

> Sizes are per colourway, so some of these are genuinely out of stock rather than decorative.

### 2. Bag and delivery (30 seconds)

**Add to bag. Continue. On delivery, click Fill in a sample address.**

> Normal shop, normal checkout. Bag, address, pay. Nothing interesting yet, which is the point.

### 3. Checkout (1 minute)

**Land on the checkout. Point at the three payment options.**

> Card, Apple Pay, crypto account. I will be straight with you: the card and Apple Pay options are
> for show, and the app says so if you click them. Everything else you are about to see is a real
> call against Mesh's sandbox.

**Point at the crypto button.**

> Now look at this button. It is Coinbase blue, with the Coinbase mark, and I did not hardcode
> either of those. Mesh publishes a brand palette and a logo set for every exchange in its
> catalogue, light and dark, and the page reads it live. If your customer's account were Binance
> this button would be yellow.

> Small thing. But the button they press now looks like the screen it opens, so handing off to their
> exchange does not feel like leaving your site.

**Point at the line underneath.**

> And that line is the live catalogue too. It is telling you who can actually settle this payment,
> in USDC, on Ethereum, today. Not a marketing list. If Kraken could not reach us, it would say so.

### 4. Connect (1 minute)

**Press the button. Mesh Link opens, embedded.**

> This is Mesh Link. I have not built any of it. It is one script tag and a token my server minted,
> and it handles every exchange in that catalogue.

**Log in: `Mesh` / `Pass123` / code `123456`.**

**While the login is on screen, point at the warning strip.**

> Worth saying out loud: that login form is served by Mesh, not by Coinbase. Never type real
> exchange credentials into a sandbox. We put that warning there because someone will otherwise try.

### 5. The portfolio, and this is the part that is not about payments (90 seconds)

**Wait for the portfolio to fill in. Let them read it.**

> One login, and we can now see what this customer holds. Balances, fiat values, and Mesh's own
> verdict on each asset.

**Point at the three assets at the top, then at ALSO HELD.**

> The top three can settle this order. The eleven underneath say "cannot reach this merchant",
> because we collect stablecoins on Ethereum and those cannot get there.

> That verdict is Mesh's, not mine. I am not comparing a balance against a price, which is the
> obvious way to do this and it is wrong: it misses the exchange's withdrawal minimum, the fees, and
> the fact that Mesh can cover a shortfall from buying power or a card on file. One call per asset,
> and Mesh answers.

**Then the important line:**

> Notice what your customer has not done. They have not copied an address. They have not withdrawn
> anything. They have not swapped anything, and they never had to find out what you accept. That is
> the whole product. Mesh is not a wallet connect button, it is the layer that makes those four
> steps disappear.

### 6. The payment route (1 minute)

**Point at the route diagram.**

> This fills in as the payment happens, and every row is stamped by a real Mesh event as it arrives.
> Nothing here is on a timer, and there is no spinner. If a row stays blank it is because that step
> did not happen.

> I am making a point of that because every demo you have been shown has a progress bar that always
> completes. This one can genuinely stop halfway, and if it does, that is information.

### 7. Pay (90 seconds)

**Press Pay.**

> Second Link session. Notice it went straight to the account they already connected. No second
> picker, because being asked to choose your exchange twice in one checkout is confusing.

**MFA `123456`. Approve. Watch the route fill in.**

> Preview. Initiated. Executed. All real events.

**The receipt prints, the product picture takes a YOURS stamp.**

> Fifty dollars, in USDC, on Ethereum, from Coinbase, to our address.

### 8. Paid is not settled (1 minute)

**Point at the status on the receipt. It says Paid.**

> Here is the bit I actually want you to take away, because it is the difference between a demo and
> a payment system.

> That says paid, not settled. What just happened is that the customer's browser told us the
> exchange acknowledged the withdrawal. That message ran on their machine. It can be lost, it can be
> forged, and exchanges can fail a transfer hours later.

**Wait. Between six and thirty-four seconds. It flips to Settled.**

> There. That changed because a webhook arrived from Mesh, signature verified, server side. That is
> the only thing in this system allowed to say you have been paid.

> If you take one thing from today: never let the browser mark an order as paid.

### 9. Behind the payment (2 minutes, only if the room is technical)

**Open the panel.**

> Everything you just watched, with the working shown.

**Events tab.**

> The real SDK lifecycle in order, with timings. That is what actually fired.

**Integration tab.**

> What Mesh said about this account. Eligibility per asset and whether each could fund the payment.

**Ledger tab.**

> The order, and its webhook deliveries. Note there are two, about twenty-four seconds apart. Mesh
> sends two per transfer as the norm, and if you let the last one win you can un-settle a settled
> order. We found that the hard way.

**Providers tab.**

> And when someone asks "could you take Kraken as well", this answers it with the live catalogue
> rather than a promise.

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
