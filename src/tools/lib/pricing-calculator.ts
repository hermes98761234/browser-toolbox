// Pricing math: markup vs margin, prices that cover percentage + fixed sales fees, rounding, break-even.

export const markupToMargin = (k: number) => k / (1 + k)
export const marginToMarkup = (m: number) => (m >= 1 ? Infinity : m / (1 - m))

export interface Fees { pct: number; fixed: number } // pct as fraction of price, fixed per sale

/** Price giving net margin m (profit / price) after fees: P(1 − f − m) = cost + fixed. */
export function priceForMargin(cost: number, m: number, fees: Fees): number {
  const d = 1 - fees.pct - m
  return d > 0 ? (cost + fees.fixed) / d : NaN
}

/** Price giving profit = markup × cost after fees: P(1 − f) = cost(1 + k) + fixed. */
export function priceForMarkup(cost: number, k: number, fees: Fees): number {
  const d = 1 - fees.pct
  return d > 0 ? (cost * (1 + k) + fees.fixed) / d : NaN
}

export interface Breakdown { price: number; cost: number; fees: number; profit: number; margin: number; markup: number }

export function breakdown(price: number, cost: number, fees: Fees): Breakdown {
  const fee = price * fees.pct + fees.fixed
  const profit = price - cost - fee
  return { price, cost, fees: fee, profit, margin: price ? profit / price : NaN, markup: cost ? profit / cost : NaN }
}

export type Rounding = 'none' | 'cent' | '99' | '95' | '49' | 'whole' | '5' | '10'

/** Rounds a price up to a "charm" ending so the target margin is never undercut. */
export function roundPrice(p: number, r: Rounding): number {
  if (!Number.isFinite(p)) return p
  const e = 1e-9
  switch (r) {
    case 'none': return p
    case 'cent': return Math.ceil(p * 100 - e) / 100
    case 'whole': return Math.ceil(p - e)
    case '5': return Math.ceil(p / 5 - e) * 5
    case '10': return Math.ceil(p / 10 - e) * 10
    case '99':
    case '95':
    case '49': {
      const end = Number(r) / 100
      let v = Math.floor(p) + end
      if (v < p - e) v += r === '49' ? 0.5 : 1
      if (r === '49' && v - 0.5 >= p - e && v - 0.5 > 0) v -= 0.5
      return Math.round(v * 100) / 100
    }
  }
}

/** Units per period needed to cover fixed costs. */
export const breakEvenUnits = (fixed: number, profitPerUnit: number) => (profitPerUnit > 0 ? Math.ceil(fixed / profitPerUnit - 1e-9) : Infinity)

/** Share of competitor prices strictly below yours (0..1). */
export const pricePercentile = (price: number, others: number[]) => (others.length ? others.filter((o) => o < price).length / others.length : NaN)
