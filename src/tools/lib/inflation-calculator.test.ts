import { describe, expect, it } from 'vitest'
import { adjust, annualRate, compound, cpiMonth, cpiYear, cumulative, LAST_INDEX, lastLabel, MONTHLY } from './inflation-calculator'

describe('CPI data', () => {
  it('has the full monthly series', () => {
    expect(MONTHLY.length).toBe(1365)
    expect(LAST_INDEX).toBe(1364)
    expect(lastLabel()).toBe('Sep 2026')
    expect(MONTHLY[0]).toBe(9.8)
  })
  it('annual averages match the source CSV', () => {
    expect(cpiYear(1913)!.v).toBeCloseTo(9.8833, 4)
    expect(cpiYear(1980)!.v).toBeCloseTo(82.4083, 4)
    expect(cpiYear(2023)!.v).toBeCloseTo(304.7016, 4)
    const y25 = cpiYear(2025)!
    expect(y25.months).toBe(11)
    expect(y25.partial).toBe(true)
    expect(cpiYear(1900)).toBeNull()
  })
  it('interpolates the missing October 2025', () => {
    const o = cpiMonth(2025, 9)!
    expect(o.interpolated).toBe(true)
    expect(o.v).toBeCloseTo((324.8 + 324.122) / 2, 6)
    expect(cpiMonth(2026, 11)).toBeNull()
  })
  it('math', () => {
    expect(adjust(100, 172.2, 304.7016)).toBeCloseTo(176.946, 3)
    expect(cumulative(100, 150)).toBeCloseTo(0.5, 12)
    expect(annualRate(100, 121, 2)).toBeCloseTo(0.1, 12)
    expect(compound([0.1, 0.1])[2]).toBeCloseTo(1.21, 12)
  })
})
