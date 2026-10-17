import { describe, expect, it } from 'vitest'
import { criterionAverages, letter, maxTotal, median, pdfSafe, studentResult, wrap } from './rubric-builder'

const levels = [{ id: 'a', name: 'Exemplary', points: 4 }, { id: 'b', name: 'Proficient', points: 3 }, { id: 'c', name: 'Developing', points: 2 }]
const criteria = [{ id: 'x', name: 'Thesis', weight: 2, cells: {} }, { id: 'y', name: 'Evidence', weight: 1, cells: {} }]

describe('rubric-builder', () => {
  it('scores weighted criteria', () => {
    expect(maxTotal(criteria, levels)).toBe(12)
    const r = studentResult(criteria, levels, { id: 's', name: 'A', picks: { x: 'b', y: 'a' }, comment: '' })
    expect(r).toEqual({ earned: 10, max: 12, pct: 10 / 12, scored: 2, complete: true })
    const part = studentResult(criteria, levels, { id: 's', name: 'A', picks: { y: 'c' }, comment: '' })
    expect(part.earned).toBe(2)
    expect(part.complete).toBe(false)
  })
  it('grades and aggregates', () => {
    expect(letter(0.9)).toBe('A')
    expect(letter(0.8999)).toBe('B')
    expect(letter(0.1)).toBe('F')
    expect(median([3, 1, 2, 10])).toBe(2.5)
    const av = criterionAverages(criteria, levels, [
      { id: '1', name: '', picks: { x: 'a' }, comment: '' },
      { id: '2', name: '', picks: { x: 'c', y: 'b' }, comment: '' },
    ])
    expect(av[0].avg).toBe(3)
    expect(av[1]).toMatchObject({ avg: 3, n: 1 })
  })
  it('wraps and sanitizes text', () => {
    expect(wrap('aa bb cc dd', 5, (s) => s.length)).toEqual(['aa bb', 'cc dd'])
    expect(wrap('superlongword x', 4, (s) => s.length)).toEqual(['superlongword', 'x'])
    expect(pdfSafe('“Hi” — it’s ✓')).toBe('"Hi" - it\'s ?')
  })
})
