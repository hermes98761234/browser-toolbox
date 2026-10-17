import { describe, expect, it } from 'vitest'
import { effectiveAnnual, futureValue, simulate, yearsToTarget } from './compound-interest-calculator'

const base = { principal: 10000, rate: 5, years: 10, compound: 12, contribution: 100, contribFreq: 12, timing: 'end' as const, growth: 0 }

describe('compound interest', () => {
  it('reference values', () => {
    expect(futureValue(10000, 5, 10, 12, 0, 12)).toBeCloseTo(16470.09, 2)
    expect(futureValue(0, 5, 10, 12, 100, 12)).toBeCloseTo(15528.23, 2)
    expect(effectiveAnnual(5, 12)).toBeCloseTo(0.0511619, 6)
    expect(effectiveAnnual(5, 0)).toBeCloseTo(Math.exp(0.05) - 1, 9)
  })
  it('simulation matches the closed form', () => {
    const rows = simulate(base)
    expect(rows[9].balance).toBeCloseTo(16470.09 + 15528.23, 1)
    expect(rows[9].contributed).toBe(22000)
    expect(simulate({ ...base, timing: 'begin' })[9].balance).toBeCloseTo(futureValue(10000, 5, 10, 12, 100, 12, true), 6)
    expect(simulate({ ...base, compound: 1, contribFreq: 4 })[9].balance).toBeCloseTo(futureValue(10000, 5, 10, 1, 100, 4), 6)
  })
  it('zero rate and target', () => {
    expect(simulate({ ...base, rate: 0 })[9].balance).toBe(22000)
    expect(yearsToTarget({ ...base, rate: 0 }, 11200)).toBeCloseTo(1, 5)
  })
})
