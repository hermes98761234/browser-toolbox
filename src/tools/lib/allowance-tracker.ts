// Allowance jars: ledger balances, history series, allowance splitting and savings-interest projection.

export type Jar = 'save' | 'spend' | 'give'
export const JARS: Jar[] = ['save', 'spend', 'give']
export interface Tx { id: string; date: string; jar: Jar; amount: number; note: string; kind: 'allowance' | 'gift' | 'chore' | 'spend' | 'donate' | 'interest' | 'transfer' }
export type Split = Record<Jar, number>

export const round2 = (x: number) => Math.round(x * 100) / 100

/** Splits an amount by percentages; rounding remainder goes to the largest share so cents add up exactly. */
export function splitAmount(amount: number, split: Split): Record<Jar, number> {
  const tot = JARS.reduce((a, j) => a + Math.max(0, split[j]), 0) || 1
  const out = { save: 0, spend: 0, give: 0 }
  for (const j of JARS) out[j] = Math.floor(((amount * Math.max(0, split[j])) / tot) * 100) / 100
  const rest = round2(amount - out.save - out.spend - out.give)
  const big = JARS.reduce((a, b) => (split[b] > split[a] ? b : a))
  out[big] = round2(out[big] + rest)
  return out
}

export function balances(txs: Tx[]): Record<Jar, number> {
  const b = { save: 0, spend: 0, give: 0 }
  for (const t of txs) b[t.jar] = round2(b[t.jar] + t.amount)
  return b
}

const dayNum = (d: string) => Math.round(Date.parse(d + 'T00:00:00Z') / 86400000)

/** Running balance per jar at each date with activity: [dayNumber, balance] points. */
export function history(txs: Tx[]): Record<Jar, [number, number][]> {
  const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date))
  const b = { save: 0, spend: 0, give: 0 }
  const out: Record<Jar, [number, number][]> = { save: [], spend: [], give: [] }
  sorted.forEach((t, i) => {
    b[t.jar] = round2(b[t.jar] + t.amount)
    if (i === sorted.length - 1 || sorted[i + 1].date !== t.date) for (const j of JARS) out[j].push([dayNum(t.date), b[j]])
  })
  return out
}

/** Weekly rate equivalent to a monthly compound rate. */
export const weeklyRate = (monthlyPct: number) => Math.pow(1 + monthlyPct / 100, 12 / 52) - 1

/** Projects the save jar week by week. Returns balances for weeks 0..n. */
export function projectSavings(start: number, weeklyDeposit: number, monthlyPct: number, weeks: number): number[] {
  const r = weeklyRate(monthlyPct)
  const out = [start]
  let b = start
  for (let w = 1; w <= weeks; w++) {
    b = b * (1 + r) + weeklyDeposit
    out.push(b)
  }
  return out
}

/** Weeks until the save jar reaches `goal` (Infinity if it never does within 20 years). */
export function weeksToGoal(start: number, weeklyDeposit: number, monthlyPct: number, goal: number): number {
  if (start >= goal) return 0
  const r = weeklyRate(monthlyPct)
  let b = start
  for (let w = 1; w <= 1040; w++) {
    b = b * (1 + r) + weeklyDeposit
    if (b >= goal - 1e-9) return w
  }
  return Infinity
}

/** Whole weeks of allowance due between the last paid date and today. */
export function weeksDue(lastPaid: string, today: string): number {
  return Math.max(0, Math.floor((dayNum(today) - dayNum(lastPaid)) / 7))
}

export const addDays = (d: string, n: number) => new Date((dayNum(d) + n) * 86400000).toISOString().slice(0, 10)
