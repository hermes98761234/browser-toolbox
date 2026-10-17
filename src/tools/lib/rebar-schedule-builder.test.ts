import { describe, expect, it } from 'vitest'
import { calc, kgPerM, shapeBy, stockBars } from './rebar-schedule-builder'

describe('rebar schedule', () => {
  it('unit weights match d²/162', () => {
    expect(kgPerM(12)).toBeCloseTo(0.888, 3)
    expect(kgPerM(16)).toBeCloseTo(1.578, 3)
    expect(kgPerM(25)).toBeCloseTo(3.853, 3)
  })
  it('stirrup cut length (230×450 beam, 25 cover, 8 mm link)', () => {
    // out-to-out 180 × 400: 2(180+400) + 2·max(80,75) − 6·8 − 6·8 = 1160 + 160 − 96 = 1224
    expect(shapeBy('51').len({ A: 180, B: 400 }, 8)).toBeCloseTo(1224)
  })
  it('L and U bars and helix', () => {
    expect(shapeBy('11').len({ A: 1000, B: 300 }, 12)).toBe(1276)
    expect(shapeBy('21').len({ A: 300, B: 2000, C: 300 }, 16)).toBe(2536)
    const helix = shapeBy('77').len({ D: 400, P: 100, H: 1000 }, 8)
    expect(helix).toBeCloseTo(10 * Math.hypot(Math.PI * 400, 100) + Math.PI * 400, 6)
  })
  it('totals and stock optimisation', () => {
    const c = calc({ id: 'a', mark: 'B1', member: 'Beam', shape: '00', dia: 16, dims: { A: 4000 }, members: 3, perMember: 4 })
    expect(c.count).toBe(12)
    expect(c.totalM).toBe(48)
    expect(c.kg).toBeCloseTo(48 * kgPerM(16), 6)
    expect(stockBars([4000, 4000, 4000, 7000, 5000], 12000)).toEqual({ bars: 2, waste: 0, tooLong: 0 })
  })
})
