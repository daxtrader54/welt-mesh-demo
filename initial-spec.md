# Mesh Integration Demo App

## Context

I want to build a polished, production-style demonstration application using the Mesh Sandbox APIs and Mesh Link SDK.

This should not feel like a throwaway API example or developer sandbox. The finished application should look and behave like a plausible real consumer-facing product that happens to use Mesh underneath.

The goal is to demonstrate:

1. A clear real-world use case for Mesh
2. Correct implementation of the Mesh API and Web Link SDK
3. Secure separation between frontend and backend responsibilities
4. Good handling of the complete user journey rather than only the happy path
5. Useful transaction and integration telemetry
6. Clear, readable code and documentation
7. An application that can be deployed publicly to Vercel
8. Enough product thinking that the application demonstrates why Mesh is useful, rather than simply proving an API call works

I would prefer Next.js with TypeScript unless you identify a strong technical reason to use another stack.

The app must be deployable to Vercel.

---

# Important Working Method

Do not immediately start implementing.

First, interview me to define the complete product and technical requirements.

Ask me questions in sensible groups and challenge weak assumptions.

I want us to agree the product before writing application code.

You should specifically interview me about:

1. Product concept and target user
2. User journey
3. Visual style
4. What should be visible before connecting Mesh
5. Coinbase connection UX
6. Payment UX
7. Portfolio UX
8. Transaction success UX
9. Failure/error UX
10. Developer/debug information we should expose
11. Creative functionality beyond the minimum requirements
12. Backend architecture
13. Data persistence
14. Webhook handling
15. Authentication, if any
16. Environment variables
17. Sandbox behaviour
18. Vercel deployment
19. Documentation
20. Demo/presentation mode
21. Scope and what we explicitly should NOT build

For decisions where I have no strong preference, make a recommendation and explain why.

Once requirements are agreed, create a short implementation plan before coding.

---

# Core Integration Requirements

The application must use Mesh Sandbox and function end to end.

## Mesh Link

Integrate the official Mesh Web Link SDK:

`@meshconnect/web-link-sdk`

Understand the current implementation from the official repository and documentation rather than relying on assumptions.

The Link session should be created using a Link Token generated server-side.

Mesh API credentials must never be exposed in browser code.

The frontend should receive only the Link Token and other data safe for the client.

Use the current Mesh documentation as authoritative where older examples conflict with it.

---

# Coinbase Connection

The application must allow a user to launch Mesh Link and connect a Coinbase Sandbox account.

Sandbox MFA code:

`123456`

The application should respond appropriately to Mesh Link lifecycle events.

At minimum, understand and consider handling:

`pageLoaded`

`integrationSelected`

`integrationOAuthStarted`

`integrationMfaRequired`

`integrationConnected`

`transferStarted`

`transferAssetSelected`

`transferNetworkSelected`

`transferPreviewed`

`transferInitiated`

`transferExecuted`

`transferCompleted`

and relevant error states such as:

`integrationConnectionError`

`connectionUnavailable`

`connectionDeclined`

`transferNoEligibleAssets`

`transferPreviewError`

`transferExecutionError`

`transferDeclined`

Do not implement pointless handling for every event purely for completeness.

Instead decide which events improve:

1. User experience
2. Application state
3. Troubleshooting
4. Demo visibility

---

# Required Payment Flow

The application must provide a genuine Mesh payment flow.

The user is purchasing:

**A $50 pair of shoes**

Payment requirements:

Amount:

`$50`

Payment asset:

`USDC`

Source:

`Coinbase`

Destination network:

`Ethereum`

Destination wallet:

`0x0Ff0000f0A0f0000F0F000000000ffFf00f0F0f0`

Mesh Link should handle the payment interaction.

Sandbox transfer MFA code:

`123456`

The UI should make it clear:

1. What is being purchased
2. Price
3. Payment method
4. Asset
5. Network
6. Transaction status
7. Successful completion

I do not want the UI to feel like a raw API client.

It should feel like a believable checkout experience.

---

# Portfolio Requirement

After connecting Coinbase, use the Mesh-issued access token to make the appropriate Mesh API calls and retrieve the Coinbase portfolio.

Display the portfolio clearly in the application.

Possible useful information includes:

1. Asset
2. Symbol
3. Balance
4. Fiat value
5. Available balance if applicable
6. Total portfolio value

Do not invent fields that the Mesh API does not actually provide.

The interface should make it immediately obvious that Mesh has allowed the application to connect to a held-away Coinbase account and understand what the user owns.

This is important because it demonstrates Mesh's wider value beyond simply triggering a payment.

---

# Product Concept

The required example involves buying a pair of shoes.

However, I do not necessarily want this to look like a generic ecommerce tutorial.

During requirements discovery, help me decide whether the best framing is:

### Option A: Premium sneaker store

A polished ecommerce product where someone buys a limited-edition pair of shoes using assets held on Coinbase.

This maps directly onto the required transaction.

### Option B: Crypto-native commerce concept

A modern commerce application showing how a user can pay directly from assets held elsewhere without manually transferring, swapping or bridging crypto first.

