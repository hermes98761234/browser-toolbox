// Habit streak math on YYYY-MM-DD keys (calendar days, timezone-free).

export const addDay = (key: string, n: number) => {
  const d = new Date(key + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
/** 0 = Sunday … 6 = Saturday. */
export const weekday = (key: string) => new Date(key + 'T00:00:00Z').getUTCDay()
export const localKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** schedule: weekdays the habit is due; empty = every day. */
const due = (key: string, schedule: number[]) => !schedule.length || schedule.includes(weekday(key))

/**
 * Current streak: consecutive due days completed, walking back from today.
 * An unfinished today does not break the streak (the day isn't over).
 */
export function currentStreak(done: Set<string>, schedule: number[], today: string, limit = 3660): number {
  let n = 0
  let k = today
  if (due(k, schedule) && !done.has(k)) k = addDay(k, -1)
  for (let i = 0; i < limit; i++, k = addDay(k, -1)) {
    if (!due(k, schedule)) continue
    if (!done.has(k)) break
    n++
  }
  return n
}

/** Longest run of consecutive completed due days, from the earliest completion to today. */
export function longestStreak(done: Set<string>, schedule: number[], today: string): number {
  if (!done.size) return 0
  let k = [...done].sort()[0]
  let best = 0, run = 0
  for (let i = 0; i < 3660 && k <= today; i++, k = addDay(k, 1)) {
    if (!due(k, schedule)) continue
    if (done.has(k)) best = Math.max(best, ++run)
    else if (k !== today) run = 0
  }
  return best
}

/** Completed / due over the last `days` days ending today (today counts only if done). */
export function completionRate(done: Set<string>, schedule: number[], today: string, days: number): number {
  let d = 0, c = 0
  for (let i = 0; i < days; i++) {
    const k = addDay(today, -i)
    if (!due(k, schedule)) continue
    if (k === today && !done.has(k)) continue
    d++
    if (done.has(k)) c++
  }
  return d ? c / d : 0
}
