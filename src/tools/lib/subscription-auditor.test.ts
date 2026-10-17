import { describe, expect, it } from 'vitest'
import { addMonths, daysBetween, monthly, nextRenewal, perYear, renewalsBetween, yearly } from './subscription-auditor'

describe('normalisation', () => {
  it('converts cycles to yearly and monthly', () => {
    expect(yearly(9.99, 'monthly')).toBeCloseTo(119.88, 9)
    expect(yearly(5, 'weekly')).toBeCloseTo(260.89, 2)
    expect(monthly(120, 'yearly')).toBe(10)
    expect(yearly(30, 'quarterly')).toBe(120)
    expect(perYear('days', 28)).toBeCloseTo(13.045, 3)
  })
})

describe('renewal dates', () => {
  it('clamps month ends and keeps the anchor day', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29')
    expect(addMonths('2026-01-31', 2)).toBe('2026-03-31')
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15')
  })
  it('rolls forward to the next renewal', () => {
    expect(nextRenewal('2026-01-31', 'monthly', '2026-03-05')).toBe('2026-03-31')
    expect(nextRenewal('2026-10-20', 'monthly', '2026-10-17')).toBe('2026-10-20')
    expect(nextRenewal('2025-02-10', 'yearly', '2026-10-17')).toBe('2027-02-10')
    expect(nextRenewal('2026-10-01', 'weekly', '2026-10-17')).toBe('2026-10-22')
    expect(nextRenewal('2026-10-01', 'days', '2026-10-17', 10)).toBe('2026-10-21')
    expect(daysBetween('2026-10-17', '2026-10-22')).toBe(5)
  })
  it('lists renewals in a window', () => {
    expect(renewalsBetween('2026-01-31', 'monthly', '2026-02-01', '2026-05-31')).toEqual(['2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31'])
  })
})
