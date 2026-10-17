import { describe, expect, it } from 'vitest'
import { coverage, footprint, parsePts, totals, type Block } from './building-massing-studio'

const B = (o: Partial<Block>): Block => ({ id: 'a', name: 'A', shape: 'rect', w: 20, d: 10, arm: 6, pts: [], x: 0, y: 0, rot: 0, floors: 5, fh: 3, base: 0, use: 'office', ...o })

describe('building-massing-studio', () => {
  it('footprints of each shape', () => {
    expect(footprint(B({}))).toBeCloseTo(200)
    expect(footprint(B({ shape: 'L', w: 20, d: 20, arm: 6 }))).toBeCloseTo(20 * 6 + 14 * 6)
    expect(footprint(B({ shape: 'U', w: 30, d: 20, arm: 6 }))).toBeCloseTo(30 * 20 - 18 * 14)
    expect(footprint(B({ shape: 'court', w: 30, d: 20, arm: 6 }))).toBeCloseTo(600 - 18 * 8)
    expect(footprint(B({ shape: 'poly', pts: [[0, 0], [10, 0], [10, 10]] }))).toBeCloseTo(50)
  })
  it('GFA, parking exclusion and height', () => {
    const t = totals([B({}), B({ id: 'b', use: 'parking', floors: 2, base: 0 }), B({ id: 'c', floors: 10, fh: 3.5, base: 15 })])
    expect(t.gfa).toBeCloseTo(200 * 17)
    expect(t.countedGfa).toBeCloseTo(200 * 15)
    expect(t.maxHeight).toBeCloseTo(50)
  })
  it('coverage counts overlaps once, rotation preserves area', () => {
    const c = coverage([B({}), B({ id: 'b', x: 10 })], 0.25)
    expect(c.union).toBeCloseTo(300, 0)
    expect(c.overlap).toBeCloseTo(100, 0)
    expect(coverage([B({ rot: 30 })], 0.1).union).toBeCloseTo(200, -1)
  })
  it('parses points', () => {
    expect(parsePts('0,0 10,0; 10 5')).toEqual([[0, 0], [10, 0], [10, 5]])
  })
})
