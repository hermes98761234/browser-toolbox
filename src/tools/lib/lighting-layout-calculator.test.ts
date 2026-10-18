import { describe, expect, it } from 'vitest'
import { cu, directLux, fixtureCount, grid, positions, rcr, roomIndex } from './lighting-layout-calculator'

describe('lumen method', () => {
  it('cavity ratio and room index', () => {
    expect(rcr(10, 8, 2.15)).toBeCloseTo(2.41875, 10)
    expect(roomIndex(10, 8, 2.15) * rcr(10, 8, 2.15)).toBeCloseTo(5, 10)
  })
  it('fixture count', () => {
    expect(fixtureCount(500, 80, 4000, 0.7, 0.8)).toBeCloseTo(17.857, 3)
  })
  it('CU table interpolation', () => {
    expect(cu('troffer', 0, 80, 50)).toBeCloseTo(1.18, 10)
    expect(cu('troffer', 2.5, 80, 50)).toBeCloseTo(0.96, 10)
    expect(cu('troffer', 2, 80, 40)).toBeCloseTo(0.965, 10)
    expect(cu('pendant', 2, 50, 50)).toBeCloseTo(0.86 * 0.8, 10)
    expect(cu('troffer', 20, 80, 50)).toBeCloseTo(0.52, 10)
  })
  it('grid layout', () => {
    const g = grid(18, 10, 8)
    expect(g.cols * g.rows).toBeGreaterThanOrEqual(18)
    expect(g.cols).toBeGreaterThanOrEqual(g.rows)
    expect(grid(12, 20, 5).cols).toBeGreaterThan(grid(12, 20, 5).rows)
    expect(positions(2, 1, 10, 4)).toEqual([{ x: 2.5, y: 2 }, { x: 7.5, y: 2 }])
  })
  it('point illuminance under a Lambertian source', () => {
    // Directly below: E = I0 / h², I0 = Φ·2/(2π)
    expect(directLux([{ x: 0, y: 0 }], 0, 0, 2, 1000, 1)).toBeCloseTo(1000 / Math.PI / 4, 8)
  })
})
