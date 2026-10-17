import { describe, expect, it } from 'vitest'
import { addDay, completionRate, currentStreak, longestStreak, weekday } from './habit-tracker'

const S = (...k: string[]) => new Set(k)

describe('habit-tracker', () => {
  it('handles dates', () => {
    expect(addDay('2024-02-28', 2)).toBe('2024-03-01')
    expect(weekday('2024-01-01')).toBe(1)
  })
  it('computes current streak with grace for today', () => {
    const d = S('2024-01-08', '2024-01-09', '2024-01-10')
    expect(currentStreak(d, [], '2024-01-10')).toBe(3)
    expect(currentStreak(d, [], '2024-01-11')).toBe(3)
    expect(currentStreak(d, [], '2024-01-12')).toBe(0)
  })
  it('skips non-scheduled days', () => {
    // Mon/Wed/Fri habit: 2024-01-08 Mon, 01-10 Wed, 01-12 Fri
    const d = S('2024-01-08', '2024-01-10', '2024-01-12')
    expect(currentStreak(d, [1, 3, 5], '2024-01-14')).toBe(3)
    expect(longestStreak(d, [1, 3, 5], '2024-01-14')).toBe(3)
    expect(longestStreak(d, [], '2024-01-14')).toBe(1)
  })
  it('computes completion rate', () => {
    const d = S('2024-01-08', '2024-01-09')
    expect(completionRate(d, [], '2024-01-10', 4)).toBeCloseTo(2 / 3)
  })
})
