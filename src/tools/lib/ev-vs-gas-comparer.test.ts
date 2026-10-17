import { describe, expect, it } from 'vitest'
import { breakEven, co2, evCostPerDist, gasCostPerDist, netTotal, simulate, type Params } from './ev-vs-gas-comparer'

const car = { price: 30000, incentive: 0, maintPerDist: 0, insurance: 0, fees: 0, resalePct: 50 }
const P: Params = {
  us: false, years: 5, distance: 10000, growth: 0, gasEff: 6, gasPrice: 2, evEff: 18, homePrice: 0.2, publicPrice: 0.5, publicShare: 0, chargeLoss: 10, gridCo2: 300,
  ev: { ...car, price: 36000 }, gas: car,
}

describe('ev-vs-gas-comparer', () => {
  it('per-distance energy cost', () => {
    expect(gasCostPerDist(P)).toBeCloseTo(0.12)
    expect(evCostPerDist(P)).toBeCloseTo(0.04)
    expect(gasCostPerDist({ ...P, us: true, gasEff: 30, gasPrice: 3.6 })).toBeCloseTo(0.12)
  })
  it('simulation and break-even', () => {
    const ys = simulate(P)
    // gas: 1200/yr, ev: 400/yr → 800/yr saving vs 6000 premium → 7.5 years
    expect(ys[1].gas - ys[0].gas).toBeCloseTo(1200)
    expect(breakEven(ys)).toBeNull()
    expect(breakEven(simulate({ ...P, years: 10 }))).toBeCloseTo(7.5)
    const n = netTotal(P, ys)
    expect(n.gas).toBeCloseTo(30000 + 6000 - 15000)
  })
  it('co2', () => {
    const c = co2(P)
    expect(c.gas).toBeCloseTo(600 * 2.31)
    expect(c.ev).toBeCloseTo(2000 * 0.3)
  })
})
