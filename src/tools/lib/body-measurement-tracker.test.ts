import { describe, expect, it } from 'vitest'
import { changes, ellipsePerimeter, halfWidth, navyBodyFat, waistHip, whrRisk, whtrBand } from './body-measurement-tracker'

const e = (date: string, waist: number, weight: number) => ({ id: date, date, weight, neck: 38, chest: 100, waist, hips: 100, arm: 32, thigh: 56, calf: 37, note: '' })

describe('body-measurement-tracker', () => {
  it('ellipse maths', () => {
    expect(ellipsePerimeter(1, 1)).toBeCloseTo(2 * Math.PI, 10)
    expect(ellipsePerimeter(2, 1)).toBeCloseTo(9.68845, 4)
    expect(halfWidth(2 * Math.PI)).toBeCloseTo(1, 10)
    expect(ellipsePerimeter(halfWidth(90, 0.7), 0.7 * halfWidth(90, 0.7))).toBeCloseTo(90, 8)
  })
  it('ratios and body fat', () => {
    expect(waistHip({ waist: 85, hips: 100 })).toBeCloseTo(0.85)
    expect(whrRisk(0.92, 'male')).toBe('high')
    expect(whrRisk(0.88, 'male')).toBe('low')
    expect(whrRisk(0.86, 'female')).toBe('high')
    expect(whtrBand(0.45)).toBe('Healthy')
    expect(whtrBand(0.55)).toBe('Increased')
    expect(navyBodyFat('male', 180, 38, 85, 0)).toBeCloseTo(16.1, 1)
    expect(navyBodyFat('female', 165, 33, 75, 100)).toBeCloseTo(29.4, 1)
  })
  it('changes between first and last entry', () => {
    const c = changes([e('2026-03-01', 88, 82), e('2026-01-01', 92, 85)])
    expect(c.waist).toBe(-4)
    expect(c.weight).toBe(-3)
    expect(changes([e('2026-01-01', 90, 80)]).waist).toBe(0)
  })
})
