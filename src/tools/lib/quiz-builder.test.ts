import { describe, expect, it } from 'vitest'
import { SAMPLE, decodeQuiz, encodeQuiz, grade, norm, pack, score, shuffled, unpack, validate } from './quiz-builder'

const [single, multi, tf, text] = SAMPLE.questions

describe('grading', () => {
  it('grades single, true/false and text', () => {
    expect(grade(single, [1])).toBe(1)
    expect(grade(single, [0])).toBe(0)
    expect(grade(tf, [0])).toBe(1)
    expect(grade(tf, [1])).toBe(0)
    expect(grade(text, '  JUPITER! ')).toBe(1)
    expect(grade(text, 'Saturn')).toBe(0)
    expect(grade(text, undefined)).toBe(0)
    expect(norm('Café  Olé')).toBe('cafe ole')
  })
  it('gives partial credit on multi-select', () => {
    expect(grade(multi, [0, 2, 3])).toBe(2)
    expect(grade(multi, [0, 2])).toBeCloseTo(4 / 3)
    expect(grade(multi, [0, 1])).toBe(0)
    expect(grade(multi, [0, 1, 2, 3, 4])).toBeCloseTo(2 / 3)
  })
  it('scores the whole quiz', () => {
    const r = score(SAMPLE, { s1: [1], s2: [0, 2, 3], s3: [0], s4: 'jupiter', s5: [1], s6: 'mars' })
    expect(r.max).toBe(7)
    expect(r.got).toBe(7)
    expect(r.passed).toBe(true)
    expect(score(SAMPLE, {}).pct).toBe(0)
  })
  it('validates', () => {
    expect(validate(SAMPLE)).toEqual([])
    expect(validate({ ...SAMPLE, questions: [{ ...single, correct: [], prompt: '' }] })).toHaveLength(2)
  })
})

describe('link encoding', () => {
  it('round-trips with and without compression', async () => {
    for (const c of [true, false]) {
      const s = await encodeQuiz(SAMPLE, c)
      expect(s[0]).toBe(c ? 'z' : 'j')
      expect(s).toMatch(/^[A-Za-z0-9_-]+$/)
      const q = await decodeQuiz(s)
      expect(pack(q)).toEqual(pack(SAMPLE))
    }
  })
  it('compression shortens the link', async () => {
    expect((await encodeQuiz(SAMPLE)).length).toBeLessThan((await encodeQuiz(SAMPLE, false)).length)
  })
  it('rejects junk', async () => {
    expect(() => unpack({})).toThrow()
    await expect(decodeQuiz('x123')).rejects.toThrow()
  })
  it('shuffles deterministically', () => {
    const a = shuffled([1, 2, 3, 4, 5], 7)
    expect(a).toEqual(shuffled([1, 2, 3, 4, 5], 7))
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5])
  })
})
