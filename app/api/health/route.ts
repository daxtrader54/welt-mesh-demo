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
    return ok({
      config,
      // 'memory' is honest but degraded: on serverless the webhook and the browser will not
      // agree, because they may not be the same instance.
      storage: config.ok ? store().kind : 'unknown',
      time: new Date().toISOString()
    })
  })
}
