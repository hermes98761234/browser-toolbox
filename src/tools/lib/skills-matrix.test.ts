import { describe, expect, it } from 'vitest'
import { exportCsv, importCsv, key, mentoring, personStats, skillStats, type Matrix } from './skills-matrix'

let n = 0
const id = () => `i${n++}`
const M: Matrix = {
  skills: [{ id: 'ts', name: 'TypeScript', group: 'Dev', target: 3, need: 2 }, { id: 'k8', name: 'Kubernetes', group: 'Ops', target: 3, need: 2 }, { id: 'ux', name: 'UX', group: 'Design', target: 2, need: 1 }],
  people: [{ id: 'a', name: 'Ann', role: 'Dev' }, { id: 'b', name: 'Bo', role: 'Dev' }, { id: 'c', name: 'Cy', role: 'Ops' }],
  r: { [key('a', 'ts')]: 4, [key('b', 'ts')]: 3, [key('c', 'k8')]: 4, [key('a', 'ux')]: 1, [key('b', 'k8')]: 1 },
  interest: { [key('b', 'k8')]: true, [key('a', 'ux')]: true },
}

describe('skills matrix', () => {
  it('computes coverage, gaps and single points of failure', () => {
    const st = skillStats(M)
    expect(st.map((s) => [s.covered, s.gap, s.risk])).toEqual([[2, 0, 'ok'], [1, 1, 'gap'], [0, 1, 'gap']])
    expect(st[1].spof).toBe(true)
    expect(st[1].learners).toBe(1)
    expect(st[0].avg).toBeCloseTo(7 / 3)
  })
  it('finds key people and mentors', () => {
    const ps = personStats(M)
    expect(ps[2].unique).toEqual(['Kubernetes'])
    expect(ps[0].total).toBe(5)
    expect(mentoring(M)).toEqual([{ skill: 'Kubernetes', mentor: 'Cy', learner: 'Bo' }])
  })
  it('round-trips CSV', () => {
    const m = importCsv('Name,Role,Dev / TypeScript,Ops / Kubernetes\nAnn,Dev,4,Aware*\nBo,Dev,expert,', id)!
    expect(m.skills.map((s) => s.group)).toEqual(['Dev', 'Ops'])
    expect(m.people.map((p) => p.role)).toEqual(['Dev', 'Dev'])
    expect(exportCsv(m)).toEqual([['Name', 'Role', 'Dev / TypeScript', 'Ops / Kubernetes'], ['Ann', 'Dev', '4', '1*'], ['Bo', 'Dev', '4', '0']])
    expect(importCsv('x', id)).toBeNull()
  })
})
