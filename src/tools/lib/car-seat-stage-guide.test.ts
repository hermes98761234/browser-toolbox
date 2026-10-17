import { describe, expect, it } from 'vitest'
import { advise, DEFAULT_LIMITS as L } from './car-seat-stage-guide'

describe('car-seat-stage-guide', () => {
  it('keeps toddlers rear-facing within limits', () => {
    expect(advise({ ageMonths: 30, weightLb: 30, heightIn: 36 }, L, false).stage).toBe('rear')
  })
  it('moves to harness when rear limits are exceeded', () => {
    const a = advise({ ageMonths: 20, weightLb: 42, heightIn: 35 }, L, false)
    expect(a.stage).toBe('forward')
    expect(a.warnings.length).toBe(1)
  })
  it('booster after harness, belt only when it fits', () => {
    expect(advise({ ageMonths: 84, weightLb: 70, heightIn: 50 }, L, false).stage).toBe('booster')
    expect(advise({ ageMonths: 120, weightLb: 80, heightIn: 58 }, L, false).stage).toBe('booster')
    expect(advise({ ageMonths: 120, weightLb: 80, heightIn: 58 }, L, true).stage).toBe('belt')
    expect(advise({ ageMonths: 84, weightLb: 80, heightIn: 58 }, L, true).stage).toBe('booster') // under 8
  })
  it('uses the seat-specific limits', () => {
    expect(advise({ ageMonths: 40, weightLb: 45, heightIn: 40 }, { ...L, rearMaxLb: 50, rearMaxIn: 43 }, false).stage).toBe('rear')
  })
})
