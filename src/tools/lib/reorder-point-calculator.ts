// Inventory maths: inverse normal (z for a cycle service level), safety stock, reorder point, EOQ, simulation.

/** Inverse standard normal CDF (Acklam's rational approximation, |error| < 1.2e-9 after refinement). */
export function zFor(p: number): number {
  if (!(p > 0 && p < 1)) return p >= 1 ? Infinity : -Infinity
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239]
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572]
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416]
  const lo = 0.02425
  let x: number
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p))
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  } else if (p <= 1 - lo) {
    const q = p - 0.5, r = q * q
    x = ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p))
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  // one Halley refinement step
  const e = 0.5 * erfc(-x / Math.SQRT2) - p
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2)
  return x - u / (1 + (x * u) / 2)
}

/** Complementary error function (Numerical Recipes erfcc, ~1e-7 relative). */
export function erfc(x: number): number {
  const z = Math.abs(x), t = 1 / (1 + 0.5 * z)
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))))
  return x >= 0 ? r : 2 - r
}

export interface Inputs {
  demand: number // units per day (mean)
  demandSd: number // units per day
  lead: number // days
  leadSd: number // days
  service: number // cycle service level, %
  days: number // operating days per year
  orderCost: number // per order
  unitCost: number
  holdPct: number // annual holding cost as % of unit cost
}

export function calc(i: Inputs) {
  const z = zFor(i.service / 100)
  const sigmaLT = Math.sqrt(i.lead * i.demandSd ** 2 + i.demand ** 2 * i.leadSd ** 2)
  const ss = Math.max(0, z * sigmaLT)
  const ltDemand = i.demand * i.lead
  const rop = ltDemand + ss
  const D = i.demand * i.days
  const H = (i.unitCost * i.holdPct) / 100
  const eoq = H > 0 ? Math.sqrt((2 * D * i.orderCost) / H) : NaN
  const orders = D / eoq
  const cycle = eoq / i.demand
  const orderingCost = orders * i.orderCost
  const holdingCost = (eoq / 2) * H
  const ssCost = ss * H
  return { z, sigmaLT, ss, ltDemand, rop, D, H, eoq, orders, cycle, orderingCost, holdingCost, ssCost, total: orderingCost + holdingCost + ssCost, avgInv: eoq / 2 + ss }
}

/** Annual ordering + cycle holding cost for an order quantity Q. */
export const costAt = (Q: number, D: number, S: number, H: number) => ({ ordering: (D / Q) * S, holding: (Q / 2) * H })

/** Deterministic saw-tooth stock profile for the chart: [day, on-hand]. */
export function sawtooth(eoq: number, rop: number, ss: number, demand: number, lead: number, days: number): [number, number][] {
  const out: [number, number][] = []
  let stock = ss + eoq, t = 0
  out.push([0, stock])
  let guard = 0
  while (t < days && guard++ < 1000) {
    const toRop = Math.max(0, (stock - rop) / demand)
    t += toRop
    stock -= toRop * demand
    out.push([t, stock])
    t += lead
    stock -= lead * demand
    out.push([t, stock])
    stock += eoq
    out.push([t, stock])
  }
  return out.filter((p) => p[0] <= days)
}

/** Seeded daily simulation with normal demand and lead times; continuous review (s, Q). */
export function simulate(i: Inputs, rop: number, Q: number, days = 365, seed = 1) {
  let s = seed >>> 0 || 1
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) + 0.5) / 4294967296
  const normal = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd())
  let stock = rop + Q / 2
  const pipeline: { at: number; q: number }[] = []
  let demanded = 0, shipped = 0, stockoutDays = 0, cycles = 0, cyclesShort = 0, shortThisCycle = false
  const trace: [number, number][] = []
  for (let d = 0; d < days; d++) {
    for (const p of pipeline.filter((x) => x.at === d)) {
      stock += p.q
      cycles++
      if (shortThisCycle) cyclesShort++
      shortThisCycle = false
    }
    const want = Math.max(0, Math.round(i.demand + i.demandSd * normal()))
    const give = Math.min(stock, want)
    demanded += want
    shipped += give
    stock -= give
    if (give < want) {
      stockoutDays++
      shortThisCycle = true
    }
    const position = stock + pipeline.filter((x) => x.at > d).reduce((a, x) => a + x.q, 0)
    if (position <= rop) pipeline.push({ at: d + Math.max(1, Math.round(i.lead + i.leadSd * normal())), q: Q })
    trace.push([d, stock])
  }
  return { fill: demanded ? shipped / demanded : 1, stockoutDays, cycles, csl: cycles ? 1 - cyclesShort / cycles : 1, trace }
}
