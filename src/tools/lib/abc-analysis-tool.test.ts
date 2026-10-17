import { describe, expect, it } from 'vitest'
import { classify, parseNum, summarize } from './abc-analysis-tool'

describe('ABC analysis', () => {
  const items = [10, 500, 300, 100, 50, 25, 15].map((v, i) => ({ name: `i${i}`, value: v }))
  it('sorts and accumulates', () => {
    const r = classify(items)
    expect(r.map((x) => x.item.value)).toEqual([500, 300, 100, 50, 25, 15, 10])
    expect(r[r.length - 1].cum).toBeCloseTo(1)
    expect(r[0].share).toBeCloseTo(0.5)
  })
  it('classifies by starting cumulative share', () => {
    // cum starts: 0, .5, .8, .9, .95, .975, .99
    expect(classify(items).map((x) => x.cls).join('')).toBe('AABBCCC')
    expect(classify(items, 0.7, 0.9).map((x) => x.cls).join('')).toBe('AABCCCC')
    expect(classify([{ name: 'x', value: 5 }])[0].cls).toBe('A')
  })
  it('summarizes classes', () => {
    const s = summarize(classify(items))
    expect(s[0]).toMatchObject({ cls: 'A', count: 2 })
    expect(s[0].valueShare).toBeCloseTo(0.8)
    expect(s.reduce((a, x) => a + x.count, 0)).toBe(7)
  })
  it('ignores bad values and parses numbers', () => {
    expect(classify([{ name: 'a', value: NaN }, { name: 'b', value: -1 }, { name: 'c', value: 1 }])).toHaveLength(1)
    expect(parseNum('$1,234.50')).toBe(1234.5)
    expect(parseNum('1.234,50 €')).toBe(1234.5)
    expect(parseNum('')).toBeNaN()
  })
})
