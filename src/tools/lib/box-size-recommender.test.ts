import { describe, expect, it } from 'vitest'
import { evaluate, orientations, pack, pillows, type Box, type Item } from './box-size-recommender'

const it_ = (p: Partial<Item>): Item => ({ id: 'i', name: 'x', l: 10, w: 10, h: 10, kg: 1, qty: 1, upright: false, ...p })
const box = (p: Partial<Box>): Box => ({ id: 'b', name: 'B', l: 20, w: 20, h: 20, kg: 0.3, cost: 1, maxKg: 0, ...p })

describe('box packing', () => {
  it('orientations', () => {
    expect(orientations(1, 2, 3, false)).toHaveLength(6)
    expect(orientations(2, 2, 2, false)).toHaveLength(1)
    expect(orientations(1, 2, 3, true)).toEqual([[1, 2, 3], [2, 1, 3]])
  })
  it('packs 8 cubes exactly', () => {
    const r = pack(20, 20, 20, [it_({ qty: 8 })])
    expect(r.unplaced).toBe(0)
    expect(pack(20, 20, 20, [it_({ qty: 9 })]).unplaced).toBe(1)
  })
  it('rotates a long item to fit', () => {
    expect(pack(10, 10, 40, [it_({ l: 38, w: 5, h: 5 })]).unplaced).toBe(0)
    expect(pack(10, 10, 40, [it_({ l: 38, w: 5, h: 5, upright: true })]).unplaced).toBe(1)
  })
  it('mixed items', () => {
    const r = pack(30, 20, 15, [it_({ l: 30, w: 20, h: 5 }), it_({ l: 15, w: 10, h: 10, qty: 4 })])
    expect(r.unplaced).toBe(0)
  })
  it('evaluate with padding and weight', () => {
    const f = evaluate([box({}), box({ id: 'c', l: 21, w: 21, h: 21 })], [it_({ qty: 8 })], 0.5)
    expect(f[0].fits).toBe(false)
    expect(f[1].fits).toBe(true)
    expect(f[1].voidVol).toBeCloseTo(21 ** 3 - 8000, 6)
    expect(evaluate([box({ maxKg: 5 })], [it_({ qty: 8 })], 0)[0].overweight).toBe(true)
    expect(pillows(7000)).toBe(10)
  })
})
