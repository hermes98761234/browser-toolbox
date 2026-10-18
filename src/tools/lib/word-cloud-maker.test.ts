import { describe, expect, it } from 'vitest'
import { Board, countWords, dilate, parseWeighted, shapeMask, sizeFor, spiral, stopSet } from './word-cloud-maker'

describe('word cloud', () => {
  it('counts words without stop words', () => {
    const c = countWords('The garden grows. The garden needs water, water and sun! 42 seeds', { stop: stopSet(['en'], 'sun'), minLen: 3, numbers: false })
    expect(c[0]).toEqual({ word: 'garden', count: 2 })
    expect(c.find((w) => w.word === 'water')?.count).toBe(2)
    expect(c.some((w) => w.word === 'the' || w.word === 'sun' || w.word === '42')).toBe(false)
    expect(stopSet(['de'], '').has('und')).toBe(true)
  })
  it('parses weighted lists', () => {
    expect(parseWeighted('alpha: 5\nbeta, 2\ngamma 3.5\ndelta\n\nalpha 1')).toEqual([
      { word: 'alpha', count: 6 }, { word: 'gamma', count: 3.5 }, { word: 'beta', count: 2 }, { word: 'delta', count: 1 },
    ])
  })
  it('scales sizes', () => {
    expect(sizeFor(1, 1, 10, 12, 72, 'linear')).toBe(12)
    expect(sizeFor(10, 1, 10, 12, 72, 'linear')).toBe(72)
    expect(sizeFor(4, 1, 16, 10, 20, 'sqrt')).toBeCloseTo(10 + 10 / 3, 6)
    expect(sizeFor(5, 5, 5, 10, 20, 'log')).toBe(20)
  })
  it('spiral starts at centre and grows outward', () => {
    const s = spiral(50, 1, 2)
    expect(s[0]).toEqual([0, 0])
    const r = s.map(([x, y]) => Math.hypot(x, y))
    expect(Math.max(...r)).toBeLessThanOrEqual(52)
    expect(r[r.length - 1]).toBeGreaterThan(45)
  })
  it('board detects collisions and respects the mask', () => {
    const sp = { w: 2, h: 2, bits: new Uint8Array([1, 1, 1, 0]) }
    const b = new Board(10, 10)
    expect(b.fits(sp, 0, 0)).toBe(true)
    b.put(sp, 0, 0)
    expect(b.fits(sp, 1, 1)).toBe(true) // only the empty corner overlaps
    expect(b.fits(sp, 1, 0)).toBe(false)
    expect(b.fits(sp, 9, 9)).toBe(false)
    const masked = new Board(10, 10, shapeMask('ellipse', 10, 10))
    expect(masked.fits(sp, 0, 0)).toBe(false)
    expect(masked.fits(sp, 4, 4)).toBe(true)
    expect(dilate(sp, 1).w).toBe(4)
    expect(dilate(sp, 1).bits.reduce((a, x) => a + x, 0)).toBe(15)
  })
  it('masks have plausible areas', () => {
    const area = (m: Uint8Array) => m.reduce((a, x) => a + x, 0) / m.length
    expect(area(shapeMask('ellipse', 200, 200))).toBeCloseTo(Math.PI / 4, 1)
    expect(area(shapeMask('diamond', 201, 201))).toBeCloseTo(0.5, 1)
    expect(area(shapeMask('rect', 10, 10))).toBe(1)
    for (const s of ['heart', 'star', 'cloud'] as const) {
      const a = area(shapeMask(s, 100, 100))
      expect(a).toBeGreaterThan(0.2)
      expect(a).toBeLessThan(0.8)
    }
  })
})

describe('fit factor', () => {
  it('scales up sparse clouds and down crowded ones', async () => {
    const { fitFactor } = await import('./word-cloud-maker')
    expect(fitFactor([{ word: 'abc', size: 10 }], 100000)).toBe(3)
    expect(fitFactor([{ word: 'abcdefghij', size: 200 }], 10000)).toBe(0.4)
    const k = fitFactor([{ word: 'abcd', size: 20 }], 4 * 0.6 * 20 * 20 * 1.1 / 0.8 * 4)
    expect(k).toBeCloseTo(2, 6)
  })
})
