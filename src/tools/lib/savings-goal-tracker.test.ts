import { describe, expect, it } from 'vitest'
import { addMonths, daysBetween, monthsToGoal, projection, requiredMonthly } from './savings-goal-tracker'

describe('savings goals', () => {
  it('required monthly without interest', () => {
    expect(requiredMonthly(12000, 0, 12)).toBe(1000)
    expect(requiredMonthly(5000, 6000, 12)).toBe(0)
    expect(requiredMonthly(5000, 0, 0)).toBe(Infinity)
  })
  it('required monthly with interest matches the annuity formula', () => {
    // FV of 0 + PMT over 12 months at 6%/yr: PMT = 10000 * 0.005 / (1.005^12 - 1) ≈ 810.66
    expect(requiredMonthly(10000, 0, 12, 6)).toBeCloseTo(810.66, 2)
    const p = projection(0, requiredMonthly(10000, 0, 12, 6), 6, 12)
    expect(p[12]).toBeCloseTo(10000, 6)
  })
  it('months to goal', () => {
    expect(monthsToGoal(1000, 0, 100)).toBe(10)
    expect(monthsToGoal(10000, 0, 810.67, 6)).toBe(12)
    expect(monthsToGoal(1000, 0, 0)).toBe(Infinity)
  })
  it('dates', () => {
    expect(addMonths('2026-01-15', 3)).toBe('2026-04-15')
    expect(daysBetween('2026-01-01', '2026-01-31')).toBe(30)
  })
})
