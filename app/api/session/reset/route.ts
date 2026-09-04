import { guard, ok } from '@/lib/http'
import { readSessionId } from '@/lib/session'
import { getSession, putSession } from '@/lib/store/records'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Start again, keeping the account connected.
 *
 * This used to delete the session record and the cookie, which destroyed the stored token ids and
 * minted a new Mesh userId on the next request, so every run paid for a full Coinbase sign-in
 * while three places on screen promised it would not. It now leaves the connection alone, which is
 * what the copy said all along and what makes a second run fast.
 *
 * What it does not do, despite a previous version of this comment and the README both saying so,
 * is clear the order. The order was never in the session record: it lives under its own key and
 * the browser holds the id. The browser dropping that id is the reset, and this call confirms the
 * connection survived and refreshes the session TTL while it is at it. Deleting the order key too
 * would need the id sent up, and would buy nothing: it is already unreachable and expires in a day.
 *
 * It still never calls Mesh's remove-connection endpoint. That permanently revokes a tokenId with
 * no way back, which is the wrong thing for a reset button to do.
 */
export async function POST() {
  return guard(async () => {
    const sid = await readSessionId()
    if (!sid) return ok({ cleared: true, connectionKept: false })

    const session = await getSession(sid)
    if (session) await putSession(sid, session)

    return ok({ cleared: true, connectionKept: (session?.connections.length ?? 0) > 0 })
  })
}
