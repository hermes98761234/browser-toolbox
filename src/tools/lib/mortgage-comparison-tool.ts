// Mortgage offer math: annuity payment, amortization (fixed or ARM), APR, cost at a horizon.

export interface Offer {
  name: string
  principal: number
  rate: number // annual %, nominal, compounded monthly
  years: number
  fees: number // upfront fees + points paid in cash
  armYears: number // 0 = fixed; otherwise intro period length
  armRate: number // annual % after the intro period
  extra: number // extra principal per month
}

export interface Row { month: number; payment: number; interest: number; principal: number; balance: number }

/** Level monthly payment for principal P, monthly rate r, n months. */
export function payment(P: number, r: number, n: number): number {
  if (n <= 0) return P
  if (r === 0) return P / n
  return (P * r) / (1 - Math.pow(1 + r, -n))
}

export function amortize(o: Offer): Row[] {
  const n = Math.round(o.years * 12)
  const rows: Row[] = []
  let bal = o.principal
  let r = o.rate / 1200
  let pay = payment(bal, r, n)
  for (let m = 1; m <= n && bal > 1e-6; m++) {
    if (o.armYears > 0 && m === Math.round(o.armYears * 12) + 1) {
      r = o.armRate / 1200
      pay = payment(bal, r, n - m + 1)
    }
    const interest = bal * r
    let princ = Math.min(bal, pay - interest + Math.max(0, o.extra))
    if (m === n) princ = bal
    bal -= princ
    rows.push({ month: m, payment: interest + princ, interest, principal: princ, balance: Math.max(0, bal) })
  }
  return rows
}

/** APR: annual rate whose monthly discounting makes PV(scheduled payments) = principal − fees. */
export function apr(o: Offer, rows = amortize(o)): number {
  const net = o.principal - o.fees
  if (net <= 0 || !rows.length) return NaN
  const pv = (r: number) => rows.reduce((a, row, i) => a + row.payment / Math.pow(1 + r, i + 1), 0)
  let lo = 0, hi = 1
  if (pv(lo) < net) return NaN
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2
    if (pv(mid) > net) lo = mid
    else hi = mid
  }
  return ((lo + hi) / 2) * 1200
}

export interface Summary { monthly: number; months: number; interest: number; total: number; apr: number }

export function summarize(o: Offer, rows = amortize(o)): Summary {
  const interest = rows.reduce((a, r) => a + r.interest, 0)
  return { monthly: rows[0]?.payment ?? 0, months: rows.length, interest, total: o.principal + interest + o.fees, apr: apr(o, rows) }
}

/** Interest + fees paid during the first `months` (true cost if you sell or refinance then). */
export function costAt(o: Offer, rows: Row[], months: number): number {
  return o.fees + rows.slice(0, months).reduce((a, r) => a + r.interest, 0)
}

/**
 * Compares cumulative cost (fees + interest) of A against B month by month.
 * `cheaperAtStart`: A costs less right after closing; `month`: first month the order flips (−1 = never).
 */
export function breakEven(a: Offer, ra: Row[], b: Offer, rb: Row[]): { cheaperAtStart: boolean; month: number } {
  let ca = a.fees, cb = b.fees
  const cheaperAtStart = ca <= cb
  const n = Math.max(ra.length, rb.length)
  for (let m = 0; m < n; m++) {
    ca += ra[m]?.interest ?? 0
    cb += rb[m]?.interest ?? 0
    if (ca < cb !== cheaperAtStart && ca !== cb) return { cheaperAtStart, month: m + 1 }
  }
  return { cheaperAtStart, month: -1 }
}