### Option C: Another creative concept

Suggest something better if it still naturally supports the required $50 shoe payment.

The product concept must not obscure the core Mesh integration.

---

# Product Story We Should Demonstrate

The user journey should communicate this concept clearly:

A user already owns digital assets elsewhere.

They should not need to:

1. Copy wallet addresses
2. Manually withdraw assets
3. Move funds between wallets
4. Work out what the merchant accepts
5. Understand every underlying payment rail

Instead:

User selects product

→ chooses Pay with Crypto / Mesh

→ connects Coinbase

→ sees relevant holdings

→ Mesh presents the transaction

→ user approves

→ payment completes

→ merchant receives the configured outcome

The experience should demonstrate that Mesh acts as an abstraction/orchestration layer rather than merely another wallet connection button.

---

# Developer / Integration View

I am considering including an optional panel such as:

**View Integration Details**

This could show selected Mesh lifecycle information without exposing secrets.

For example:

Link session started

Coinbase selected

Authentication completed

Portfolio loaded

Transfer preview created

Transfer initiated

Transfer completed

Transaction ID

Transfer ID

Transaction hash

Network

Asset

Destination address

This should be visually secondary to the consumer application.

The main application should remain clean.

The developer view exists to make the underlying integration understandable.

Please discuss whether this is worth including during requirements discovery.

---

# Failure Modes

Treat failure handling as an important part of the build.

Think specifically about:

1. Failure to create a Link Token
2. Mesh Link failing to load
3. User closing Link
4. Coinbase authentication failure
5. MFA failure
6. No eligible assets
7. Portfolio retrieval failure
8. Transfer preview failure
9. Transfer execution failure
10. Network/API failure
11. Expired Link Token
12. Duplicate actions caused by clicking buttons repeatedly
13. User refreshing mid-flow
14. Mesh API timeout
15. Invalid or missing environment configuration

Errors should be useful.

Avoid generic:

`Something went wrong`

where we have enough information to give the user or developer a more meaningful state.

---

# Server-Side Architecture

Use server-side Next.js functionality for Mesh API operations requiring secrets.

Likely architecture:

Browser

→ Next.js application

→ server API route / server action

→ Mesh Sandbox API

The Mesh client secret must only exist server-side.

Potential routes may include concepts such as:

`/api/mesh/link-token`

`/api/mesh/portfolio`

`/api/mesh/webhook`

Do not commit to these names until we understand the actual Mesh API interactions required.

Prefer simple explicit architecture over unnecessary abstraction.

---

# Webhooks

Research whether the payment flow used in this application exposes the appropriate Mesh webhook states in Sandbox.

If useful and practical, implement webhook reception.

Important considerations:

1. Verify Mesh webhook signatures correctly
2. Use the raw HTTP request body where required for HMAC validation
3. Treat webhook delivery as at-least-once
4. Implement idempotency using the appropriate Mesh event identifier
5. Do not treat frontend callbacks as the authoritative settlement mechanism if Mesh documentation says server-side events should be used

However, do not add webhook infrastructure purely to make the project appear more complicated.

During requirements discovery, tell me whether it materially improves this demonstration.

---

# Application State

We need to decide whether persistence is necessary.

Options might include:

1. React/local browser state only
2. Lightweight persistence
3. Vercel-compatible database

My current preference is to avoid adding a database unless the functionality genuinely benefits from one.

If transaction history or webhook idempotency makes persistence worthwhile, explain the simplest suitable option.

Do not introduce infrastructure simply for architecture theatre.

---

# Security

Follow good practices.

At minimum:

1. Mesh secret remains server-side
2. Environment variables are used correctly
3. Secrets are not committed
4. Sensitive access tokens should not be printed to the UI or logs without a clear reason
5. Avoid leaking full authentication payloads
6. Validate server request inputs
7. Avoid trusting browser-reported payment success for sensitive business state
8. Avoid XSS through raw event/error payloads
9. Do not store more customer data than necessary

Document the important security decisions.

---

# UI / Design

The finished product should look polished and intentionally designed.

Avoid:

1. Generic Bootstrap dashboard
2. Developer-tool aesthetic for the main experience
3. Huge gradients everywhere
4. Crypto clichés
5. Excessive Web3 language
6. Dense technical information presented to ordinary users
7. Fake functionality

Prefer:

1. Minimal ecommerce UI
2. Strong product imagery
3. Clear typography
4. Obvious checkout CTA
5. Simple transaction progress
6. Good responsive behaviour
7. Subtle technical details available on demand

Mobile should work, although desktop presentation is likely the primary experience.

---

# Creative / Bonus Features

The brief explicitly allows creativity beyond the core flow.

During requirements discovery, propose useful additions ranked by:

Impact

vs

Implementation effort

Potential ideas:

### Transaction timeline

Show how the Mesh payment progresses through its lifecycle.

### Portfolio-aware UX

Once Coinbase is connected, show the user's holdings and indicate how their portfolio could fund purchases.

### Payment receipt

Produce a clean receipt after successful payment with:

Product

Amount

Asset

Network

Destination

Transaction ID

Transaction hash where available

