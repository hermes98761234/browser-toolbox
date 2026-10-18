import { describe, expect, it } from 'vitest'
import { fitText, initials, joinWords, parseQuote, starFills, starPoints, wrapWords } from './testimonial-card-maker'

const mono = (fs: number) => (s: string) => s.length * fs * 0.5

describe('testimonial card maker', () => {
  it('parses highlights', () => {
    expect(parseQuote('So *very fast* now')).toEqual([{ text: 'So', hl: false }, { text: 'very', hl: true }, { text: 'fast', hl: true }, { text: 'now', hl: false }])
    expect(parseQuote('5*3 rating').map((w) => w.hl)).toEqual([false, false])
  })
  it('wraps words', () => {
    const lines = wrapWords(parseQuote('aaa bbb ccc ddd'), 7, (s) => s.length)
    expect(lines.map((l) => l.map((w) => w.text).join(' '))).toEqual(['aaa bbb', 'ccc ddd'])
  })
  it('fits the largest font', () => {
    const w = parseQuote('one two three four five six')
    const r = fitText(w, 100, 60, 1.2, 8, 80, mono)
    // check optimality: fs fits, fs+1 does not
    const ok = (fs: number) => wrapWords(w, 100, mono(fs)).length * fs * 1.2 <= 60 && wrapWords(w, 100, mono(fs)).every((l) => mono(fs)(l.map((x) => x.text).join(' ')) <= 100)
    expect(ok(r.fs)).toBe(true)
    expect(ok(r.fs + 1)).toBe(false)
  })
  it('stars and initials', () => {
    expect(starFills(3.5)).toEqual([1, 1, 1, 0.5, 0])
    const p = starPoints(0, 0, 10)
    expect(p).toHaveLength(10)
    expect(p[0][1]).toBeCloseTo(-10)
    expect(initials('maria  de la Cruz')).toBe('MC')
    expect(initials('Ann')).toBe('A')
    expect(initials('  ')).toBe('?')
  })
})
describe('glue', () => {
  it('keeps punctuation attached after highlights', () => {
    const w = parseQuote('closed *the books*. Done')
    expect(joinWords(w)).toBe('closed the books. Done')
    expect(w[3]).toEqual({ text: '.', hl: false, glue: true })
  })
})
