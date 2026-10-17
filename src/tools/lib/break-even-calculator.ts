// Break-even analysis (cost-volume-profit).

export interface BeInput {
  fixed: number // fixed costs per period
  price: number // selling price per unit
  variable: number // variable cost per unit
  expected: number // expected units sold per period
  target: number // target profit per period
}

export interface BeResult {
  cm: number // contribution margin per unit
  cmRatio: number
  units: number // break-even units (exact, may be fractional); Infinity if never
  unitsCeil: number
  revenue: number // break-even sales revenue
  targetUnits: number
  profit: number // profit at expected volume
  safety: number // margin of safety in units
  safetyPct: number
  dol: number // degree of operating leverage at expected volume
}

export function breakEven(i: BeInput): BeResult {
  const cm = i.price - i.variable
  const cmRatio = i.price > 0 ? cm / i.price : 0
  const units = cm > 0 ? i.fixed / cm : Infinity
  const profit = i.expected * cm - i.fixed
  const targetUnits = cm > 0 ? (i.fixed + i.target) / cm : Infinity
  const safety = i.expected - units
  return {
    cm,
    cmRatio,
    units,
    unitsCeil: Number.isFinite(units) ? Math.ceil(units - 1e-9) : Infinity,
    revenue: units * i.price,
    targetUnits,
    profit,
    safety,
    safetyPct: i.expected > 0 ? safety / i.expected : 0,
    dol: profit !== 0 ? (i.expected * cm) / profit : Infinity,
  }
}

/** Points for cost/revenue lines from 0 to maxUnits. */
export function curves(i: BeInput, maxUnits: number, n = 40) {
  const xs = Array.from({ length: n + 1 }, (_, k) => (maxUnits * k) / n)
  return {
    revenue: xs.map((x) => [x, x * i.price] as [number, number]),
    cost: xs.map((x) => [x, i.fixed + x * i.variable] as [number, number]),
    fixed: xs.map((x) => [x, i.fixed] as [number, number]),
    profit: xs.map((x) => [x, x * (i.price - i.variable) - i.fixed] as [number, number]),
  }
}
