import { describe, expect, it } from 'vitest'
import { fingerOf, LESSONS, makeDrill, score, tally, weakKeys, wordsFor, type Stroke } from './typing-tutor'

describe('typing tutor', () => {
  it('maps fingers', () => {
    expect(fingerOf('a')).toBe(0)
    expect(fingerOf('f')).toBe(3)
    expect(fingerOf('g')).toBe(3)
    expect(fingerOf('j')).toBe(4)
    expect(fingerOf(';')).toBe(7)
    expect(fingerOf('1')).toBe(0)
  })
  it('filters words by allowed keys', () => {
    const w = wordsFor('asdfghjkl;')
    expect(w).toContain('flask')
    expect(w.every((x) => /^[asdfghjkl]+$/.test(x))).toBe(true)
  })
  it('makes deterministic drills from lesson keys only', () => {
    const l = LESSONS.find((x) => x.id === 'home1')!
    const a = makeDrill(l, 20, 7)
    expect(a).toBe(makeDrill(l, 20, 7))
    expect(a.split(' ')).toHaveLength(20)
    expect(/^[fjdk ]+$/.test(a)).toBe(true)
    const n = makeDrill(LESSONS.find((x) => x.id === 'numbers')!, 10, 3)
    expect(/^[0-9 ]+$/.test(n)).toBe(true)
  })
  it('scores WPM and accuracy', () => {
    // 50 correct chars in 60 s = 10 WPM; 2 wrong strokes out of 52
    const strokes: Stroke[] = Array.from({ length: 52 }, (_, i) => ({ expected: 'a', typed: i < 2 ? 'b' : 'a', t: (i * 60000) / 51 }))
    const r = score(strokes, 'a'.repeat(50), 'a'.repeat(50))
    expect(r.wpm).toBeCloseTo(10, 6)
    expect(r.accuracy).toBeCloseTo(50 / 52, 6)
    expect(r.errors).toBe(2)
  })
  it('tallies keys and finds weak ones', () => {
    const s: Stroke[] = [...Array(10)].map((_, i) => ({ expected: 'q', typed: i < 5 ? 'w' : 'q', t: i }))
    const t = tally({}, [...s, ...[...Array(10)].map((_, i) => ({ expected: 'a', typed: 'a', t: i }))])
    expect(t.q).toEqual({ n: 10, err: 5 })
    expect(weakKeys(t)[0].key).toBe('q')
    expect(weakKeys(t).find((k) => k.key === 'a')).toBeUndefined()
  })
})
