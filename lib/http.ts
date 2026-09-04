import 'server-only'
import { NextResponse } from 'next/server'
import { ConfigError } from '@/lib/env'
import { failure, type Failure } from '@/lib/failure'

/**
 * Every route answers in the same shape, so the client has one thing to handle.
 * Failures are the app's Failure type, which already carries shopper-facing copy and a
 * technical detail kept apart from it.
 */

export type ApiOk<T> = { ok: true } & T
export type ApiFail = { ok: false; error: Failure }

export function ok<T extends object>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, ...data } as ApiOk<T>, init)
}

export function fail(error: Failure, status = 400) {
  return NextResponse.json({ ok: false, error } as ApiFail, { status })
}

/**
 * Wraps a handler so an unexpected throw becomes a useful state rather than a blank 500.
 * A missing environment variable is the single most likely cause on a fresh deployment, so it
 * gets named explicitly instead of being buried.
 */
export async function guard(handler: () => Promise<Response>): Promise<Response> {
  try {
    return await handler()
  } catch (err) {
    if (err instanceof ConfigError) {
      return fail(
        failure('config', { detail: err.message, hint: `Missing: ${err.missing.join(', ')}` }),
        500
      )
    }
    console.error('[welt] unhandled route error', err)
    return fail(failure('unknown', { detail: err instanceof Error ? err.message : String(err) }), 500)
  }
}

export async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T
  } catch {
    return null
  }
}
