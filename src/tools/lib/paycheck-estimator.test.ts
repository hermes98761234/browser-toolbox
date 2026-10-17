import { describe, expect, it } from 'vitest'
import { bracketTax, checkTable, compute, hourlyAnnual, TABLE_2026, type Inputs } from './paycheck-estimator'

const base: Inputs = { status: 'single', gross: 75000, periods: 26, k401: 0, roth: 0, hsa: 0, sec125: 0, postTax: 0, children: 0, otherDeps: 0, extraDeduction: 0, stateRate: 0, stateDeduction: 0, localRate: 0 }

describe('paycheck-estimator', () => {
  it('applies brackets progressively', () => {
    const b = TABLE_2026.brackets.single
    expect(bracketTax(12400, b).tax).toBeCloseTo(1240)
    expect(bracketTax(58900, b).tax).toBeCloseTo(1240 + 38000 * 0.12 + 8500 * 0.22)
    expect(bracketTax(58900, b).marginal).toBe(0.22)
    expect(bracketTax(0, b).tax).toBe(0)
  })
  it('computes a single $75k salary', () => {
    const r = compute(base, TABLE_2026)
    expect(r.federalTaxable).toBe(75000 - 16100)
    expect(r.federal).toBeCloseTo(1240 + 38000 * 0.12 + 8500 * 0.22, 2)
    expect(r.ss).toBeCloseTo(4650)
    expect(r.medicare).toBeCloseTo(1087.5)
    expect(r.net).toBeCloseTo(75000 - r.federal - 4650 - 1087.5, 2)
    expect(r.schedule).toHaveLength(26)
    expect(r.schedule.reduce((a, p) => a + p.net, 0)).toBeCloseTo(r.net, 2)
  })
  it('pre-tax deductions: 401k avoids income tax only, HSA/125 avoid FICA too', () => {
    const r = compute({ ...base, k401: 10, hsa: 2000, sec125: 1200 }, TABLE_2026)
    expect(r.federalTaxable).toBe(75000 - 3200 - 7500 - 16100)
    expect(r.ss).toBeCloseTo((75000 - 3200) * 0.062)
  })
  it('caps Social Security and adds additional Medicare', () => {
    const r = compute({ ...base, gross: 300000 }, TABLE_2026)
    expect(r.ss).toBeCloseTo(184500 * 0.062)
    expect(r.addlMedicare).toBeCloseTo(100000 * 0.009)
    const last = r.schedule[25], first = r.schedule[0]
    expect(last.ss).toBe(0)
    expect(first.ss).toBeCloseTo((300000 / 26) * 0.062)
  })
  it('child tax credit and state flat rate', () => {
    const r = compute({ ...base, status: 'mfj', gross: 90000, children: 2, stateRate: 4.95, stateDeduction: 2850 * 2 }, TABLE_2026)
    const tax = bracketTax(90000 - 32200, TABLE_2026.brackets.mfj).tax
    expect(r.federal).toBeCloseTo(Math.max(0, tax - 4400), 2)
    expect(r.state).toBeCloseTo((90000 - 5700) * 0.0495, 2)
  })
  it('validates tables and hourly pay', () => {
    expect(checkTable(TABLE_2026)).toBeNull()
    expect(checkTable({ ...TABLE_2026, brackets: { ...TABLE_2026.brackets, single: [[0, 0.1], [0, 0.2]] } })).toMatch(/increase/)
    expect(hourlyAnnual(25, 40, 5)).toBe((1000 + 187.5) * 52)
  })
})
