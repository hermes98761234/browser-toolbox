import { describe, expect, it } from 'vitest'
import { cmToFtIn, fromCurrent, ftInToCm, midParental, pctAt } from './adult-height-estimator'

describe('adult-height-estimator', () => {
  it('mid-parental height', () => {
    expect(midParental(180, 165, 'boy')).toBe(179)
    expect(midParental(180, 165, 'girl')).toBe(166)
  })
  it('percent of adult height', () => {
    expect(pctAt(2, 'boy')).toBe(49.5)
    expect(pctAt(2.5, 'girl')).toBeCloseTo(54.9)
    expect(pctAt(30, 'girl')).toBe(100)
    expect(fromCurrent(86.6, 2, 'boy')).toBeCloseTo(174.95, 1)
  })
  it('converts feet and inches', () => {
    expect(ftInToCm(5, 10)).toBeCloseTo(177.8)
    expect(cmToFtIn(177.8)).toEqual([5, 10])
    expect(cmToFtIn(182.88)).toEqual([6, 0])
  })
})
