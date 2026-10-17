import { describe, expect, it } from 'vitest'
import { bracketTax, checkTable, dueDates, estimate, seTax, YEARS, type Inputs } from './quarterly-tax-estimator'

const Y = YEARS['2025']
const base: Inputs = { status: 'single', profit: 80000, wages: 0, otherIncome: 0, adjustments: 0, itemized: 0, credits: 0, withholding: 0, priorTax: 0, priorAgi: 0, qbi: true }

describe('quarterly-tax-estimator', () => {
  it('bracket tax matches hand calculation', () => {
    expect(bracketTax(46878.54, Y.brackets.single, Y.rates).tax).toBeCloseTo(5386.92, 2)
    expect(bracketTax(11925, Y.brackets.single, Y.rates)).toEqual({ tax: 1192.5, marginal: 0.1 })
    expect(bracketTax(0, Y.brackets.single, Y.rates).tax).toBe(0)
    expect(bracketTax(1e6, Y.brackets.mfj, Y.rates).marginal).toBe(0.37)
  })
  it('SE tax with wage base and W-2 interaction', () => {
    expect(seTax(80000, 0, Y).total).toBeCloseTo(11303.64, 2)
    expect(seTax(300, 0, Y).total).toBe(0) // under $400 of net earnings
    const s = seTax(100000, 170000, Y) // only 6,100 of SS base left
    expect(s.ss).toBeCloseTo(6100 * 0.124, 6)
  })
  it('full estimate for a single freelancer', () => {
    const r = estimate(base, Y)
    expect(r.agi).toBeCloseTo(74348.18, 2)
    expect(r.qbiDed).toBeCloseTo(11719.64, 2)
    expect(r.taxable).toBeCloseTo(46878.54, 2)
    expect(r.total).toBeCloseTo(16690.57, 1)
    expect(r.perQuarter).toBeCloseTo((0.9 * r.total) / 4, 6)
  })
  it('safe harbor uses 100% / 110% of prior-year tax when lower', () => {
    expect(estimate({ ...base, priorTax: 12000, priorAgi: 90000 }, Y).required).toBe(12000)
    expect(estimate({ ...base, priorTax: 12000, priorAgi: 160000 }, Y).required).toBeCloseTo(13200, 6)
    expect(estimate({ ...base, profit: 3000 }, Y).noPaymentsNeeded).toBe(true)
  })
  it('due dates shift off weekends', () => {
    expect(dueDates(2026)).toEqual(['2026-04-15', '2026-06-15', '2026-09-15', '2027-01-15'])
    expect(dueDates(2028)[0]).toBe('2028-04-17') // Apr 15 2028 is a Saturday
  })
  it('validates edited tables', () => {
    expect(checkTable(YEARS['2026'])).toBe('')
    expect(checkTable({ ...Y, rates: [0.1, 2] })).toMatch(/fractions/)
  })
})
