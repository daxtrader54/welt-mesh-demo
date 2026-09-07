# Demoing WELT

**Version 2**, 7 September 2026.

A script for showing this to someone, and the honest answers to what they will ask.

Ten minutes for the walkthrough, five for questions. It works on a laptop at 1440x900, which is what
it was designed for. Demo from **https://welt-mesh-demo.vercel.app**, never from a preview URL: Mesh
validates the origin Link opens from, and every commit gets a new preview domain.

What changed from v1: the customer now picks their own exchange on the first connect, so the
branding beat moved to after the connect where it is a response rather than a claim. There is a new
answer covering what actually happens when Pay is pressed, which is the question everything else
turns out to depend on. And the MetaMask answer has been corrected: v1 asserted that a self-custody
transfer in the sandbox would be a genuine on-chain testnet transaction, and there is no evidence
for that.

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

> This is WELT.
> A mock up of an online sports shoe retailer
> In this case the shoe is the "Skechers Sport Track Syntac" trainer
> four colours, costing fifty dollars 
> you can click around the site and purchase any of the trainers
> It is built as an ordinary shop front.
> to simulate a normal shopping experience 
> the mesh magic is added from checkout 
> so let's jump in

**Point at the "Crypto accepted: USDC · USDT · PYUSD" strip.**

> At this stage, there is no mention of Mesh.
> But we know it has four trainers, and the shop accepts crypto.
> TAKE A LOOK AROUND
> Let's pick a shoe and buy one

### 2. Bag and delivery (30 seconds)

> Add to bag and go to checkout.
> Do address.
> Continue to payment

### 3. Checkout (1 minute)

> Three payment options.
> Card and Apple Pay are for show,
> clickable but the app won't support them.
> "We're gonna pick CHOOSE YOUR EXCHANGE... button" 
> And this is where Mesh enters the chat
> everything from here is a real call against Mesh's sandbox.
> and we start tracking all the mesh events in real time

**Point at the crypto button. It reads "Choose your exchange or wallet".**

> In the crypto account section:
> We haven't selected any exchange yet.
> The customer will need to pick here.
> "SMASH BUTTON"

### 4. Connect (1 minute)

> This is Mesh Link 
> To integrate it was one script tag, plus a token my server mints for the session.
> Here we have "the picker"

> This is an example list that your customer can choose from
> Everything on it is already integrated.
> In production, adding Kraken is not a project with a timeline, it is a customer tapping Kraken.
> You can configure all the exchanges shown easily, these are the ones I chose.

**Pick Coinbase.**

**Log in as `Mesh`, password `Pass123`, code `123456`.**

**While the login is on screen, point at the warning strip.**

> That login form is served by Mesh, not by Coinbase.

**Once it closes, point at the button again. It now reads "Continue with Coinbase", in Coinbase
blue, with the Coinbase mark.**

> None of that is hardcoded.
> Mesh publishes a brand palette and a logo set for every integration it supports, light and dark,
> and the page reads it live.
> Had they picked Binance, that button would be Binance yellow.


### 5. The portfolio (2 minutes, and it is not about payments)

> Styling aside, the checkout now matches the account behind it.
> One login, and we can see all the assts this customer holds.
> Balances, fiat values, and a verdict per asset.

> The top three assets here can settle this order now.
> The eleven underneath say "cannot reach this merchant".

> We collect stablecoins at an address on Ethereum, and Bitcoin cannot arrive at an Ethereum address on this sandbox.

### 6. Payment trace (1 minute)

**Scroll to the section headed Payment trace, below the checkout.**

> Seven rows, each stamped by a real Mesh event as it arrives.
> Nothing runs on a timer, there is no spinner,
> A row that stays blank is a step that genuinely did not happen.
> If this stops halfway, that is information rather than a hang.

### 7. Pay (90 seconds)

**Press Pay.**

> Let's press PAY
> Second Link session, opening straight on the account the user already connected.
> No second picker, because being asked to choose your exchange twice in one checkout is confusing.

**MFA `123456`. Approve. Watch the trace fill in.**

