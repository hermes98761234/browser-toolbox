import { describe, expect, it } from 'vitest'
import { clock, countWords, duration, emphasis, parseScript, pxPerSec, totalWords } from './teleprompter'

describe('teleprompter', () => {
  it('counts words', () => {
    expect(countWords("Hello, world — it's 2026!")).toBe(4)
    expect(countWords('  ')).toBe(0)
  })
  it('parses headings, pauses, notes and paragraphs', () => {
    const s = parseScript('# Intro\nHello there\nfriends.\n\n(smile)\n[pause]\nSecond part.\n[pause 2.5s]\n\nEnd')
    expect(s.map((x) => x.kind)).toEqual(['head', 'para', 'note', 'pause', 'para', 'pause', 'para'])
    expect(s[1]).toEqual({ kind: 'para', text: 'Hello there friends.', words: 3 })
    expect(s[5]).toEqual({ kind: 'pause', sec: 2.5 })
    expect(totalWords(s)).toBe(6)
  })
  it('computes timing', () => {
    const s = parseScript('one two three four five six\n[pause 4]')
    expect(duration(s, 120)).toBeCloseTo(3 + 4)
    expect(pxPerSec(600, 100, 150)).toBeCloseTo(15)
    expect(clock(65)).toBe('1:05')
    expect(clock(3725)).toBe('1:02:05')
  })
  it('splits emphasis', () => {
    expect(emphasis('a *b* c')).toEqual([{ t: 'a ', em: false }, { t: 'b', em: true }, { t: ' c', em: false }])
  })
})
