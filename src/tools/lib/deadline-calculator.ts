// Deadline Calculator logic: computed holiday calendars (US federal, UK England & Wales),
// business-day and court-style calendar-day counting, and iCalendar export.
// Dates are ISO strings "YYYY-MM-DD"; arithmetic uses UTC to avoid time-zone drift.

export const toDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
export const iso = (d: Date) => d.toISOString().slice(0, 10)
export const add = (s: string, n: number) => {
  const d = toDate(s)
  d.setUTCDate(d.getUTCDate() + n)
  return iso(d)
}
export const dow = (s: string) => toDate(s).getUTCDay() // 0 = Sunday
const ymd = (y: number, m: number, d: number) => iso(new Date(Date.UTC(y, m - 1, d)))

/** Gregorian Easter Sunday (anonymous / Meeus–Jones–Butcher computus). */
export function easter(y: number): string {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1
  return ymd(y, month, day)
}

/** n-th weekday (0 = Sun … 6 = Sat) of a month; n = -1 → last. */
export function nthWeekday(y: number, m: number, wd: number, n: number): string {
  if (n > 0) {
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay()
    return ymd(y, m, 1 + ((wd - first + 7) % 7) + (n - 1) * 7)
  }
  const lastDay = new Date(Date.UTC(y, m, 0))
  return ymd(y, m, lastDay.getUTCDate() - ((lastDay.getUTCDay() - wd + 7) % 7))
}

export interface Holiday { date: string; name: string }

/** US federal holidays (5 U.S.C. 6103) with the Saturday → Friday / Sunday → Monday observance rule. */
export function usFederal(y: number): Holiday[] {
  const obs = (d: string) => (dow(d) === 6 ? add(d, -1) : dow(d) === 0 ? add(d, 1) : d)
  const list: Holiday[] = [
    { date: obs(ymd(y, 1, 1)), name: "New Year's Day" },
    { date: nthWeekday(y, 1, 1, 3), name: 'Birthday of Martin Luther King, Jr.' },
    { date: nthWeekday(y, 2, 1, 3), name: "Washington's Birthday" },
    { date: nthWeekday(y, 5, 1, -1), name: 'Memorial Day' },
    ...(y >= 2021 ? [{ date: obs(ymd(y, 6, 19)), name: 'Juneteenth National Independence Day' }] : []),
    { date: obs(ymd(y, 7, 4)), name: 'Independence Day' },
    { date: nthWeekday(y, 9, 1, 1), name: 'Labor Day' },
    { date: nthWeekday(y, 10, 1, 2), name: 'Columbus Day' },
    { date: obs(ymd(y, 11, 11)), name: 'Veterans Day' },
    { date: nthWeekday(y, 11, 4, 4), name: 'Thanksgiving Day' },
    { date: obs(ymd(y, 12, 25)), name: 'Christmas Day' },
  ]
  // New Year's Day of the following year observed on Friday 31 December.
  if (dow(ymd(y + 1, 1, 1)) === 6) list.push({ date: ymd(y, 12, 31), name: "New Year's Day (observed)" })
  return list.filter((h) => h.date.startsWith(String(y))).sort((a, b) => a.date.localeCompare(b.date))
}

// One-off changes to England & Wales bank holidays by royal proclamation.
const UK_MOVED: Record<string, Record<string, string>> = {
  '1995': { early: '1995-05-08' }, '2020': { early: '2020-05-08' },
  '2002': { spring: '2002-06-04' }, '2012': { spring: '2012-06-04' }, '2022': { spring: '2022-06-02' },
}
const UK_EXTRA: Holiday[] = [
  { date: '1999-12-31', name: 'Millennium celebrations' }, { date: '2002-06-03', name: 'Golden Jubilee' },
  { date: '2011-04-29', name: 'Royal wedding' }, { date: '2012-06-05', name: 'Diamond Jubilee' },
  { date: '2022-06-03', name: 'Platinum Jubilee' }, { date: '2022-09-19', name: 'State Funeral of Queen Elizabeth II' },
  { date: '2023-05-08', name: 'Coronation of King Charles III' },
]

