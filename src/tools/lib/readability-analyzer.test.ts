import { describe, expect, it } from 'vitest'
import { analyze, consensus, gradeLabel, hardWords, heat, replaceWord, sentenceGrade, sentences, targetSpw, targetWps } from './readability-analyzer'

describe('readability analyzer', () => {
  it('per-sentence FK grade matches the formula', () => {
    const [s] = sentences('The cat sat on the mat.')
    expect(sentenceGrade(s)).toBeCloseTo(0.39 * 6 + 11.8 * 1 - 15.59, 6)
  })
  it('target sentence length and word length invert the FK formula', () => {
    const wps = targetWps(8, 1.4)
    expect(0.39 * wps + 11.8 * 1.4 - 15.59).toBeCloseTo(8, 6)
    const spw = targetSpw(6, 15)
    expect(0.39 * 15 + 11.8 * spw - 15.59).toBeCloseTo(6, 6)
  })
  it('consensus averages the five grade formulas', () => {
    const r = analyze('We walk to the park. The sun is warm. Birds sing in the tall trees.')
    expect(consensus(r)).toBeCloseTo((r.fk + r.fog + r.smog + r.cli + r.ari) / 5, 6)
    expect(gradeLabel(3.2)).toBe('Grade 3')
    expect(gradeLabel(14)).toBe('College')
  })
  it('finds hard words with suggestions', () => {
    const h = hardWords('We must utilize additional resources. Utilize them carefully and immediately.')
    const u = h.find((x) => x.word === 'utilize')!
    expect(u.count).toBe(2)
    expect(u.suggest).toContain('use')
    expect(h.some((x) => x.word === 'additional')).toBe(true)
    expect(h.some((x) => x.word === 'we')).toBe(false)
  })
  it('replaces whole words keeping capitals', () => {
    expect(replaceWord('Utilize tools. We utilize them; reutilize no.', 'utilize', 'use')).toBe('Use tools. We use them; reutilize no.')
    expect(heat(5, 6)).toBe(0)
    expect(heat(12, 6)).toBe(1)
  })
})
