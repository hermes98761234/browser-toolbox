import { describe, expect, it } from 'vitest'
import { adherence, conflicts, hhmm, lanes, minutesByCat, parseHhmm, snap, union } from './time-blocking-planner'

const b = (id: string, col: 'plan' | 'actual', s: number, e: number, cat: string) => ({ id, col, start: s, end: e, title: id, cat })

describe('time-blocking-planner', () => {
  it('time helpers', () => {
    expect(snap(487)).toBe(480)
    expect(snap(488)).toBe(495)
    expect(hhmm(545)).toBe('09:05')
    expect(parseHhmm('9:05')).toBe(545)
    expect(parseHhmm('x')).toBeNaN()
  })
  it('union and categories', () => {
    expect(union([{ start: 0, end: 60 }, { start: 30, end: 90 }, { start: 120, end: 150 }])).toBe(120)
    expect(minutesByCat([b('a', 'plan', 0, 60, 'Deep'), b('b', 'plan', 30, 90, 'Deep'), b('c', 'plan', 90, 100, 'Admin')])).toEqual({ Deep: 90, Admin: 10 })
  })
  it('adherence', () => {
    const r = adherence([b('p', 'plan', 480, 600, 'Deep')], [b('a', 'actual', 480, 540, 'Deep'), b('c', 'actual', 540, 600, 'Admin'), b('d', 'actual', 700, 730, 'Admin')])
    expect(r).toEqual({ matched: 60, planned: 120, unplanned: 30, score: 0.5 })
  })
  it('conflicts and lanes', () => {
    const bl = [b('a', 'plan', 0, 60, 'x'), b('b', 'plan', 30, 90, 'x'), b('c', 'plan', 90, 120, 'x'), b('d', 'actual', 0, 60, 'x')]
    expect(conflicts(bl).map(([x, y]) => x.id + y.id)).toEqual(['ab'])
    const l = lanes(bl.filter((x) => x.col === 'plan'))
    expect(l.a).toEqual({ lane: 0, of: 2 })
    expect(l.b).toEqual({ lane: 1, of: 2 })
    expect(l.c).toEqual({ lane: 0, of: 1 })
  })
})
