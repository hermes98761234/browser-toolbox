import { describe, expect, it } from 'vitest'
import { buildPlan, clock, planLength, segmentAt, summary, type Workout } from './interval-timer'

const tabata: Workout = { id: 't', name: 'Tabata', prep: 10, work: 20, rest: 10, rounds: 8, sets: 1, setRest: 60, cool: 0, moves: '' }

describe('interval-timer', () => {
  it('builds a classic Tabata (4 minutes + prep)', () => {
    const p = buildPlan(tabata)
    expect(p.filter((s) => s.kind === 'work')).toHaveLength(8)
    expect(p.filter((s) => s.kind === 'rest')).toHaveLength(7)
    expect(planLength(p)).toBe(10 + 8 * 20 + 7 * 10)
    expect(summary(p).work).toBe(160)
  })
  it('adds set breaks between sets only and cycles moves', () => {
    const p = buildPlan({ ...tabata, sets: 3, cool: 60, moves: 'Squats, Push-ups, Burpees' })
    expect(p.filter((s) => s.kind === 'setRest')).toHaveLength(2)
    expect(p[p.length - 1].kind).toBe('cool')
    expect(p.filter((s) => s.kind === 'work').map((s) => s.label).slice(0, 4)).toEqual(['Squats', 'Push-ups', 'Burpees', 'Squats'])
    expect(planLength(p)).toBe(10 + 3 * 230 + 2 * 60 + 60)
  })
  it('finds the segment at a time', () => {
    const p = buildPlan(tabata)
    expect(segmentAt(p, 0)).toBe(0)
    expect(segmentAt(p, 9.99)).toBe(0)
    expect(segmentAt(p, 10)).toBe(1)
    expect(p[segmentAt(p, 31)].kind).toBe('rest')
    expect(segmentAt(p, 1e6)).toBe(p.length)
  })
  it('skips zero-length segments and formats clocks', () => {
    expect(buildPlan({ ...tabata, prep: 0, rest: 0 }).every((s) => s.kind === 'work')).toBe(true)
    expect(clock(65)).toBe('1:05')
    expect(clock(3661)).toBe('1:01:01')
    expect(clock(0.2)).toBe('0:01')
  })
})
