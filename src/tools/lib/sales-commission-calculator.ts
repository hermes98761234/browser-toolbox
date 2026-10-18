// Tiered sales commission: marginal (progressive) vs retroactive (whole amount) tiers, quota-based
// accelerators, caps and recoverable / non-recoverable draws.

export interface Tier { upTo: number; rate: number } // upTo: tier ceiling (amount or % of quota); Infinity / 0 for the last tier; rate in %
export type Basis = 'amount' | 'quota'
export type Method = 'marginal' | 'retro'
export interface Plan { basis: Basis; method: Method; tiers: Tier[]; cap: number; draw: number; recoverable: boolean }
export interface Part { tier: number; from: number; to: number; rate: number; base: number; amount: number }
export interface Result { gross: number; total: number; capped: boolean; parts: Part[]; tier: number; attainment: number; effRate: number }

/** Tier ceilings converted to sales amounts, ascending; the last one is open-ended. */
export function bounds(tiers: Tier[], basis: Basis, quota: number): { lo: number; hi: number; rate: number }[] {
  const conv = (x: number) => (basis === 'quota' ? (x / 100) * quota : x)
  const sorted = [...tiers].sort((a, b) => (a.upTo || Infinity) - (b.upTo || Infinity))
  let lo = 0
  return sorted.map((t, i) => {
    const hi = i === sorted.length - 1 || !t.upTo ? Infinity : Math.max(lo, conv(t.upTo))
    const b = { lo, hi, rate: t.rate }
    lo = hi
    return b
  })
}

/**
 * Marginal: each slice of sales earns its own tier's rate (like income tax brackets).
 * Retroactive: once a tier is reached, the whole amount earns that tier's rate.
 * A sale exactly on a ceiling stays in the lower tier.
 */
export function commission(sales: number, quota: number, p: Pick<Plan, 'basis' | 'method' | 'tiers' | 'cap'>): Result {
  const bs = bounds(p.tiers, p.basis, quota)
  const s = Math.max(0, sales)
  let tier = bs.findIndex((b) => s <= b.hi)
  if (tier < 0) tier = bs.length - 1
  const parts: Part[] = []
  if (p.method === 'marginal') {
    bs.forEach((b, i) => {
      const base = Math.max(0, Math.min(s, b.hi) - b.lo)
      if (base > 0 || i === 0) parts.push({ tier: i, from: b.lo, to: Math.min(s, b.hi), rate: b.rate, base, amount: (base * b.rate) / 100 })
    })
  } else if (bs[tier]) parts.push({ tier, from: 0, to: s, rate: bs[tier].rate, base: s, amount: (s * bs[tier].rate) / 100 })
  const gross = parts.reduce((a, x) => a + x.amount, 0)
  const capped = p.cap > 0 && gross > p.cap
  const total = capped ? p.cap : gross
  return { gross, total, capped, parts, tier, attainment: quota > 0 ? s / quota : NaN, effRate: s > 0 ? total / s : 0 }
}

export interface Settle { payout: number; recovered: number; balance: number; drawTopUp: number }

/**
 * Draw against commission. If commission is below the draw the rep still gets the draw; a recoverable draw
 * adds the shortfall to a balance that is recovered from later excess commission, a non-recoverable one forgives it.
 */
export function settle(comm: number, draw: number, recoverable: boolean, balanceIn: number): Settle {
  if (draw <= 0) {
    const recovered = recoverable ? Math.min(comm, balanceIn) : 0
    return { payout: comm - recovered, recovered, balance: balanceIn - recovered, drawTopUp: 0 }
  }
  if (comm >= draw) {
    const recovered = recoverable ? Math.min(comm - draw, balanceIn) : 0
    return { payout: comm - recovered, recovered, balance: balanceIn - recovered, drawTopUp: 0 }
  }
  const top = draw - comm
  return { payout: draw, recovered: 0, balance: recoverable ? balanceIn + top : balanceIn, drawTopUp: top }
}

/** Commission at exactly 100 % of quota: the "target incentive" used to sanity-check the plan. */
export const targetIncentive = (quota: number, p: Pick<Plan, 'basis' | 'method' | 'tiers' | 'cap'>) => commission(quota, quota, p).total
