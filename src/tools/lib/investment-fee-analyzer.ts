// Long-run cost of investment fees: monthly simulation with asset-based fees (expense ratio +
// advisory fee), front-end sales loads on each deposit and flat yearly account fees.

export interface Inputs { initial: number; monthly: number; growth: number; ret: number; years: number; inflation: number }
export interface Scenario { id: string; name: string; er: number; advisory: number; load: number; flat: number }
export interface Row { year: number; balance: number; contributed: number; fees: number; real: number }

/**
 * Month by month: deposit (minus sales load) at the start of the month, grow at the gross return,
 * then deduct the asset-based fee; flat fees are taken at each year end. Rates in % per year;
 * monthly rates are chosen so 12 months compound exactly to the annual figures.
 * `growth` raises the monthly deposit each year (%).
 */
export function simulate(inp: Inputs, sc: Scenario | null): Row[] {
  const g = (1 + inp.ret / 100) ** (1 / 12) - 1
  const pct = sc ? (sc.er + sc.advisory) / 100 : 0
  const f = 1 - (1 - Math.min(0.99, pct)) ** (1 / 12)
  const load = sc ? sc.load / 100 : 0
  let bal = inp.initial * (1 - load)
  let fees = inp.initial * load
  let contributed = inp.initial
  const rows: Row[] = [{ year: 0, balance: bal, contributed, fees, real: bal }]
  let dep = inp.monthly
  for (let y = 1; y <= inp.years; y++) {
    for (let m = 0; m < 12; m++) {
      bal += dep * (1 - load)
      fees += dep * load
      contributed += dep
      bal *= 1 + g
      const fee = bal * f
      bal -= fee
      fees += fee
    }
    if (sc && sc.flat > 0) {
      const flat = Math.min(bal, sc.flat)
      bal -= flat
      fees += flat
    }
    dep *= 1 + inp.growth / 100
    rows.push({ year: y, balance: bal, contributed, fees, real: bal / (1 + inp.inflation / 100) ** y })
  }
  return rows
}

export interface Summary { final: number; fees: number; lost: number; drag: number; shareLost: number; contributed: number }
/** Compares a scenario with the fee-free baseline: fees paid, lost growth on those fees, total drag. */
export function summarize(inp: Inputs, sc: Scenario): Summary {
  const base = simulate(inp, null).at(-1)!
  const r = simulate(inp, sc).at(-1)!
  const drag = base.balance - r.balance
  return { final: r.balance, fees: r.fees, lost: drag - r.fees, drag, shareLost: base.balance > 0 ? drag / base.balance : 0, contributed: r.contributed }
}

/** Effective annual cost in % (asset-based fee only). */
export const annualPct = (sc: Scenario) => sc.er + sc.advisory

/** Fee-equivalent: the yearly fee (%) that would cost the same as this scenario over the horizon (bisection). */
export function equivalentFee(inp: Inputs, sc: Scenario): number {
  const target = simulate(inp, sc).at(-1)!.balance
  let lo = 0, hi = 20
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    const b = simulate(inp, { id: '', name: '', er: mid, advisory: 0, load: 0, flat: 0 }).at(-1)!.balance
    if (b > target) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

export const PRESETS: Omit<Scenario, 'id'>[] = [
  { name: 'Index fund', er: 0.04, advisory: 0, load: 0, flat: 0 },
  { name: 'Target-date fund', er: 0.12, advisory: 0, load: 0, flat: 0 },
  { name: 'Robo-advisor', er: 0.08, advisory: 0.25, load: 0, flat: 0 },
  { name: 'Active mutual fund', er: 0.75, advisory: 0, load: 0, flat: 0 },
  { name: 'Advisor + active funds', er: 0.6, advisory: 1, load: 0, flat: 0 },
  { name: 'Load fund (A shares)', er: 0.85, advisory: 0, load: 5.75, flat: 0 },
  { name: 'Small account, flat fee', er: 0.1, advisory: 0, load: 0, flat: 50 },
]
