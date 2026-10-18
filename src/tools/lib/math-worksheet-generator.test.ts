import { describe, expect, it } from 'vitest'
import { answer, check, fmtMoney, generate, type Grade, type Topic } from './math-worksheet-generator'

const topics: Topic[] = ['bond', 'times', 'place', 'clock', 'money', 'seq']
const grades: Grade[] = ['K', '1', '2', '3']

describe('early-primary worksheet generator', () => {
  it('is deterministic for a seed', () => {
    expect(generate('clock', '2', 8, 42)).toEqual(generate('clock', '2', 8, 42))
    expect(generate('clock', '2', 8, 42)).not.toEqual(generate('clock', '2', 8, 43))
  })
  it('produces valid problems for every topic and grade', () => {
    for (const t of topics) for (const g of grades) {
      const ps = generate(t, g, 12, 7, { cur: 'EUR', division: true })
      expect(ps.length).toBe(12)
      for (const p of ps) {
        if (p.k === 'bond') expect(p.a + p.b).toBe(p.whole)
        if (p.k === 'clock') { expect(p.h).toBeGreaterThanOrEqual(1); expect(p.m).toBeLessThan(60) }
        if (p.k === 'place') expect(Number(answer(p))).toBeLessThanOrEqual(9999)
        if (p.k === 'seq') expect(p.items.filter((x) => x === null).length).toBeGreaterThan(0)
        if (p.k === 'money') expect(p.items.length).toBeGreaterThan(0)
        expect(check(p, answer(p))).toBe(true)
      }
    }
  })
  it('kindergarten clocks are o\'clock or half past', () => {
    for (const p of generate('clock', 'K', 20, 3)) if (p.k === 'clock') expect([0, 30]).toContain(p.m)
  })
  it('answers and lenient checking', () => {
    expect(answer({ k: 'times', a: 7, b: 8, div: false })).toBe('56')
    expect(answer({ k: 'times', a: 7, b: 8, div: true })).toBe('8')
    expect(answer({ k: 'clock', h: 3, m: 5 })).toBe('3:05')
    expect(check({ k: 'clock', h: 3, m: 5 }, '03.05')).toBe(true)
    const m = { k: 'money' as const, items: [25, 10, 1], cur: 'USD' as const }
    expect(answer(m)).toBe('36¢')
    expect(check(m, '36')).toBe(true)
    expect(check(m, '$0.36')).toBe(true)
    expect(check(m, '35')).toBe(false)
    expect(fmtMoney(1250, 'GBP')).toBe('£12.50')
    expect(answer({ k: 'place', th: 0, h: 3, t: 0, o: 7 })).toBe('307')
  })
})