> Preview. Initiated. Executed. Real events.

**The receipt prints and the product picture takes a YOURS stamp.**

> Fifty dollars in USDC, on Ethereum, from Coinbase, to our address.

### 8. Paid is not settled (1 minute)

**Point at the status on the receipt. It says Paid.**

> This part shows the difference between a demo and a payment system.

> It says paid, not settled.
> What happened is that the customer's browser told us the exchange acknowledged the withdrawal.
> That message ran on their machine. It can be lost, it can be forged, and exchanges can fail a transfer hours later.

**Wait. Six to thirty-four seconds. It flips to Settled.**

> Now it's flipped.
> That changed because a webhook arrived from Mesh, signature verified, server side.
> It is the only thing in this system allowed to say you have been paid.
> Never let the browser mark an order paid.

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

The panel's Demo tab has two resets and they do different things. **Start the next order** keeps the
account connected, the bag and the delivery address, so a second run skips the sign-in. That is the
one for between takes. **Forget everything** drops the connection, the address and the bag, so the
next run is a genuine first visit with the sign-in back in it. That is the one to press before you
show someone new, because the connect step is a third of the story and a warm session hides it.

---

**If they ask about the Bitcoin, and someone always does:**

> Fair question, and the accurate answer is more interesting than the salesy one. 
> Mesh has a feature> called SmartFunding that converts one holding to fund a payment in another. 
> It is in the API and in the docs. 
> So in principle your customer could hold only Bitcoin and still pay you in USDC.

> From what I could see, conversions are switched off for this sandbox client 
> I connected an account holding five Bitcoin and no stablecoin at all,
> asked Mesh what could fund a fifty dollar USDC payment, and got an empty list. 
> It returned bitcoin as ineligible
> Every response carries a field reading `transferBalanceFundingAvailability: disabled`.

> `MESH-NOTES.md` has the response bodies if you want them.

**Back to the main thread. Select USDC and point at the small grey line that appears under it:
"Funded from your balance, then from your buying power, then from a payment method on file."**

> That line is Mesh answering a specific question we asked about this specific account: if this
> customer pays you fifty dollars in USDC, where does the money actually come from? It has given us
> the order it would try. Balance first. If the balance falls short, buying power. If that falls
> short, a card they have on file at the exchange.

> The obvious way to build a checkout like this is to read the balance, compare it to the price, and
> show a tick or a cross. That is wrong three ways over. It misses the exchange's own minimum
> withdrawal, it misses the fees that come off the top, and it would tell a customer with forty
> dollars of USDC that they cannot buy this, when Mesh can see they have a card on file and would
> complete the payment perfectly well.

> So we do not do the arithmetic. We ask Mesh once per asset we accept, and print the answer.

**Point at the struck-through line under Paying from: Copy a wallet address, Withdraw from your
exchange, Swap or move funds, Work out what we accept.**

> And this is the product. Four things your customer would normally have to do to pay you from an
> exchange balance, none of which happened. Mesh is not a wallet connect button. It is the layer that
> makes those four disappear.


## The questions you will get

### "What actually happens when I press Pay?"

Ask this of yourself before anyone asks you, because every other answer here depends on it.

**Everything is real except the money movement.**

Our server mints a link token carrying the amount, asset, network and destination. Mesh Link opens on
the connected account, quotes the exchange's fees, previews the transfer and takes the MFA code. Mesh
writes a transfer into its own ledger, marks it succeeded and generates a transaction hash. It then
posts a signed webhook to our server, which verifies the HMAC and flips the order to settled.

All of that is genuine. Real API calls, real Mesh records, a real webhook with a real signature, a
real state change on our side. The events driving the payment trace on screen actually fired.

What does not happen is the last inch. No blockchain is touched. The simulated Coinbase decrements a
simulated balance, which is why the sandbox pot drains at about $50 a run and is shared with every
other Mesh sandbox user in the world.

So the hash is not on any chain. We checked it against Ethereum mainnet, Sepolia and Base and found
it on none of them, which is why the receipt shows it as a reference and does not link to an
explorer. Adding an explorer link would have been the easy dishonest choice.