/** Bank holidays in England and Wales, including Easter-based days and weekend substitutes. */
export function ukEnglandWales(y: number): Holiday[] {
  const e = easter(y)
  const mv = UK_MOVED[String(y)] ?? {}
  const ny = ymd(y, 1, 1)
  const out: Holiday[] = [
    { date: dow(ny) === 6 ? add(ny, 2) : dow(ny) === 0 ? add(ny, 1) : ny, name: "New Year's Day" + (dow(ny) % 6 === 0 ? ' (substitute day)' : '') },
    { date: add(e, -2), name: 'Good Friday' },
    { date: add(e, 1), name: 'Easter Monday' },
    { date: mv.early ?? nthWeekday(y, 5, 1, 1), name: 'Early May bank holiday' },
    { date: mv.spring ?? nthWeekday(y, 5, 1, -1), name: 'Spring bank holiday' },
    { date: nthWeekday(y, 8, 1, -1), name: 'Summer bank holiday' },
  ]
  const xmas = ymd(y, 12, 25), w = dow(xmas)
  // Sat: Christmas → Mon 27, Boxing (Sun) → Tue 28. Sun: Boxing Mon 26, Christmas → Tue 27. Fri: Boxing (Sat) → Mon 28.
  if (w === 6) out.push({ date: ymd(y, 12, 27), name: 'Christmas Day (substitute day)' }, { date: ymd(y, 12, 28), name: 'Boxing Day (substitute day)' })
  else if (w === 0) out.push({ date: ymd(y, 12, 26), name: 'Boxing Day' }, { date: ymd(y, 12, 27), name: 'Christmas Day (substitute day)' })
  else if (w === 5) out.push({ date: xmas, name: 'Christmas Day' }, { date: ymd(y, 12, 28), name: 'Boxing Day (substitute day)' })
  else out.push({ date: xmas, name: 'Christmas Day' }, { date: ymd(y, 12, 26), name: 'Boxing Day' })
  out.push(...UK_EXTRA.filter((h) => h.date.startsWith(String(y))))
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

/** Parses "2026-12-24 Office closed" lines (one per line; text after the date is the name). */
export function parseCustom(text: string): { list: Holiday[]; bad: number } {
  const list: Holiday[] = []
  let bad = 0
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const m = /^(\d{4}-\d{2}-\d{2})\s*[-–:,]?\s*(.*)$/.exec(t)
    if (m && iso(toDate(m[1])) === m[1]) list.push({ date: m[1], name: m[2] || 'Custom holiday' })
    else bad++
  }
  return { list, bad }
}

export interface Cal { weekend: number[]; holidays: Map<string, string> }
export const isBusiness = (d: string, c: Cal) => !c.weekend.includes(dow(d)) && !c.holidays.has(d)

/** Moves forward (or backward) to the nearest business day, staying put if d already is one. */
export function roll(d: string, c: Cal, dir: 1 | -1 = 1): string {
  let x = d
  for (let i = 0; i < 400 && !isBusiness(x, c); i++) x = add(x, dir)
  return x
}

export type Mode = 'business' | 'calendar'
export interface CountOpts { mode: Mode; includeStart: boolean; rollForward: boolean }
export interface CountResult { due: string; rawEnd: string; rolled: boolean; skipped: { date: string; why: string }[] }

/**
 * Counts n days from `start` (negative n counts backwards).
 * business: only business days count; day 1 is the first business day after the trigger
 *   (or the trigger itself when includeStart and it is a business day).
 * calendar: every day counts; with rollForward a deadline landing on a weekend/holiday moves to
 *   the next business day (previous one when counting backwards), like FRCP 6(a)(1)(C).
 */
export function countDays(start: string, n: number, c: Cal, o: CountOpts): CountResult {
  const dir = n < 0 ? -1 : 1
  const why = (d: string) => (c.holidays.get(d) ?? 'Weekend')
  const skipped: { date: string; why: string }[] = []
  if (o.mode === 'business') {
    if (n === 0) return { due: start, rawEnd: start, rolled: false, skipped }
    let left = Math.abs(n)
    let d = start
    if (o.includeStart && isBusiness(start, c)) left--
    while (left > 0) {
      d = add(d, dir)
      if (isBusiness(d, c)) left--
      else skipped.push({ date: d, why: why(d) })
    }
    return { due: d, rawEnd: d, rolled: false, skipped }
  }
  const raw = add(start, n - (o.includeStart ? dir : 0) * (n === 0 ? 0 : 1))
  let due = raw
  if (o.rollForward && !isBusiness(raw, c)) {
    due = roll(raw, c, dir as 1 | -1)
    for (let d = raw; d !== due; d = add(d, dir)) skipped.push({ date: d, why: why(d) })
  }
  return { due, rawEnd: raw, rolled: due !== raw, skipped }
}

/** Business days strictly after `a` up to and including `b` (negative if b < a). */
export function businessBetween(a: string, b: string, c: Cal): number {
  const dir = b < a ? -1 : 1
  let n = 0
  for (let d = a; d !== b; ) {
    d = add(d, dir)
    if (isBusiness(d, c)) n += dir
  }
  return n
}

const icsEsc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
/** All-day VEVENTs with VALARM reminders `remind` days before each deadline (09:00 local). */
export function toIcs(events: { date: string; title: string; desc: string }[], remind: number[], stamp = new Date()): string {
  const dt = stamp.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Browser Toolbox//Deadline Calculator//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH']
  events.forEach((e, i) => {
    lines.push('BEGIN:VEVENT', `UID:${e.date}-${i}-${dt}@browser-toolbox`, `DTSTAMP:${dt}`, `DTSTART;VALUE=DATE:${e.date.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${add(e.date, 1).replace(/-/g, '')}`, `SUMMARY:${icsEsc(e.title)}`, `DESCRIPTION:${icsEsc(e.desc)}`, 'TRANSP:TRANSPARENT')
    for (const r of remind) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(`${e.title} in ${r} day(s)`)}`, `TRIGGER:-P${r === 0 ? 'T0M' : `${r - 1}DT15H`}`, 'END:VALARM')
    lines.push('END:VEVENT')
  })
  lines.push('END:VCALENDAR')
  return lines.join('\r\n') + '\r\n'
}
