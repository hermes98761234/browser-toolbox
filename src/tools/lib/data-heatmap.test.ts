import { describe, expect, it } from 'vitest'
import { dist, inkFor, MAPS, normalise, order, parseMatrix, ramp, scaler, seriate } from './data-heatmap'

describe('data heatmap', () => {
  it('parses a labelled matrix', () => {
    const m = parseMatrix(',a,b\nx,1,2\ny,,"2,500.5"')
    expect(m.cols).toEqual(['a', 'b'])
    expect(m.rows).toEqual(['x', 'y'])
    expect(m.v[0]).toEqual([1, 2])
    expect(Number.isNaN(m.v[1][0])).toBe(true)
    expect(m.v[1][1]).toBe(2500.5)
  })
  it('normalises', () => {
    const v = [[1, 3], [2, 2]]
    expect(normalise(v, 'row')).toEqual([[0.25, 0.75], [0.5, 0.5]])
    expect(normalise(v, 'col')).toEqual([[1 / 3, 0.6], [2 / 3, 0.4]])
    expect(normalise(v, 'total')[0][1]).toBe(0.375)
    const z = normalise([[1, 2, 3]], 'zrow')[0]
    expect(z).toEqual([-1, 0, 1])
  })
  it('maps colours and ink', () => {
    expect(ramp(MAPS.grey, 0)).toBe('#ffffff')
    expect(ramp(MAPS.grey, 0.5)).toBe('#808080')
    expect(ramp(MAPS.viridis, 1)).toBe('#fde725')
    expect(inkFor('#ffffff')).toBe('#111111')
    expect(inkFor('#440154')).toBe('#ffffff')
  })
  it('scales values', () => {
    expect(scaler([], 'linear', 0, 10)(5)).toBe(0.5)
    expect(scaler([], 'linear', -2, 10, 0)(-1)).toBe(0.25)
    expect(scaler([], 'linear', -2, 10, 0)(5)).toBe(0.75)
    expect(scaler([], 'log', 1, 100)(10)).toBeCloseTo(0.5)
    const q = scaler([1, 2, 3, 100, 1000], 'quantile', 0, 0)
    expect(q(3)).toBe(0.5)
    expect(q(1000)).toBe(1)
  })
  it('orders similar rows together', () => {
    expect(dist([0, NaN], [3, 4])).toBeCloseTo(Math.sqrt(18))
    const vecs = [[0, 0], [10, 10], [0.1, 0], [10, 9.9], [5, 5]]
    const o = seriate(vecs)
    const pos = (i: number) => o.indexOf(i)
    expect(Math.abs(pos(0) - pos(2))).toBe(1)
    expect(Math.abs(pos(1) - pos(3))).toBe(1)
    expect(order(['b', 'a', 'c10', 'c9'], [], 'alpha')).toEqual([1, 0, 3, 2])
    expect(order(['x', 'y'], [[1], [5]], 'total')).toEqual([1, 0])
  })
})
