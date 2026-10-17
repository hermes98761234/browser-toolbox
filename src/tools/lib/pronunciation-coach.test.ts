import { describe, expect, it } from 'vitest'
import { bestAlternative, compare, editDistance, phoneKey, similarity, simulateAttempt, tokens } from './pronunciation-coach'

describe('pronunciation coach', () => {
  it('tokenises', () => {
    expect(tokens("Don’t stop — it's well-known!")).toEqual(["don't", 'stop', "it's", 'well', 'known'])
  })
  it('edit distance and phonetic keys', () => {
    expect(editDistance('kitten', 'sitting')).toBe(3)
    expect(phoneKey('phone')).toBe(phoneKey('fone'))
    expect(phoneKey('knight')).toBe(phoneKey('nite'))
    expect(phoneKey('ship')).not.toBe(phoneKey('sip'))
    expect(similarity('three', 'tree')).toBeGreaterThan(0.7)
    expect(similarity('cat', 'elephant')).toBeLessThan(0.4)
  })
  it('perfect match scores 100', () => {
    const r = compare('The quick brown fox', 'the quick brown fox')
    expect(r.score).toBe(100)
    expect(r.cells.every((c) => c.mark === 'ok')).toBe(true)
  })
  it('marks close, missed and extra words', () => {
    const r = compare('I think three trees are very tall', 'I sink tree trees are wery very tall')
    const marks = r.cells.map((c) => `${c.mark}:${c.target ?? ''}/${c.heard ?? ''}`)
    expect(marks).toContain('close:think/sink')
    expect(marks).toContain('close:three/tree')
    expect(r.counts.extra).toBe(1)
    expect(r.score).toBeLessThan(100)
    expect(r.score).toBeGreaterThan(50)
    const m = compare('she sells sea shells', 'she sea shells')
    expect(m.cells.find((c) => c.mark === 'missed')?.target).toBe('sells')
  })
  it('empty heard scores zero', () => {
    expect(compare('hello world', '').score).toBe(0)
    expect(compare('hello world', '').counts.missed).toBe(2)
  })
  it('chooses the best alternative', () => {
    expect(bestAlternative('red lorry yellow lorry', ['red lorry yellow lolly', 'red lorry yellow lorry']).score).toBe(100)
  })
  it('simulated attempts are deterministic and similar', () => {
    const t = 'The weather was very warm with a light wind'
    expect(simulateAttempt(t, 3)).toBe(simulateAttempt(t, 3))
    expect(compare(t, simulateAttempt(t, 3)).score).toBeGreaterThan(40)
  })
})
