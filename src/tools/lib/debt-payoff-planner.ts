// Month-by-month debt payoff simulation: snowball, avalanche, custom order, or minimums only
// ('minimum' ignores the extra payment and does not roll freed-up minimums over).

export interface Debt { id: string; name: string; balance: number; apr: number; min: number }
export type Strategy = 'avalanche' | 'snowball' | 'order' | 'minimum'

export interface SimResult {
  months: number
  totalInterest: number
  totalPaid: number
  payoffMonth: Record<string, number> // month index (1-based) when each debt hits zero; Infinity if never
  balances: number[][] // [month][debt] balance at end of month (month 0 = start)
  totals: number[]
  interestByDebt: Record<string, number>
  stuck: boolean // hit the month cap (payments don't cover interest)
  order: string[] // order in which debts get paid off
}

/** Picks the debt that receives the extra money this month. */
function target(debts: Debt[], bal: number[], strategy: Strategy): number {
  let best = -1
  for (let i = 0; i < debts.length; i++) {
    if (bal[i] <= 0.005) continue
    if (best < 0) { best = i; continue }
    if (strategy === 'snowball' && (bal[i] < bal[best] - 1e-9 || (Math.abs(bal[i] - bal[best]) < 1e-9 && debts[i].apr > debts[best].apr))) best = i
    if (strategy === 'avalanche' && (debts[i].apr > debts[best].apr || (debts[i].apr === debts[best].apr && bal[i] < bal[best]))) best = i
  }
  return best
}

export function simulate(debts: Debt[], extra: number, strategy: Strategy, maxMonths = 600): SimResult {
  const bal = debts.map((d) => Math.max(0, d.balance))
  const budget = debts.reduce((a, d) => a + (d.balance > 0 ? d.min : 0), 0) + Math.max(0, extra)
  const payoffMonth: Record<string, number> = {}
  const interestByDebt: Record<string, number> = {}
  debts.forEach((d, i) => { interestByDebt[d.id] = 0; if (bal[i] <= 0) payoffMonth[d.id] = 0 })
  const balances = [bal.slice()]
  const totals = [bal.reduce((a, b) => a + b, 0)]
  const order: string[] = []
  let totalInterest = 0, totalPaid = 0, m = 0
  while (bal.some((b) => b > 0.005) && m < maxMonths) {
    m++
    // interest accrues on the balance carried into the month
    debts.forEach((d, i) => {
      if (bal[i] <= 0) return
      const it = (bal[i] * d.apr) / 100 / 12
      bal[i] += it
      totalInterest += it
      interestByDebt[d.id] += it
    })
    // minimums
    let pool = strategy === 'minimum' ? 0 : budget
    debts.forEach((d, i) => {
      if (bal[i] <= 0) return
      const pay = Math.min(bal[i], d.min)
      bal[i] -= pay
      totalPaid += pay
      if (strategy !== 'minimum') pool -= pay
    })
    // extra + freed-up minimums go to the target debt(s)
    while (pool > 0.005) {
      const t = target(debts, bal, strategy === 'minimum' ? 'avalanche' : strategy)
      if (t < 0) break
      const pay = Math.min(bal[t], pool)
      bal[t] -= pay
      pool -= pay
      totalPaid += pay
    }
    debts.forEach((d, i) => {
      if (bal[i] <= 0.005 && payoffMonth[d.id] === undefined) {
        bal[i] = 0
        payoffMonth[d.id] = m
        order.push(d.id)
      }
    })
    balances.push(bal.slice())
    totals.push(bal.reduce((a, b) => a + b, 0))
  }
  debts.forEach((d) => { if (payoffMonth[d.id] === undefined) payoffMonth[d.id] = Infinity })
  return { months: m, totalInterest, totalPaid, payoffMonth, balances, totals, interestByDebt, stuck: bal.some((b) => b > 0.005), order }
}

/** Monthly interest a debt accrues at its current balance. */
export const monthlyInterest = (d: Debt) => (d.balance * d.apr) / 100 / 12
