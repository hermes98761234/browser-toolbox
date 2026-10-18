import { describe, expect, it } from 'vitest'
import { paceSchedule, syllabify, tokenize, wpm } from './read-aloud-helper'

describe('read aloud helper', () => {
  it('tokenizes covering every character', () => {
    const t = tokenize("Hi, it's me.\nOk")
    expect(t.map((x) => x.text).join('')).toBe("Hi, it's me.\nOk")
    expect(t.filter((x) => x.word).map((x) => x.text)).toEqual(['Hi', "it's", 'me', 'Ok'])
  })
  it('syllabifies common words', () => {
    const cases: Record<string, string> = {
      banana: 'ba-na-na', rabbit: 'rab-bit', table: 'ta-ble', little: 'lit-tle', children: 'chil-dren', make: 'make',
      winter: 'win-ter', monster: 'mon-ster', jumped: 'jumped', wanted: 'want-ed', father: 'fa-ther', pocket: 'pock-et',
      Elephant: 'E-le-phant', happy: 'hap-py', cat: 'cat', reading: 'read-ing', running: 'run-ning',
    }
    for (const [w, s] of Object.entries(cases)) expect(syllabify(w).join('-')).toBe(s)
  })
  it('pace schedule spans exactly n/wpm minutes', () => {
    const toks = tokenize('One two three, four five. Six seven eight nine ten.')
    const s = paceSchedule(toks, 120)
    expect(s.length).toBe(10)
    const end = s[s.length - 1].t + s[s.length - 1].d
    expect(end).toBeCloseTo(5, 6)
    // the word before a full stop lingers longer than a plain word
    expect(s[4].d).toBeGreaterThan(s[0].d)
  })
  it('computes wpm', () => {
    expect(wpm(150, 60)).toBe(150)
    expect(wpm(100, 0)).toBe(0)
  })
})
