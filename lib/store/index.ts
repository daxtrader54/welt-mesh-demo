import 'server-only'
import { Redis } from '@upstash/redis'
import { meshEnv } from '@/lib/env'

/**
 * A tiny key/value store with a TTL on everything.
 *
 * Redis is here for two specific reasons, not for architecture points. Webhook idempotency needs
 * a write that survives across serverless invocations, and the order the browser polls has to be
 * the same order the webhook wrote to. Neither works with process memory on Vercel, where every
 * request may land on a different instance.
 *
 * The in-memory fallback keeps local development running without an Upstash account. It is
 * honestly labelled as degraded on /api/health, because on serverless it will look like the
 * webhook silently did nothing.
 */

export type Store = {
  readonly kind: 'redis' | 'memory'
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>
  /** Returns false if the key already existed. This is the idempotency primitive. */
  setIfAbsent<T>(key: string, value: T, ttlSeconds: number): Promise<boolean>
  del(key: string): Promise<void>
  /** Increments and sets a TTL on first write. Used to cap link token minting per session. */
  incr(key: string, ttlSeconds: number): Promise<number>
}

function redisStore(url: string, token: string): Store {
  /**
   * The client defaults to five retries with exponential backoff, which is about twelve seconds of
   * sleeps with no request timeout. The rate limiter sits in front of the Mesh call on the pay
   * path, so those defaults turn a store hiccup into a dead button and then an unexplained error.
   */
  const redis = new Redis({ url, token, retry: { retries: 1, backoff: () => 250 } })
  return {
    kind: 'redis',
    async get<T>(key: string) {
      return (await redis.get<T>(key)) ?? null
    },
    async set<T>(key: string, value: T, ttlSeconds: number) {
      await redis.set(key, value, { ex: ttlSeconds })
    },
    async setIfAbsent<T>(key: string, value: T, ttlSeconds: number) {
      const res = await redis.set(key, value, { ex: ttlSeconds, nx: true })
      return res === 'OK'
    },
    async del(key: string) {
      await redis.del(key)
    },
    async incr(key: string, ttlSeconds: number) {
      const n = await redis.incr(key)
      if (n === 1) await redis.expire(key, ttlSeconds)
      return n
    }
  }
}

type Entry = { value: unknown; expiresAt: number }
const memory = new Map<string, Entry>()

function alive(key: string): Entry | null {
  const entry = memory.get(key)
  if (!entry) return null
  if (entry.expiresAt < Date.now()) {
    memory.delete(key)
    return null
  }
  return entry
}

const memoryStore: Store = {
  kind: 'memory',
  async get<T>(key: string) {
    return (alive(key)?.value as T) ?? null
  },
  async set<T>(key: string, value: T, ttlSeconds: number) {
    memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 })
  },
  async setIfAbsent<T>(key: string, value: T, ttlSeconds: number) {
    if (alive(key)) return false
    memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 })
    return true
  },
  async del(key: string) {
    memory.delete(key)
  },
  async incr(key: string, ttlSeconds: number) {
    const current = (alive(key)?.value as number) ?? 0
    const next = current + 1
    const expiresAt = alive(key)?.expiresAt ?? Date.now() + ttlSeconds * 1000
    memory.set(key, { value: next, expiresAt })
    return next
  }
}

let cached: Store | null = null

export function store(): Store {
  if (cached) return cached
  const { redis } = meshEnv()
  cached = redis ? redisStore(redis.url, redis.token) : memoryStore
  return cached
}
