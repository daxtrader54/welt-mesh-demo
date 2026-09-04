import { configStatus } from '@/lib/env'
import { store } from '@/lib/store'
import { guard, ok } from '@/lib/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Presence, never values. Answers "is this deployment configured" without leaking anything,
 * which is the first thing to check when the demo misbehaves on a machine that is not yours.
 */
export async function GET() {
  return guard(async () => {
    const config = configStatus()
    if (!config.ok) {
      return ok({ config, storage: 'unknown', storageReachable: false, time: new Date().toISOString() })
    }

    /**
     * A real round trip, not a check that the variables are set.
     *
     * This reported `storage: "redis"` from the presence of two environment variables, and the
     * Upstash client makes no network call when it is constructed. So the one check you run before
     * a demo read green with the database paused, deleted or over quota, while both the pay path
     * and settlement were already broken.
     */
    const kind = store().kind
    let reachable = false
    try {
      reachable = await store().ping()
    } catch {
      reachable = false
    }

    return ok({
      config,
      // 'memory' is honest but degraded: on serverless the webhook and the browser will not
      // agree, because they may not be the same instance.
      storage: kind,
      // The field worth reading before a demo. `storage` says what is configured;
      // this says whether it answered. They are not the same thing.
      storageReachable: reachable,
      time: new Date().toISOString()
    })
  })
}
