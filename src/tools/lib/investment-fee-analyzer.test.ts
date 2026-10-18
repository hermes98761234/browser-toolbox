import { describe, expect, it } from 'vitest'
import { equivalentFee, simulate, summarize, type Inputs, type Scenario } from './investment-fee-analyzer'

const lump: Inputs = { initial: 10000, monthly: 0, growth: 0, ret: 7, years: 10, inflation: 0 }
const sc = (er: number, extra: Partial<Scenario> = {}): Scenario => ({ id: 'x', name: 'x', er, advisory: 0, load: 0, flat: 0, ...extra })

describe('investment fees', () => {
  it('fee-free lump sum compounds at the annual rate', () => {
    expect(simulate(lump, null).at(-1)!.balance).toBeCloseTo(10000 * 1.07 ** 10, 4)
  })
  it('a 1% fee multiplies each year by 0.99', () => {
    const r = simulate(lump, sc(1)).at(-1)!
    expect(r.balance).toBeCloseTo(10000 * (1.07 * 0.99) ** 10, 4)
    const s = summarize(lump, sc(1))
    expect(s.drag).toBeCloseTo(10000 * 1.07 ** 10 - r.balance, 6)
    expect(s.fees + s.lost).toBeCloseTo(s.drag, 6)
    expect(s.fees).toBeGreaterThan(0)
    expect(s.lost).toBeGreaterThan(0)
  })
  it('monthly contributions: annuity-due check without fees', () => {
    const inp: Inputs = { initial: 0, monthly: 100, growth: 0, ret: (1.01 ** 12 - 1) * 100, years: 1, inflation: 0 } // 1%/month
    const fv = 100 * ((1.01 ** 12 - 1) / 0.01) * 1.01
    expect(simulate(inp, null).at(-1)!.balance).toBeCloseTo(fv, 6)
  })
  it('front load and flat fees', () => {
    const r = simulate({ ...lump, years: 0 }, sc(0, { load: 5 }))[0]
    expect(r.balance).toBe(9500)
    expect(r.fees).toBe(500)
    const f = simulate({ ...lump, ret: 0, years: 2 }, sc(0, { flat: 50 })).at(-1)!
    expect(f.balance).toBeCloseTo(9900, 9)
  })
  it('equivalent annual fee of a pure-ER scenario is the ER', () => {
    expect(equivalentFee(lump, sc(0.75))).toBeCloseTo(0.75, 4)
    expect(equivalentFee(lump, sc(0, { load: 5 }))).toBeGreaterThan(0.4)
  })
})
