// Time-zone math via Intl.DateTimeFormat (DST-aware, no tz database bundled).

const fmtCache = new Map<string, Intl.DateTimeFormat>()
function dtf(zone: string) {
  let f = fmtCache.get(zone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' })
    fmtCache.set(zone, f)
  }
  return f
}

export interface Local { y: number; mo: number; d: number; h: number; mi: number; wd: string }

/** Wall-clock parts of instant `t` (ms) in `zone`. */
export function local(t: number, zone: string): Local {
  const p: Record<string, string> = {}
  for (const x of dtf(zone).formatToParts(new Date(t))) p[x.type] = x.value
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, wd: p.weekday }
}

/** UTC offset of `zone` at instant `t`, in minutes (e.g. −300 for New York in winter). */
export function offset(t: number, zone: string): number {
  const l = local(t, zone)
  const asUtc = Date.UTC(l.y, l.mo - 1, l.d, l.h, l.mi)
  return Math.round((asUtc - Math.floor(t / 60000) * 60000) / 60000)
}

/** Instant of local midnight on `date` (YYYY-MM-DD) in `zone`. */
export function midnight(date: string, zone: string): number {
  const [y, m, d] = date.split('-').map(Number)
  let t = Date.UTC(y, m - 1, d)
  // two passes handle DST transitions around midnight
  for (let i = 0; i < 2; i++) t = Date.UTC(y, m - 1, d) - offset(t, zone) * 60000
  return t
}

export const isWeekend = (wd: string) => wd === 'Sat' || wd === 'Sun'

export const fmtOffset = (min: number) => `UTC${min < 0 ? '−' : '+'}${Math.floor(Math.abs(min) / 60)}${Math.abs(min) % 60 ? ':' + String(Math.abs(min) % 60).padStart(2, '0') : ''}`

/** 0 = asleep, 1 = early/evening, 2 = working hours, given local decimal hour and the person's working window. */
export function band(h: number, start = 9, end = 17, weekend = false): 0 | 1 | 2 {
  if (h >= start && h < end && !weekend) return 2
  if (h >= 7 && h < 22) return 1
  return 0
}

/**
 * Scores each slot (step minutes, from `t0`, `n` slots) for a meeting of `len` slots:
 * sum over cities of the worst band inside the meeting. Returns slot indexes sorted best first.
 */
export function bestSlots(t0: number, n: number, step: number, len: number, zones: { zone: string; start: number; end: number }[]): { i: number; score: number; allWork: boolean }[] {
  const out: { i: number; score: number; allWork: boolean }[] = []
  for (let i = 0; i + len <= n; i++) {
    let score = 0
    let allWork = true
    for (const z of zones) {
      let worst = 2
      for (let k = 0; k < len; k++) {
        const l = local(t0 + (i + k) * step * 60000, z.zone)
        worst = Math.min(worst, band(l.h + l.mi / 60, z.start, z.end, isWeekend(l.wd)))
      }
      score += worst
      if (worst < 2) allWork = false
    }
    out.push({ i, score, allWork })
  }
  return out.sort((a, b) => b.score - a.score || a.i - b.i)
}
