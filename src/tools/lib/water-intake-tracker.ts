export interface Drink {
  t: string // HH:MM
  ml: number
}
export type Log = Record<string, Drink[]>

export const ML_PER_OZ = 29.5735

/** Daily goal suggestion: 35 ml per kg body weight, +350 ml per 30 min of exercise, +500 ml in hot weather. */
export function suggestGoal(weightKg: number, exerciseMin: number, hot: boolean): number {
  const base = Math.max(0, weightKg) * 35 + (Math.max(0, exerciseMin) / 30) * 350 + (hot ? 500 : 0)
  return Math.round(base / 50) * 50
}

export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return isoDay(new Date(y, m - 1, d + n))
}

export const dayTotal = (log: Log, day: string) => (log[day] ?? []).reduce((a, x) => a + x.ml, 0)

/** The last `n` days ending at `end` (oldest first) with totals. */
export function lastDays(log: Log, end: string, n = 7): { day: string; ml: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const day = addDays(end, i - n + 1)
    return { day, ml: dayTotal(log, day) }
  })
}

/** Consecutive days (ending today, or yesterday if today not yet reached) meeting the goal. */
export function streak(log: Log, end: string, goal: number): number {
  let d = dayTotal(log, end) >= goal ? end : addDays(end, -1)
  let n = 0
  while (goal > 0 && dayTotal(log, d) >= goal) {
    n++
    d = addDays(d, -1)
  }
  return n
}

/** Minutes since midnight for HH:MM. */
export const minutesOf = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** Whether a reminder is due: inside the active window and `every` minutes since the last drink/reminder. */
export function reminderDue(nowMin: number, lastMin: number | null, every: number, from: string, to: string): boolean {
  if (nowMin < minutesOf(from) || nowMin > minutesOf(to)) return false
  const since = lastMin == null ? nowMin - minutesOf(from) : nowMin - lastMin
  return since >= every
}
