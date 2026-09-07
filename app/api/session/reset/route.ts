import { guard, ok } from '@/lib/http'
import { clearSessionCookie, readSessionId } from '@/lib/session'
import { clearSession, getSession, putSession } from '@/lib/store/records'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Two resets, because a demo wants two different things and one button was doing the smaller job
 * under the bigger name.
 *
 * **Default: start the next order.** Keeps the account connected, which is what makes a second run
 * fast. This used to delete the session record and the cookie, which destroyed the stored token ids
 * and minted a new Mesh userId on the next request, so every run paid for a full Coinbase sign-in
 * while three places on screen promised it would not.
 *
 * The order is not cleared here and never was. It lives under its own key and the browser holds the
 * id, so the browser dropping that id is the reset. This call confirms the connection survived and
 * refreshes the session TTL while it is at it.
 *
 * **`full: true`: forget everything.** Drops the session record and the cookie, so the next visit is
 * a genuine first visit and the sign-in is part of the demo again. That is what you want before
 * showing someone new, and what "reset" was misleadingly implying all along.
 *
 * Neither calls Mesh's remove-connection endpoint. That permanently revokes a tokenId with no way
 * back, which is the wrong thing for a button on a demo panel to do. Forgetting our side is enough:
 * without the session there is nothing to replay, so Link asks for the sign-in again.
 */
export async function POST(request: Request) {
  return guard(async () => {
    const body = (await request.json().catch(() => null)) as { full?: boolean } | null
    const full = body?.full === true

    const sid = await readSessionId()
    if (!sid) return ok({ cleared: true, connectionKept: false, full })

    if (full) {
      await clearSession(sid)
      await clearSessionCookie()
      return ok({ cleared: true, connectionKept: false, full: true })
    }

    const session = await getSession(sid)
    if (session) await putSession(sid, session)

    return ok({ cleared: true, connectionKept: (session?.connections.length ?? 0) > 0, full: false })
  })
}
