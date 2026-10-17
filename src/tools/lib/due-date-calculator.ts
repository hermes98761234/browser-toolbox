// Pregnancy dating: Naegele's rule (with cycle-length adjustment), conception, IVF transfer and
// ultrasound dating, gestational age and informational milestones. Dates are YYYY-MM-DD (UTC).

const DAY = 86400000
export const toDay = (iso: string) => Math.round(Date.parse(iso + 'T00:00:00Z') / DAY)
export const fromDay = (d: number) => new Date(d * DAY).toISOString().slice(0, 10)
export const isDate = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso) && Number.isFinite(Date.parse(iso + 'T00:00:00Z'))

export type Method = 'lmp' | 'conception' | 'ivf3' | 'ivf5' | 'ultrasound'
export interface Input {
  method: Method
  date: string
  /** Average cycle length (LMP method). */
  cycle: number
  /** Gestational age at the ultrasound. */
  usWeeks: number
  usDays: number
}

/** "LMP-equivalent" start date: gestational age 0w0d. */
export function lmpEquivalent(i: Input): string {
  const d = toDay(i.date)
  switch (i.method) {
    case 'lmp': return fromDay(d + (Math.round(i.cycle) - 28))
    case 'conception': return fromDay(d - 14)
    case 'ivf3': return fromDay(d - 17)
    case 'ivf5': return fromDay(d - 19)
    case 'ultrasound': return fromDay(d - (Math.round(i.usWeeks) * 7 + Math.round(i.usDays)))
  }
}

/** Estimated due date = LMP-equivalent + 280 days (40 weeks). */
export const dueDate = (i: Input) => fromDay(toDay(lmpEquivalent(i)) + 280)

/** Classic Naegele's rule on the calendar: LMP + 1 year − 3 months + 7 days (28-day cycle). */
export function naegeleCalendar(lmp: string): string {
  const [y, m, d] = lmp.split('-').map(Number)
  const t = new Date(Date.UTC(y + 1, m - 1 - 3, d + 7))
  return t.toISOString().slice(0, 10)
}

export function gestationalAge(lmpEq: string, on: string): { weeks: number; days: number; total: number } {
  const total = toDay(on) - toDay(lmpEq)
  return { weeks: Math.floor(total / 7), days: ((total % 7) + 7) % 7, total }
}

export const trimester = (totalDays: number) => (totalDays < 14 * 7 ? 1 : totalDays < 28 * 7 ? 2 : 3)

export interface Milestone { from: number; to: number; title: string; note: string }
/** Week ranges (inclusive start week, exclusive end) of common informational milestones. */
export const MILESTONES: Milestone[] = [
  { from: 4, to: 5, title: 'Home pregnancy test usually positive', note: 'Around the time of the missed period.' },
  { from: 6, to: 9, title: 'Early ultrasound / first prenatal visit', note: 'Cardiac activity is often visible from about 6–7 weeks.' },
  { from: 10, to: 14, title: 'First-trimester screening window', note: 'Blood screening (cfDNA/NIPT from 10 weeks) and nuchal translucency scan around 11–14 weeks.' },
  { from: 14, to: 15, title: 'Second trimester begins', note: '14 weeks 0 days.' },
  { from: 18, to: 23, title: 'Anatomy (mid-pregnancy) scan', note: 'Detailed ultrasound, usually 18–22 weeks.' },
  { from: 24, to: 29, title: 'Glucose screening window', note: 'Gestational diabetes screening is commonly done at 24–28 weeks.' },
  { from: 27, to: 37, title: 'Pertussis (Tdap) vaccine window', note: 'Often recommended between 27 and 36 weeks in each pregnancy.' },
  { from: 28, to: 29, title: 'Third trimester begins', note: '28 weeks 0 days. Rh-negative patients may be offered anti-D.' },
  { from: 36, to: 38, title: 'Group B strep screening', note: 'Usually 36 0/7 – 37 6/7 weeks.' },
  { from: 37, to: 39, title: 'Early term', note: '37 0/7 – 38 6/7 weeks.' },
  { from: 39, to: 41, title: 'Full term', note: '39 0/7 – 40 6/7 weeks; estimated due date at 40 0/7.' },
  { from: 41, to: 42, title: 'Late term', note: '41 0/7 – 41 6/7 weeks.' },
]

/** Approximate size by week (crown–rump length until 13 weeks, then crown–heel), cm and grams. */
export const SIZE: Record<number, [string, number, number]> = {
  8: ['raspberry', 1.6, 1], 10: ['strawberry', 3.1, 4], 12: ['lime', 5.4, 14], 14: ['lemon', 14.7, 43], 16: ['avocado', 18.6, 100], 18: ['bell pepper', 22.2, 190],
  20: ['banana', 25.6, 300], 22: ['papaya', 27.8, 430], 24: ['ear of corn', 30, 600], 26: ['zucchini', 35.6, 760], 28: ['eggplant', 37.6, 1000], 30: ['cabbage', 39.9, 1300],
  32: ['squash', 42.4, 1700], 34: ['cantaloupe', 45, 2100], 36: ['romaine lettuce', 47.4, 2600], 38: ['pumpkin', 49.8, 3100], 40: ['watermelon', 51.2, 3400],
}
export function sizeAt(week: number): [number, [string, number, number]] | null {
  const ks = Object.keys(SIZE).map(Number).filter((k) => k <= week)
  if (!ks.length) return null
  const k = Math.max(...ks)
  return [k, SIZE[k]]
}

export function toIcs(events: { date: string; end?: string; title: string; note?: string }[], stamp = '20260101T000000Z'): string {
  const d = (iso: string) => iso.replace(/-/g, '')
  const esc = (s: string) => s.replace(/[\\,;]/g, '\\$&')
  const out = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Browser Toolbox//Due Date//EN', 'CALSCALE:GREGORIAN']
  events.forEach((e, i) => {
    out.push('BEGIN:VEVENT', `UID:due-${i}-${d(e.date)}@browser-toolbox`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d(e.date)}`, `DTEND;VALUE=DATE:${d(fromDay(toDay(e.end ?? e.date) + 1))}`, `SUMMARY:${esc(e.title)}`)
    if (e.note) out.push(`DESCRIPTION:${esc(e.note)}`)
    out.push('TRANSP:TRANSPARENT', 'END:VEVENT')
  })
  out.push('END:VCALENDAR')
  return out.join('\r\n') + '\r\n'
}
