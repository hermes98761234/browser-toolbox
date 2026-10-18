// Life in weeks: one row per year of age (starting on each birthday), 52 week boxes per row.
// The 52nd box absorbs the 1–2 extra days of each year so every row starts exactly on a birthday.

const ms = 86400000
const utc = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) }
export const iso = (t: number) => new Date(t).toISOString().slice(0, 10)

/** The `n`-th birthday (Feb 29 birthdays fall on Feb 28 in common years). */
export function birthday(birth: string, n: number): string {
  const [y, m, d] = birth.split('-').map(Number)
  const yy = y + n
  const last = new Date(Date.UTC(yy, m, 0)).getUTCDate()
  return iso(Date.UTC(yy, m - 1, Math.min(d, last)))
}

export const daysBetween = (a: string, b: string) => Math.round((utc(b) - utc(a)) / ms)

/** Whole years of age on `date`. */
export function age(birth: string, date: string): number {
  let n = Number(date.slice(0, 4)) - Number(birth.slice(0, 4))
  if (birthday(birth, n) > date) n--
  return n
}

export interface Cell { row: number; col: number }

/** Grid cell for a date: row = age in years, col = week since the last birthday (0–51). */
export function cellOf(birth: string, date: string): Cell {
  const row = age(birth, date)
  const col = Math.min(51, Math.floor(daysBetween(birthday(birth, row), date) / 7))
  return { row, col }
}

/** First and last day covered by a cell. */
export function cellRange(birth: string, c: Cell): [string, string] {
  const start = utc(birthday(birth, c.row)) + c.col * 7 * ms
  const end = c.col === 51 ? utc(birthday(birth, c.row + 1)) - ms : start + 6 * ms
  return [iso(start), iso(end)]
}

export interface LifeStats {
  days: number; weeks: number; totalWeeks: number; weeksLeft: number; share: number
  years: number; nextBirthday: string; daysToBirthday: number; summersLeft: number; heartbeats: number; sleepYears: number
}

export function stats(birth: string, today: string, expectancy: number): LifeStats {
  const days = Math.max(0, daysBetween(birth, today))
  const c = cellOf(birth, today)
  const weeks = Math.max(0, c.row * 52 + c.col)
  const totalWeeks = Math.round(expectancy * 52)
  const years = age(birth, today)
  const nb = birthday(birth, years + 1)
  return {
    days, weeks, totalWeeks, weeksLeft: Math.max(0, totalWeeks - weeks), share: Math.min(1, weeks / totalWeeks), years,
    nextBirthday: nb, daysToBirthday: daysBetween(today, nb), summersLeft: Math.max(0, Math.floor(expectancy - years - (today.slice(5) > '07-15' ? 1 : 0))),
    heartbeats: days * 24 * 60 * 72, sleepYears: (days / 365.25) / 3,
  }
}

export interface Era { id: string; name: string; from: number; to: number; color: string }

/** Default life phases by age in years. */
export const ERAS: Era[] = [
  { id: 'early', name: 'Early years', from: 0, to: 5, color: '#f9a8d4' },
  { id: 'school', name: 'School', from: 5, to: 18, color: '#93c5fd' },
  { id: 'study', name: 'Studies', from: 18, to: 22, color: '#a5b4fc' },
  { id: 'work', name: 'Working life', from: 22, to: 67, color: '#86efac' },
  { id: 'retired', name: 'Retirement', from: 67, to: 120, color: '#fcd34d' },
]

export const eraOf = (eras: Era[], row: number) => eras.find((e) => row >= e.from && row < e.to)

/** Parses "YYYY-MM-DD" and checks it is a real calendar date. */
export function validDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  return iso(utc(s)) === s
}
