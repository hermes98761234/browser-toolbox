// Total cost of ownership: EV vs gas car, year by year, with price escalation, depreciation and break-even.

export interface Car { price: number; incentive: number; maintPerDist: number; insurance: number; fees: number; resalePct: number }
export interface Params {
  us: boolean; years: number; distance: number; growth: number // energy price growth %/yr
  gasEff: number; gasPrice: number // L/100km or mpg; per L or per gal
  evEff: number; homePrice: number; publicPrice: number; publicShare: number; chargeLoss: number // kWh/100 dist; %; %
  gridCo2: number // g/kWh
  ev: Car; gas: Car
}

export const KG_CO2_PER_L = 2.31
export const KG_CO2_PER_GAL = 8.89

export const gasCostPerDist = (p: Params, priceMul = 1) => (p.us ? (p.gasPrice * priceMul) / p.gasEff : (p.gasEff / 100) * p.gasPrice * priceMul)
export function evCostPerDist(p: Params, priceMul = 1) {
  const kwh = (p.evEff / 100) / (1 - p.chargeLoss / 100)
  const price = p.homePrice * (1 - p.publicShare / 100) + p.publicPrice * (p.publicShare / 100)
  return kwh * price * priceMul
}

export interface Year { year: number; ev: number; gas: number; evEnergy: number; gasEnergy: number }

/** Cumulative cost at the end of each year (year 0 = upfront). Resale value credited in the final year. */
export function simulate(p: Params): Year[] {
  const out: Year[] = [{ year: 0, ev: p.ev.price - p.ev.incentive, gas: p.gas.price - p.gas.incentive, evEnergy: 0, gasEnergy: 0 }]
  let ev = out[0].ev, gas = out[0].gas
  for (let y = 1; y <= p.years; y++) {
    const mul = (1 + p.growth / 100) ** (y - 1)
    const evE = evCostPerDist(p, mul) * p.distance
    const gasE = gasCostPerDist(p, mul) * p.distance
    ev += evE + p.ev.maintPerDist * p.distance + p.ev.insurance + p.ev.fees
    gas += gasE + p.gas.maintPerDist * p.distance + p.gas.insurance + p.gas.fees
    out.push({ year: y, ev, gas, evEnergy: evE, gasEnergy: gasE })
  }
  return out
}

/** Net total after selling the car at the end. */
export const netTotal = (p: Params, ys: Year[]) => ({
  ev: ys[ys.length - 1].ev - (p.ev.price * p.ev.resalePct) / 100,
  gas: ys[ys.length - 1].gas - (p.gas.price * p.gas.resalePct) / 100,
})

/** First (fractional) year when cumulative EV cost drops to or below gas, or null. */
export function breakEven(ys: Year[]): number | null {
  if (ys[0].ev <= ys[0].gas) return 0
  for (let i = 1; i < ys.length; i++) {
    const d0 = ys[i - 1].ev - ys[i - 1].gas, d1 = ys[i].ev - ys[i].gas
    if (d1 <= 0) return ys[i - 1].year + d0 / (d0 - d1)
  }
  return null
}

/** Tailpipe + grid CO₂ per year in kg. */
export function co2(p: Params) {
  const gas = p.us ? (p.distance / p.gasEff) * KG_CO2_PER_GAL : (p.distance * p.gasEff / 100) * KG_CO2_PER_L
  const ev = ((p.distance * p.evEff) / 100 / (1 - p.chargeLoss / 100)) * (p.gridCo2 / 1000)
  return { gas, ev }
}
