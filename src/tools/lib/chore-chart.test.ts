import { describe, expect, it } from 'vitest'
import { addDays, assignee, balance, earned, mondayOf, weekday, type Chore } from './chore-chart'

const c = (p: Partial<Chore>): Chore => ({ id: 'c', name: 'Dishes', emoji: '', points: 2, days: [0, 1, 2, 3, 4, 5, 6], who: ['a', 'b', 'c'], rotate: 'day', ...p })

describe('chore chart', () => {
  it('weekday and monday', () => {
    expect(weekday('2026-10-19')).toBe(0) // Monday
    expect(weekday('2026-10-18')).toBe(6) // Sunday
    expect(mondayOf('2026-10-18')).toBe('2026-10-12')
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
  })
  it('daily rotation cycles through members', () => {
    const ch = c({})
    const seq = [0, 1, 2, 3].map((i) => assignee(ch, addDays('2026-10-19', i)))
    expect(new Set(seq.slice(0, 3)).size).toBe(3)
    expect(seq[3]).toBe(seq[0])
  })
  it('weekly rotation keeps one person all week', () => {
    const ch = c({ rotate: 'week', who: ['a', 'b'] })
    const w1 = [0, 1, 2, 3, 4, 5, 6].map((i) => assignee(ch, addDays('2026-10-19', i)))
    expect(new Set(w1).size).toBe(1)
    expect(assignee(ch, '2026-10-26')).not.toBe(w1[0])
  })
  it('not due → null; rotation over due days only', () => {
    const ch = c({ days: [0, 3], who: ['a', 'b'] })
    expect(assignee(ch, '2026-10-20')).toBeNull()
    expect(assignee(ch, '2026-10-19')).not.toBe(assignee(ch, '2026-10-22'))
  })
  it('points and balance', () => {
    const chores = [c({ id: 'x', points: 3 }), c({ id: 'y', points: 5 })]
    const done = { 'x|2026-10-19': 'a', 'y|2026-10-19': 'a', 'x|2026-10-20': 'b' }
    expect(earned(chores, done)).toEqual({ a: 8, b: 3 })
    expect(earned(chores, done, '2026-10-20')).toEqual({ b: 3 })
    expect(balance('a', chores, done, [{ at: '', member: 'a', reward: 'r', cost: 6 }])).toBe(2)
  })
})
