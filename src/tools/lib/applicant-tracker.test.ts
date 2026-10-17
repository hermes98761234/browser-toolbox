import { describe, expect, it } from 'vitest'
import { avgStageDays, daysInStage, funnel, matches, moveTo, timeToHire, type Candidate } from './applicant-tracker'

const c = (id: string, h: [Candidate['stage'], string][]): Candidate => ({
  id, name: id, role: 'Dev', email: '', phone: '', source: 'LinkedIn', rating: 3, tags: ['react'], notes: '', files: [],
  stage: h[h.length - 1][0], history: h.map(([stage, at]) => ({ stage, at })),
})

const A = c('a', [['Applied', '2026-01-01'], ['Screen', '2026-01-05'], ['Interview', '2026-01-10'], ['Offer', '2026-01-20'], ['Hired', '2026-01-25']])
const B = c('b', [['Applied', '2026-01-02'], ['Screen', '2026-01-04'], ['Rejected', '2026-01-08']])
const C = c('c', [['Applied', '2026-01-03']])

describe('applicant-tracker', () => {
  it('moves with history and ignores no-op moves', () => {
    const m = moveTo(C, 'Screen', '2026-01-09')
    expect(m.history).toHaveLength(2)
    expect(moveTo(m, 'Screen', '2026-01-10')).toBe(m)
  })
  it('computes days in stage', () => {
    expect(daysInStage(C, '2026-01-13')).toBe(10)
  })
  it('builds a funnel from the highest stage reached', () => {
    const f = funnel([A, B, C])
    expect(f.map((x) => x.count)).toEqual([3, 2, 1, 1, 1])
    expect(f[1].rate).toBeCloseTo(2 / 3)
    expect(f[2].rate).toBe(0.5)
  })
  it('averages stage durations and time to hire', () => {
    const d = avgStageDays([A, B], '2026-02-01')
    expect(d.Applied).toBe(3) // (4 + 2) / 2
    expect(d.Screen).toBe(4.5) // (5 + 4) / 2
    expect(timeToHire([A, B, C])).toBe(24)
    expect(timeToHire([C])).toBeNaN()
  })
  it('searches tags and fields', () => {
    expect(matches(A, 'REACT')).toBe(true)
    expect(matches(A, 'python')).toBe(false)
  })
})
