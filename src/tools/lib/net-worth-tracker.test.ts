import { describe, expect, it } from 'vitest'
import { change, cmgr, monthsBack, nextMonth, totals } from './net-worth-tracker'

const accts = [
  { id: 'c', name: 'Checking', kind: 'asset' as const, cat: 'Cash' },
  { id: 'h', name: 'House', kind: 'asset' as const, cat: 'Real estate' },
  { id: 'm', name: 'Mortgage', kind: 'liability' as const, cat: 'Mortgage' },
]

describe('net-worth-tracker', () => {
  it('totals assets and liabilities', () => {
    const t = totals(accts, { month: '2026-01', values: { c: 5000, h: 300000, m: 220000 } })
    expect(t.assets).toBe(305000)
    expect(t.liabilities).toBe(220000)
    expect(t.net).toBe(85000)
    expect(t.byCat.Mortgage).toBe(220000)
    // negative liability input is treated as an amount owed
    expect(totals(accts, { month: 'x', values: { m: -1000 } }).net).toBe(-1000)
  })
  it('changes and months', () => {
    expect(change(110, 100)).toBeCloseTo(0.1)
    expect(change(-50, -100)).toBeCloseTo(0.5)
    expect(change(5, 0)).toBeNull()
    expect(nextMonth('2025-12')).toBe('2026-01')
    expect(nextMonth('2026-03')).toBe('2026-04')
    const ss = [{ month: '2025-01', values: {} }, { month: '2025-12', values: {} }, { month: '2026-01', values: {} }]
    expect(monthsBack(ss, '2026-01', 12)?.month).toBe('2025-01')
    expect(monthsBack(ss, '2026-01', 1)?.month).toBe('2025-12')
    expect(monthsBack(ss, '2026-01', 3)).toBeNull()
    expect(cmgr(100, 121, 2)).toBeCloseTo(0.1)
  })
})
