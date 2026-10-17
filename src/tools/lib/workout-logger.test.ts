import { describe, expect, it } from 'vitest'
import { brzycki, detectPRs, e1rm, exerciseTrend, sessionVolume, weekStart, weeklyVolume, type WSession } from './workout-logger'

const S = (id: string, date: string, sets: [number, number][], ex = 'Squat'): WSession => ({ id, date, name: '', entries: [{ exercise: ex, sets: sets.map(([reps, weight]) => ({ reps, weight })) }] })

describe('workout-logger', () => {
  it('estimates 1RM', () => {
    expect(e1rm(100, 1)).toBe(100)
    expect(e1rm(100, 5)).toBeCloseTo(116.667, 2)
    expect(brzycki(100, 5)).toBeCloseTo(112.5, 3)
    expect(e1rm(0, 5)).toBe(0)
  })
  it('sums volume', () => {
    expect(sessionVolume(S('a', '2024-01-01', [[5, 100], [5, 100], [3, 110]]))).toBe(1330)
  })
  it('detects PRs after the baseline', () => {
    const prs = detectPRs([S('b', '2024-01-08', [[5, 105]]), S('a', '2024-01-01', [[5, 100]]), S('c', '2024-01-15', [[8, 100]])])
    expect(prs.filter((p) => p.sessionId === 'b').map((p) => p.kind).sort()).toEqual(['e1rm', 'volume', 'weight'])
    expect(prs.filter((p) => p.sessionId === 'c').map((p) => p.kind).sort()).toEqual(['e1rm', 'volume'])
  })
  it('groups by ISO week', () => {
    expect(weekStart('2024-01-07')).toBe('2024-01-01')
    expect(weekStart('2024-01-08')).toBe('2024-01-08')
    const w = weeklyVolume([S('a', '2024-01-02', [[1, 100]]), S('b', '2024-01-05', [[1, 50]]), S('c', '2024-01-09', [[2, 10]])])
    expect(w).toEqual([{ week: '2024-01-01', volume: 150, sessions: 2 }, { week: '2024-01-08', volume: 20, sessions: 1 }])
  })
  it('builds exercise trend', () => {
    const t = exerciseTrend([S('a', '2024-01-01', [[1, 100]]), S('b', '2024-01-02', [[1, 50]], 'Bench')], 'squat')
    expect(t).toHaveLength(1)
    expect(t[0].top).toBe(100)
  })
})
