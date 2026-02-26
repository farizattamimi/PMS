export function validateCronSecret(params: {
  cronSecret?: string
  nodeEnv?: string
  providedSecret?: string | null
}): { ok: true } | { ok: false; status: number; error: string } {
  const { cronSecret, nodeEnv, providedSecret } = params

  if (!cronSecret) {
    if (nodeEnv === 'production') {
      return {
        ok: false,
        status: 500,
        error: 'Server misconfigured: CRON_SECRET is required in production',
      }
    }
    return { ok: true }
  }

  if (providedSecret !== cronSecret) {
    return { ok: false, status: 401, error: 'Unauthorized' }
  }

  return { ok: true }
}

export function normalizeManagerPropertyIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(
    new Set(value.filter((v: unknown): v is string => typeof v === 'string' && v.length > 0))
  )
}
