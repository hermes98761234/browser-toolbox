import { describe, expect, it } from 'vitest'
import { bestOrient, layout, netArea, pack, seams } from './drywall-estimator'

const wall = (length: number, height = 8, openings: { x: number; y: number; w: number; h: number }[] = []) => ({ length, height, openings })

describe('drywall-estimator', () => {
  it('lays a 12×8 wall', () => {
    expect(layout(wall(12), 8, 4, 'h').length).toBe(4)
    const p12 = layout(wall(12), 12, 4, 'h')
    expect(p12.length).toBe(2)
    expect(p12.every((p) => p.full)).toBe(true)
    expect(layout(wall(12), 8, 4, 'v').length).toBe(3)
  })
  it('packs offcuts into shared sheets', () => {
    const pieces = layout(wall(10), 8, 4, 'h') // 2 full + 2 pieces 2×4
    expect(pieces.length).toBe(4)
    expect(pack(pieces, 8, 4).length).toBe(3)
    // 9 ft wall: bands 4,4,1 → pieces (8×4,1×4)×2 + (8×1)+(1×1)
    const p9 = layout(wall(10, 9), 8, 4, 'h')
    expect(pack(p9, 8, 4).length).toBe(4)
  })
  it('openings that cover a full band remove board', () => {
    const door = { x: 1, y: 0, w: 3, h: 6.75 }
    const p = layout(wall(12, 8, [door]), 12, 4, 'h')
    // top band [4,8] not fully covered → one 12 ft piece; bottom band split [0,1] and [4,12]
    expect(p.map((q) => q.l).sort((a, b) => a - b)).toEqual([1, 8, 12])
    expect(netArea(wall(12, 8, [door]))).toBeCloseTo(96 - 20.25)
  })
  it('measures seams', () => {
    expect(seams(layout(wall(12), 12, 4, 'h'))).toBeCloseTo(12)
    expect(seams(layout(wall(12), 8, 4, 'h'))).toBeCloseTo(12 + 8)
    expect(bestOrient(wall(12), 12, 4)).toBe('h')
  })
})
