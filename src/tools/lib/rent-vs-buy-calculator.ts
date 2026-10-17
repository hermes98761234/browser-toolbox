// Rent vs buy: monthly simulation with equal cash outlay. Whoever spends less in a month invests the
// difference, so both paths use the same money and their net worth can be compared fairly.

export interface Inputs {
  price: number
  downPct: number
  rate: number // mortgage APR %
  term: number // years
  closingPct: number // buyer closing costs % of price
  sellPct: number // selling costs % of value at sale
  taxPct: number // property tax % of value / yr
  insurance: number // homeowner's insurance $/yr (grows with inflation)
  maintPct: number // % of value / yr
  hoa: number // $/month (grows with inflation)
  appreciation: number // % / yr
  rent: number // $/month
  rentGrowth: number // % / yr
  rentersIns: number // $/yr
  invest: number // % / yr return on the alternative portfolio
  inflation: number // % / yr for insurance and HOA
  years: number
  pmiPct: number // % of loan / yr while LTV > 78 %
  deductPct: number // marginal tax rate applied to mortgage interest + property tax (0 = ignore)
}

export function payment(principal: number, aprPct: number, years: number) {
  const n = years * 12, r = aprPct / 100 / 12
  if (principal <= 0) return 0
  return r === 0 ? principal / n : (principal * r) / (1 - Math.pow(1 + r, -n))
}

export interface Year {
  year: number
  homeValue: number
  balance: number
  buyCost: number // cash spent by the buyer that year
  rentCost: number
  buyNW: number
  rentNW: number
  equity: number
  buyPortfolio: number
  rentPortfolio: number
}

export function simulate(i: Inputs): { rows: Year[]; pay: number; loan: number; upfront: number; breakEven: number | null } {
  const loan = i.price * (1 - i.downPct / 100)
  const upfront = i.price * (i.downPct / 100 + i.closingPct / 100)
  const pay = payment(loan, i.rate, i.term)
  const mr = i.rate / 100 / 12
  const g = (p: number) => Math.pow(1 + p / 100, 1 / 12) - 1
  const ga = g(i.appreciation), gi = g(i.invest), gf = g(i.inflation)
  let value = i.price, bal = loan, rent = i.rent, buyP = 0, rentP = upfront
  let ins = i.insurance, hoa = i.hoa, rIns = i.rentersIns
  const rows: Year[] = []
  let breakEven: number | null = null
  for (let y = 1; y <= i.years; y++) {
    let buyCost = 0, rentCost = 0
    for (let m = 0; m < 12; m++) {
      const interest = bal * mr
      const pi = bal > 0 ? Math.min(pay, bal + interest) : 0
      const pmi = bal > 0.78 * i.price && i.downPct < 20 ? (bal * i.pmiPct) / 100 / 12 : 0
      const tax = (value * i.taxPct) / 100 / 12
      const own = pi + pmi + tax + ins / 12 + (value * i.maintPct) / 100 / 12 + hoa - (interest + tax) * (i.deductPct / 100)
      bal = Math.max(0, bal + interest - pi)
      const rentM = rent + rIns / 12
      buyCost += own
      rentCost += rentM
      buyP *= 1 + gi
      rentP *= 1 + gi
      if (own > rentM) rentP += own - rentM
      else buyP += rentM - own
      value *= 1 + ga
      ins *= 1 + gf
      hoa *= 1 + gf
      rIns *= 1 + gf
    }
    rent *= 1 + i.rentGrowth / 100
    const equity = value - bal
    const buyNW = equity - (value * i.sellPct) / 100 + buyP
    rows.push({ year: y, homeValue: value, balance: bal, buyCost, rentCost, buyNW, rentNW: rentP, equity, buyPortfolio: buyP, rentPortfolio: rentP })
    if (breakEven === null && buyNW >= rentP) breakEven = y
  }
  return { rows, pay, loan, upfront, breakEven }
}
