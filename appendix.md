## Creative direction rules

1. Do not default to the usual AI-generated SaaS aesthetic.

No giant gradient hero
No three-column feature grid
No purple/blue glow
No “trusted by” logo strip
No glassmorphism
No generic dashboard cards everywhere
No fake metrics
No oversized rounded rectangles for every surface

2. The app should feel like a real product with a point of view.

Pick a visual concept and commit to it.

Possible directions:

Premium sneaker boutique
Editorial fashion checkout
Minimal luxury retail
Retro-futurist commerce
High-end product launch page
Streetwear drop experience

3. Treat the $50 shoe purchase as a deliberate product moment.

The shoe should feel like something the user actually wants to buy.

Give it:

A proper product name
Good imagery
A short description
Size selector if useful
Clear price
A strong checkout moment

Avoid making it look like a developer test disguised as a store.

4. Make Mesh feel invisible until it matters.

The customer should experience:

Choose shoe
Pay
Connect Coinbase
Approve
Done

Do not plaster “Mesh API”, “Mesh Link” and “Web3 infrastructure” across the consumer UI.

Mesh is infrastructure.

The consumer should mainly see a clean payment experience.

5. Reveal the technical sophistication progressively.

The main UI should be simple.

Then include something like:

`Behind the payment`

or

`See what happened`

which opens a technical view showing:

Coinbase connected
Portfolio read
Funding option selected
Transfer preview created
USDC
Ethereum
Destination
Transaction state

This gives the demo two layers:

Consumer story
Technical story

6. Make the transaction lifecycle visually interesting.

Do not use a boring spinner for 20 seconds.

Consider a compact animated sequence:

```text
Coinbase
   ↓
USDC found
   ↓
Payment authorised
   ↓
Ethereum
   ↓
Merchant paid
```

Or a horizontal route:

```text
Coinbase → Mesh → Ethereum → Merchant
```

Only show stages we can genuinely infer from Mesh events.

7. Use real event data to drive the animation.

Do not fake progress.

If `integrationConnected` fires, update the connection state.

If `transferPreviewed` fires, show the preview.

If `transferExecuted` fires, show execution.

The interface should visibly react to the actual SDK lifecycle.

8. Make failure states part of the design.

Most demos only design success.

Create useful failure states for:

Coinbase unavailable
No eligible assets
Authentication failed
Payment declined
Transfer failed

They should look intentional rather than like raw error messages.

9. Add one playful easter egg.

Something subtle.

Examples:

A tiny “payment route” diagram appears when clicking the receipt
Shoe box opens when payment completes
Receipt prints down the screen
Transaction success changes the product state to “Yours”
A small confetti burst, but only once

Nothing gimmicky enough to distract from the product.

10. Make the portfolio useful, not just a table.

Instead of:

```text
BTC 1.2
ETH 3.4
USDC 500
```

consider:

```text
Your Coinbase wallet

$8,420 total

USDC      $740
ETH       $4,180
BTC       $3,500
```

Then connect that directly to commerce:

`$50 available to spend`

or

`You can pay for this with USDC`

Only if supported by the returned data.

11. Create a satisfying receipt.

After payment, show a proper receipt:

```text
ORDER #MESH-042

Orbit Runner 01
$50.00

Paid with
USDC

Network
Ethereum

From
Coinbase

Status
Confirmed
```

Then let the user expand:

`View transaction details`

12. Give the app a name.

Do not call it:

Mesh Demo
Crypto Checkout
Web3 Store

Give the fictional product an identity.

Some directions:

OFFSET
SIDECHAIN
FOUND
LACE
DROP/50
SOLE
ROUTE
PAYLOAD

Claude should propose at least ten names before settling on one.

13. Typography should carry more of the design than decoration.

Use:

Strong spacing
Large editorial product typography
Clear hierarchy
Minimal borders
Few colours

Do not solve every design problem with a card.

14. Keep the palette restrained.

One dominant neutral palette plus one accent.

For example:

Black / off-white / safety orange
Cream / dark navy / electric blue
White / graphite / acid green

Avoid the standard crypto neon gradient.

15. Make desktop presentation excellent.

This will likely be shown on a laptop screen.

Design deliberately for something around:

1440 × 900

Mobile should still work, but do not compromise the desktop demo to make everything mobile-first.

16. Build one “wow” moment, not ten.

The best candidate is probably:

**The payment route becomes visible after Coinbase connects.**

Example:

```text
YOU HAVE
Coinbase
$740 USDC

        ↓

PAY
$50 USDC

        ↓

MERCHANT RECEIVES
USDC
Ethereum
```

Then pressing Pay launches Link.

Simple, clear and memorable.

17. Avoid fake blockchain theatre.

No spinning cubes
No 3D Ethereum logos
No matrix backgrounds
No wallet-address rain
No “decentralised future” copy

The sophistication should come from making crypto feel normal.

18. Use copy that normal people understand.

Bad:

`Initiate on-chain asset transfer`

Better:

`Pay $50`

Bad:

`Connect custodial exchange`

Better:

`Continue with Coinbase`

Bad:

`Transfer execution complete`

Better:

`Payment complete`

Technical terminology can live in the developer view.

19. Add a hidden presentation mode if useful.

For example:

`?demo=true`

could enable:

Cleaner console/event panel
Reset controls
Faster navigation back to the starting state
Developer details

Do not create mocked success states that misrepresent the real integration.

20. The end result should make someone think:

> “This could actually be a product.”

Not:

> “Someone completed an API tutorial.”
