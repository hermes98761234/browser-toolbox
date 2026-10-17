// PTO accrual engine: accrual schedules, workday counting, capped balance timeline per leave type.

export type Method = 'biweekly' | 'semimonthly' | 'monthly' | 'lump' | 'hourly'
export interface Policy { id: string; name: string; color: string; annual: number; method: Method; carryCap: number; maxCap: number; start: number }
export interface Request { id: string; type: string; start: string; end: string; half: boolean; status: 'planned' | 'approved'; note: string }

const DAY = 86400000
export const iso = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
export const parse = (s: string) => new Date(`${s}T00:00:00Z`)
export const addDays = (s: string, n: number) => iso(new Date(parse(s).getTime() + n * DAY))

/** Weekdays between start and end inclusive, skipping holidays. */
export function workdays(start: string, end: string, holidays: Set<string>): string[] {
  const out: string[] = []
  if (!start || !end || end < start) return out
  for (let t = parse(start).getTime(), e = parse(end).getTime(); t <= e; t += DAY) {
    const d = new Date(t)
    const wd = d.getUTCDay()
    const s = iso(d)
    if (wd !== 0 && wd !== 6 && !holidays.has(s)) out.push(s)
  }
  return out
}

/** Hours a request consumes (half-day flag halves a single-day request, or the last day of a longer one). */
export function requestHours(r: Request, holidays: Set<string>, hpd: number): number {
  const n = workdays(r.start, r.end, holidays).length
  return n === 0 ? 0 : (n - (r.half ? 0.5 : 0)) * hpd
}

/** Accrual credits within the plan year [y0, y0 + 1 year). `annual` in hours. */
export function accrualEvents(method: Method, annual: number, yearStart: string, hpd: number, holidays: Set<string>): { date: string; amount: number }[] {
  const y0 = parse(yearStart)
  const y1 = new Date(Date.UTC(y0.getUTCFullYear() + 1, y0.getUTCMonth(), y0.getUTCDate()))
  const end = iso(new Date(y1.getTime() - DAY))
  const ev: { date: string; amount: number }[] = []
  const monthDate = (m: number, day: number) => iso(new Date(Date.UTC(y0.getUTCFullYear(), y0.getUTCMonth() + m, day)))
  switch (method) {
    case 'lump':
      ev.push({ date: yearStart, amount: annual })
      break
    case 'monthly':
      // credited at the end of each completed month
      for (let m = 1; m <= 12; m++) ev.push({ date: addDays(monthDate(m, 1), -1), amount: annual / 12 })
      break
    case 'semimonthly':
      for (let m = 0; m < 12; m++) {
        ev.push({ date: monthDate(m, 15), amount: annual / 24 })
        ev.push({ date: addDays(monthDate(m + 1, 1), -1), amount: annual / 24 })
      }
      break
    case 'biweekly':
      for (let k = 1; k <= 26; k++) ev.push({ date: addDays(yearStart, k * 14 - 1), amount: annual / 26 })
      break
    case 'hourly': {
      // accrues per hour worked: every workday earns annual / (working hours in the year)
      const days = workdays(yearStart, end, holidays)
      const per = annual / Math.max(1, days.length * hpd)
      for (const d of days) ev.push({ date: d, amount: per * hpd })
      break
    }
  }
  return ev.filter((e) => e.date <= end)
}

export interface Timeline { points: { date: string; balance: number }[]; accrued: number; used: number; forfeited: number; endBalance: number; carryOver: number }

/**
 * Walks accruals and usage day by day. Accrual stops while the balance sits at `maxCap` (0 = no cap).
 * Returns the balance after each event, totals, and how much is lost at year end above `carryCap` (negative = unlimited carry-over, 0 = nothing carries).
 */
export function timeline(p: Policy, reqs: Request[], yearStart: string, hpd: number, holidays: Set<string>, upTo?: string): Timeline {
  const ev: { date: string; acc: number; use: number }[] = accrualEvents(p.method, p.annual, yearStart, hpd, holidays).map((e) => ({ date: e.date, acc: e.amount, use: 0 }))
  const y0 = parse(yearStart)
  const yEnd = iso(new Date(Date.UTC(y0.getUTCFullYear() + 1, y0.getUTCMonth(), y0.getUTCDate()) - DAY))
  for (const r of reqs) {
    const days = workdays(r.start, r.end, holidays)
    days.forEach((d, i) => {
      if (d < yearStart || d > yEnd) return
      ev.push({ date: d, acc: 0, use: hpd * (r.half && i === days.length - 1 ? 0.5 : 1) })
    })
  }
  ev.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.acc ? -1 : 1))
  let bal = p.start, accrued = 0, used = 0
  const points = [{ date: yearStart, balance: bal }]
  for (const e of ev) {
    if (upTo && e.date > upTo) break
    if (e.acc) {
      const add = p.maxCap > 0 ? Math.max(0, Math.min(e.acc, p.maxCap - bal)) : e.acc
      bal += add
      accrued += add
    }
    if (e.use) {
      bal -= e.use
      used += e.use
    }
    points.push({ date: e.date, balance: bal })
  }
  const last = upTo && upTo < yEnd ? upTo : yEnd
  if (points[points.length - 1].date < last) points.push({ date: last, balance: bal })
  const forfeited = !upTo && p.carryCap >= 0 ? Math.max(0, bal - p.carryCap) : 0
  return { points, accrued, used, forfeited, endBalance: bal, carryOver: bal - forfeited }
}

/** US federal holidays for a year (observed dates). */
export function usHolidays(y: number): string[] {
  const nth = (m: number, wd: number, n: number) => {
    const d = new Date(Date.UTC(y, m, 1))
    const off = (wd - d.getUTCDay() + 7) % 7
    return iso(new Date(Date.UTC(y, m, 1 + off + 7 * (n - 1))))
  }
  const last = (m: number, wd: number) => {
    const d = new Date(Date.UTC(y, m + 1, 0))
    return iso(new Date(Date.UTC(y, m, d.getUTCDate() - ((d.getUTCDay() - wd + 7) % 7))))
  }
  const fixed = (m: number, day: number) => {
    const d = new Date(Date.UTC(y, m, day))
    const wd = d.getUTCDay()
    return iso(new Date(d.getTime() + (wd === 6 ? -DAY : wd === 0 ? DAY : 0)))
  }
  return [fixed(0, 1), nth(0, 1, 3), nth(1, 1, 3), last(4, 1), fixed(5, 19), fixed(6, 4), nth(8, 1, 1), nth(9, 1, 2), fixed(10, 11), nth(10, 4, 4), fixed(11, 25)]
}
