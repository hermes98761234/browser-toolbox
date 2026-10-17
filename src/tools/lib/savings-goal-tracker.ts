// Savings goal maths: required monthly contribution, months to goal, date helpers.

/** Whole + fractional months between two ISO dates (30.4375-day months). */
export function monthsBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(fromIso), b = Date.parse(toIso)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN
  return (b - a) / (86400000 * 30.436875)
}

export const daysBetween = (fromIso: string, toIso: string) => Math.ceil((Date.parse(toIso) - Date.parse(fromIso)) / 86400000)

/**
 * Monthly deposit (end of month) needed to grow `saved` to `target` in `months` months at `annualRate` % (compounded monthly).
 * Returns 0 if already reached, Infinity if no time is left.
 */
export function requiredMonthly(target: number, saved: number, months: number, annualRate = 0): number {
  if (saved >= target) return 0
  const n = Math.ceil(months - 1e-9)
  if (!(n > 0)) return Infinity
  const r = annualRate / 100 / 12
  if (r === 0) return (target - saved) / n
  const g = (1 + r) ** n
  return Math.max(0, ((target - saved * g) * r) / (g - 1))
}

/** Months until `target` is reached with a monthly deposit `pmt`; Infinity if never. */
export function monthsToGoal(target: number, saved: number, pmt: number, annualRate = 0): number {
  if (saved >= target) return 0
  const r = annualRate / 100 / 12
  if (r === 0) return pmt > 0 ? Math.ceil((target - saved) / pmt) : Infinity
  if (pmt <= 0 && saved <= 0) return Infinity
  const n = Math.log((target * r + pmt) / (saved * r + pmt)) / Math.log(1 + r)
  return Number.isFinite(n) && n > 0 ? Math.ceil(n - 1e-9) : Infinity
}

/** Balance path month by month with deposit `pmt`. */
export function projection(saved: number, pmt: number, annualRate: number, months: number): number[] {
  const r = annualRate / 100 / 12
  const out = [saved]
  let b = saved
  for (let i = 0; i < months; i++) { b = b * (1 + r) + pmt; out.push(b) }
  return out
}

export function addMonths(iso: string, m: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCMonth(d.getUTCMonth() + m)
  return d.toISOString().slice(0, 10)
}
