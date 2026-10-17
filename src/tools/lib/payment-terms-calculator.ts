// Trade-credit terms ("2/10 net 30") parsing and cost-of-credit maths.

export interface Terms {
  discount: number // fraction, 0.02
  discDays: number // 10
  netDays: number // 30
  eom: boolean
  label: string
}

/**
 * Parses common notations: "2/10 net 30", "2/10 n/30", "2% 10 net 30", "1.5/15, net 45",
 * "net 60", "n60", "3/10 EOM" (net assumed 30 after the discount date when missing).
 */
export function parseTerms(raw: string): Terms | null {
  const s = raw.trim().toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ')
  if (!s) return null
  const eom = /\beom\b|end of month/.test(s)
  const disc = /(\d+(?:\.\d+)?)\s*%?\s*(?:\/|\s)\s*(\d+)(?!\s*%)/.exec(s.replace(/\b(net|n)\s*\/?\s*\d+/, ''))
  const net = /\b(?:net|n)\s*\/?\s*(\d+)/.exec(s)
  if (!disc && !net) return null
  const d = disc ? Number(disc[1]) / 100 : 0
  const dd = disc ? Number(disc[2]) : 0
  const nd = net ? Number(net[1]) : dd + 20
  if (!(d >= 0 && d < 1) || nd <= 0 || dd < 0 || (d > 0 && nd <= dd)) return null
  const label = `${d ? `${+(d * 100).toFixed(3)}/${dd} ` : ''}net ${nd}${eom ? ' EOM' : ''}`
  return { discount: d, discDays: dd, netDays: nd, eom, label }
}

/** Cost of NOT taking the discount, simple annualised (the textbook "nominal" rate). */
export function nominalCost(d: number, discDays: number, payDay: number, year = 365): number {
  const days = payDay - discDays
  if (d <= 0) return 0
  if (days <= 0) return Infinity
  return (d / (1 - d)) * (year / days)
}

/** Effective annual rate of forgoing the discount, with compounding. */
export function effectiveCost(d: number, discDays: number, payDay: number, year = 365): number {
  const days = payDay - discDays
  if (d <= 0) return 0
  if (days <= 0) return Infinity
  return Math.pow(1 + d / (1 - d), year / days) - 1
}

export interface Decision {
  discountAmt: number
  payEarly: number
  borrowDays: number
  interest: number // cost of borrowing to pay early, simple interest at `rate`
  netSaving: number // discountAmt - interest
  nominal: number
  effective: number
  takeIt: boolean
  breakEvenRate: number // borrowing rate (simple) at which both choices cost the same
}

/** Buyer view: pay early (financed at `rate` simple APR) vs pay on `payDay`. */
export function decide(t: Terms, amount: number, rate: number, payDay = t.netDays, year = 365): Decision {
  const discountAmt = amount * t.discount
  const payEarly = amount - discountAmt
  const borrowDays = Math.max(0, payDay - t.discDays)
  const interest = payEarly * rate * (borrowDays / year)
  const nominal = nominalCost(t.discount, t.discDays, payDay, year)
  return {
    discountAmt,
    payEarly,
    borrowDays,
    interest,
    netSaving: discountAmt - interest,
    nominal,
    effective: effectiveCost(t.discount, t.discDays, payDay, year),
    takeIt: t.discount > 0 && discountAmt > interest,
    breakEvenRate: nominal,
  }
}
