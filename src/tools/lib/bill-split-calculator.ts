// Bill splitting: share allocation in whole cents, per-person balances, and greedy settle-up.

export type SplitMode = 'equal' | 'weights' | 'exact'
export interface Person { id: string; name: string }
export interface Expense { id: string; desc: string; amount: number; payer: string; mode: SplitMode; /** person id → weight or exact amount; missing/0 = not included (equal: any key present = included) */ parts: Record<string, number> }
export interface Transfer { from: string; to: string; amount: number }

/**
 * Splits `total` (currency units) by weights into whole cents using the largest-remainder method,
 * so the parts always add up exactly to the total.
 */
export function allocate(total: number, weights: number[]): number[] {
  const cents = Math.round(total * 100)
  const W = weights.reduce((a, w) => a + Math.max(0, w), 0)
  if (!W) return weights.map(() => 0)
  const raw = weights.map((w) => (cents * Math.max(0, w)) / W)
  const base = raw.map(Math.floor)
  let left = cents - base.reduce((a, b) => a + b, 0)
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1])
  for (const [, i] of order) {
    if (left <= 0) break
    base[i]++
    left--
  }
  return base.map((c) => c / 100)
}

/** Each person's owed share of one expense (ids of people not involved get 0). */
export function shares(e: Expense, people: Person[]): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(people.map((p) => [p.id, 0]))
  if (e.mode === 'exact') {
    for (const p of people) out[p.id] = Math.round((e.parts[p.id] ?? 0) * 100) / 100
    return out
  }
  const ws = people.map((p) => (e.mode === 'equal' ? (e.parts[p.id] ? 1 : 0) : e.parts[p.id] ?? 0))
  allocate(e.amount, ws).forEach((v, i) => (out[people[i].id] = v))
  return out
}

/** Difference between the amount and the exact parts (non-zero means the exact split doesn't add up). */
export const exactGap = (e: Expense) => Math.round((e.amount - Object.values(e.parts).reduce((a, v) => a + (v || 0), 0)) * 100) / 100

export interface Balance { id: string; paid: number; owed: number; net: number }

/** Net balance per person: positive = should receive, negative = should pay. */
export function balances(people: Person[], expenses: Expense[]): Balance[] {
  const paid: Record<string, number> = {}, owed: Record<string, number> = {}
  for (const p of people) paid[p.id] = owed[p.id] = 0
  for (const e of expenses) {
    if (paid[e.payer] !== undefined) paid[e.payer] += e.amount
    const sh = shares(e, people)
    for (const id in sh) owed[id] += sh[id]
  }
  const r2 = (x: number) => Math.round(x * 100) / 100
  return people.map((p) => ({ id: p.id, paid: r2(paid[p.id]), owed: r2(owed[p.id]), net: r2(paid[p.id] - owed[p.id]) }))
}

/**
 * Settle-up: repeatedly match the largest debtor with the largest creditor and transfer the smaller of the two.
 * Works in cents; produces at most n − 1 transfers. Any rounding residue (when shares don't sum to amounts) is ignored.
 */
export function settle(bal: { id: string; net: number }[]): Transfer[] {
  const cr = bal.map((b) => ({ id: b.id, c: Math.round(b.net * 100) })).filter((b) => b.c > 0)
  const db = bal.map((b) => ({ id: b.id, c: -Math.round(b.net * 100) })).filter((b) => b.c > 0)
  const out: Transfer[] = []
  for (;;) {
    cr.sort((a, b) => b.c - a.c)
    db.sort((a, b) => b.c - a.c)
    const c = cr[0], d = db[0]
    if (!c || !d || c.c <= 0 || d.c <= 0) break
    const x = Math.min(c.c, d.c)
    out.push({ from: d.id, to: c.id, amount: x / 100 })
    c.c -= x
    d.c -= x
    if (!c.c) cr.shift()
    if (!d.c) db.shift()
  }
  return out
}
