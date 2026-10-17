import { describe, expect, it } from 'vitest'
import { frac, gcd, generate, text, TOPICS, type Level, type Topic } from './worksheet-generator'

const num = (s: string) => Number(s.replace(/,/g, '').replace('−', '-'))
// Evaluates "a op b = ____" plain text with exact integer arithmetic.
function evalSimple(q: string): number {
  const m = /^(−?[\d,.]+) ([+−×÷]) (−?[\d,.]+) =/.exec(q)!
  const a = num(m[1]), b = num(m[3])
  return m[2] === '+' ? a + b : m[2] === '−' ? a - b : m[2] === '×' ? a * b : a / b
}

describe('worksheet-generator', () => {
  it('is deterministic per seed', () => {
    expect(generate('add', 2, 10, 42).map((p) => text(p.q))).toEqual(generate('add', 2, 10, 42).map((p) => text(p.q)))
    expect(generate('add', 2, 10, 42).map((p) => text(p.q))).not.toEqual(generate('add', 2, 10, 43).map((p) => text(p.q)))
  })
  it('arithmetic answers are correct', () => {
    for (const t of ['add', 'sub', 'mul', 'decimal'] as Topic[])
      for (const l of [1, 2, 3] as Level[])
        for (const p of generate(t, l, 40, 7)) expect(num(text(p.a))).toBeCloseTo(evalSimple(text(p.q)), 6)
  })
  it('subtraction stays non-negative unless allowed', () => {
    for (const p of generate('sub', 3, 50, 3)) expect(num(text(p.a))).toBeGreaterThanOrEqual(0)
  })
  it('division with remainders', () => {
    for (const p of generate('div', 3, 40, 9, { remainders: true })) {
      const m = /^([\d,]+) ÷ ([\d,]+)/.exec(text(p.q))!
      const a = num(m[1]), b = num(m[2])
      const [q, r] = text(p.a).split(' R ').map(num)
      expect(q).toBe(Math.floor(a / b))
      expect(r || 0).toBe(a % b)
    }
  })
  it('fractions simplify and become mixed numbers', () => {
    expect(gcd(12, 18)).toBe(6)
    expect(text(frac(6, 8))).toBe('3/4')
    expect(text(frac(7, 2))).toBe('3 1/2')
    expect(text(frac(8, 4))).toBe('2')
    for (const p of generate('fracAdd', 2, 30, 5)) {
      const fs = p.q.filter((t) => typeof t === 'object' && 'f' in t) as { f: [string, string] }[]
      const v = fs.map((f) => Number(f.f[0]) / Number(f.f[1]))
      const sub = text(p.q).includes('−')
      const ans = text(p.a).split(' ')
      const val = ans.reduce((s, x) => s + (x.includes('/') ? Number(x.split('/')[0]) / Number(x.split('/')[1]) : Number(x)), 0)
      expect(val).toBeCloseTo(sub ? v[0] - v[1] : v[0] + v[1], 9)
    }
  })
  it('equations have integer solutions that satisfy them', () => {
    for (const p of generate('equation', 3, 30, 11)) {
      const x = num(text(p.a).replace('x = ', ''))
      const expr = text(p.q).replace(/−/g, '-').replace(/(\d)x/g, '$1*x').replace(/(\d)\(/g, '$1*(').replace('=', '==')
      expect(new Function('x', `return ${expr}`)(x)).toBe(true)
    }
  })
  it('every topic produces the requested count', () => {
    for (const t of Object.keys(TOPICS) as Topic[]) for (const l of [1, 2, 3] as Level[]) expect(generate(t, l, 20, 1).length).toBe(20)
  })
})
