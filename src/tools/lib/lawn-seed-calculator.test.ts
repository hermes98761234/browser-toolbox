import { describe, expect, it } from 'vitest'
import { LB1000_TO_GM2, nearestEdge, plan, polyArea, polyPerimeter, selfCrossing, type P } from './lawn-seed-calculator'

describe('lawn seed', () => {
  const L: P[] = [[0, 0], [40, 0], [40, 30], [20, 30], [20, 50], [0, 50]]
  it('polygon area/perimeter', () => {
    expect(polyArea(L)).toBe(40 * 30 + 20 * 20)
    expect(polyPerimeter(L)).toBe(180)
    expect(selfCrossing(L)).toBe(false)
    expect(selfCrossing([[0, 0], [10, 10], [10, 0], [0, 10]])).toBe(true)
  })
  it('inserts on the nearest edge', () => {
    expect(nearestEdge([[0, 0], [10, 0], [10, 10], [0, 10]], [5, -1])).toBe(0)
    expect(nearestEdge([[0, 0], [10, 0], [10, 10], [0, 10]], [-1, 5])).toBe(3)
  })
  it('seed and fertilizer quantities', () => {
    const p = plan(5000, 7, 0.1, 10, 40, 1, 24, 15, 25)
    expect(p.seedLb).toBeCloseTo(38.5, 6)
    expect(p.bags).toBe(4)
    expect(p.seedCost).toBe(160)
    expect(p.fertLb).toBeCloseTo(20.833, 3)
    expect(p.fertBags).toBe(2)
    expect(LB1000_TO_GM2).toBeCloseTo(4.882, 3)
  })
})
