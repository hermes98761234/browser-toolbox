// Homework planner: due-date maths, sorting and weekly overview.

export interface Task {
  id: string
  title: string
  subject: string // subject id
  kid: string
  due: string // YYYY-MM-DD
  time: string // HH:MM
  minutes: number
  priority: 1 | 2 | 3 // 3 = high
  done: boolean
  notes: string
}

export const dueAt = (t: Task) => new Date(`${t.due}T${t.time || '08:00'}:00`)

export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00`)
  d.setDate(d.getDate() + n)
  return ymd(d)
}

/** Whole days from `today` to the due day (negative = overdue). */
export function daysLeft(t: Task, today: string): number {
  return Math.round((new Date(`${t.due}T12:00:00`).getTime() - new Date(`${today}T12:00:00`).getTime()) / 86400000)
}

export type Bucket = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'done'
export const BUCKETS: [Bucket, string][] = [['overdue', 'Overdue'], ['today', 'Due today'], ['tomorrow', 'Due tomorrow'], ['week', 'This week'], ['later', 'Later'], ['done', 'Done']]

export function bucket(t: Task, now: Date): Bucket {
  if (t.done) return 'done'
  if (dueAt(t).getTime() < now.getTime()) return 'overdue'
  const d = daysLeft(t, ymd(now))
  return d <= 0 ? 'today' : d === 1 ? 'tomorrow' : d <= 7 ? 'week' : 'later'
}

/** Sort: open before done, then due time, then priority (high first). */
export function sortTasks(ts: Task[]): Task[] {
  return [...ts].sort((a, b) => Number(a.done) - Number(b.done) || dueAt(a).getTime() - dueAt(b).getTime() || b.priority - a.priority || a.title.localeCompare(b.title))
}

/** Monday of the week containing `day`. */
export function weekStart(day: string): string {
  const d = new Date(`${day}T12:00:00`)
  const dow = (d.getDay() + 6) % 7
  return addDays(day, -dow)
}

export function week(ts: Task[], start: string) {
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(start, i)
    const tasks = sortTasks(ts.filter((t) => t.due === day))
    return { day, tasks, minutes: tasks.filter((t) => !t.done).reduce((a, t) => a + Math.max(0, t.minutes), 0) }
  })
}

export const reminderKey = (t: Task) => `${t.id}@${t.due}T${t.time}`

/** Tasks whose reminder time (due − lead minutes) has passed but due time has not, and not yet notified. */
export function dueReminders(ts: Task[], now: Date, leadMin: number, seen: Set<string>): Task[] {
  return ts.filter((t) => {
    if (t.done) return false
    const due = dueAt(t).getTime()
    return !seen.has(reminderKey(t)) && now.getTime() >= due - leadMin * 60000 && now.getTime() < due
  })
}
