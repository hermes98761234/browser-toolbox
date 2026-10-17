// OKR maths: key-result progress (increasing or decreasing targets), weighted objective roll-up,
// quarter calendar, pace vs. elapsed time and carry-over to the next quarter.

export interface CheckIn { date: string; value: number }
export interface KeyResult {
  id: string
  title: string
  start: number
  target: number
  current: number
  unit: string
  weight: number
  log: CheckIn[]
}
export interface Objective {
  id: string
  title: string
  owner: string
  quarter: string
  krs: KeyResult[]
}

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0)

/** Fraction of the way from start to target (works when the target is below the start). */
export function krProgress(kr: Pick<KeyResult, 'start' | 'target' | 'current'>): number {
  if (kr.target === kr.start) return kr.current === kr.target ? 1 : 0
  return clamp01((kr.current - kr.start) / (kr.target - kr.start))
}

/** Weighted mean of key-result progress (weights ≤ 0 are ignored). */
export function objProgress(o: Pick<Objective, 'krs'>): number {
  let w = 0, s = 0
  for (const k of o.krs) {
    const kw = Math.max(0, k.weight)
    w += kw
    s += kw * krProgress(k)
  }
  return w ? s / w : 0
}

export const quarterProgress = (os: Objective[]) => (os.length ? os.reduce((a, o) => a + objProgress(o), 0) / os.length : 0)

/** "2026-Q4" for a date. */
export const quarterOf = (iso: string) => `${iso.slice(0, 4)}-Q${Math.floor((+iso.slice(5, 7) - 1) / 3) + 1}`

export function quarterRange(q: string): [string, string] {
  const y = +q.slice(0, 4), n = +q.slice(-1)
  const s = new Date(Date.UTC(y, (n - 1) * 3, 1))
  const e = new Date(Date.UTC(y, n * 3, 0))
  return [s.toISOString().slice(0, 10), e.toISOString().slice(0, 10)]
}

export function nextQuarter(q: string): string {
  const y = +q.slice(0, 4), n = +q.slice(-1)
  return n === 4 ? `${y + 1}-Q1` : `${y}-Q${n + 1}`
}

/** Share of the quarter elapsed on `today` (0 before, 1 after). */
export function elapsed(q: string, today: string): number {
  const [a, b] = quarterRange(q).map((d) => Date.parse(d + 'T00:00:00Z'))
  const t = Date.parse(today + 'T00:00:00Z')
  return clamp01((t - a + 86400000) / (b - a + 86400000))
}

export type Health = 'on-track' | 'at-risk' | 'off-track' | 'done'
/** Compares progress with linear pace through the quarter. */
export function health(progress: number, expected: number): Health {
  if (progress >= 1) return 'done'
  if (progress >= expected - 0.1) return 'on-track'
  if (progress >= expected - 0.3) return 'at-risk'
  return 'off-track'
}

/** Google-style grade colour band for an end-of-quarter score. */
export const grade = (p: number) => (p >= 0.7 ? 'good' : p >= 0.4 ? 'ok' : 'low')

/** Copies unfinished objectives into the next quarter, restarting each unfinished KR from its current value. */
export function carryOver(os: Objective[], q: string, newId: () => string): Objective[] {
  const nq = nextQuarter(q)
  return os
    .filter((o) => o.quarter === q && objProgress(o) < 1)
    .map((o) => ({
      ...o,
      id: newId(),
      quarter: nq,
      krs: o.krs.filter((k) => krProgress(k) < 1).map((k) => ({ ...k, id: newId(), start: k.current, log: [] })),
    }))
}

/** Objective progress after each check-in date, for a progress-over-time chart. */
export function history(o: Objective): [string, number][] {
  const dates = [...new Set(o.krs.flatMap((k) => k.log.map((c) => c.date)))].sort()
  return dates.map((d) => {
    const krs = o.krs.map((k) => {
      const past = k.log.filter((c) => c.date <= d)
      return { ...k, current: past.length ? past[past.length - 1].value : k.start }
    })
    return [d, objProgress({ krs })]
  })
}
