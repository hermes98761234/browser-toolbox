import { describe, expect, it } from 'vitest'
import { fmtDur, fmtMin, move, renumber, sanitize, summarize, wrap, type Shot } from './shot-list-planner'

const base: Shot = { id: 'a', scene: '1', shot: '1', size: 'MS', angle: 'Eye level', move: 'Static', lens: 35, desc: '', audio: 'Sync', location: '', gear: ['Tripod'], setup: 10, dur: 15, takes: 4, status: 'planned' }

describe('shot list', () => {
  it('summarizes time on set', () => {
    const s = summarize([base, { ...base, id: 'b', scene: '2', status: 'shot', gear: ['Tripod', 'Gimbal'] }, { ...base, id: 'c', status: 'cut' }], 45)
    expect(s.active).toBe(2)
    expect(s.done).toBe(1)
    expect(s.screenSec).toBe(30)
    expect(s.shootMin).toBeCloseTo(8, 10) // 2 shots × 4 takes × 60 s
    expect(s.totalMin).toBeCloseTo(28, 10)
    expect(s.gear[0]).toEqual({ name: 'Tripod', shots: 2 })
  })
  it('moves and renumbers', () => {
    expect(move([1, 2, 3, 4], 0, 2)).toEqual([2, 3, 1, 4])
    expect(move([1, 2, 3, 4], 3, 0)).toEqual([4, 1, 2, 3])
    const r = renumber([base, { ...base, scene: '2' }, { ...base, shot: '9' }])
    expect(r.map((x) => x.shot)).toEqual(['1', '1', '2'])
  })
  it('sanitizes and wraps', () => {
    expect(sanitize('“Hi” – ok… ✓')).toBe('"Hi" - ok... ?')
    expect(wrap('aa bb cc', 5, (t) => t.length)).toEqual(['aa bb', 'cc'])
    expect(wrap('abcdefgh', 3, (t) => t.length)).toEqual(['abc', 'def', 'gh'])
    expect(fmtDur(75)).toBe('1m 15s')
    expect(fmtMin(130)).toBe('2h 10m')
  })
})
