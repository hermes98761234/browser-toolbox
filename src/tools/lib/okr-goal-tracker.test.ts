import { describe, expect, it } from 'vitest'
import { carryOver, elapsed, health, history, krProgress, nextQuarter, objProgress, quarterOf, quarterRange, type KeyResult, type Objective } from './okr-goal-tracker'

const kr = (p: Partial<KeyResult>): KeyResult => ({ id: 'k', title: 'k', start: 0, target: 100, current: 0, unit: '', weight: 1, log: [], ...p })

describe('OKR maths', () => {
  it('key result progress, including decreasing targets and clamping', () => {
    expect(krProgress(kr({ current: 25 }))).toBe(0.25)
    expect(krProgress(kr({ start: 500, target: 200, current: 350 }))).toBe(0.5)
    expect(krProgress(kr({ current: 150 }))).toBe(1)
    expect(krProgress(kr({ current: -5 }))).toBe(0)
    expect(krProgress(kr({ start: 1, target: 1, current: 1 }))).toBe(1)
  })
  it('weighted objective roll-up', () => {
    expect(objProgress({ krs: [kr({ current: 100, weight: 3 }), kr({ current: 0, weight: 1 })] })).toBe(0.75)
    expect(objProgress({ krs: [] })).toBe(0)
  })
  it('quarters', () => {
    expect(quarterOf('2026-10-17')).toBe('2026-Q4')
    expect(quarterRange('2026-Q4')).toEqual(['2026-10-01', '2026-12-31'])
    expect(quarterRange('2024-Q1')).toEqual(['2024-01-01', '2024-03-31'])
    expect(nextQuarter('2026-Q4')).toBe('2027-Q1')
    expect(elapsed('2026-Q4', '2026-12-31')).toBe(1)
    expect(elapsed('2026-Q4', '2026-09-01')).toBe(0)
    expect(elapsed('2026-Q4', '2026-11-15')).toBeCloseTo(46 / 92, 5)
  })
  it('health vs pace', () => {
    expect(health(0.5, 0.5)).toBe('on-track')
    expect(health(0.3, 0.5)).toBe('at-risk')
    expect(health(0.1, 0.5)).toBe('off-track')
    expect(health(1, 0.2)).toBe('done')
  })
  it('carry-over keeps unfinished work and restarts from current', () => {
    let n = 0
    const o: Objective = { id: 'o', title: 'O', owner: '', quarter: '2026-Q4', krs: [kr({ id: 'a', current: 100 }), kr({ id: 'b', current: 40 })] }
    const c = carryOver([o], '2026-Q4', () => `n${n++}`)
    expect(c).toHaveLength(1)
    expect(c[0].quarter).toBe('2027-Q1')
    expect(c[0].krs).toHaveLength(1)
    expect(c[0].krs[0].start).toBe(40)
  })
  it('history replays check-ins', () => {
    const o: Objective = { id: 'o', title: 'O', owner: '', quarter: '2026-Q4', krs: [kr({ log: [{ date: '2026-10-05', value: 20 }, { date: '2026-10-12', value: 60 }] }), kr({ log: [{ date: '2026-10-12', value: 20 }] })] }
    expect(history(o)).toEqual([['2026-10-05', 0.1], ['2026-10-12', 0.4]])
  })
})
