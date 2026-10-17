// Auto loan (annuity) and lease payment maths.

/** Monthly annuity payment for principal `pv` at nominal APR (%), `n` months. */
export function payment(pv: number, aprPct: number, n: number): number {
  if (n <= 0) return 0
  const r = aprPct / 100 / 12
  if (r === 0) return pv / n
  return (r * pv) / (1 - Math.pow(1 + r, -n))
}

/** Remaining balance after `k` payments. */
export function balanceAfter(pv: number, aprPct: number, n: number, k: number): number {
  const r = aprPct / 100 / 12
  const pmt = payment(pv, aprPct, n)
  if (r === 0) return Math.max(0, pv - pmt * k)
  return Math.max(0, pv * Math.pow(1 + r, k) - (pmt * (Math.pow(1 + r, k) - 1)) / r)
}

export interface Purchase {
  price: number
  taxPct: number
  fees: number
  down: number
  tradeIn: number
  tradeOwed: number
  rebate: number
  /** Whether trade-in value reduces the taxable amount (most US states). */
  taxCredit: boolean
}

/** Amount financed after tax, fees, down payment, rebate and trade-in equity. */
export function amountFinanced(p: Purchase): { taxable: number; tax: number; financed: number } {
  const taxable = Math.max(0, p.price - (p.taxCredit ? p.tradeIn : 0))
  const tax = (taxable * p.taxPct) / 100
  const financed = Math.max(0, p.price + tax + p.fees - p.down - p.rebate - (p.tradeIn - p.tradeOwed))
  return { taxable, tax, financed }
}

export interface Lease {
  capCost: number
  residualPct: number
  msrp: number
  moneyFactor: number
  months: number
  taxPct: number
  acqFee: number
  capReduction: number
  dispositionFee: number
}

/** Standard lease payment: depreciation + rent charge, with sales tax on the monthly payment. */
export function leasePayment(l: Lease): { residual: number; adjCap: number; depreciation: number; rent: number; base: number; tax: number; monthly: number } {
  const residual = (l.msrp * l.residualPct) / 100
  const adjCap = l.capCost + l.acqFee - l.capReduction
  const depreciation = (adjCap - residual) / l.months
  const rent = (adjCap + residual) * l.moneyFactor
  const base = depreciation + rent
  const tax = (base * l.taxPct) / 100
  return { residual, adjCap, depreciation, rent, base, tax, monthly: base + tax }
}

export const mfToApr = (mf: number) => mf * 2400
export const aprToMf = (apr: number) => apr / 2400

/** Estimated market value after `months` with a first-year drop and a constant yearly rate afterwards. */
export function carValue(price: number, months: number, firstYearPct = 20, laterPct = 15): number {
  const y = months / 12
  if (y <= 1) return price * (1 - (firstYearPct / 100) * y)
  return price * (1 - firstYearPct / 100) * Math.pow(1 - laterPct / 100, y - 1)
}
