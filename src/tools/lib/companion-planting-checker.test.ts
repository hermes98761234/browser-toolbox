import { describe, expect, it } from 'vitest'
import { analyse, bestRow, foes, friends, rel, suggestions } from './companion-planting-checker'

describe('companion-planting-checker', () => {
  it('knows classic pairs symmetrically', () => {
    expect(rel('tomato', 'basil')).toBe(1)
    expect(rel('basil', 'tomato')).toBe(1)
    expect(rel('bean', 'onion')).toBe(-1)
    expect(rel('onion', 'bean')).toBe(-1)
    expect(rel('corn', 'squash')).toBe(1) // Three Sisters
    expect(rel('tomato', 'tomato')).toBe(0)
    expect(friends('carrot').map((p) => p.id)).toContain('onion')
    expect(foes('fennel').length).toBeGreaterThan(8)
  })
  it('analyses a selection', () => {
    const a = analyse(['tomato', 'basil', 'potato'])
    expect(a.pairs).toBe(3)
    expect(a.good).toEqual([['tomato', 'basil']])
    expect(a.bad).toEqual([['tomato', 'potato']])
    expect(a.family).toEqual([['tomato', 'potato']])
  })
  it('suggests conflict-free companions', () => {
    const s = suggestions(['corn', 'bean', 'squash'])
    expect(s.every((x) => x.bad === 0)).toBe(true)
    expect(s.map((x) => x.p.id)).not.toContain('onion')
  })
  it('orders a row to keep foes apart', () => {
    const r = bestRow(['bean', 'onion', 'carrot'])
    const i = r.order.indexOf('bean'), j = r.order.indexOf('onion')
    expect(Math.abs(i - j)).toBe(2)
    expect(r.score).toBe(1)
  })
})
