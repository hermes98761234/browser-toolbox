// Pure helpers for the study Pomodoro timer: phase cycling, daily stats, streaks.

export type Phase = 'focus' | 'short' | 'long'
export interface Session { id: string; start: number; min: number; subject: string; task?: string; interruptions: number; rating: number }

export const DAY = 86_400_000

/** Phase that follows `phase`, given how many focus sessions are finished in this cycle (after this one). */
export function nextPhase(phase: Phase, focusDone: number, longEvery: number): Phase {
  if (phase !== 'focus') return 'focus'
  return focusDone > 0 && focusDone % Math.max(1, longEvery) === 0 ? 'long' : 'short'
}

/** Local-date key YYYY-MM-DD. */
export function dayKey(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Minutes per subject for each of the last `days` days (oldest first). */
export function dailyBySubject(log: Session[], days: number, now: number, subjects: string[]) {
  const s0 = startOfDay(now)
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(s0)
    d.setDate(d.getDate() - (days - 1 - i))
    const key = dayKey(d.getTime())
    const day = log.filter((x) => dayKey(x.start) === key)
    return { key, date: d, values: subjects.map((sub) => day.filter((x) => x.subject === sub).reduce((a, x) => a + x.min, 0)), count: day.length }
  })
}

/** Consecutive days (ending today, or yesterday if today isn't done yet) with ≥ goal sessions. */
export function streak(log: Session[], goal: number, now: number): number {
  const per = new Map<string, number>()
  for (const x of log) per.set(dayKey(x.start), (per.get(dayKey(x.start)) ?? 0) + 1)
  const d = new Date(startOfDay(now))
  if ((per.get(dayKey(d.getTime())) ?? 0) < goal) d.setDate(d.getDate() - 1)
  let n = 0
  while ((per.get(dayKey(d.getTime())) ?? 0) >= goal) {
    n++
    d.setDate(d.getDate() - 1)
  }
  return n
}

/** Average rating and session count by hour of day (start time). */
export function byHour(log: Session[]) {
  return Array.from({ length: 24 }, (_, h) => {
    const xs = log.filter((x) => new Date(x.start).getHours() === h)
    return { h, n: xs.length, rating: xs.length ? xs.reduce((a, x) => a + x.rating, 0) / xs.length : 0 }
  })
}

export const mmss = (ms: number) => {
  const t = Math.max(0, Math.ceil(ms / 1000))
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}
