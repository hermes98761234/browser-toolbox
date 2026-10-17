import { describe, expect, it } from 'vitest'
import { ageWeeks, recommend, sessionMinutes, skillStat, type Session } from './puppy-training-planner'

let n = 0
const s = (date: string, skill: string, reps: number, hits: number, distraction: Session['distraction'] = 'low'): Session => ({ id: `s${n++}`, date, skill, reps, hits, minutes: 5, distraction, note: '' })

describe('puppy training', () => {
  it('stats use the last three sessions for the recent rate', () => {
    const st = skillStat([s('2026-10-01', 'sit', 10, 2), s('2026-10-02', 'sit', 10, 7), s('2026-10-03', 'sit', 10, 8), s('2026-10-04', 'sit', 10, 9)], 'sit')
    expect(st.sessions).toBe(4)
    expect(st.overall).toBeCloseTo(26 / 40)
    expect(st.recent).toBeCloseTo(24 / 30)
    expect(st.proofed).toBe('low')
    expect(st.status).toBe('progressing')
  })
  it('reliable once proofed at high distraction', () => {
    const st = skillStat([s('2026-10-01', 'sit', 10, 9, 'medium'), s('2026-10-02', 'sit', 10, 9, 'high')], 'sit')
    expect(st.proofed).toBe('high')
    expect(st.status).toBe('reliable')
  })
  it('recommends easier, harder and new skills', () => {
    const log = [s('2026-10-10', 'marker', 10, 10), s('2026-10-10', 'down', 10, 3), s('2026-10-11', 'come', 10, 9)]
    const r = recommend(log, '2026-10-12')
    expect(r[0]).toMatchObject({ skill: 'down', kind: 'easier' })
    expect(r.find((x) => x.skill === 'come')?.kind).toBe('harder')
    // marker at 100% unlocks sit, touch and leave it
    expect(r.filter((x) => x.kind === 'start').map((x) => x.skill)).toEqual(expect.arrayContaining(['sit', 'touch', 'leave']))
    // stay needs sit and down: not yet
    expect(r.find((x) => x.skill === 'stay')).toBeUndefined()
  })
  it('age and session length', () => {
    expect(ageWeeks('2026-08-01', '2026-10-17')).toBe(11)
    expect(sessionMinutes(11)).toBe(7)
    expect(sessionMinutes(2)).toBe(3)
    expect(sessionMinutes(52)).toBe(15)
  })
})
