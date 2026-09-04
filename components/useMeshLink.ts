'use client'

import { useCallback, useRef, useState } from 'react'
import type {
  IntegrationAccessToken,
  LinkEventType,
  LinkPayload,
  SessionSummary,
  TransferFinishedPayload
} from '@meshconnect/web-link-sdk'
import { failure, type Failure } from '@/lib/failure'

/**
 * Opening Mesh Link, with the demo-reliability details that are easy to leave out.
 *
 *  - The token is minted on the click, never on page load. It lasts ten minutes and is single
 *    use, and a token minted when the page loaded is the classic "worked yesterday" failure.
 *  - A `busy` guard means a double click cannot mint two tokens or stack two overlays.
 *  - `createLink` is called per session so the connected accounts passed in are current.
 *  - Anything the SDK throws becomes a designed failure state, not an unhandled rejection.
 *  - The SDK is imported dynamically, inside the click. It touches `window` at module scope, so
 *    a static import crashes the server render of this component. Loading it on demand also
 *    keeps it out of the initial bundle, which the shop does not need to display a shoe.
 *  - Rendered embedded on a wide screen, so paying happens inside the checkout column rather than
 *    on top of the shop. The iframe has to exist in the DOM before `openLink` runs, which is why
 *    the container is always mounted and collapsed rather than conditionally rendered.
 *  - Rendered as an overlay on a narrow one. Link's own layout needs more width than a phone's
 *    checkout column gives it: embedded on a 375px viewport loaded, fired `pageLoaded`, and then
 *    showed a white frame. Overlay is Mesh's default and is the right shape for a phone.
 */

/** Below this, Link gets the full screen instead of a column it does not fit in. */
const EMBED_MIN_WIDTH = 1024

export type OpenIntent = 'connect' | 'pay'

type TokenResponse =
  | {
      ok: true
      linkToken: string
      ms: number
      order?: { id: string; reference: string; amount: number; symbol: string }
      accessTokens?: {
        accessToken: string
        brokerType: string
        brokerName: string
        accountId: string
        accountName: string
      }[]
    }
  | { ok: false; error: Failure }

/** The id of the iframe Link renders into. Must be in the DOM before openLink is called. */
export const LINK_FRAME_ID = 'welt-mesh-link'

export type MeshLinkHandlers = {
  onEvent: (event: LinkEventType) => void
  onConnected: (payload: LinkPayload) => void
  onTransferFinished: (payload: TransferFinishedPayload) => void
  onExit: (error: string | undefined, summary: SessionSummary | undefined) => void
  onFailure: (error: Failure) => void
  /** Fired once the token is in hand, before Link opens. */
  onOpening?: (info: { intent: OpenIntent; orderId?: string; reference?: string; ms: number }) => void
  /** Whether Link is on screen right now, so the page can make room for it. */
  onVisibilityChange?: (visible: boolean) => void
}

/**
 * Pull the SDK into the module cache without opening anything.
 *
 * It is a 105KB chunk that cannot be imported at module scope, so without this the first click
 * pays for the download on top of the token round trip and the iframe load, all in series, at the
 * moment everyone is watching. Also suppresses the SDK's own prewarm iframe, which points at the
 * production host and is created and destroyed microseconds apart when imported inside a click.
 */
export async function preloadMeshLink(): Promise<void> {
  try {
    ;(window as unknown as { meshLinkShouldSkipPrewarm?: boolean }).meshLinkShouldSkipPrewarm = true
    await import('@meshconnect/web-link-sdk')
  } catch {
    // The click path imports it again and reports the failure properly there.
  }
}

/** How long Link gets to emit its first event before we assume it will never render. */
const LOAD_TIMEOUT_MS = 12_000

