import { describe, expect, it } from 'vitest'
import { CELLS, compute, fmtH, suggest, type Inputs } from './battery-pack-planner'

const cell = CELLS.find((c) => c.id === '18650-p')!
const base: Inputs = { cell, s: 13, p: 4, load: 500, mode: 'W', dod: 100, eff: 100, overhead: 0, gap: 0 }

describe('battery pack math', () => {
  it('computes a 13S4P e-bike pack', () => {
    const r = compute(base)
    expect(r.cells).toBe(52)
    expect(r.vNom).toBeCloseTo(46.8, 6)
    expect(r.vMax).toBeCloseTo(54.6, 6)
    expect(r.ah).toBeCloseTo(12, 6)
    expect(r.wh).toBeCloseTo(561.6, 6)
    expect(r.iMax).toBe(60)
    expect(r.rPack).toBeCloseTo((13 * 0.015) / 4, 9)
    expect(r.current).toBeCloseTo(500 / 46.8, 6)
    expect(r.runtimeH).toBeCloseTo(561.6 / 500, 6)
    expect(r.massKg).toBeCloseTo(52 * 0.047, 6)
  })
  it('applies DoD and efficiency', () => {
    const r = compute({ ...base, dod: 80, eff: 90 })
    expect(r.usableWh).toBeCloseTo(561.6 * 0.8, 6)
    expect(r.runtimeH).toBeCloseTo((561.6 * 0.8 * 0.9) / 500, 6)
    expect(r.current).toBeCloseTo(500 / 0.9 / 46.8, 6)
  })
  it('current mode and warnings', () => {
    const r = compute({ ...base, mode: 'A', load: 70 })
    expect(r.power).toBeCloseTo(70 * 46.8, 6)
    expect(r.warnings.some((w) => w.includes('exceeds'))).toBe(true)
    expect(r.cRate).toBeCloseTo(70 / 4 / 3, 6)
  })
  it('suggests S and P', () => {
    // 48 V, 500 W for 1.5 h with 18650-p: S = 13; need 750 Wh → 750/(46.8*3)=5.34 → 6P
    expect(suggest(cell, 48, 500, 1.5, 0, 100, 100)).toEqual({ s: 13, p: 6 })
    // current limited: 100 A peak / 15 A → 7P
    expect(suggest(cell, 48, 100, 0.1, 100, 100, 100)).toEqual({ s: 13, p: 7 })
  })
  it('formats hours', () => {
    expect(fmtH(0.5)).toBe('30 min')
    expect(fmtH(2.25)).toBe('2 h 15 min')
  })
})
