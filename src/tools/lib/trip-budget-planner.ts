// Trip budget math: currency conversion to a home currency, splits, balances and settle-up.

export interface Expense { id: string; date: string; desc: string; cat: string; amount: number; cur: string; paidBy: string; split: string[] }
/** rates[c] = how many home-currency units one unit of c is worth. Home currency rate = 1. */
export type Rates = Record<string, number>

export function toHome(amount: number, cur: string, rates: Rates, home: string): number {
  if (cur === home) return amount
  const r = rates[cur]
  return r > 0 ? amount * r : NaN
}

/** Net balance per person in home currency: positive = is owed money. */
export function balances(expenses: Expense[], people: string[], rates: Rates, home: string): Record<string, number> {
  const b: Record<string, number> = Object.fromEntries(people.map((p) => [p, 0]))
  for (const e of expenses) {
    const v = toHome(e.amount, e.cur, rates, home)
    if (!Number.isFinite(v)) continue
    const among = e.split.filter((p) => p in b)
    const who = among.length ? among : people
    if (!who.length) continue
    if (e.paidBy in b) b[e.paidBy] += v
    for (const p of who) b[p] -= v / who.length
  }
  return b
}

/** Greedy settle-up: largest debtor pays largest creditor. At most n−1 transfers. */
export function settle(bal: Record<string, number>): { from: string; to: string; amount: number }[] {
  const cred = Object.entries(bal).filter(([, v]) => v > 0.005).map(([p, v]) => ({ p, v }))
  const debt = Object.entries(bal).filter(([, v]) => v < -0.005).map(([p, v]) => ({ p, v: -v }))
  const out: { from: string; to: string; amount: number }[] = []
  while (cred.length && debt.length) {
    cred.sort((a, b) => b.v - a.v)
    debt.sort((a, b) => b.v - a.v)
    const c = cred[0], d = debt[0]
    const x = Math.min(c.v, d.v)
    out.push({ from: d.p, to: c.p, amount: Math.round(x * 100) / 100 })
    c.v -= x
    d.v -= x
    if (c.v < 0.005) cred.shift()
    if (d.v < 0.005) debt.shift()
  }
  return out
}

/** Each person's consumed share (what they spent on themselves), in home currency. */
export function shares(expenses: Expense[], people: string[], rates: Rates, home: string): Record<string, number> {
  const s: Record<string, number> = Object.fromEntries(people.map((p) => [p, 0]))
  for (const e of expenses) {
    const v = toHome(e.amount, e.cur, rates, home)
    if (!Number.isFinite(v)) continue
    const among = e.split.filter((p) => p in s)
    const who = among.length ? among : people
    for (const p of who) s[p] += v / who.length
  }
  return s
}

/** Inclusive day count between two YYYY-MM-DD dates (min 1). */
export function tripDays(start: string, end: string): number {
  const a = Date.parse(start + 'T00:00:00Z'), b = Date.parse(end + 'T00:00:00Z')
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 1
  return Math.max(1, Math.round((b - a) / 86400000) + 1)
}
