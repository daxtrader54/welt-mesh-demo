'use client'

import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import Image from 'next/image'
import type { LinkEventType, LinkPayload, TransferFinishedPayload } from '@meshconnect/web-link-sdk'
import { failure, type Failure } from '@/lib/failure'
import { usd } from '@/lib/format'
import { chargedTotal, describeExitPage, initialOrderState, reduceOrder } from '@/lib/order/state'
import {
  BRAND,
  DEFAULT_COLOURWAY,
  HANDLING_FEE,
  PRODUCT,
  SPEC,
  colourway as findColourway,
  plateSrc,
  type ColourwayId,
  type PlateId
} from '@/lib/product'
import { AddedToBag, BagView, type BagItem } from './Bag'
import { ColourwayPicker, PriceBlock, SizePicker } from './Checkout'
import {
  DeliveryForm,
  DeliverySummary,
  EMPTY_ADDRESS,
  isComplete,
  type Address
} from './Delivery'
import { FundingNote } from './FundingPicker'
import { FailureNotice, Footer, SandboxNotice } from './Notices'
import { FundingSource, Manifest, type Funding } from './PaymentRoute'
import { Portfolio, type Position, type Quote } from './Portfolio'
import { PretendPaymentModal } from './PretendPayment'
import { ProductPlate } from './ProductPlate'
import { ProductPanels } from './Reviews'
import { ShopFront } from './ShopFront'
import { Receipt } from './Receipt'
import {
  ConsoleBar,
  PanelHandle,
  TechnicalView,
  type ConnectionSummary,
  type ServerCall
} from './TechnicalView'
import { LINK_FRAME_ID, preloadMeshLink, useMeshLink } from './useMeshLink'

/**
 * The shop: product, bag, checkout, confirmation.
 *
 * The funnel is deliberate. A pay button on the product page is not how anyone buys shoes, and the
 * payment method belongs at checkout, after the bag, which is where a customer expects to choose
 * it. It costs three clicks before Mesh appears and buys the thing the demo depends on, which is
 * that this reads as a shop rather than an integration with a photograph attached.
 *
 * Two Link sessions inside that. The first connects and stops, which is the only way to read
 * holdings before asking anyone to pay. The second carries the payment, and whichever account
 * actually funds it comes back on `transferPreviewed` and ends up on the receipt.
 */

type Step = 'shop' | 'product' | 'bag' | 'delivery' | 'checkout' | 'done'

