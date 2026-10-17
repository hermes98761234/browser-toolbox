import { describe, expect, it } from 'vitest'
import { changeSince, range, status, trendPerWeek } from './pet-weight-tracker'

describe('pet-weight-tracker', () => {
  const w = [{ date: '2024-01-01', kg: 30 }, { date: '2024-01-08', kg: 30.5 }, { date: '2024-01-15', kg: 31 }, { date: '2024-01-22', kg: 31.5 }]
  it('computes the weekly trend', () => {
    expect(trendPerWeek(w)).toBeCloseTo(0.5, 9)
    expect(trendPerWeek(w.slice(0, 1))).toBe(0)
  })
  it('computes change since', () => {
    const c = changeSince(w, 14)!
    expect(c.from.date).toBe('2024-01-08')
    expect(c.kg).toBeCloseTo(1)
    expect(c.pct).toBeCloseTo(1 / 30.5)
  })
  it('classifies against breed range', () => {
    const r = range('Dog', 'Beagle')
    expect(r).toEqual([9, 14])
    expect(status(8, r)).toBe('under')
    expect(status(8.8, r)).toBe('in')
    expect(status(15, r)).toBe('over')
    expect(status(10, null)).toBe('unknown')
  })
})
