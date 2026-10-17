// Monte Carlo retirement projection in real (today's) money: yearly returns ~ Normal(μ, σ) applied to
// the balance, contributions until retirement, withdrawals (net of other income) after.

export interface Plan {
  age: number; retireAge: number; endAge: number
  balance: number; contribution: number; contribGrowth: number // real % per year
  spending: number; otherIncome: number // per year in retirement, today's money
  meanReturn: number; volatility: number; inflation: number // nominal %, %, %
  fees: number // % per year
}

export const DEFAULT_PLAN: Plan = {
  age: 35, retireAge: 65, endAge: 95, balance: 85000, contribution: 14000, contribGrowth: 1,
  spending: 60000, otherIncome: 22000, meanReturn: 7, volatility: 15, inflation: 2.5, fees: 0.3,
}

/** Real expected return after inflation and fees (fraction). */
export const realReturn = (p: Pick<Plan, 'meanReturn' | 'inflation' | 'fees'>) => (1 + (p.meanReturn - p.fees) / 100) / (1 + p.inflation / 100) - 1

export function rng(seed: number) {
  let a = seed >>> 0 || 1
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function gauss(r: () => number) {
  let u = 0
  while (u === 0) u = r()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r())
}

export interface SimResult {
  ages: number[]
  pct: Record<'p5' | 'p10' | 'p25' | 'p50' | 'p75' | 'p90' | 'p95', number[]> // balance at start of each age
  success: number // share of paths never running out before endAge
  depletion: number[] // histogram: paths depleted at each age (index = age - first age)
  atRetirement: number // median balance at retirement age
}

const quant = (sorted: Float64Array, q: number) => {
  const i = q * (sorted.length - 1), lo = Math.floor(i), hi = Math.ceil(i)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo)
}

/** Runs `paths` simulations. Volatility 0 gives the deterministic projection. */
export function simulate(p: Plan, paths = 2000, seed = 1): SimResult {
  const years = Math.max(1, Math.round(p.endAge - p.age))
  const ages = Array.from({ length: years + 1 }, (_, i) => p.age + i)
  const mu = realReturn(p), sd = p.volatility / 100 / (1 + p.inflation / 100)
  const r = rng(seed)
  const grid = Array.from({ length: years + 1 }, () => new Float64Array(paths))
  const depletion = new Array(years + 1).fill(0)
  let ok = 0
  const draw = Math.max(0, p.spending - p.otherIncome)
  for (let k = 0; k < paths; k++) {
    let b = p.balance, failed = false
    grid[0][k] = b
    for (let y = 0; y < years; y++) {
      const age = p.age + y
      const ret = sd > 0 ? Math.max(-0.95, mu + sd * gauss(r)) : mu
      if (age < p.retireAge) b = b * (1 + ret) + p.contribution * Math.pow(1 + p.contribGrowth / 100, y)
      else b = (b - draw) * (1 + ret) // withdraw at the start of each retirement year
      if (b <= 0) {
        if (!failed) depletion[y + 1]++
        failed = true
        b = 0
      }
      grid[y + 1][k] = b
    }
    if (!failed) ok++
  }
  const keys = ['p5', 'p10', 'p25', 'p50', 'p75', 'p90', 'p95'] as const
  const qs = [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95]
  const pct = Object.fromEntries(keys.map((k) => [k, [] as number[]])) as SimResult['pct']
  for (const col of grid) {
    col.sort()
    keys.forEach((k, i) => pct[k].push(quant(col, qs[i])))
  }
  const ri = Math.min(years, Math.max(0, p.retireAge - p.age))
  return { ages, pct, success: ok / paths, depletion, atRetirement: pct.p50[ri] }
}

/** Surface: median balance by age for a range of mean returns (each row its own Monte Carlo). */
export function surface(p: Plan, returns: number[], paths = 600, seed = 7) {
  return returns.map((m) => {
    const s = simulate({ ...p, meanReturn: m }, paths, seed)
    return { ret: m, p50: s.pct.p50, p10: s.pct.p10, success: s.success }
  })
}

/** Closed form for checks: FV of a balance plus a growing annuity (end-of-year deposits). */
export function futureValue(balance: number, contribution: number, rate: number, growth: number, years: number) {
  let b = balance
  for (let y = 0; y < years; y++) b = b * (1 + rate) + contribution * Math.pow(1 + growth, y)
  return b
}

/** Sustainable real spending for a deterministic return over `years` (annuity-due payment). */
export function sustainableSpending(balance: number, rate: number, years: number) {
  if (years <= 0) return balance
  if (Math.abs(rate) < 1e-12) return balance / years
  return (balance * rate) / ((1 - Math.pow(1 + rate, -years)) * (1 + rate))
}