The useful way to put this to a merchant: you are seeing the whole integration exercised except the
settlement onto a chain, and that last step is the part a merchant would never see anyway. What they
would see is the webhook, and the webhook is real.

### "Can my customer choose to pay in Bitcoin?"

No, and there are two reasons. Only one of them is a switch.

Mesh's link token has no field for the funding asset, so a merchant cannot offer that choice at all.
Mesh decides at payment time.

And on this sandbox client Mesh never converts, because conversion is switched off for us. Connect
`MeshBTC`, which held 5 BTC and no stablecoin, ask Mesh what can fund a $50 USDC payment, and it
returns an empty list. Ask it about a BTC destination in the same minute and the BTC comes back
eligible. Every response carries `transferBalanceFundingAvailability: disabled`.

Say that plainly rather than talking around it. "We tested it, here is the response body, here is the
question we have put to Mesh" is a better answer than a hedge. `MESH-NOTES.md` has the full run.

### "Why can't I pay with MetaMask?"

Because we are pointed at a sandbox, and a sandbox must not be able to touch anything real. The
testnet business below is the mechanism, not the reason.

**The mechanism.** Our address is on Ethereum, chainId 1. Here is what each integration can reach,
live from Mesh:

```
MetaMask   Sepolia (11155111), Base Sepolia (84532)
Phantom    Sepolia, Base Sepolia, Solana Devnet
Rainbow    Sepolia
Coinbase   Ethereum (1), Polygon, Solana, Base, Bitcoin, + 12 more
Binance    Ethereum (1), BSC, Solana, + 19 more
```

The wallets have no route to chainId 1, so no transfer is possible. Not a policy, the sets do not
intersect. Those testnets do carry USDC, but Sepolia USDC is a different contract on a different
chain and cannot arrive at a mainnet address.

**Why the difference exists**, and this is the part worth having ready. Mesh can simulate an
exchange, because an exchange is just a server it talks to. It runs a fake Coinbase with a fake
login, a shared fake balance and fake transfers, and because the whole thing is fiction it can
happily claim to sit on mainnet.

It cannot simulate your wallet. MetaMask is really installed in your browser, really holds your keys,
and its balance can only be learned by reading a real chain. A mainnet transfer from it would need
your signature and would move your actual money, which is the one thing a sandbox must never do. So
self-custody wallets are confined to test networks, where nothing valuable can move.

**Someone will say "but my MetaMask has real mainnet USDC in it".** They are right that the payment
itself is unremarkable, and in production it works: swap our sandbox keys for production keys and
MetaMask appears on mainnet alongside everything else. They should still not try it here. The
destination `0x0Ff0000f0A0f0000F0F000000000ffFf00f0F0f0` is a placeholder from the exercise brief and
nobody holds its keys. Sandbox money going there is fine because it never moves. Real money going
there is gone permanently.

**One thing we have not verified**, and do not claim in a room. Whether a wallet transfer in Mesh's
sandbox produces a genuine transaction on Sepolia, or is simulated the same way the exchange side is,
we do not know. The evidence points at simulated: the hashes this sandbox returns were checked
against Sepolia among others and were not there. To settle it, point `MERCHANT_NETWORK_ID` at
Sepolia, connect a MetaMask holding Sepolia USDC, pay, and look the hash up on sepolia.etherscan.io.
Twenty minutes and a wallet with testnet funds.

### "What does it cost the merchant?"

`clientFee` is wired up and tested and ships at zero. Set it to 2 and Mesh charges $52 at source and
delivers $50 to the destination. It is off because a shop advertising $50 and charging $52 is either
lying in the headline or dripping the fee at the last step, and the second one is now unlawful in the
UK.

### "How much of this is mocked?"

Card and Apple Pay, and they say so. The blockchain settlement, as above. Everything else is a real
Mesh call against the sandbox. No failure is simulated, no success state is faked, and every row in
the payment trace is stamped by an event that actually arrived.

### "How long would this take us to build?"

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
