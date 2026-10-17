// Unix timestamp parsing (unit autodetection), date math and formatting helpers.

export type Unit = 's' | 'ms' | 'us' | 'ns'
export const UNIT_NAME: Record<Unit, string> = { s: 'seconds', ms: 'milliseconds', us: 'microseconds', ns: 'nanoseconds' }
const PER_MS: Record<Unit, number> = { s: 1e-3, ms: 1, us: 1e3, ns: 1e6 }

/** Guess the unit of a numeric timestamp from its magnitude (dates between ~1973 and ~5138). */
export function detectUnit(n: number): Unit {
  const a = Math.abs(n)
  if (a < 1e11) return 's'
  if (a < 1e14) return 'ms'
  if (a < 1e17) return 'us'
  return 'ns'
}

export interface Parsed {
  ms: number
  unit: Unit | 'date'
  fraction?: string // sub-millisecond digits kept for display (µs / ns input)
}

/** Parses a timestamp (any unit) or a date string. Returns null when invalid. */
export function parseInput(raw: string, force: Unit | 'auto' = 'auto'): Parsed | null {
  const t = raw.trim().replace(/[_,\s]/g, '')
  if (!t) return null
  if (/^[-+]?\d+(\.\d+)?$/.test(t)) {
    const n = Number(t)
    const unit = force === 'auto' ? detectUnit(n) : force
    let ms: number
    let fraction: string | undefined
    if (unit === 'us' || unit === 'ns') {
      // BigInt keeps precision for 16–19 digit integers
      const [ip] = t.split('.')
      const big = BigInt(ip)
      const div = unit === 'us' ? 1000n : 1000000n
      ms = Number(big / div)
      const rem = big % div
      fraction = (rem < 0n ? -rem : rem).toString().padStart(unit === 'us' ? 3 : 6, '0')
    } else ms = n / PER_MS[unit]
    if (!Number.isFinite(ms) || Math.abs(ms) > 8.64e15) return null
    return { ms: unit === 's' ? Math.round(ms) : ms, unit, fraction }
  }
  const s = raw.trim()
  // bare "YYYY-MM-DD HH:MM" → treat space as T (still local time, as the browser would)
  const iso = /^\d{4}-\d{2}-\d{2} \d/.test(s) ? s.replace(' ', 'T') : s
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? { ms, unit: 'date' } : null
}

export function toUnit(ms: number, unit: Unit): string {
  if (unit === 's') return String(Math.floor(ms / 1000))
  if (unit === 'ms') return String(Math.round(ms))
  const big = BigInt(Math.round(ms)) * (unit === 'us' ? 1000n : 1000000n)
  return big.toString()
}

/** ISO-8601 week number and week-year, computed in UTC. */
export function isoWeek(ms: number): { year: number; week: number } {
  const d = new Date(ms)
  const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  const day = (new Date(t).getUTCDay() + 6) % 7 // Mon=0
  const thu = t - day * 864e5 + 3 * 864e5
  const y = new Date(thu).getUTCFullYear()
  const week = 1 + Math.floor((thu - Date.UTC(y, 0, 1)) / (7 * 864e5))
  return { year: y, week }
}

export function dayOfYear(ms: number): number {
  const d = new Date(ms)
  return Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5) + 1
}

const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365.2425 * 864e5], ['month', 30.436875 * 864e5], ['week', 7 * 864e5], ['day', 864e5], ['hour', 36e5], ['minute', 6e4], ['second', 1e3],
]

/** "3 days ago" / "in 2 hours" relative to `now`. */
export function relative(ms: number, now: number, locale = 'en'): string {
  const diff = ms - now
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  for (const [u, len] of STEPS) if (Math.abs(diff) >= len || u === 'second') return rtf.format(Math.round(diff / len), u)
  return ''
}

/** Exact breakdown like "1y 23d 04:05:06". */
export function duration(msAbs: number): string {
  let s = Math.floor(Math.abs(msAbs) / 1000)
  const y = Math.floor(s / 31556952)
  s -= y * 31556952
  const d = Math.floor(s / 86400)
  s -= d * 86400
  const p = (n: number) => String(n).padStart(2, '0')
  return `${y ? `${y}y ` : ''}${d}d ${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`
}

/** UTC offset in minutes of `zone` at instant `ms`. */
export function zoneOffset(zone: string, ms: number): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(new Date(ms))
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second'))
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000)
}

export const fmtOffset = (min: number) => `UTC${min < 0 ? '−' : '+'}${String(Math.floor(Math.abs(min) / 60)).padStart(2, '0')}:${String(Math.abs(min) % 60).padStart(2, '0')}`

/** Wall-clock date/time in a zone → epoch ms (handles DST by iterating). */
export function wallToEpoch(date: string, time: string, zone: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const tm = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time)
  if (!m || !tm) return null
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +tm[1], +tm[2], +(tm[3] ?? 0))
  try {
    let t = guess - zoneOffset(zone, guess) * 60000
    t = guess - zoneOffset(zone, t) * 60000
    return t
  } catch {
    return null
  }
}

export function isValidZone(z: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: z })
    return true
  } catch {
    return false
  }
}

/** RFC 2822 date as used in e-mail headers, in UTC. */
export function rfc2822(ms: number): string {
  return new Date(ms).toUTCString().replace('GMT', '+0000')
}