export function Shop({ panelOpenByDefault }: { panelOpenByDefault: boolean }) {
  const [step, setStep] = useState<Step>('shop')
  const [colourwayId, setColourwayId] = useState<ColourwayId>(DEFAULT_COLOURWAY)
  const [plate, setPlate] = useState<PlateId>('lateral')
  const [size, setSize] = useState<string | null>(null)
  const [bag, setBag] = useState<BagItem | null>(null)
  /** Kept after the bag is emptied, so the confirmation still has something to show. */
  const [purchased, setPurchased] = useState<BagItem | null>(null)
  const [justAdded, setJustAdded] = useState(false)
  const [pretend, setPretend] = useState<'card' | 'applePay' | null>(null)
  const [sizeNudge, setSizeNudge] = useState(false)

  const [order, dispatch] = useReducer(reduceOrder, undefined, initialOrderState)
  const [funding, setFunding] = useState<Funding | null>(null)
  const [connection, setConnection] = useState<ConnectionSummary | null>(null)
  /**
   * The Mesh integration the shopper chose. Captured from the connect session's exit summary and
   * replayed into the payment session, so the picker appears once in a checkout rather than twice.
   */
  const [pickedIntegrationId, setPickedIntegrationId] = useState<string | null>(null)
  const [orderId, setOrderId] = useState<string | null>(null)
  /** The short label on the receipt. The id itself is a UUID and never shown. */
  const [orderRef, setOrderRef] = useState<string | null>(null)
  const [calls, setCalls] = useState<ServerCall[]>([])
  // Collapsed to start: the shop should get to be a shop before the demo announces itself.
  // ?demo=1 opens it docked for presenting.
  const [panelOpen, setPanelOpen] = useState(panelOpenByDefault)
  const [drawer, setDrawer] = useState(false)
  /** True while Mesh Link is on screen, so the checkout makes room for it. */
  const [linkOpen, setLinkOpen] = useState(false)
  /**
   * An account is connected. Deliberately separate from `funding`: a failed balance read is not
   * fatal, and gating the pay button on the portfolio meant a shopper who connected successfully
   * but whose holdings could not be read was returned to the connect screen with no explanation
   * and no way forward.
   */
  /**
   * Name and address. Client side only, and deliberately: nothing ships, so collecting real
   * postal addresses on a public demo would be storing personal data for no reason. See
   * components/Delivery.tsx.
   */
  const [address, setAddress] = useState<Address>(EMPTY_ADDRESS)
  /**
   * The provider the checkout opens Link on by default, from the live catalogue. Never hardcoded:
   * the server picks the top usable entry and this just carries it.
   */
  const [suggested, setSuggested] = useState<{ id: string; name: string } | null>(null)
  const [hasConnection, setHasConnection] = useState(false)
  /**
   * Whether the shopper has chosen the crypto route in *this* checkout.
   *
   * Separate from `hasConnection` on purpose. A connection survives a reset, so on a second visit
   * a token already exists, and treating that as "connected" dropped the returning shopper
   * straight into a crypto-only checkout with the card and Apple Pay options gone. Holding a token
   * is not the same as having picked how to pay.
   */
  const [choseCrypto, setChoseCrypto] = useState(false)
  /** The whole account, not just the line that pays. The brief calls this first-class. */
  const [positions, setPositions] = useState<Position[]>([])
  const [cryptoValue, setCryptoValue] = useState<number | null>(null)
  /** Mesh's per-asset answer on what can actually pay. Null until it has been asked. */
  const [quotes, setQuotes] = useState<Quote[] | null>(null)
  /** Which asset the shopper picked. Decides the single destination sent to Mesh. */
  const [asset, setAsset] = useState<string | null>(null)

  const colourway = findColourway(colourwayId)
  /** True when what is on screen is exactly what is already in the bag. */
  const inBag = Boolean(bag && bag.colourway.id === colourwayId && bag.size === size)

  /**
   * The "Paying from" panel has to follow the asset the shopper picked.
   *
   * The server works out the settlement position for the merchant's default, USDC, because that is
   * what it settles in when nobody chooses. Picking PYUSD then left the panel reading 9,347.87
   * USDC and "Enough USDC to cover this order" directly above a row saying the merchant receives
   * PYUSD: three numbers describing two different payments.
   *
   * Coverage comes from Mesh's quote where it answered, and falls back to the balance only when it
   * did not, which keeps the eligibility story honest rather than quietly reverting to arithmetic.
   */
  const payingWith = asset ?? PRODUCT.settlement.symbol
  const activeFunding: Funding | null = funding && {
    ...funding,
    settlement:
      funding.settlement?.symbol === payingWith
        ? funding.settlement
        : (() => {
            const held = positions.find(p => p.symbol === payingWith)
            if (!held) return null
            const quoted = quotes?.find(q => q.symbol === payingWith)?.eligible
            return {
              symbol: payingWith,
              amount: held.amount,
              marketValue: held.marketValue ?? null,
              covers: quoted ?? held.amount >= PRODUCT.price
            }
          })()
  }
  const orderIdRef = useRef<string | null>(null)
  orderIdRef.current = orderId
  /** Whether the Link session now open was handed a stored Mesh token id. See the reducer. */
  const reusedTokensRef = useRef(false)

  const note = useCallback((route: string, mesh: string | null, ms: number | null, ok: boolean) => {
    setCalls(prev => [...prev, { at: Date.now(), route, mesh, ms, ok }])
  }, [])

  const fail = useCallback((f: Failure) => dispatch({ type: 'failed', at: Date.now(), failure: f }), [])

  /**
   * Throw away a connection Mesh will not accept, on the page and on the server.
   *
   * Two paths report the same dead token and both end here. The holdings call returns
   * `connection_expired`, and Link raises `transferConfigureError` carrying "Please login again to
   * continue." inside a payment session. The portfolio route has already dropped it server side in
   * the first case, which makes the DELETE a no-op there rather than a second code path.
   *
   * Clearing `choseCrypto` is what puts the shopper back on the payment options, where the connect
   * button and the full catalogue link live. Leaving it set kept them on a crypto-only screen whose
   * only control was "Continue anyway", which is the dead end this exists to prevent.
   */
  const forgetConnection = useCallback(async () => {
    setConnection(null)
    setHasConnection(false)
    setChoseCrypto(false)
    setFunding(null)
    setPositions([])
    setQuotes([])
    setPickedIntegrationId(null)
    try {
      await fetch('/api/mesh/connection', { method: 'DELETE' })
    } catch {
      // Best effort. The shopper is already being sent back to connect again, and the next
      // successful connection replaces this one anyway.
    }
  }, [])

  /**
   * Read the connected account: holdings first, then Mesh's per-asset quotes.
   *
   * Its own function because two paths need it. A fresh connection calls it from
   * `onIntegrationConnected`. A returning shopper, whose connection survived the reset, calls it
   * when they pick the crypto route at checkout, because no SDK event fires for them. Without that
   * second caller the checkout sat on "Reading your account" forever, which is exactly what it
   * did.
   */
  const readPortfolio = useCallback(async () => {
    /**
     * A hung request has to end as a warning, not as a spinner nobody can get past. "Reading your
     * account" with no way forward is the worst state this checkout can be in, and it is the one
     * a stuck fetch produces.
     */
    const abort = new AbortController()
    const watchdog = setTimeout(() => abort.abort(), 20_000)
    try {
      const started = Date.now()
      const res = await fetch('/api/mesh/portfolio', { signal: abort.signal })
      const json = await res.json()
      note('GET /api/mesh/portfolio', 'POST /api/v1/holdings/get + /value', Date.now() - started, json.ok)

      if (!json.ok) {
        /**
         * An expired connection is not a warning, because "continue anyway" is not honest advice
         * once the server has thrown the token away. The shopper goes back to the payment options
         * with the connection forgotten, which puts the connect button and the full catalogue
         * link back on screen. Everything else stays a warning: the payment still works without
         * the portfolio, and that is worth saying rather than blocking on.
         */
        // The effect watching for `connection_expired` does the forgetting, wherever it is reported.
        if (json.error?.code === 'connection_expired') {
          dispatch({ type: 'failed', at: Date.now(), failure: json.error })
          return
        }
        dispatch({ type: 'holdings:failed', at: Date.now(), failure: json.error })
        return
      }

      setFunding({ provider: json.provider, accountName: json.accountName, settlement: json.settlement })
      setPositions(json.positions ?? [])
      setCryptoValue(json.cryptoValue ?? null)
      dispatch({
        type: 'holdings:done',
        at: Date.now(),
        institution: json.provider,
        usdc: json.settlement?.amount ?? null,
        positions: json.positions.length
      })

      // Behind the holdings, not in front of them: five Mesh calls should not stand between the
      // shopper and the first number on screen.
      void (async () => {
        const qStarted = Date.now()
        try {
          const qres = await fetch('/api/mesh/quotes')
          const qjson = await qres.json()
          note('GET /api/mesh/quotes', 'POST /api/v1/transfers/managed/quote', Date.now() - qStarted, qjson.ok)
          if (!qjson.ok) return setQuotes([])
          setQuotes(qjson.quotes)
          // Default to the first thing that can actually pay, preferring the settlement asset.
          const best =
            qjson.quotes.find((q: Quote) => q.eligible && q.primary) ??
            qjson.quotes.find((q: Quote) => q.eligible)
          if (best) setAsset(best.symbol)
        } catch {
          setQuotes([])
        }
      })()
    } catch (err) {
      const timedOut = err instanceof Error && err.name === 'AbortError'
      dispatch({
        type: 'holdings:failed',
        at: Date.now(),
        failure: failure('portfolio_failed', {
          detail: timedOut
            ? 'Reading the account took longer than 20 seconds and was given up on'
            : err instanceof Error
              ? err.message
              : String(err)
        })
      })
    } finally {
      clearTimeout(watchdog)
    }
  }, [note])

  /** Hand the auth token to the server, then read the portfolio with it. */
  const takeConnection = useCallback(
    async (payload: LinkPayload) => {
      const access = payload.accessToken
      const account = access?.accountTokens?.[0]
      if (!access || !account) return

      try {
        const res = await fetch('/api/mesh/connection', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            brokerType: access.brokerType,
            brokerName: access.brokerName,
            accountName: account.account?.accountName ?? null,
            authToken: account.accessToken,
            tokenId: account.tokenId ?? null,
            expiresInSeconds: access.expiresInSeconds ?? null
          })
        })
        const json = await res.json()
        note('POST /api/mesh/connection', null, null, json.ok)
        if (json.ok) {
          setConnection(json.connection)
          setHasConnection(true)
          setChoseCrypto(true)
        }
      } catch {
        // Not fatal on its own. The portfolio read below reports the real consequence.
      }

      await readPortfolio()
    },
    [note, readPortfolio]
  )

  const onTransferFinished = useCallback(
    async (payload: TransferFinishedPayload) => {
      /**
       * Mesh documents this payload as carrying pending, succeeded or failed. The SDK's published
       * type narrows it to 'success', which is wrong, so the value is read rather than assumed.
       * Shipping goods on a failed transfer is the one thing a payments demo must not model.
       */
      const status = String(payload.status ?? '').toLowerCase()
      if (status && status !== 'success' && status !== 'succeeded') {
        fail(
          failure(status === 'pending' ? 'execution_failed' : 'transfer_declined', {
            title:
              status === 'pending'
                ? 'Your payment is still being confirmed'
                : 'The payment did not complete',
            hint:
              status === 'pending'
                ? 'Your account has authorised it and the exchange has not finished. Nothing else is needed from you.'
                : undefined,
            detail: `Mesh reported transfer status "${payload.status}"`
          })
        )
        return
      }

      setStep('done')
      // The confirmation is the payoff and it renders below a photograph, so without this it can
      // land off screen at the exact moment it fires.
      window.scrollTo({ top: 0, behavior: 'smooth' })
      // The order is placed, so the bag is no longer holding anything. Leaving "Bag (1)" in the
      // header after a confirmed purchase is the detail that made it feel unfinished.
      setBag(current => {
        if (current) setPurchased(current)
        return null
      })
      const id = orderIdRef.current
      if (!id) return
      try {
        const res = await fetch(`/api/orders/${id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            status: 'paid',
            txId: payload.txId,
            transferId: payload.transferId,
            txHash: payload.txHash,
            totalAmountInFiat: payload.totalAmountInFiat
          })
        })
        note('PATCH /api/orders/:id', null, null, res.ok)
      } catch {
        // The receipt is already complete from the SDK payload. This write is for the server's own
        // record and for the webhook to reconcile against, so a failure here is not shown.
      }
    },
    [note]
  )

  const { open, busy } = useMeshLink({
    onEvent: event =>
      dispatch({
        type: 'link',
        at: Date.now(),
        event: event as LinkEventType,
        reusedTokens: reusedTokensRef.current
      }),
    onConnected: takeConnection,
    onTransferFinished,
    onExit: (error, summary) => {
      const page = summary?.page
      if (summary?.selectedIntegration?.id) setPickedIntegrationId(summary.selectedIntegration.id)
      // Closing on the success page is not a failure, it is the end of a completed payment.
      if (page === 'transferExecutedPage') return
      if (order.status === 'paid' || order.status === 'settled') return
      /**
       * A designed failure must survive the shopper closing Link, and they have to close it to get
       * back to the page. Without this guard every specific state - no eligible assets, declined,
       * preview failed - was overwritten by a generic "Payment cancelled" on the way out.
       */
      if (order.status === 'failed') return
      if (!error && (order.status === 'connected' || order.status === 'draft')) return

      const where = describeExitPage(page)
      fail(
        failure('abandoned', {
          title: where ? `Payment cancelled ${where}` : 'Payment cancelled',
          detail: error ?? `Closed on ${page ?? 'an unknown page'}`
        })
      )
    },
    onFailure: fail,
    onOpening: info => {
      note('POST /api/mesh/link-token', 'POST /api/v1/linktoken', info.ms, true)
      if (info.orderId) setOrderId(info.orderId)
      if (info.reference) setOrderRef(info.reference)
      // A ref, not state: the events that need it can arrive in the same tick as the open.
      reusedTokensRef.current = info.reusedTokens
    },
    onVisibilityChange: setLinkOpen
  })

  const addToBag = useCallback(() => {
    if (!size) {
      setSizeNudge(true)
      return
    }
    setBag({ colourway, size })
    setJustAdded(true)
  }, [colourway, size])

  /**
   * The crypto route at checkout.
   *
   * A returning shopper already has a token on file, so there is nothing to connect: this reads
   * their account and shows the portfolio without opening Link at all. A first-time shopper gets
   * the connect session. `force` skips the shortcut, which is how "use a different account" works.
   */
  const startConnect = useCallback(
    (force = false) => {
      setPretend(null)
      setChoseCrypto(true)
      if (connection && !force) {
        dispatch({ type: 'connect:reused', at: Date.now(), institution: connection.brokerName })
        void readPortfolio()
        return
      }
      dispatch({ type: 'connect:started', at: Date.now() })
      /**
       * Deep-linked to the suggested provider unless the shopper asked for the full catalogue.
       * Mesh's picker is the breadth argument and it stays one click away, but it is the wrong
       * default: a shopper who does not own crypto reads a list of self-custody wallets as a
       * question they cannot answer, and a tester did.
       */
      void open('connect', !force && suggested ? { integrationId: suggested.id } : undefined)
    },
    [open, connection, readPortfolio, suggested]
  )

  const startPayment = useCallback(
    (changeAccount = false) => {
      if (!bag) return
      dispatch({ type: 'pay:started', at: Date.now() })
      void open('pay', {
        colourway: bag.colourway.id,
        size: bag.size,
        ...(asset ? { asset } : {}),
        // Omitting this restores Mesh's picker, which is exactly what "change account" is for.
        ...(changeAccount || !pickedIntegrationId ? {} : { integrationId: pickedIntegrationId })
      })
    },
    [open, bag, pickedIntegrationId, asset]
  )

  /** Poll for the webhook. Bounded, because a sandbox that never sends one must not hang. */
  useEffect(() => {
    if (order.status !== 'paid' || !orderId) return
    let attempts = 0
    let cancelled = false

    const explain = async () => {
      try {
        const health = await fetch('/api/health').then(r => r.json())
        if (!health?.config?.optional?.webhookSecret) {
          return 'no webhook secret set on this deployment'
        }
        if (health?.storage !== 'redis') {
          return 'no shared store, so the webhook cannot reach this page'
        }
      } catch {
        // Health is a nicety here. If it is unreachable, fall through to the generic reason.
      }
      return 'nothing received yet; sandbox does not guarantee delivery'
    }

    const tick = async () => {
      if (cancelled) return
      if (attempts >= 12) {
        const reason = await explain()
        if (!cancelled) dispatch({ type: 'settlement:timeout', at: Date.now(), reason })
        return
      }
      attempts += 1
      try {
        const res = await fetch(`/api/orders/${orderId}`)
        const json = await res.json()
        if (json.ok && json.order?.status === 'settled') {
          dispatch({ type: 'settled', at: Date.now(), txHash: json.order.txHash })
          return
        }
      } catch {
        // Ignore. The next tick tries again, and the receipt is complete without this.
      }
      if (!cancelled) setTimeout(tick, 3000)
    }

    const timer = setTimeout(tick, 2000)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [order.status, orderId])

  const reset = useCallback(async () => {
    await fetch('/api/session/reset', { method: 'POST' }).catch(() => {})
    dispatch({ type: 'reset' })
    setStep('shop')
    setBag(null)
    setPurchased(null)
    setPickedIntegrationId(null)
    setFunding(null)
    setConnection(null)
    setOrderId(null)
    setOrderRef(null)
    setCalls([])
    setSize(null)
    setDrawer(false)
    setLinkOpen(false)
    // The account stays connected on purpose, which is what makes a second run fast. Only the
    // order and what was read for it are cleared, including the choice of how to pay, so the
    // next checkout offers card and Apple Pay again rather than assuming crypto.
    setChoseCrypto(false)
    setFunding(null)
    setPositions([])
    setCryptoValue(null)
    setQuotes(null)
    setAsset(null)
    window.scrollTo({ top: 0 })
  }, [])

  const goto = useCallback((next: Step) => {
    setStep(next)
    setJustAdded(false)
    // Navigating away unmounts the Link iframe, and nothing else clears this. Left set, every
    // content block on the checkout stays hidden and the column is blank until a page reload.
    setLinkOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  /**
   * The bag survives a refresh and dies with the tab. sessionStorage rather than localStorage on
   * purpose: a shop that remembers your bag next week is right for a shop and wrong for a demo
   * that should start clean every time someone opens it.
   */
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('welt_bag')
      if (saved) {
        const parsed = JSON.parse(saved) as { colourwayId: ColourwayId; size: string }
        setBag({ colourway: findColourway(parsed.colourwayId), size: parsed.size })
        setColourwayId(parsed.colourwayId)
        setSize(parsed.size)
      }
    } catch {
      // A malformed or blocked store just means an empty bag. Nothing to report.
    }
  }, [])

  useEffect(() => {
    try {
      if (bag) sessionStorage.setItem('welt_bag', JSON.stringify({ colourwayId: bag.colourway.id, size: bag.size }))
      else sessionStorage.removeItem('welt_bag')
    } catch {
      // Private browsing can refuse. The bag still works for this page view.
    }
  }, [bag])

  /**
   * The delivery address, same store and the same reasoning. It stays across a reset, like the
   * connection does, so a second run through does not mean typing an address again.
   */
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('welt_address')
      if (saved) setAddress({ ...EMPTY_ADDRESS, ...(JSON.parse(saved) as Partial<Address>) })
    } catch {
      // Nothing to recover. An empty form is the correct fallback.
    }
  }, [])

  useEffect(() => {
    try {
      if (isComplete(address)) sessionStorage.setItem('welt_address', JSON.stringify(address))
    } catch {
      // Private browsing can refuse. The address still works for this page view.
    }
  }, [address])

  /**
   * A connection survives a reset by design, so on a second run one already exists. Asking once on
   * load is what lets the checkout offer "connected" instead of walking someone through a
   * connection they already made.
   */
  useEffect(() => {
    let cancelled = false
    fetch('/api/mesh/connection')
      .then(r => r.json())
      .then(j => {
        if (cancelled || !j.ok || !j.connection) return
        setConnection(j.connection)
        setHasConnection(true)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  /**
   * A dead connection, reported from either path, is forgotten here.
   *
   * Keyed on the code rather than the failure object so it fires on the transition and not on
   * every dispatch. Both reporters only have to say what happened; this decides what to do about
   * it, which keeps the holdings path and the Link path from drifting apart.
   */
  useEffect(() => {
    if (order.failure?.code === 'connection_expired') void forgetConnection()
  }, [order.failure?.code, forgetConnection])

  /** Fetch the SDK chunk as the shopper reaches checkout, so the pay click does not pay for it. */
  useEffect(() => {
    if (step === 'checkout') void preloadMeshLink()
  }, [step])

  /**
   * Who to open Link on. Fetched once, in the background, well before anyone clicks: resolving it
   * on the click would put a catalogue call between the button and the overlay.
   */
  useEffect(() => {
    let cancelled = false
    fetch('/api/mesh/providers')
      .then(r => r.json())
      .then(j => !cancelled && j.suggested && setSuggested(j.suggested))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'd' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault()
        setPanelOpen(v => !v)
        setDrawer(v => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const paid = order.status === 'paid' || order.status === 'settled'
  const settled = order.status === 'settled'
  /**
   * The checkout has committed to the crypto route. Holding a token is not enough: a returning
   * shopper still gets to see card and Apple Pay before choosing.
   */
  const connected = hasConnection && choseCrypto && !paid
  const showManifest = (step === 'checkout' || step === 'done') && order.status !== 'draft'
  /** The bag empties on purchase, so the confirmation reads from what was bought. */
  const item = bag ?? purchased

  return (
    <div className="flex" style={{ ['--plate-accent' as string]: colourway.accent }}>
      <div className="min-w-0 flex-1">
        {/* The bottom padding clears the fixed console bar, plus whatever iOS puts below it. */}
        <div
          className="mx-auto max-w-[1180px] px-5 pb-28 sm:px-6 lg:px-10"
          style={{ paddingBottom: 'calc(7rem + env(safe-area-inset-bottom))' }}
        >
          <header className="rule-b flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 py-5 sm:py-6">
            <button
              type="button"
              onClick={() => (paid ? void reset() : goto('shop'))}
              className="flex items-baseline gap-5 text-left"
            >
              <span className="text-xl font-extrabold leading-none tracking-[0.2em] sm:text-2xl">
                {BRAND}
              </span>
              <span className="label hidden sm:inline">
                {PRODUCT.brand} · {PRODUCT.name}
              </span>
            </button>

            <div className="flex items-baseline gap-6">
              <span className="label hidden md:inline">Free delivery</span>
              <button
                type="button"
                onClick={() => bag && goto('bag')}
                disabled={!bag}
                className="btn-quiet disabled:opacity-50"
              >
                Bag ({bag ? 1 : 0})
              </button>
            </div>
          </header>

          {step === 'shop' && (
            <ShopFront
              onSelect={id => {
                setColourwayId(id)
                setPlate('lateral')
                goto('product')
              }}
            />
          )}

          {step === 'product' && (
            <>
              <button type="button" onClick={() => goto('shop')} className="btn-quiet mt-6">
                All colourways
              </button>

              {/* Explicit grid placement, because mobile stacks in DOM order. The first pass put
                  the entire spec sheet between the photograph and the price. */}
              <main className="grid items-start gap-x-16 gap-y-10 py-8 md:grid-cols-[minmax(0,1fr)_minmax(0,19rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,23rem)]">
                <section className="md:col-start-1 md:row-start-1 lg:col-start-1 lg:row-start-1">
                  <ProductPlate colourway={colourwayId} plate={plate} onPlateChange={setPlate} />
                </section>

                <section className="flex flex-col gap-7 md:col-start-2 md:row-span-2 md:row-start-1 lg:col-start-2 lg:row-span-2 lg:row-start-1">
                  <div>
                    <p className="label mb-2">{PRODUCT.brand}</p>
                    <h1 className="text-[2.4rem] font-bold leading-[0.95] tracking-[-0.03em] sm:text-[2.6rem]">
                      {PRODUCT.name}
                    </h1>
                    <p className="mt-4 text-sm leading-relaxed text-muted">
                      Lightweight trainer with a mesh upper and a memory foam sockliner. Four
                      colourways, clearance pricing, one pair per order.
                    </p>
                    <div className="mt-6">
                      <PriceBlock />
                    </div>
                  </div>

                  <ColourwayPicker value={colourwayId} onChange={setColourwayId} />

                  <div>
                    <SizePicker
                      value={size}
                      onChange={v => {
                        setSize(v)
                        setSizeNudge(false)
                      }}
                    />
                    {sizeNudge && !size && (
                      <p
                        role="alert"
                        className="mt-2 text-sm font-medium"
                        style={{ color: 'var(--color-warn)' }}
                      >
                        Pick a size first.
                      </p>
                    )}
                  </div>

                  <div>
                    {inBag ? (
                      <>
                        <div className="flex w-full items-center justify-center gap-2 border-2 border-ink py-3.5">
                          <span
                            className="grid h-4 w-4 place-items-center rounded-full text-[10px] font-bold"
                            style={{ background: 'var(--plate-accent)', color: 'var(--color-plate)' }}
                            aria-hidden
                          >
                            ✓
                          </span>
                          <span className="data text-sm font-semibold uppercase tracking-[0.08em]">
                            Added to bag
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => goto('bag')}
                          className="btn-primary mt-2 w-full py-4 text-sm"
                        >
                          View bag
                        </button>
                        <p className="note mt-2">
                          One pair per order. Change the colour or size to swap what is in the bag.
                        </p>
                      </>
                    ) : (
                      <button type="button" onClick={addToBag} className="btn-primary w-full py-4 text-sm">
                        {bag ? 'Update bag' : 'Add to bag'}
                      </button>
                    )}

                    <div className="rule-t mt-5 flex items-baseline justify-between gap-4 pt-3">
                      <span className="text-sm font-medium">Standard delivery</span>
                      <span className="data text-sm">Free</span>
                    </div>
                    <p className="note mt-1">Dispatched the next working day. 30 day returns.</p>
                  </div>

                  <ProductPanels />
                </section>

                <section className="md:col-start-1 md:row-start-2 lg:col-start-1 lg:row-start-2">
                  <dl className="rule-t pt-5">
                    {SPEC.map(s => (
                      <div key={s.n} className="rule-b flex items-baseline gap-5 py-2.5">
                        <dt className="data w-6 shrink-0 text-xs text-faint">{s.n}</dt>
                        <dt className="label w-24 shrink-0">{s.label}</dt>
                        <dd className="text-sm">{s.value}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              </main>
            </>
          )}

          {step === 'bag' && bag && (
            <BagView
              item={bag}
              onCheckout={() => goto(isComplete(address) ? 'checkout' : 'delivery')}
              onBack={() => goto('shop')}
              onRemove={() => {
                setBag(null)
                goto('shop')
              }}
            />
          )}

          {step === 'delivery' && bag && (
            <DeliveryForm
              item={bag}
              value={address}
              onChange={setAddress}
              onContinue={() => goto('checkout')}
              onBack={() => goto('bag')}
            />
          )}

          {/**
           * Checkout and the receipt want opposite layouts, and sharing one grid gave the wrong
           * half to each.
           *
           * A checkout is about finalising an amount. Handing sixty percent of the screen to an
           * annotated product drawing and squeezing the itemisation, the delivery address and the
           * payment method into a 384px rail is the product page wearing a checkout as a sidebar.
           * So checkout drops the plate, centres one column, and shows the shoe the way a checkout
           * shows anything: a thumbnail on its line item. It also gives Mesh Link half as much
           * width again to render in.
           *
           * The receipt keeps the plate, because that is the YOURS moment and the product earns
           * the room there.
           */}
          {(step === 'checkout' || step === 'done') && item && (
            <main
              className={
                step === 'done'
                  ? 'grid gap-x-16 gap-y-10 py-8 md:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]'
                  : 'mx-auto w-full max-w-[38rem] py-8'
              }
            >
              {step === 'done' && (
                <section className="order-2 lg:order-none md:col-start-1 md:row-start-1 lg:col-start-1 lg:row-start-1">
                  <ProductPlate
                    colourway={item.colourway.id}
                    plate={plate}
                    onPlateChange={setPlate}
                    owned={paid}
                  />
                </section>
              )}

              <section
                className={
                  step === 'done'
                    ? 'order-1 flex flex-col gap-7 md:order-none md:col-start-2 md:row-start-1 lg:col-start-2 lg:row-start-1'
                    : 'flex flex-col gap-7'
                }
              >
                {step === 'checkout' && !paid && (
                  <>
                    <div>
                      <h1
                        className={`text-[2rem] font-bold leading-[1] tracking-[-0.02em] ${
                          linkOpen ? 'hidden' : ''
                        }`}
                      >
                        How would you like to pay?
                      </h1>
                      {/* The itemisation a checkout is supposed to have: what it is, which one,
                          which size, and what it costs, with the shoe present but not in charge. */}
                      <div className="rule-t mt-5 flex items-center gap-4 pt-4">
                        <div className="relative h-20 w-20 shrink-0 border border-rule bg-plate">
                          <Image
                            src={plateSrc(item.colourway.id, 'lateral')}
                            alt=""
                            fill
                            sizes="80px"
                            className="object-contain p-1"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold leading-tight">
                            {PRODUCT.brand} {PRODUCT.name}
                          </div>
                          <div className="note">
                            {item.colourway.name} · UK {item.size} · Qty 1
                          </div>
                          <div className="note">{item.colourway.ref}</div>
                        </div>
                        <div className="data shrink-0 text-sm">{usd(PRODUCT.price)}</div>
                      </div>

                      <dl className="mt-4">
                        <div className="flex items-baseline justify-between gap-4 py-1">
                          <dt className="text-sm text-muted">Delivery</dt>
                          <dd className="data text-sm">Free</dd>
                        </div>
                        {HANDLING_FEE > 0 && (
                          <div className="flex items-baseline justify-between gap-4 py-1">
                            <dt className="text-sm text-muted">Handling</dt>
                            <dd className="data text-sm">{usd(HANDLING_FEE)}</dd>
                          </div>
                        )}
                        <div className="rule-t mt-2 flex items-baseline justify-between gap-4 pt-2">
                          <dt className="text-base font-semibold">Total</dt>
                          <dd className="data text-xl font-semibold">
                            {usd(PRODUCT.price + HANDLING_FEE)}
                          </dd>
                        </div>
                      </dl>

                      {/**
                       * Said before Link opens, not after.
                       *
                       * The merchant receives exactly $50.00, so that is the total. The exchange
                       * then charges its own withdrawal fee on top, which was one cent in sandbox,
                       * and the first place the shopper saw it was Mesh's own screen reading
                       * $50.01. Mesh's breakdown does not itemise it either: it lists the payment
                       * and a free gas fee and then a total a penny higher. Arriving at a number
                       * nobody warned you about is the moment a checkout loses trust, and it costs
                       * one line to avoid.
                       */}
                      {choseCrypto && (
                        <p className="note mt-2">
                          {BRAND} receives {usd(PRODUCT.price + HANDLING_FEE)}. Your exchange adds
                          its own withdrawal fee on top, so the amount it debits is slightly
                          higher. Mesh shows the exact total before you confirm, and the receipt
                          breaks it down.
                        </p>
                      )}
                      {isComplete(address) && !linkOpen && (
                        <DeliverySummary address={address} onEdit={() => goto('delivery')} />
                      )}
                    </div>

                    {order.failure && !linkOpen && (
                      <FailureNotice
                        failure={order.failure}
                        onRetry={
                          order.failure.retryable
                            ? funding
                              ? () => startPayment()
                              : () => startConnect(true)
                            : undefined
                        }
                        onDismiss={() => {
                          dispatch({ type: 'clear:failure' })
                          setChoseCrypto(false)
                        }}
                        dismissLabel="Back to the payment options"

                      />
                    )}

                    {!connected && !order.failure && !linkOpen && (
                      <>
                        <div className="space-y-2">
                          {/* Crypto leads. It is the selected method and the whole point of the
                              shop, and burying it under two options that open a sheet saying they
                              are for show read as an afterthought. */}
                          <div className="border-2 border-ink bg-plate px-4 pb-4 pt-3.5">
                            <div className="flex items-center gap-3">
                              <span
                                className="grid h-4 w-4 shrink-0 place-items-center rounded-full border border-ink"
                                aria-hidden
                              >
                                <span className="h-2 w-2 rounded-full bg-ink" />
                              </span>
                              <span className="flex-1 text-sm font-semibold">Crypto account</span>
                              <span className="note">Settles in {PRODUCT.settlement.symbol}</span>
                            </div>

                            <button
                              type="button"
                              onClick={() => startConnect()}
                              disabled={busy}
                              className="btn-primary mt-4 w-full py-4 text-sm"
                            >
                              {busy
                                ? 'Opening…'
                                : connection
                                  ? `Continue with ${connection.brokerName}`
                                  : suggested
                                    ? `Pay with ${suggested.name} · ${usd(PRODUCT.price + HANDLING_FEE)}`
                                    : `Pay with crypto · ${usd(PRODUCT.price + HANDLING_FEE)}`}
                            </button>
                            <p className="note mt-2">
                              {connection
                                ? 'Already connected, so there is no sign-in this time. '
                                : null}
                              <button
                                type="button"
                                onClick={() => startConnect(true)}
                                className="underline underline-offset-2 hover:text-ink"
                              >
                                {connection ? 'Use a different account' : 'Use a different exchange or wallet'}
                              </button>
                              .
                            </p>
                            <div className="mt-3">
                              <FundingNote />
                            </div>
                          </div>

                          {[
                            { key: 'card' as const, name: 'Card', note: 'Visa, Mastercard, Amex' },
                            { key: 'applePay' as const, name: 'Apple Pay', note: 'One tap' }
                          ].map(m => (
                            <button
                              key={m.key}
                              type="button"
                              onClick={() => setPretend(m.key)}
                              className="flex w-full items-center gap-3 border border-rule bg-plate px-4 py-3.5 text-left transition-colors hover:border-ink"
                            >
                              <span className="h-4 w-4 shrink-0 rounded-full border border-rule" aria-hidden />
                              <span className="flex-1 text-sm font-medium">{m.name}</span>
                              <span className="note">{m.note}</span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}

                    {connected && !funding && !order.warning && !order.failure && !linkOpen && (
                      <div className="rule-t pt-4">
                        <div className="label mb-2">Paying from</div>
                        <p className="text-sm text-muted">Reading your account…</p>
                        <div className="mt-4 h-[4.5rem] border border-rule bg-plate" aria-hidden />
                      </div>
                    )}

                    {order.warning && !order.failure && !linkOpen && (
                      <FailureNotice
                        failure={order.warning}
                        onDismiss={() => dispatch({ type: 'clear:failure' })}
                        dismissLabel="Continue anyway"
                      />
                    )}

                    {connected && !order.failure && !linkOpen && (funding || order.warning) && (
                      <>
                        {funding && positions.length > 0 && (
                          <Portfolio
                            provider={funding.provider}
                            accountName={funding.accountName}
                            positions={positions}
                            cryptoValue={cryptoValue}
                            quotes={quotes}
                            selected={asset}
                            onSelect={setAsset}
                          />
                        )}

                        <FundingSource
                          funding={activeFunding}
                          providerName={connection?.brokerName ?? null}
                          payingWith={asset}
                          showProvider={positions.length === 0}
                          onChangeAccount={() => startPayment(true)}
                        />
                        <button
                          type="button"
                          onClick={() => startPayment()}
                          disabled={busy}
                          className="btn-primary w-full py-4 text-sm"
                        >
                          {busy ? 'Opening…' : `Pay ${usd(PRODUCT.price + HANDLING_FEE)}`}
                        </button>
                      </>
                    )}
                    <div
                      className={
                        linkOpen ? 'stamp border border-rule bg-plate' : 'h-0 overflow-hidden'
                      }
                      aria-hidden={!linkOpen}
                    >
                      {linkOpen && (
                        <>
                          {/* The credential warning has to be here, not behind the iframe. This is
                              the exact moment Mesh shows a login form, and it is the moment real
                              exchange credentials get typed into a sandbox by mistake. */}
                          <div className="p-3">
                            <SandboxNotice compact />
                          </div>
                          <div className="rule-t rule-b flex items-center justify-between px-4 py-2.5">
                            <span className="label">Secure payment</span>
                            <span className="label">Powered by Mesh</span>
                          </div>
                        </>
                      )}
                      <iframe
                        id={LINK_FRAME_ID}
                        title="Mesh Link"
                        className="w-full border-0"
                        // Mesh asks for 665px: its sticky footer and action buttons position
                        // against the iframe's own viewport height, not the page's.
                        style={{
                          height: linkOpen ? 'min(665px, calc(100dvh - 180px))' : 0,
                          minHeight: linkOpen ? 450 : 0,
                          display: 'block'
                        }}
                        allow="clipboard-write; camera"
                      />
                    </div>
                  </>
                )}

                {step === 'done' && (
                  <>
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className="grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold"
                          style={{ background: 'var(--plate-accent)', color: 'var(--color-plate)' }}
                          aria-hidden
                        >
                          ✓
                        </span>
                        <span className="label text-ink">
                          {settled ? 'Order settled' : 'Order confirmed'}
                        </span>
                      </div>
                      <h1 className="mt-3 text-[2.4rem] font-bold leading-[0.95] tracking-[-0.03em]">
                        Yours.
                      </h1>
                      <p className="mt-3 text-sm leading-relaxed text-muted">
                        Order <span className="data">{orderRef}</span> is paid. We took{' '}
                        {usd(chargedTotal(order, PRODUCT.price + HANDLING_FEE))} in{' '}
                        {order.payment.symbol} from your {order.source?.name ?? 'connected'} account
                        and sent it to the merchant on {order.payment.networkName}.
                        {settled
                          ? ' The merchant has confirmed receipt.'
                          : ' We will confirm here when the merchant acknowledges it.'}
                      </p>
                    </div>

                    <Receipt
                      order={order}
                      orderId={orderRef}
                      size={`UK ${item.size}`}
                      colourway={item.colourway}
                      address={address}
                      settled={settled}
                    />

                    <div className="rule-t pt-5">
                      <button type="button" onClick={reset} className="btn-primary w-full py-4 text-sm">
                        Start a new order
                      </button>
                      <p className="note mt-3">
                        Demonstration store, so nothing ships. Starting again clears this order and
                        keeps the account connected, so the next run does not sign in again.
                      </p>
                    </div>
                  </>
                )}
              </section>
            </main>
          )}

          {showManifest && <Manifest order={order} />}

          <Footer />
        </div>
      </div>

      {justAdded && bag && (
        <AddedToBag
          item={bag}
          onViewBag={() => goto('bag')}
          onKeepShopping={() => setJustAdded(false)}
        />
      )}

      <PretendPaymentModal
        method={pretend}
        amount={usd(PRODUCT.price + HANDLING_FEE)}
        onClose={() => setPretend(null)}
        onUseCrypto={() => startConnect()}
      />

      {/* Always mounted. On a wide screen it hides while the docked panel is open; on a narrow one
          it is the only way in, because a 26rem panel does not belong on a phone. */}
      <ConsoleBar
        order={order}
        open={panelOpen || drawer}
        className={panelOpen ? 'lg:hidden' : undefined}
        onToggle={() => {
          setPanelOpen(v => !v)
          setDrawer(v => !v)
        }}
      />

      {/* The collapse handle, sitting on the rule the panel opens along. Desktop only: on a phone
          the bar along the bottom is the way in and out. */}
      <PanelHandle open={panelOpen} onToggle={() => setPanelOpen(v => !v)} />

      {/* Docked on desktop, overlay on mobile. CSS picks, so there is no media query in JS. */}
      <TechnicalView
        open={panelOpen}
        docked
        onClose={() => setPanelOpen(false)}
        order={order}
        calls={calls}
        connection={connection}
        onReset={reset}
      />
      <TechnicalView
        open={drawer}
        docked={false}
        onClose={() => setDrawer(false)}
        order={order}
        calls={calls}
        connection={connection}
        onReset={reset}
      />
    </div>
  )
}
