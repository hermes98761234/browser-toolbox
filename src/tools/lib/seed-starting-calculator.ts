// Indoor seed-starting schedule: sow, germinate, harden off and transplant dates from the last spring frost.

export interface Seed {
  name: string
  /** Sow indoors this many weeks before last frost [earliest, latest]. */
  sow: [number, number]
  /** Days to germinate [min, max]. */
  germ: [number, number]
  /** Ideal soil temperature for germination, °F [min, max]. */
  temp: [number, number]
  /** Transplant outdoors, weeks relative to last frost (negative = before). */
  out: number
  hardy?: boolean
}

export const SEEDS: Seed[] = [
  { name: 'Tomato', sow: [8, 6], germ: [5, 10], temp: [75, 85], out: 1 },
  { name: 'Pepper', sow: [10, 8], germ: [7, 14], temp: [80, 85], out: 2 },
  { name: 'Eggplant', sow: [10, 8], germ: [7, 14], temp: [80, 85], out: 2 },
  { name: 'Basil', sow: [6, 4], germ: [5, 10], temp: [70, 80], out: 1 },
  { name: 'Broccoli', sow: [8, 6], germ: [4, 7], temp: [65, 75], out: -2, hardy: true },
  { name: 'Cabbage', sow: [8, 6], germ: [4, 7], temp: [65, 75], out: -3, hardy: true },
  { name: 'Cauliflower', sow: [8, 6], germ: [5, 10], temp: [65, 75], out: -2, hardy: true },
  { name: 'Kale', sow: [8, 6], germ: [5, 8], temp: [65, 75], out: -3, hardy: true },
  { name: 'Lettuce', sow: [6, 4], germ: [2, 7], temp: [60, 70], out: -2, hardy: true },
  { name: 'Onion (seed)', sow: [12, 10], germ: [7, 14], temp: [65, 75], out: -4, hardy: true },
  { name: 'Leek', sow: [12, 10], germ: [7, 14], temp: [65, 75], out: -2, hardy: true },
  { name: 'Celery', sow: [12, 10], germ: [14, 21], temp: [70, 75], out: 1 },
  { name: 'Parsley', sow: [10, 8], germ: [14, 28], temp: [70, 75], out: -1, hardy: true },
  { name: 'Cucumber', sow: [4, 3], germ: [3, 7], temp: [75, 85], out: 2 },
  { name: 'Zucchini / squash', sow: [4, 3], germ: [3, 7], temp: [75, 85], out: 2 },
  { name: 'Melon', sow: [4, 3], germ: [4, 8], temp: [80, 90], out: 2 },
  { name: 'Marigold', sow: [8, 6], germ: [5, 10], temp: [70, 75], out: 1 },
  { name: 'Petunia', sow: [12, 10], germ: [7, 14], temp: [75, 80], out: 1 },
]

const DAY = 86400000
export const toDay = (iso: string) => Math.round(Date.parse(iso + 'T00:00:00Z') / DAY)
export const fromDay = (d: number) => new Date(d * DAY).toISOString().slice(0, 10)
export const validDate = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso) && Number.isFinite(Date.parse(iso + 'T00:00:00Z'))

export interface Plan {
  name: string
  sowFrom: string
  sowTo: string
  germFrom: string
  germTo: string
  hardenFrom: string
  transplant: string
  /** Weeks indoors from the earliest sowing to transplant. */
  weeksIndoors: number
  temp: [number, number]
  hardy: boolean
}

/** Schedule for one seed; `margin` shifts transplanting later (weeks) to be safe from a late frost. */
export function plan(s: Seed, lastFrost: string, margin = 0): Plan {
  const f = toDay(lastFrost)
  const tender = !s.hardy
  const tr = f + (s.out + (tender ? margin : 0)) * 7
  const sowFrom = f - s.sow[0] * 7 + (tender ? margin * 7 : 0)
  const sowTo = f - s.sow[1] * 7 + (tender ? margin * 7 : 0)
  return {
    name: s.name,
    sowFrom: fromDay(sowFrom),
    sowTo: fromDay(sowTo),
    germFrom: fromDay(sowFrom + s.germ[0]),
    germTo: fromDay(sowTo + s.germ[1]),
    hardenFrom: fromDay(tr - 7),
    transplant: fromDay(tr),
    weeksIndoors: Math.round((tr - sowFrom) / 7),
    temp: s.temp,
    hardy: !!s.hardy,
  }
}

export interface Event { date: string; end?: string; title: string }

export function events(plans: Plan[]): Event[] {
  return plans
    .flatMap((p) => [
      { date: p.sowFrom, end: p.sowTo, title: `Sow ${p.name} indoors` },
      { date: p.hardenFrom, end: fromDay(toDay(p.transplant) - 1), title: `Harden off ${p.name}` },
      { date: p.transplant, title: `Transplant ${p.name} outside` },
    ])
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** iCalendar with all-day events (end date exclusive, as RFC 5545 requires). */
export function toIcs(evs: Event[], stamp = '20260101T000000Z'): string {
  const d = (iso: string) => iso.replace(/-/g, '')
  const out = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Browser Toolbox//Seed Starting//EN', 'CALSCALE:GREGORIAN']
  evs.forEach((e, i) => {
    out.push('BEGIN:VEVENT', `UID:seed-${i}-${d(e.date)}@browser-toolbox`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d(e.date)}`, `DTEND;VALUE=DATE:${d(fromDay(toDay(e.end ?? e.date) + 1))}`, `SUMMARY:${e.title.replace(/[,;]/g, '\\$&')}`, 'TRANSP:TRANSPARENT', 'END:VEVENT')
  })
  out.push('END:VCALENDAR')
  return out.join('\r\n') + '\r\n'
}

/** Typical average last spring frost by USDA hardiness zone (month, day). */
export const ZONE_FROST: [string, number, number][] = [
  ['Zone 3', 5, 20], ['Zone 4', 5, 10], ['Zone 5', 4, 30], ['Zone 6', 4, 20], ['Zone 7', 4, 5], ['Zone 8', 3, 20], ['Zone 9', 2, 25], ['Zone 10', 1, 30],
]

/** Next occurrence (on or after `today`) of month/day. */
export function nextDate(month: number, day: number, today: string): string {
  const y = +today.slice(0, 4)
  const iso = (yy: number) => `${yy}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return iso(y) >= today ? iso(y) : iso(y + 1)
}

export const cToF = (c: number) => (c * 9) / 5 + 32
export const fToC = (f: number) => ((f - 32) * 5) / 9
