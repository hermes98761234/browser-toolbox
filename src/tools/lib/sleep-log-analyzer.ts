// Sleep log maths: durations across midnight, efficiency, timing consistency, social jet lag, sleep debt.

export interface Night {
  id: string
  date: string // night-of date (the evening you went to bed), YYYY-MM-DD
  bed: string // HH:MM
  wake: string // HH:MM
  latency: number // minutes to fall asleep
  waso: number // minutes awake after sleep onset
  quality: number // 1–5
  note: string
}

/** "HH:MM" → minutes after midnight, NaN when malformed. */
export function toMin(t: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim())
  if (!m) return NaN
  const h = Number(m[1]), mi = Number(m[2])
  return h < 24 && mi < 60 ? h * 60 + mi : NaN
}

/** Bedtime as minutes on an evening-anchored clock: 12:00 → 0 … 11:59 next day → 1439. */
export const bedClock = (t: string) => (toMin(t) - 720 + 1440) % 1440

/** Time in bed in minutes (wake is assumed to follow bed within 24 h). */
export function timeInBed(bed: string, wake: string): number {
  const b = toMin(bed), w = toMin(wake)
  if (!Number.isFinite(b) || !Number.isFinite(w)) return NaN
  const d = (w - b + 1440) % 1440
  return d === 0 ? 1440 : d
}

export function nightStats(n: Night) {
  const tib = timeInBed(n.bed, n.wake)
  const sleep = Math.max(0, tib - Math.max(0, n.latency) - Math.max(0, n.waso))
  const start = bedClock(n.bed) // evening clock
  return { tib, sleep, eff: tib > 0 ? sleep / tib : NaN, start, end: start + tib, mid: start + tib / 2 }
}

export const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN)
/** Population standard deviation. */
export function sd(a: number[]): number {
  if (a.length < 2) return 0
  const m = mean(a)
  return Math.sqrt(mean(a.map((x) => (x - m) ** 2)))
}

/** Weekend = nights before Sat and Sun (Fri and Sat evenings). */
export const isFreeNight = (date: string) => {
  const d = new Date(date + 'T12:00:00').getDay()
  return d === 5 || d === 6
}

export function summary(nights: Night[], goalH: number) {
  const ok = nights.filter((n) => Number.isFinite(timeInBed(n.bed, n.wake)))
  const st = ok.map(nightStats)
  const sleeps = st.map((s) => s.sleep)
  const work = ok.map((n, i) => [n, st[i]] as const).filter(([n]) => !isFreeNight(n.date)).map(([, s]) => s.mid)
  const free = ok.map((n, i) => [n, st[i]] as const).filter(([n]) => isFreeNight(n.date)).map(([, s]) => s.mid)
  const sdBed = sd(st.map((s) => s.start)), sdWake = sd(st.map((s) => s.end))
  const recent = [...ok].sort((a, b) => a.date.localeCompare(b.date)).slice(-7).map((n) => nightStats(n).sleep)
  return {
    n: ok.length,
    avgSleep: mean(sleeps),
    sdSleep: sd(sleeps),
    avgEff: mean(st.map((s) => s.eff)),
    avgBed: mean(st.map((s) => s.start)),
    avgWake: mean(st.map((s) => s.end)),
    sdBed, sdWake,
    /** 100 = identical timing every night, 0 = ≥ 90 min average spread. */
    consistency: ok.length < 2 ? NaN : Math.max(0, 100 * (1 - (sdBed + sdWake) / 2 / 90)),
    /** Difference between free-day and work-day mid-sleep, minutes. */
    jetLag: work.length && free.length ? mean(free) - mean(work) : NaN,
    /** Sleep debt over the last 7 logged nights, minutes (positive = owed). */
    debt7: recent.reduce((a, s) => a + (goalH * 60 - s), 0),
    avgQuality: mean(ok.map((n) => n.quality)),
  }
}

/** Evening-clock minutes → "HH:MM" wall time. */
export function clock(m: number): string {
  if (!Number.isFinite(m)) return '—'
  const t = ((Math.round(m) + 720) % 1440 + 1440) % 1440
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

export function hm(min: number): string {
  if (!Number.isFinite(min)) return '—'
  const s = min < 0 ? '−' : ''
  const a = Math.round(Math.abs(min))
  return `${s}${Math.floor(a / 60)}h ${String(a % 60).padStart(2, '0')}m`
}

/** Trailing moving average over `k` points. */
export function rolling(a: number[], k: number): number[] {
  return a.map((_, i) => mean(a.slice(Math.max(0, i - k + 1), i + 1)))
}

/** Pearson correlation; NaN with < 3 points or zero variance. */
export function corr(x: number[], y: number[]): number {
  if (x.length < 3 || x.length !== y.length) return NaN
  const mx = mean(x), my = mean(y)
  let sxy = 0, sxx = 0, syy = 0
  for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2 }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN
}
