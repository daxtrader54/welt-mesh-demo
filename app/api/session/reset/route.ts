import { guard, ok } from '@/lib/http'
import { clearSessionCookie, readSessionId } from '@/lib/session'
import { clearSession } from '@/lib/store/records'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Start the demo again from the beginning.
 *
 * This clears our own state only. It deliberately does not call Mesh's remove-connection
 * endpoint, because that permanently revokes the tokenId, and the next run would then have to
 * sign in to Coinbase again. Keeping the Mesh connection is what makes a repeat demo quick.
 */
export async function POST() {
  return guard(async () => {
    const sid = await readSessionId()
    if (sid) await clearSession(sid)
    await clearSessionCookie()
    return ok({ cleared: true })
  })
}
