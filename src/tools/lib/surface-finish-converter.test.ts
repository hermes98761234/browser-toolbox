import { describe, expect, it } from 'vitest'
import { fromRa, gostClass, nGrade, RQ_RA, toRa } from './surface-finish-converter'

const M = { profile: 'sine' as const, rzRatio: 5, rtRatio: 1.2 }

describe('surface finish', () => {
  it('µm ⇄ µin is exact', () => {
    expect(fromRa(0.8, 'ra', 'uin', M)).toBeCloseTo(31.496, 3)
    expect(toRa(63, 'ra', 'uin', M)).toBeCloseTo(1.6002, 4)
  })
  it('profile ratios', () => {
    expect(RQ_RA.sine).toBeCloseTo(1.1107, 4)
    expect(RQ_RA.gauss).toBeCloseTo(1.2533, 4)
    expect(RQ_RA.triangle).toBeCloseTo(1.1547, 4)
    expect(toRa(fromRa(1.6, 'rq', 'um', M), 'rq', 'um', M)).toBeCloseTo(1.6, 12)
  })
  it('Rz and Rt approximations round-trip', () => {
    expect(fromRa(1.6, 'rz', 'um', M)).toBeCloseTo(8, 10)
    expect(fromRa(1.6, 'rt', 'um', M)).toBeCloseTo(9.6, 10)
    expect(toRa(9.6, 'rt', 'um', M)).toBeCloseTo(1.6, 10)
  })
  it('grades', () => {
    expect(nGrade(1.6)).toEqual({ grade: 'N7', limit: 1.6 })
    expect(nGrade(1.0)?.grade).toBe('N7')
    expect(nGrade(0.8)?.grade).toBe('N6')
    expect(nGrade(80)).toBeNull()
    expect(gostClass(1.6)).toBe(6)
    expect(gostClass(0.63)).toBe(8)
    expect(gostClass(100)).toBeNull()
  })
})
