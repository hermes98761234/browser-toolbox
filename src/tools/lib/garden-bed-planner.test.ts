import { describe, expect, it } from 'vitest'
import { autoFill, companions, conflicts, gridSpots, minDist, soilLitres, type Bed } from './garden-bed-planner'

const bed: Bed = { id: 'a', name: 'A', x: 0, z: 0, w: 1.2, d: 1.2, h: 0.3 }

describe('garden bed planner', () => {
  it('fits a square-foot-like grid', () => {
    expect(gridSpots(bed, 'lettuce')).toHaveLength(16) // 4 × 4 at 25 cm
    expect(gridSpots(bed, 'tomato')).toHaveLength(4) // 2 × 2 at 60 cm
    const t = gridSpots(bed, 'tomato')
    expect(t[0][0]).toBeCloseTo(0.3)
    expect(t[1][0]).toBeCloseTo(0.9)
  })
  it('detects spacing conflicts and out-of-bed plants', () => {
    expect(minDist('tomato', 'basil')).toBeCloseTo(0.425)
    const c = conflicts(
      [
        { id: '1', bed: 'a', type: 'tomato', u: 0.3, v: 0.3 },
        { id: '2', bed: 'a', type: 'basil', u: 0.6, v: 0.3 },
        { id: '3', bed: 'a', type: 'basil', u: 1.0, v: 1.0 },
        { id: '4', bed: 'a', type: 'basil', u: 1.5, v: 1.0 },
      ],
      [bed],
    )
    expect([...c].sort()).toEqual(['1', '2', '4'])
  })
  it('auto-fills around existing plants', () => {
    const spots = autoFill(bed, 'lettuce', [{ id: 't', bed: 'a', type: 'tomato', u: 0.6, v: 0.6 }])
    expect(spots.length).toBeLessThan(16)
    expect(spots.every(([u, v]) => Math.hypot(u - 0.6, v - 0.6) >= 0.425)).toBe(true)
  })
  it('finds companions and soil volume', () => {
    expect(companions(['tomato', 'basil', 'kale'])).toEqual({ good: [['tomato', 'basil']], bad: [['tomato', 'kale']] })
    expect(soilLitres(bed)).toBeCloseTo(432)
  })
})
