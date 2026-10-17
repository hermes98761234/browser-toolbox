// Recurring pet medication rules → dose occurrences (local calendar dates + HH:MM times).

export type Repeat = 'daily' | 'weekly' | 'everyNDays' | 'monthly' | 'once'
export interface Med {
  id: string
  pet: string
  name: string
  dose: string
  repeat: Repeat
  /** N for everyNDays (days) or monthly (months). */
  every: number
  /** Weekdays for weekly (0 = Sunday). */
  days: number[]
  times: string[] // HH:MM
  start: string // YYYY-MM-DD
  end: string // '' = open-ended
  notes: string
}
export interface Dose { med: Med; date: string; time: string; key: string }

const parse = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))
const fmt = (t: number) => new Date(t).toISOString().slice(0, 10)
export const addDays = (s: string, n: number) => fmt(parse(s) + n * 86400000)
export const dayDiff = (a: string, b: string) => Math.round((parse(b) - parse(a)) / 86400000)
export const weekday = (s: string) => new Date(parse(s)).getUTCDay()
const daysIn = (y: number, m0: number) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate()

export const doseKey = (medId: string, date: string, time: string) => `${medId}@${date}T${time}`

/** Is the medication due on this date? Monthly doses on the 31st fall on the month's last day. */
export function dueOn(m: Med, date: string): boolean {
  if (date < m.start || (m.end && date > m.end)) return false
  const n = Math.max(1, Math.round(m.every))
  switch (m.repeat) {
    case 'once': return date === m.start
    case 'daily': return true
    case 'everyNDays': return dayDiff(m.start, date) % n === 0
    case 'weekly': return m.days.includes(weekday(date))
    case 'monthly': {
      const [sy, sm, sd] = [+m.start.slice(0, 4), +m.start.slice(5, 7) - 1, +m.start.slice(8, 10)]
      const [y, mo, d] = [+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)]
      const months = (y - sy) * 12 + (mo - sm)
      return months % n === 0 && d === Math.min(sd, daysIn(y, mo))
    }
  }
}

const sortedTimes = (m: Med) => [...m.times].filter((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)).sort()

/** All doses in [from, to] inclusive, ordered by date and time. */
export function doses(meds: Med[], from: string, to: string): Dose[] {
  const out: Dose[] = []
  for (let d = from, i = 0; d <= to && i < 1000; d = addDays(d, 1), i++)
    for (const m of meds) if (dueOn(m, d)) for (const t of sortedTimes(m)) out.push({ med: m, date: d, time: t, key: doseKey(m.id, d, t) })
  return out.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
}

/** Next date (≥ from) the medication is due, searching up to ~2 years ahead. */
export function nextDate(m: Med, from: string): string | null {
  for (let d = from > m.start ? from : m.start, i = 0; i < 800; d = addDays(d, 1), i++) {
    if (m.end && d > m.end) return null
    if (dueOn(m, d)) return d
  }
  return null
}

/** Given / due over past doses (not counting doses later than `nowKey` = 'YYYY-MM-DDTHH:MM'). */
export function adherence(meds: Med[], given: Record<string, string>, from: string, nowKey: string) {
  const past = doses(meds, from, nowKey.slice(0, 10)).filter((d) => `${d.date}T${d.time}` <= nowKey)
  const done = past.filter((d) => given[d.key]).length
  return { due: past.length, done, missed: past.length - done }
}

export function describe(m: Med): string {
  const n = Math.max(1, Math.round(m.every))
  const t = sortedTimes(m).join(', ')
  switch (m.repeat) {
    case 'once': return `once on ${m.start} at ${t}`
    case 'daily': return `daily at ${t}`
    case 'everyNDays': return n === 1 ? `daily at ${t}` : `every ${n} days at ${t}`
    case 'weekly': return `every ${m.days.map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')} at ${t}`
    case 'monthly': return `${n === 1 ? 'monthly' : `every ${n} months`} on day ${+m.start.slice(8)} at ${t}`
  }
}
