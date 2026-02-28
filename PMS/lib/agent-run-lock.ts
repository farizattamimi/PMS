type LockHandle = {
  managerId: string
  token: string
  key: string
}

const memoryLocks = new Map<string, string>()
const LOCK_TTL_MS = 15 * 60 * 1000

function randomToken(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function upstashConfig(): { url: string; token: string; prefix: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return { url, token, prefix: process.env.RATE_LIMIT_PREFIX ?? 'pms:rl' }
}

async function acquireDistributedLock(lock: LockHandle): Promise<boolean | null> {
  const cfg = upstashConfig()
  if (!cfg) return null
  try {
    const res = await fetch(`${cfg.url}/set/${encodeURIComponent(lock.key)}/${encodeURIComponent(lock.token)}?NX=true&PX=${LOCK_TTL_MS}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${cfg.token}` },
    })
    if (!res.ok) return null
    const payload = (await res.json().catch(() => ({}))) as { result?: unknown }
    return payload.result === 'OK'
  } catch {
    return null
  }
}

async function releaseDistributedLock(lock: LockHandle): Promise<boolean> {
  const cfg = upstashConfig()
  if (!cfg) return false
  const script = `
local v = redis.call("GET", KEYS[1])
if v == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`
  try {
    const body = JSON.stringify([['EVAL', script, '1', lock.key, lock.token]])
    const res = await fetch(`${cfg.url}/pipeline`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${cfg.token}`,
        'content-type': 'application/json',
      },
      body,
    })
    return res.ok
  } catch {
    return false
  }
}

function keyForManager(managerId: string): string {
  const prefix = process.env.RATE_LIMIT_PREFIX ?? 'pms:rl'
  return `${prefix}:agent:run:lock:${managerId}`
}

export async function acquireManagerRunLock(managerId: string): Promise<LockHandle | null> {
  const lock: LockHandle = {
    managerId,
    token: randomToken(),
    key: keyForManager(managerId),
  }

  const distributed = await acquireDistributedLock(lock)
  if (distributed === true) return lock
  if (distributed === false) return null

  // In production, fail closed if distributed lock infra is unavailable.
  if (process.env.NODE_ENV === 'production') return null

  // Fallback for local/dev when Redis is unavailable.
  if (memoryLocks.has(lock.key)) return null
  memoryLocks.set(lock.key, lock.token)
  setTimeout(() => {
    if (memoryLocks.get(lock.key) === lock.token) memoryLocks.delete(lock.key)
  }, LOCK_TTL_MS).unref?.()
  return lock
}

export async function releaseManagerRunLock(lock: LockHandle): Promise<void> {
  const distributedReleased = await releaseDistributedLock(lock)
  if (distributedReleased) return
  if (memoryLocks.get(lock.key) === lock.token) memoryLocks.delete(lock.key)
}
