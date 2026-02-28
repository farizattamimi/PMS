type ReplayConsumeResult = 'accepted' | 'duplicate' | 'unavailable'

const memoryReplay = new Map<string, number>()

function upstashConfig(): { url: string; token: string; prefix: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return { url, token, prefix: process.env.RATE_LIMIT_PREFIX ?? 'pms:rl' }
}

function replayKey(namespace: string, eventId: string): string {
  const prefix = process.env.RATE_LIMIT_PREFIX ?? 'pms:rl'
  return `${prefix}:webhook:replay:${namespace}:${eventId}`
}

function cleanupMemory(now: number) {
  if (memoryReplay.size < 2000) return
  memoryReplay.forEach((expiresAt, key) => {
    if (expiresAt <= now) memoryReplay.delete(key)
  })
}

async function consumeDistributed(namespace: string, eventId: string, ttlSeconds: number): Promise<ReplayConsumeResult> {
  const cfg = upstashConfig()
  if (!cfg) return 'unavailable'
  const key = replayKey(namespace, eventId)
  try {
    const res = await fetch(
      `${cfg.url}/set/${encodeURIComponent(key)}/1?NX=true&EX=${Math.max(1, Math.floor(ttlSeconds))}`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${cfg.token}` },
      }
    )
    if (!res.ok) return 'unavailable'
    const payload = (await res.json().catch(() => ({}))) as { result?: unknown }
    return payload.result === 'OK' ? 'accepted' : 'duplicate'
  } catch {
    return 'unavailable'
  }
}

function consumeInMemory(namespace: string, eventId: string, ttlSeconds: number): ReplayConsumeResult {
  const now = Date.now()
  cleanupMemory(now)
  const key = replayKey(namespace, eventId)
  const existing = memoryReplay.get(key)
  if (existing && existing > now) return 'duplicate'
  memoryReplay.set(key, now + Math.max(1, Math.floor(ttlSeconds)) * 1000)
  return 'accepted'
}

export async function consumeReplayEvent(
  namespace: string,
  eventId: string,
  ttlSeconds: number
): Promise<ReplayConsumeResult> {
  const distributed = await consumeDistributed(namespace, eventId, ttlSeconds)
  if (distributed !== 'unavailable') return distributed
  if (process.env.NODE_ENV === 'production') return 'unavailable'
  return consumeInMemory(namespace, eventId, ttlSeconds)
}
