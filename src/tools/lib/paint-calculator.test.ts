import { describe, expect, it } from 'vitest'
import { bestCans, paintNeeded, roomArea, type Room } from './paint-calculator'

const room: Room = { id: 'r', name: 'R', length: 4, width: 3, height: 2.5, doors: 1, windows: 1, ceiling: true, walls: true }

describe('paint-calculator', () => {
  it('computes room area', () => {
    const a = roomArea(room, { w: 0.9, h: 2.1 }, { w: 1.2, h: 1.2 })
    expect(a.gross).toBeCloseTo(35, 6)
    expect(a.openings).toBeCloseTo(1.89 + 1.44, 6)
    expect(a.walls).toBeCloseTo(35 - 3.33, 6)
    expect(a.ceiling).toBe(12)
  })
  it('computes paint volume', () => {
    expect(paintNeeded(100, 2, 10)).toBe(20)
    expect(paintNeeded(100, 2, 10, 10)).toBeCloseTo(22, 9)
    expect(paintNeeded(100, 2, 0)).toBe(0)
  })
  it('finds the cheapest can mix', () => {
    const p = bestCans(6, [{ size: 1, price: 12 }, { size: 2.5, price: 25 }, { size: 5, price: 40 }])
    expect(p?.counts).toEqual([1, 0, 1])
    expect(p?.cost).toBe(52)
    const q = bestCans(9, [{ size: 1, price: 12 }, { size: 2.5, price: 25 }, { size: 5, price: 40 }])
    expect(q?.cost).toBe(80)
    expect(bestCans(1, [])).toBeNull()
  })
})
