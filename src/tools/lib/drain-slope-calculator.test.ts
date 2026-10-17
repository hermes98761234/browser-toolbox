import { describe, expect, it } from 'vitest'
import { fromFrac, inchFraction, inverts, manningFull, minSlopeIPC, toFrac } from './drain-slope-calculator'

describe('drain slope', () => {
  it('converts slope units', () => {
    const s = toFrac(0.25, 'inft')
    expect(fromFrac(s, 'pct')).toBeCloseTo(2.0833, 4)
    expect(fromFrac(s, 'ratio')).toBeCloseTo(48)
    expect(fromFrac(s, 'deg')).toBeCloseTo(1.193, 3)
    expect(toFrac(1, 'pct')).toBe(0.01)
    expect(fromFrac(toFrac(40, 'ratio'), 'mmm')).toBe(25)
  })
  it('formats inch fractions', () => {
    expect(inchFraction(0.25)).toBe('1/4')
    expect(inchFraction(0.125)).toBe('1/8')
    expect(inchFraction(1.5)).toBe('1 1/2')
  })
  it('computes inverts', () => {
    const n = inverts(100, [{ length: 10, slope: 0.02 }, { length: 50, slope: 0.01 }])
    expect(n[1].invert).toBeCloseTo(99.8)
    expect(n[2].invert).toBeCloseTo(99.3)
    expect(n[2].x).toBe(60)
  })
  it('code minimum slopes', () => {
    expect(minSlopeIPC(2) * 12).toBe(0.25)
    expect(minSlopeIPC(4) * 12).toBe(0.125)
    expect(minSlopeIPC(8) * 12).toBe(0.0625)
  })
  it('Manning full flow', () => {
    // 0.3 m concrete pipe at 1%: R = 0.075, V = (1/0.013)·0.075^(2/3)·0.1 ≈ 1.368 m/s, Q ≈ 0.0967 m³/s
    const r = manningFull(0.3, 0.01, 0.013)
    expect(r.V).toBeCloseTo(1.368, 2)
    expect(r.Q).toBeCloseTo(0.0967, 3)
  })
})
