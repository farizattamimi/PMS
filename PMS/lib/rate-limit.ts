type RateLimitInput = {
  bucket: string
  key: string
  limit: number
  windowMs: number
}

type Counter = {
  count: number
  resetAt: number
}

export type RateLimitResult = {
  allowed: boolean
  limit: number
  remaining: number
  resetAt: number
  retryAfterSeconds: number
}

const counters = new Map<string, Counter>()

function nowMs(): number {
  return Date.now()
}

function counterKey(bucket: string, key: string): string {
  return `${bucket}:${key}`
}

function cleanupExpiredCounters(currentTimeMs: number) {
  // Keep memory bounded in long-lived processes.
  if (counters.size < 2000) return
  counters.forEach((v, k) => {
    if (v.resetAt <= currentTimeMs) counters.delete(k)
  })
}

export function resolveRateLimitKey(req: Request, userId?: string | null): string {
  if (userId) return `user:${userId}`
  const fwd = req.headers.get('x-forwarded-for')
  const ip = fwd?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'
  return `ip:${ip}`
}

function upstashConfig():
  | { url: string; token: string; prefix: string }
  | null {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return { url, token, prefix: process.env.RATE_LIMIT_PREFIX ?? 'pms:rl' }
}

async function checkRateLimitUpstash(input: RateLimitInput): Promise<RateLimitResult | null> {
  const cfg = upstashConfig()
  if (!cfg) return null
  const key = `${cfg.prefix}:${input.bucket}:${input.key}`
  try {
    const res = await fetch(`${cfg.url}/pipeline`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${cfg.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify([
        ['INCR', key],
        ['PEXPIRE', key, String(input.windowMs), 'NX'],
        ['PTTL', key],
      ]),
    })
    if (!res.ok) return null
    const payload = (await res.json().catch(() => [])) as Array<{ result?: unknown }>
    const count = Number(payload?.[0]?.result ?? 0)
    let ttlMs = Number(payload?.[2]?.result ?? input.windowMs)
    if (!Number.isFinite(ttlMs)) ttlMs = input.windowMs
    if (ttlMs < 0) {
      // Key exists without TTL: enforce expiry to avoid unbounded lockout.
      await fetch(`${cfg.url}/pipeline`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${cfg.token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify([['PEXPIRE', key, String(input.windowMs)]]),
      }).catch(() => null)
      ttlMs = input.windowMs
    }
    if (ttlMs === 0) ttlMs = input.windowMs
    const resetAt = Date.now() + ttlMs
    if (count > input.limit) {
      return {
        allowed: false,
        limit: input.limit,
        remaining: 0,
        resetAt,
        retryAfterSeconds: Math.max(1, Math.ceil(ttlMs / 1000)),
      }
    }
    return {
      allowed: true,
      limit: input.limit,
      remaining: Math.max(0, input.limit - count),
      resetAt,
      retryAfterSeconds: 0,
    }
  } catch {
    return null
  }
}

function checkRateLimitInMemory(input: RateLimitInput): RateLimitResult {
  const current = nowMs()
  cleanupExpiredCounters(current)

  const key = counterKey(input.bucket, input.key)
  const existing = counters.get(key)

  let counter: Counter
  if (!existing || existing.resetAt <= current) {
    counter = { count: 0, resetAt: current + input.windowMs }
    counters.set(key, counter)
  } else {
    counter = existing
  }

  if (counter.count >= input.limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((counter.resetAt - current) / 1000))
    return {
      allowed: false,
      limit: input.limit,
      remaining: 0,
      resetAt: counter.resetAt,
      retryAfterSeconds,
    }
  }

  counter.count += 1
  const remaining = Math.max(0, input.limit - counter.count)
  return {
    allowed: true,
    limit: input.limit,
    remaining,
    resetAt: counter.resetAt,
    retryAfterSeconds: 0,
  }
}

export async function checkRateLimit(input: RateLimitInput): Promise<RateLimitResult> {
  const distributed = await checkRateLimitUpstash(input)
  if (distributed) return distributed
  return checkRateLimitInMemory(input)
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.floor(result.resetAt / 1000)),
  }
  if (!result.allowed) headers['Retry-After'] = String(result.retryAfterSeconds)
  return headers
}
