import { z } from 'zod'
import { failure } from '@/lib/failure'
import { fail, guard, ok, readJson } from '@/lib/http'
import { maskToken } from '@/lib/format'
import { ensureSessionId, meshUserId, readSessionId } from '@/lib/session'
import { getSession, putSession, type Connection } from '@/lib/store/records'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Takes custody of the Coinbase auth token.
 *
 * The token reaches the browser because `onIntegrationConnected` hands it to client JavaScript.
 * That is how the SDK works and we cannot change it. What we control is what happens next: it is
 * posted here immediately, held against the session, and never sent back down. The client keeps
 * no copy, nothing renders it, and nothing logs it.
 *
 * Self-custody wallets return no `tokenId`, only a long encrypted `accessToken`, so tokenId is
 * optional here. Observed with MetaMask and Phantom during the probe.
 */

const body = z.object({
  brokerType: z.string().min(1),
  brokerName: z.string().min(1),
  accountName: z.string().nullable().optional(),
  authToken: z.string().min(1),
  tokenId: z.string().nullable().optional(),
  expiresInSeconds: z.number().nullable().optional()
})

export async function POST(req: Request) {
  return guard(async () => {
    const parsed = body.safeParse(await readJson(req))
    if (!parsed.success) {
      return fail(failure('connect_failed', { detail: 'Malformed connection payload' }), 400)
    }

    const sid = await ensureSessionId()
    const input = parsed.data

    const connection: Connection = {
      tokenId: input.tokenId ?? null,
      brokerType: input.brokerType,
      brokerName: input.brokerName,
      accountName: input.accountName ?? null,
      authToken: input.authToken,
      connectedAt: Date.now(),
      expiresAt: input.expiresInSeconds ? Date.now() + input.expiresInSeconds * 1000 : null
    }

    const existing = (await getSession(sid)) ?? {
      userId: meshUserId(sid),
      createdAt: Date.now(),
      connections: []
    }

    // Reconnecting the same provider replaces the old token rather than stacking up duplicates.
    const connections = [
      ...existing.connections.filter(c => c.brokerType !== connection.brokerType),
      connection
    ]

    await putSession(sid, { ...existing, connections })

    // Deliberately thin. The drawer gets enough to prove a token arrived, and no more.
    return ok({
      connection: {
        brokerName: connection.brokerName,
        brokerType: connection.brokerType,
        accountName: connection.accountName,
        tokenId: connection.tokenId,
        authTokenMasked: maskToken(connection.authToken),
        expiresAt: connection.expiresAt
      }
    })
  })
}

/**
 * Does this session already have an account connected?
 *
 * Asked once on load so a returning shopper is offered "Pay with Coinbase, connected" rather than
 * being walked through a connection they already made. The connection survives a reset by design,
 * so this is the normal case on a second run rather than an edge one.
 *
 * Returns the same thin summary as the POST: enough to name the provider and prove a token is
 * held, and nothing that could be used as one.
 */
export async function GET() {
  return guard(async () => {
    const sid = await readSessionId()
    const session = sid ? await getSession(sid) : null
    const connection = session?.connections.at(-1)

    if (!connection) return ok({ connection: null })

    const expired = connection.expiresAt !== null && connection.expiresAt < Date.now()
    if (expired) return ok({ connection: null, expired: true })

    return ok({
      connection: {
        brokerName: connection.brokerName,
        brokerType: connection.brokerType,
        accountName: connection.accountName,
        tokenId: connection.tokenId,
        authTokenMasked: maskToken(connection.authToken),
        expiresAt: connection.expiresAt
      }
    })
  })
}
