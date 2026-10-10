// These ceilings are deliberately below R2 Standard's account-wide free allowance.
// A rolling 32-day window avoids relying on the account's billing anniversary.
export const MEDIA_LIMITS = {
  bytes: 2_000_000_000,
  objects: 10_000,
  writes: 50_000,
  reads: 500_000,
  windowDays: 32,
  auditMaxAge: 60 * 60 * 1000,
} as const

export function mediaLimits(env: {
  MEDIA_MAX_BYTES?: string
  MEDIA_MAX_WRITES?: string
  MEDIA_MAX_READS?: string
}) {
  // Overrides can only LOWER the safeguards (also useful for exercising exhaustion in tests).
  const lower = (value: string | undefined, ceiling: number) => {
    if (value === undefined) return ceiling
    const n = Number(value)
    if (!Number.isSafeInteger(n) || n < 0 || n > ceiling)
      throw new Error('Invalid media budget configuration')
    return n
  }
  return {
    ...MEDIA_LIMITS,
    bytes: lower(env.MEDIA_MAX_BYTES, MEDIA_LIMITS.bytes),
    writes: lower(env.MEDIA_MAX_WRITES, MEDIA_LIMITS.writes),
    reads: lower(env.MEDIA_MAX_READS, MEDIA_LIMITS.reads),
  }
}

export function mediaDay(time = Date.now()) {
  return Math.floor(time / 86400000)
}
