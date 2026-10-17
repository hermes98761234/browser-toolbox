// Step log math: goal streaks, monthly summaries and distance estimates on YYYY-MM-DD keys.
import { addDay } from './habit-tracker'

export type Log = Record<string, number> // date → steps

const hit = (log: Log, k: string, goal: number) => (log[k] ?? 0) >= goal

/** Consecutive days at/over the goal ending today; an unfinished today does not break it. */
export function currentStreak(log: Log, goal: number, today: string): number {
  let k = today
  if (!hit(log, k, goal)) k = addDay(k, -1)
  let n = 0
  while (hit(log, k, goal) && n < 5000) {
    n++
    k = addDay(k, -1)
  }
  return n
}

/** Longest run of consecutive goal days anywhere in the log. */
export function bestStreak(log: Log, goal: number): number {
  const days = Object.keys(log).filter((k) => hit(log, k, goal)).sort()
  let best = 0, run = 0, prev = ''
  for (const k of days) {
    run = prev && addDay(prev, 1) === k ? run + 1 : 1
    best = Math.max(best, run)
    prev = k
  }
  return best
}

export interface MonthSummary { days: number; logged: number; total: number; avg: number; goalDays: number; best: { date: string; steps: number } | null }

/** Summary of a calendar month (`ym` = YYYY-MM); averages use logged days only. */
export function monthSummary(log: Log, goal: number, ym: string): MonthSummary {
  const entries = Object.entries(log).filter(([k]) => k.startsWith(ym + '-'))
  const [y, m] = ym.split('-').map(Number)
  const days = new Date(y, m, 0).getDate()
  const total = entries.reduce((a, [, v]) => a + v, 0)
  let best: MonthSummary['best'] = null
  for (const [date, steps] of entries) if (!best || steps > best.steps) best = { date, steps }
  return { days, logged: entries.length, total, avg: entries.length ? total / entries.length : 0, goalDays: entries.filter(([, v]) => v >= goal).length, best }
}

/** Average steps over the `n` days ending `today` (missing days count as 0 only if `strict`). */
export function rollingAvg(log: Log, today: string, n: number, strict = false): number {
  let sum = 0, cnt = 0
  for (let i = 0; i < n; i++) {
    const v = log[addDay(today, -i)]
    if (v !== undefined) { sum += v; cnt++ } else if (strict) cnt++
  }
  return cnt ? sum / cnt : 0
}

/** Stride length estimate from height (≈ 0.415 × height for walking) in cm. */
export const strideCm = (heightCm: number) => heightCm * 0.415
/** Distance in km for a step count. */
export const stepsToKm = (steps: number, stride: number) => (steps * stride) / 100000
/** Rough walking energy: ≈ 0.57 kcal per pound of body weight per mile walked. */
export const stepsToKcal = (steps: number, weightKg: number, stride: number) => (stepsToKm(steps, stride) / 1.609344) * 0.57 * weightKg * 2.20462
