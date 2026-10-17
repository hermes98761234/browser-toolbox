import { describe, expect, it } from 'vitest'
import { bestStreak, currentStreak, monthSummary, rollingAvg, stepsToKcal, stepsToKm, strideCm } from './step-goal-tracker'

const log = { '2024-02-26': 11000, '2024-02-27': 12000, '2024-02-28': 9000, '2024-02-29': 10500, '2024-03-01': 10000, '2024-03-02': 4000 }

describe('step-goal-tracker', () => {
  it('current streak with grace for today', () => {
    expect(currentStreak(log, 10000, '2024-03-01')).toBe(2)
    expect(currentStreak(log, 10000, '2024-03-02')).toBe(2)
    expect(currentStreak(log, 10000, '2024-03-03')).toBe(0)
    expect(currentStreak(log, 8000, '2024-03-01')).toBe(5)
  })
  it('best streak across leap day', () => {
    expect(bestStreak(log, 10000)).toBe(2)
    expect(bestStreak(log, 3000)).toBe(6)
    expect(bestStreak({}, 1)).toBe(0)
  })
  it('month summary', () => {
    const m = monthSummary(log, 10000, '2024-02')
    expect(m.days).toBe(29)
    expect(m.logged).toBe(4)
    expect(m.total).toBe(42500)
    expect(m.goalDays).toBe(3)
    expect(m.best).toEqual({ date: '2024-02-27', steps: 12000 })
  })
  it('rolling average', () => {
    expect(rollingAvg(log, '2024-03-02', 2)).toBe(7000)
    expect(rollingAvg(log, '2024-03-04', 3, true)).toBeCloseTo(4000 / 3)
  })
  it('distance and energy', () => {
    expect(strideCm(170)).toBeCloseTo(70.55)
    expect(stepsToKm(10000, 75)).toBeCloseTo(7.5)
    expect(stepsToKcal(10000, 70, 80.4672)).toBeCloseTo(0.57 * 70 * 2.20462 * 5, 0)
  })
})
