import { describe, expect, it } from 'vitest'
import { buildCal, cpm, earliestFromDeps, formatDeps, parseDeps, WorkCal, type Task } from './construction-gantt-planner'

const T = (id: string, dur: number, deps: Task['deps'] = []): Task => ({ id, name: id, dur, deps, snet: null, phase: '', progress: 0 })
const fs = (id: string, lag = 0) => ({ id, type: 'FS' as const, lag })

// Textbook activity-on-node network: critical path A–B–D–F = 14 days.
const NET = [T('A', 3), T('B', 4, [fs('A')]), T('C', 2, [fs('A')]), T('D', 5, [fs('B')]), T('E', 3, [fs('C')]), T('F', 2, [fs('D'), fs('E')])]

describe('CPM', () => {
  it('forward/backward pass, total and free float', () => {
    const r = cpm(NET)
    expect(r.finish).toBe(14)
    const g = (id: string) => r.sched.get(id)!
    expect([g('A').es, g('A').ef, g('A').ls, g('A').lf]).toEqual([0, 3, 0, 3])
    expect([g('C').es, g('C').ef, g('C').ls, g('C').lf]).toEqual([3, 5, 7, 9])
    expect([g('E').es, g('E').ef, g('E').ls, g('E').lf]).toEqual([5, 8, 9, 12])
    expect(['A', 'B', 'C', 'D', 'E', 'F'].map((id) => g(id).tf)).toEqual([0, 0, 4, 0, 4, 0])
    expect(['A', 'B', 'C', 'D', 'E', 'F'].map((id) => g(id).ff)).toEqual([0, 0, 0, 0, 4, 0])
    expect(['A', 'B', 'C', 'D', 'E', 'F'].filter((id) => g(id).critical)).toEqual(['A', 'B', 'D', 'F'])
  })
  it('SS, FF and SF links with lags', () => {
    const r = cpm([
      ...NET,
      T('G', 4, [{ id: 'B', type: 'SS', lag: 2 }]),
      T('H', 3, [{ id: 'D', type: 'FF', lag: 1 }]),
      T('I', 2, [{ id: 'A', type: 'SF', lag: 5 }]),
    ])
    expect([r.sched.get('G')!.es, r.sched.get('G')!.ef]).toEqual([5, 9])
    expect([r.sched.get('H')!.es, r.sched.get('H')!.ef, r.sched.get('H')!.tf]).toEqual([10, 13, 1])
    expect(r.sched.get('I')!.es).toBe(3)
    // B is also constrained by G (SS+2): LS_B ≤ LS_G − 2 = 10 − 2 = 8, still B stays critical via D.
    expect(r.sched.get('B')!.tf).toBe(0)
  })
  it('SNET pushes successors and detects loops', () => {
    const moved = NET.map((t) => (t.id === 'C' ? { ...t, snet: 10 } : t))
    const r = cpm(moved)
    expect(r.sched.get('C')!.es).toBe(10)
    expect(r.sched.get('E')!.es).toBe(12)
    expect(r.finish).toBe(17)
    expect(earliestFromDeps(moved, 'C')).toBe(3)
    expect(cpm([T('X', 1, [fs('Y')]), T('Y', 1, [fs('X')])]).error).toMatch(/loop/)
  })
  it('predecessor text round-trips', () => {
    const { deps, bad } = parseDeps('1, 2SS+2, 4ff-1, 99, x', NET, 'F')
    expect(bad).toEqual(['99', 'x'])
    expect(deps).toEqual([fs('A'), { id: 'B', type: 'SS', lag: 2 }, { id: 'D', type: 'FF', lag: -1 }])
    expect(formatDeps(deps, NET)).toBe('1, 2SS+2, 4FF-1')
  })
})

describe('working calendar', () => {
  it('skips weekends and holidays', () => {
    const wc = new WorkCal('2026-12-23', buildCal([0, 6], 'us', '2026-12-24 Site closed', 2026))
    expect(wc.date(0)).toBe('2026-12-23')
    expect(wc.date(1)).toBe('2026-12-28') // 24 custom, 25 Christmas, 26–27 weekend
    expect(wc.indexOf('2026-12-26')).toBe(1)
    expect(wc.finishDate(0, 2)).toBe('2026-12-28')
    expect(wc.finishDate(3, 3)).toBe(wc.date(3))
  })
})
