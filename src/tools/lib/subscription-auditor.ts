// Billing-cycle normalisation and renewal-date rolling for the subscription auditor (ISO dates, UTC maths).

export type Cycle = 'weekly' | 'monthly' | 'quarterly' | 'semiannual' | 'yearly' | 'days'
export const CYCLES: [Cycle, string][] = [['weekly', 'Weekly'], ['monthly', 'Monthly'], ['quarterly', 'Quarterly'], ['semiannual', 'Every 6 months'], ['yearly', 'Yearly'], ['days', 'Every N days']]

/** Billing events per year. Weekly and day-based cycles use 365.25 days per year. */
export function perYear(c: Cycle, days = 30): number {
  switch (c) {
    case 'weekly': return 365.25 / 7
    case 'monthly': return 12
    case 'quarterly': return 4
    case 'semiannual': return 2
    case 'yearly': return 1
    case 'days': return 365.25 / Math.max(1, days)
  }
}
export const yearly = (price: number, c: Cycle, days?: number) => price * perYear(c, days)
export const monthly = (price: number, c: Cycle, days?: number) => yearly(price, c, days) / 12

const P = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))
const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
export const validISO = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && iso(P(s)) === s
export const daysBetween = (a: string, b: string) => Math.round((P(b) - P(a)) / 86400000)

/** Adds n months keeping the anchor day, clamped to month end (Jan 31 + 1 month → Feb 28/29). */
export function addMonths(s: string, n: number, anchorDay = +s.slice(8, 10)): string {
  const y = +s.slice(0, 4), m = +s.slice(5, 7) - 1 + n
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return iso(Date.UTC(y, m, Math.min(anchorDay, last)))
}

function step(s: string, c: Cycle, k: number, anchor: number, days: number): string {
  switch (c) {
    case 'weekly': return iso(P(s) + k * 7 * 86400000)
    case 'days': return iso(P(s) + k * Math.max(1, days) * 86400000)
    default: return addMonths(s, k * { monthly: 1, quarterly: 3, semiannual: 6, yearly: 12 }[c], anchor)
  }
}

/** First renewal on or after `today`, rolling the stored date forward by whole cycles. */
export function nextRenewal(date: string, c: Cycle, today: string, days = 30): string {
  if (!validISO(date)) return date
  const anchor = +date.slice(8, 10)
  let k = 0, d = date
  while (d < today && k < 5000) d = step(date, c, ++k, anchor, days)
  return d
}

/** Renewals of a subscription within [from, to] (inclusive), for calendar export. */
export function renewalsBetween(date: string, c: Cycle, from: string, to: string, days = 30): string[] {
  const out: string[] = []
  if (!validISO(date)) return out
  const anchor = +date.slice(8, 10)
  let d = nextRenewal(date, c, from, days)
  let k = 0
  const base = d
  while (d <= to && k < 400) {
    out.push(d)
    d = step(base, c, ++k, anchor, days)
  }
  return out
}
