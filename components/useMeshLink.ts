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
 *  - Rendered embedded rather than as an overlay. Link goes into an iframe the page owns, inside
 *    the checkout column, so paying happens in the shop instead of on top of it. The iframe has
 *    to exist in the DOM before `openLink` runs, which is why the container is always mounted and
 *    collapsed rather than conditionally rendered.
 */

export type OpenIntent = 'connect' | 'pay'

type TokenResponse =
  | {
      ok: true
      linkToken: string
      ms: number
      order?: { id: string; amount: number; symbol: string }
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
  onOpening?: (info: { intent: OpenIntent; orderId?: string; ms: number }) => void
  /** Whether Link is on screen right now, so the page can make room for it. */
  onVisibilityChange?: (visible: boolean) => void
}

export function useMeshLink(handlers: MeshLinkHandlers) {
  const [busy, setBusy] = useState(false)
  // A ref as well as state: state updates are async and a fast double click can slip between.
  const inFlight = useRef(false)
  const latest = useRef(handlers)
  latest.current = handlers

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

        latest.current.onOpening?.({ intent, orderId: json.order?.id, ms: json.ms })

        const { createLink } = await import('@meshconnect/web-link-sdk')

        latest.current.onVisibilityChange?.(true)

        const link = createLink({
          renderType: 'embedded',
          theme: 'light',
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
          onEvent: event => latest.current.onEvent(event),
          onIntegrationConnected: payload => latest.current.onConnected(payload),
          onTransferFinished: payload => {
            latest.current.onVisibilityChange?.(false)
            latest.current.onTransferFinished(payload)
          },
          onExit: (error, summary) => {
            latest.current.onVisibilityChange?.(false)
            latest.current.onExit(error, summary)
          }
        })

        link.openLink(json.linkToken, LINK_FRAME_ID)
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
