import { describe, expect, it } from 'vitest'
import { categoryPct, grade, letterFor, parseCsv, stats } from './gradebook-calculator'

const scale = [{ letter: 'A', min: 90 }, { letter: 'B', min: 80 }, { letter: 'C', min: 70 }, { letter: 'D', min: 60 }, { letter: 'F', min: 0 }]

describe('gradebook-calculator', () => {
  it('category percent with drop-lowest', () => {
    expect(categoryPct([{ score: 8, max: 10 }, { score: 18, max: 20 }], 0)).toBeCloseTo(26 / 30, 10)
    expect(categoryPct([{ score: 2, max: 10 }, { score: 18, max: 20 }], 1)).toBeCloseTo(0.9, 10)
    expect(categoryPct([{ score: 5, max: 10 }], 3)).toBe(0.5) // never drops the last item
    expect(categoryPct([], 0)).toBeNull()
  })
  it('weighted grade renormalises missing categories', () => {
    const cats = [{ id: 'h', name: 'HW', weight: 40, drop: 0 }, { id: 'e', name: 'Exam', weight: 60, drop: 0 }]
    const asg = [{ id: 'a', name: 'HW1', cat: 'h', max: 10 }, { id: 'b', name: 'Exam', cat: 'e', max: 100 }]
    const r = grade({ id: 's', name: 'S', scores: { a: 9, b: 80 } }, cats, asg, scale)
    expect(r.pct).toBeCloseTo(0.4 * 0.9 + 0.6 * 0.8, 10)
    expect(r.letter).toBe('B')
    const partial = grade({ id: 's', name: 'S', scores: { a: 9, b: null } }, cats, asg, scale)
    expect(partial.pct).toBeCloseTo(0.9, 10)
    expect(grade({ id: 's', name: 'S', scores: { a: 9, b: null } }, cats, asg, scale, true).pct).toBeCloseTo(0.36, 10)
  })
  it('letters at boundaries', () => {
    expect(letterFor(0.9, scale)).toBe('A')
    expect(letterFor(0.8999, scale)).toBe('B')
    expect(letterFor(0.1, scale)).toBe('F')
  })
  it('stats', () => {
    const s = stats([2, 4, 4, 4, 5, 5, 7, 9])
    expect(s.mean).toBe(5)
    expect(s.median).toBe(4.5)
    expect(s.sd).toBeCloseTo(2.138, 3)
  })
  it('csv', () => {
    expect(parseCsv('a,b\n"x, y",2\r\n"q""t",3')).toEqual([['a', 'b'], ['x, y', '2'], ['q"t', '3']])
    expect(parseCsv('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']])
  })
})
