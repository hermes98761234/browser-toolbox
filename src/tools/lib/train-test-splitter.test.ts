import { describe, expect, it } from 'vitest'
import { allocate, crossTab, groupSplit, kFold, leakingGroups, mulberry32, randomSplit, sampleCsv, shuffle, stratifiedSplit } from './train-test-splitter'

describe('train/test splitter', () => {
  it('PRNG and shuffle are deterministic per seed', () => {
    const a = mulberry32(42), b = mulberry32(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
    const xs = [...Array(20).keys()]
    expect(shuffle(xs, mulberry32(1))).toEqual(shuffle(xs, mulberry32(1)))
    expect(shuffle(xs, mulberry32(1))).not.toEqual(shuffle(xs, mulberry32(2)))
    expect([...shuffle(xs, mulberry32(3))].sort((p, q) => p - q)).toEqual(xs)
  })
  it('allocate sums to n with largest remainder', () => {
    expect(allocate(10, [70, 15, 15])).toEqual([7, 2, 1])
    expect(allocate(100, [80, 0, 20])).toEqual([80, 0, 20])
    const c = allocate(7, [1, 1, 1])
    expect(c[0] + c[1] + c[2]).toBe(7)
  })
  it('random split hits exact sizes', () => {
    const p = randomSplit(100, [70, 10, 20], 5)
    expect(p.filter((x) => x === 'train').length).toBe(70)
    expect(p.filter((x) => x === 'test').length).toBe(20)
  })
  it('stratified split keeps class ratios', () => {
    const labels = [...Array(60).fill('a'), ...Array(30).fill('b'), ...Array(10).fill('c')]
    const p = stratifiedSplit(labels, [80, 0, 20], 9)
    const t = crossTab(p, labels)
    expect(t.get('test')!.get('a')).toBe(12)
    expect(t.get('test')!.get('b')).toBe(6)
    expect(t.get('test')!.get('c')).toBe(2)
  })
  it('group split never leaks a group', () => {
    const groups = Array.from({ length: 200 }, (_, i) => `g${i % 37}`)
    const p = groupSplit(groups, [70, 15, 15], 3)
    expect(leakingGroups(p, groups)).toEqual([])
    const train = p.filter((x) => x === 'train').length
    expect(train).toBeGreaterThan(120)
    expect(train).toBeLessThan(160)
  })
  it('k-fold: balanced folds, stratified and grouped variants', () => {
    const f = kFold(103, 5, 1)
    const sizes = [0, 1, 2, 3, 4].map((k) => f.filter((x) => x === k).length)
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1)
    const labels = Array.from({ length: 50 }, (_, i) => (i < 10 ? 'pos' : 'neg'))
    const fs = kFold(50, 5, 1, { labels })
    for (let k = 0; k < 5; k++) expect(fs.filter((x, i) => x === k && labels[i] === 'pos').length).toBe(2)
    const groups = Array.from({ length: 60 }, (_, i) => `p${i % 13}`)
    const fg = kFold(60, 4, 2, { groups })
    expect(leakingGroups(fg.map(String), groups)).toEqual([])
  })
  it('sample data has a header and repeated patients', () => {
    const lines = sampleCsv().split('\n')
    expect(lines[0]).toContain('patient_id')
    expect(lines.length).toBeGreaterThan(60)
  })
})
