import { describe, expect, it } from 'vitest'
import { bendAllowance, bendDeduction, flatPattern, kFactor, MATERIALS, setback } from './sheet-metal-flat-pattern'

describe('sheet metal', () => {
  it('bend allowance and deduction (90°, T=2, R=2, K=0.44)', () => {
    expect(bendAllowance(90, 2, 2, 0.44)).toBeCloseTo((Math.PI / 2) * 2.88, 6) // 4.524
    expect(setback(90, 2, 2)).toBeCloseTo(4)
    expect(bendDeduction(90, 2, 2, 0.44)).toBeCloseTo(8 - 4.5239, 3)
  })
  it('U-channel flat length 50 + 100 + 50 OML', () => {
    const f = flatPattern([50, 100, 50], [{ angle: 90, up: true }, { angle: 90, up: true }], 2, 2, 0.44)
    expect(f.total).toBeCloseTo(200 - 2 * (8 - 4.5239), 3)
    expect(f.total).toBeCloseTo(f.check, 9)
    expect(f.pieces.map((p) => p.kind)).toEqual(['flat', 'bend', 'flat', 'bend', 'flat'])
    expect(f.pieces[0].length).toBeCloseTo(46)
    expect(f.pieces[2].length).toBeCloseTo(92)
  })
  it('inside dimensions use inside setback', () => {
    const f = flatPattern([46, 46], [{ angle: 90, up: true }], 2, 2, 0.5, false)
    expect(f.total).toBeCloseTo(44 + 44 + (Math.PI / 2) * 3, 6)
  })
  it('k-factor table', () => {
    const ms = MATERIALS.find((m) => m.id === 'ms')!
    expect(kFactor(ms, 1, 2)).toBe(0.38)
    expect(kFactor(ms, 2, 2)).toBe(0.43)
    expect(kFactor(ms, 10, 2)).toBe(0.5)
  })
})