export function useMeshLink(handlers: MeshLinkHandlers) {
  const [busy, setBusy] = useState(false)
  // A ref as well as state: state updates are async and a fast double click can slip between.
  const inFlight = useRef(false)
  const latest = useRef(handlers)
  latest.current = handlers
  /** Held so the session can be closed on exit rather than left loaded behind a collapsed frame. */
  const session = useRef<{ closeLink: () => void } | null>(null)
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearWatchdog = () => {
    if (watchdog.current) clearTimeout(watchdog.current)
    watchdog.current = null
  }

  const open = useCallback(
    async (
      intent: OpenIntent,
      selection?: { colourway?: string; size?: string; integrationId?: string }
    ) => {
      if (inFlight.current) return
      inFlight.current = true
      setBusy(true)

      try {
        const res = await fetch('/api/mesh/link-token', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ intent, ...selection })
        })

        const json = (await res.json().catch(() => null)) as TokenResponse | null

        if (!json) {
          latest.current.onFailure(failure('link_token', { detail: `HTTP ${res.status}, no body` }))
          return
        }
        if (!json.ok) {
          latest.current.onFailure(json.error)
          return
        }

        latest.current.onOpening?.({
          intent,
          orderId: json.order?.id,
          reference: json.order?.reference,
          ms: json.ms
        })

        const { createLink } = await import('@meshconnect/web-link-sdk')

        /**
         * If the origin is not registered in Mesh's Allowed Link URLs, or the network blocks
         * *.meshconnect.com, the SDK emits nothing at all: no event, no exit, no console error,
         * just a blank frame forever. It is the most common first-run failure and the only one in
         * this app that produced complete silence.
         */
        const embed =
          typeof window !== 'undefined' &&
          window.matchMedia(`(min-width: ${EMBED_MIN_WIDTH}px)`).matches
        latest.current.onVisibilityChange?.(embed)

        clearWatchdog()
        watchdog.current = setTimeout(() => {
          latest.current.onVisibilityChange?.(false)
          latest.current.onFailure(
            failure('sdk_load', {
              hint: `Mesh Link did not load. Check that ${window.location.origin} is registered in Mesh's Allowed Link URLs, and that *.meshconnect.com is reachable from this network.`,
              detail: `No SDK event within ${LOAD_TIMEOUT_MS / 1000}s of openLink`
            })
          )
        }, LOAD_TIMEOUT_MS)

        const link = createLink({
          renderType: embed ? 'embedded' : 'overlay',
          theme: 'light',
          language: 'system',
          displayFiatCurrency: 'USD',
          // Mesh-managed token ids for accounts already connected. Lets a returning shopper skip
          // signing in again. Empty on a first visit, and undefined rather than [] because the
          // SDK treats an empty array as "no accounts" on some paths.
          //
          // The cast is deliberate. The SDK's published `BrokerType` union is behind the API: it
          // lists 'sandbox' (Binance) but not 'sandboxCoinbase', which is exactly what a sandbox
          // Coinbase connection returns. Narrowing to the union would reject a value Mesh itself
          // sent us, so brokerType is carried as a string and asserted at this one boundary.
          accessTokens: json.accessTokens?.length
            ? (json.accessTokens as unknown as IntegrationAccessToken[])
            : undefined,
          onEvent: event => {
            clearWatchdog()
            latest.current.onEvent(event)
          },
          onIntegrationConnected: payload => latest.current.onConnected(payload),
          onTransferFinished: payload => {
            latest.current.onVisibilityChange?.(false)
            latest.current.onTransferFinished(payload)
          },
          onExit: (error, summary) => {
            clearWatchdog()
            latest.current.onVisibilityChange?.(false)
            latest.current.onExit(error, summary)
            // Mesh's guidance: close the session in onExit. Without it the frame keeps a dead
            // session loaded behind the collapsed container and its listener stays attached.
            try {
              session.current?.closeLink()
            } catch {
              // Already gone. Nothing to do.
            }
            session.current = null
          }
        })

        session.current = link
        link.openLink(json.linkToken, embed ? LINK_FRAME_ID : undefined)
      } catch (err) {
        latest.current.onVisibilityChange?.(false)
        latest.current.onFailure(
          failure('sdk_load', { detail: err instanceof Error ? err.message : String(err) })
        )
      } finally {
        inFlight.current = false
        setBusy(false)
      }
    },
    []
  )

  return { open, busy }
}
