import { describe, expect, it } from 'vitest'
import { buildDoc, gaps, goalScore, label, overall, weighted, type Competency, type Goal, type Review } from './performance-review-builder'

const C = (name: string, weight: number, self: number, mgr: number): Competency => ({ id: name, name, desc: '', weight, self, mgr, selfNote: '', mgrNote: '' })
const G = (weight: number, progress: number, status: Goal['status']): Goal => ({ id: String(Math.random()), title: 'g', measure: '', weight, progress, status, note: '' })
const LABELS = ['Unsatisfactory', 'Needs improvement', 'Meets', 'Exceeds', 'Outstanding']

describe('performance-review-builder', () => {
  it('weights ratings and skips unrated', () => {
    const cs = [C('a', 2, 4, 3), C('b', 1, 5, 0), C('c', 1, 0, 5)]
    expect(weighted(cs, 'self')).toBeCloseTo((4 * 2 + 5) / 3)
    expect(weighted(cs, 'mgr')).toBeCloseTo((3 * 2 + 5) / 3)
    expect(weighted([C('x', 1, 0, 0)], 'mgr')).toBeNaN()
  })
  it('scores goals', () => {
    expect(goalScore([G(1, 40, 'achieved'), G(1, 50, 'on-track'), G(5, 0, 'dropped')])).toBeCloseTo(0.75)
    expect(goalScore([])).toBeNaN()
  })
  it('blends overall', () => {
    const comps = [C('a', 1, 3, 4)]
    expect(overall({ comps, goals: [], goalShare: 40, scale: 5 })).toBe(4)
    // goals 100% → 5 on the scale; 0.6×4 + 0.4×5 = 4.4
    expect(overall({ comps, goals: [G(1, 100, 'achieved')], goalShare: 40, scale: 5 })).toBeCloseTo(4.4)
    expect(label(4.4, LABELS)).toBe('Exceeds')
    expect(label(NaN, LABELS)).toBe('Not rated')
  })
  it('finds perception gaps', () => {
    expect(gaps([C('a', 1, 5, 3), C('b', 1, 3, 3), C('c', 1, 2, 3)])).toEqual([{ name: 'a', self: 5, mgr: 3, diff: 2 }, { name: 'c', self: 2, mgr: 3, diff: -1 }])
  })
  it('builds a document outline', () => {
    const r: Review = { employee: 'Ana', role: 'Dev', manager: 'Bo', department: 'R&D', from: '2026-01-01', to: '2026-06-30', kind: 'Mid-year', scale: 5, labels: LABELS, comps: [C('Quality', 1, 4, 4)], goals: [G(1, 80, 'on-track')], goalShare: 30, strengths: '- Calm', development: '', selfSummary: '', mgrSummary: 'Great half.' }
    const b = buildDoc(r)
    expect(b[0]).toEqual({ t: 'title', text: 'Mid-year Performance Review' })
    expect(b.some((x) => x.t === 'bullet' && x.text === 'Calm')).toBe(true)
    expect(b.some((x) => x.t === 'h' && x.text === 'Manager comments')).toBe(true)
  })
})