### Explorer link

Where technically appropriate in Sandbox/testnet, provide a link to inspect the blockchain transaction.

### Connectivity / architecture view

A simple optional diagram showing:

Customer

→ Mesh

→ Coinbase

→ Ethereum

→ Merchant

### Integration diagnostics

A developer drawer showing key Mesh events and states.

### Another Mesh use case

If there is a small, high-value additional flow that demonstrates Mesh particularly well, propose it.

Do not build features simply for bonus points.

One thoughtful addition is better than five half-finished ones.

---

# Demo Reliability

This application may need to be demonstrated live.

Therefore prioritise reliability.

We should have:

1. Clear loading states
2. Retry behaviour where safe
3. Reset demo/session button if useful
4. Graceful failure states
5. Predictable sandbox behaviour
6. Useful diagnostics
7. No dependence on unnecessary third-party services
8. No fragile animation or state transitions
9. A clean way to start the demo from the beginning

Consider having a lightweight "Reset demo" capability if useful.

---

# Documentation

Documentation quality matters.

Create a strong README covering:

## What the application does

Brief product overview.

## Architecture

Explain the major frontend/server/Mesh boundaries.

## Mesh integration

Explain:

Link Token

Mesh Link SDK

Coinbase connection

Portfolio API

Payment flow

callbacks/events

webhooks if implemented

## Local setup

Dependencies

environment variables

development command

## Sandbox usage

Any required Coinbase Sandbox credentials and MFA behaviour, where appropriate and safe to document.

## Deployment

Vercel deployment instructions.

## Technical decisions

Important tradeoffs and reasons.

## Security

How secrets and tokens are handled.

## Failure handling

Important failure cases considered.

## Future improvements

Things intentionally excluded from scope.

---

# Code Quality

Prefer straightforward code over unnecessary patterns.

Use:

TypeScript

clear types

small understandable components

server/client separation

good error handling

meaningful naming

comments only where they explain non-obvious decisions

Avoid:

premature generic abstractions

enterprise-style architecture for a small app

massive component libraries

huge state-management dependencies unless justified

hundreds of lines of generated boilerplate

---

# Testing

During requirements discovery, recommend an appropriate level of automated testing.

At minimum I expect important pure logic and server-side behaviour to be testable.

Do not spend disproportionate effort creating a huge test suite.

Prioritise tests around areas where a regression would matter.

---

# Vercel

The final application should deploy to Vercel.

Think through:

1. Environment variables
2. Serverless/API route compatibility
3. Webhook endpoints if used
4. HTTPS
5. Mesh domain/origin requirements
6. Sandbox configuration
7. Build command
8. Node runtime requirements from the Mesh SDK
9. Any limitations introduced by Vercel serverless functions

Do not assume something works on Vercel simply because it works locally.

---

# Mesh Documentation

Use the current official Mesh material heavily.

Key sources include:

Mesh API documentation

Mesh full docs / llms-full.txt

Mesh Dashboard

Mesh Workshop

Mesh Web SDK repository

Mesh Interactive Demo

When docs and SDK examples disagree, inspect the current implementation and determine which behaviour is current.

Do not invent endpoint payloads.

Do not guess network IDs, token IDs, webhook formats or response structures.

Verify them against Mesh documentation before implementation.

---

# Exact Required Demo Transaction

Keep this visible in our implementation plan.

Product:

Pair of shoes

Price:

$50

Funding provider:

Coinbase

Payment token:

USDC

Destination network:

Ethereum

Destination:

`0x0Ff0000f0A0f0000F0F000000000ffFf00f0F0f0`

Sandbox MFA:

`123456`

This transaction must work end to end using Mesh Sandbox and Link UI.

---

# Portfolio Requirement

The app must also:

Connect Coinbase

Obtain the Mesh access token

Use the access token in appropriate Mesh API calls

Retrieve the Coinbase portfolio

Display the portfolio inside the application

This is a first-class requirement, not an optional extra.

---

# Initial Technical Recommendation

My starting preference is:

Next.js current stable version

TypeScript

App Router

React

Vercel

Official Mesh Web Link SDK

Minimal dependency set

Server-side API routes / route handlers for Mesh APIs

No database initially unless justified

Clean custom UI

Use an image asset for the shoes rather than spending significant effort creating product catalogue functionality

You should challenge any of these choices where there is a strong reason.

---

# What I Need From You First

Before touching application code:

## Phase 1

Read this brief fully.

## Phase 2

Review the relevant Mesh documentation and SDK architecture.

## Phase 3

Interview me on the outstanding product and technical requirements.

Do not ask trivial questions where the answer is already in this brief.

Focus on decisions that materially affect what we build.

## Phase 4

After the interview, produce:

1. Final agreed product specification
2. User journeys
3. Architecture
4. Mesh API/SDK interactions required
5. Component/page structure
6. State model
7. Error model
8. Security considerations
9. Testing approach
10. Deployment approach
11. Ordered implementation plan
12. Explicit out-of-scope list

Wait for me to approve that plan before starting implementation.

The objective is a small, polished, technically correct application with a clear product story, not the largest possible application.
