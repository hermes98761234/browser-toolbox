// Newborn log math: per-day diaper counts and sleep totals (sessions split at local midnight).

export type Kind = 'wet' | 'dirty' | 'both' | 'feed'
export interface Ev { id: string; t: number; kind: Kind; note?: string }
export interface Sleep { id: string; start: number; end: number | null }

const H = 3600000
/** Local midnight for a timestamp. */
export const dayStart = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }
/** Adds whole local days (DST-safe). */
export const addDays = (day: number, n: number) => { const d = new Date(day); d.setDate(d.getDate() + n); return d.getTime() }
export const dayKey = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

/** Milliseconds of sleep falling inside [from, to). Open sessions run until `now`. */
export function sleepWithin(sleeps: Sleep[], from: number, to: number, now: number): number {
  let ms = 0
  for (const s of sleeps) {
    const a = Math.max(s.start, from), b = Math.min(s.end ?? now, to)
    if (b > a) ms += b - a
  }
  return ms
}

export interface DaySummary { day: number; key: string; wet: number; dirty: number; feeds: number; sleepH: number; longestH: number }

/** Summary for each of the last `n` local days ending with the day of `now`. */
export function summarize(events: Ev[], sleeps: Sleep[], now: number, n: number): DaySummary[] {
  const today = dayStart(now)
  const out: DaySummary[] = []
  for (let i = n - 1; i >= 0; i--) {
    const day = addDays(today, -i), next = addDays(day, 1)
    const evs = events.filter((e) => e.t >= day && e.t < next)
    const longest = sleeps.reduce((m, s) => {
      const a = Math.max(s.start, day), b = Math.min(s.end ?? now, next)
      return b > a ? Math.max(m, b - a) : m
    }, 0)
    out.push({
      day, key: dayKey(day),
      wet: evs.filter((e) => e.kind === 'wet' || e.kind === 'both').length,
      dirty: evs.filter((e) => e.kind === 'dirty' || e.kind === 'both').length,
      feeds: evs.filter((e) => e.kind === 'feed').length,
      sleepH: sleepWithin(sleeps, day, next, now) / H,
      longestH: longest / H,
    })
  }
  return out
}

/** "2h 15m" style duration. */
export function dur(ms: number): string {
  if (!(ms >= 0)) return '—'
  const m = Math.round(ms / 60000)
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}
