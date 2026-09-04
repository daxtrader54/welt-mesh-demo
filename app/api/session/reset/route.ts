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
 * while three places on screen promised it would not. Now it clears the order and leaves the
 * connection alone, which is what the copy said all along and what makes a second run fast.
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
