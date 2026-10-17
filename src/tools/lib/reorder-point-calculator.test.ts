import { describe, expect, it } from 'vitest'
import { calc, costAt, sawtooth, simulate, zFor } from './reorder-point-calculator'

const I = { demand: 40, demandSd: 10, lead: 9, leadSd: 2, service: 95, days: 365, orderCost: 80, unitCost: 25, holdPct: 20 }

describe('z scores', () => {
  it('matches the normal table', () => {
    expect(zFor(0.5)).toBeCloseTo(0, 6)
    expect(zFor(0.9)).toBeCloseTo(1.281552, 5)
    expect(zFor(0.95)).toBeCloseTo(1.644854, 5)
    expect(zFor(0.99)).toBeCloseTo(2.326348, 5)
    expect(zFor(0.999)).toBeCloseTo(3.090232, 4)
    expect(zFor(0.01)).toBeCloseTo(-2.326348, 5)
  })
})

describe('inventory formulas', () => {
  it('computes safety stock, ROP and EOQ', () => {
    const r = calc(I)
    const sigma = Math.sqrt(9 * 100 + 1600 * 4)
    expect(r.sigmaLT).toBeCloseTo(sigma, 9)
    expect(r.ss).toBeCloseTo(1.644854 * sigma, 3)
    expect(r.rop).toBeCloseTo(360 + r.ss, 9)
    expect(r.eoq).toBeCloseTo(Math.sqrt((2 * 14600 * 80) / 5), 9)
    expect(r.orderingCost).toBeCloseTo(r.holdingCost, 9) // equal at EOQ
  })
  it('classic textbook EOQ', () => {
    expect(calc({ ...I, demand: 1200 / 365, orderCost: 100, unitCost: 30, holdPct: 20 }).eoq).toBeCloseTo(200, 9)
    const c = costAt(200, 1200, 100, 6)
    expect(c.ordering + c.holding).toBe(1200)
  })
  it('builds a sawtooth and a plausible simulation', () => {
    const r = calc(I)
    const st = sawtooth(r.eoq, r.rop, r.ss, I.demand, I.lead, 60)
    expect(st[0][1]).toBeCloseTo(r.ss + r.eoq)
    expect(Math.min(...st.map((p) => p[1]))).toBeCloseTo(r.ss, 6)
    const sim = simulate(I, r.rop, r.eoq, 365, 42)
    expect(sim.fill).toBeGreaterThan(0.97)
    expect(sim.trace).toHaveLength(365)
  })
})
