import 'server-only'
import { cookies } from 'next/headers'
import { randomUUID } from 'node:crypto'

/**
 * No accounts, no login. Mesh needs a stable `userId` and we need somewhere to hang the
 * connection and the order, and one httpOnly cookie does both jobs.
 *
 * The id is opaque and carries no personal data, which keeps us inside "do not store more
 * customer data than necessary".
 */

const COOKIE = 'welt_sid'
const MAX_AGE = 60 * 60 * 4

export async function readSessionId(): Promise<string | null> {
  const jar = await cookies()
  return jar.get(COOKIE)?.value ?? null
}

/** Reads the session id, minting one if this is a first visit. */
export async function ensureSessionId(): Promise<string> {
  const jar = await cookies()
  const existing = jar.get(COOKIE)?.value
  if (existing) return existing

  const sid = randomUUID()
  jar.set(COOKIE, sid, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE
  })
  return sid
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies()
  jar.delete(COOKIE)
}

/**
 * The id Mesh sees. Derived from the session so it is stable for the visit, and prefixed so it is
 * obvious in the Mesh dashboard where it came from.
 */
export function meshUserId(sid: string): string {
  return `welt-${sid}`
}
