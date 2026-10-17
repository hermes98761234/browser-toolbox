// Recurring home-maintenance tasks: next-due dates, status and iCalendar export.
import { fold, icsEscape } from './content-calendar'

export type Unit = 'days' | 'weeks' | 'months' | 'years'
export interface Task {
  id: string
  name: string
  area: string
  every: number
  unit: Unit
  /** Preferred month (1-12) for seasonal tasks; 0 = no preference. */
  month: number
  history: string[] // YYYY-MM-DD completion dates
  notes: string
}

const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return { y, m, d }
}
const pad = (n: number) => String(n).padStart(2, '0')
const fmt = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()

export function addDays(s: string, n: number): string {
  const t = new Date(s + 'T00:00:00Z')
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}

/** Adds months, clamping to the month's last day (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(s: string, n: number): string {
  const { y, m, d } = parse(s)
  const idx = y * 12 + (m - 1) + n
  const ny = Math.floor(idx / 12), nm = (idx % 12) + 1
  return fmt(ny, nm, Math.min(d, daysIn(ny, nm)))
}

export function addInterval(s: string, every: number, unit: Unit): string {
  const n = Math.max(1, Math.round(every))
  if (unit === 'days') return addDays(s, n)
  if (unit === 'weeks') return addDays(s, 7 * n)
  return addMonths(s, unit === 'months' ? n : 12 * n)
}

export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000)

export const lastDone = (t: Task) => (t.history.length ? [...t.history].sort().at(-1)! : null)

/**
 * Next due date. Done before → last completion + interval (for yearly seasonal tasks, snapped to
 * the 1st of the preferred month of that year if it falls later). Never done → the next 1st of the
 * preferred month, or today.
 */
export function nextDue(t: Task, today: string): string {
  const last = lastDone(t)
  if (!last) {
    if (!t.month) return today
    const { y, m } = parse(today)
    return t.month >= m ? fmt(y, t.month, 1) : fmt(y + 1, t.month, 1)
  }
  const due = addInterval(last, t.every, t.unit)
  const years = t.unit === 'years' ? t.every : t.unit === 'months' && t.every % 12 === 0 ? t.every / 12 : 0
  if (t.month && years >= 1) {
    // Seasonal: the preferred month nearest to one interval later (up to 6 months early/late).
    const { y, m } = parse(addMonths(last, 12 * Math.round(years) - 6))
    return fmt(m <= t.month ? y : y + 1, t.month, 1)
  }
  return due
}

export type Status = 'overdue' | 'soon' | 'ok'
export function status(due: string, today: string, soonDays = 14): Status {
  const d = daysBetween(today, due)
  return d < 0 ? 'overdue' : d <= soonDays ? 'soon' : 'ok'
}

const RRULE: Record<Unit, string> = { days: 'DAILY', weeks: 'WEEKLY', months: 'MONTHLY', years: 'YEARLY' }

/** iCalendar with one all-day recurring event per task, starting at its next due date. */
export function toIcs(tasks: Task[], today: string, stamp: Date): string {
  const z = stamp.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Browser Toolbox//Home Maintenance Scheduler//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Home maintenance']
  for (const t of tasks) {
    const due = nextDue(t, today)
    lines.push(
      'BEGIN:VEVENT',
      `UID:${t.id}@home-maintenance.browser-toolbox`,
      `DTSTAMP:${z}`,
      `DTSTART;VALUE=DATE:${due.replace(/-/g, '')}`,
      `DTEND;VALUE=DATE:${addDays(due, 1).replace(/-/g, '')}`,
      `RRULE:FREQ=${RRULE[t.unit]};INTERVAL=${Math.max(1, Math.round(t.every))}`,
      `SUMMARY:${icsEscape(`🏠 ${t.name}`)}`,
      `CATEGORIES:${icsEscape(t.area)}`,
      `DESCRIPTION:${icsEscape(`${t.area} · every ${t.every === 1 ? t.unit.slice(0, -1) : `${t.every} ${t.unit}`}${t.notes ? `\n${t.notes}` : ''}`)}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(t.name)}`, 'TRIGGER:-PT15H', 'END:VALARM',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}
