import { describe, expect, it } from 'vitest'
import { category, exposure, hitBox, hitSphere, sunVec } from './sun-exposure-mapper'

describe('sun-exposure-mapper', () => {
  it('sun vectors', () => {
    const s = sunVec(0, 180)
    expect(s[2]).toBeCloseTo(1) // due south = +z
    expect(sunVec(90, 0)[1]).toBeCloseTo(1)
    expect(sunVec(0, 90)[0]).toBeCloseTo(1) // east = +x
  })
  it('ray hits', () => {
    expect(hitBox([0, 0, 0], [1, 0, 0], [2, -1, -1], [3, 1, 1])).toBe(true)
    expect(hitBox([0, 0, 0], [-1, 0, 0], [2, -1, -1], [3, 1, 1])).toBe(false)
    expect(hitSphere([0, 0, 0], [0, 1, 0], [0, 5, 0], 1)).toBe(true)
    expect(hitSphere([0, 0, 0], [0, -1, 0], [0, 5, 0], 1)).toBe(false)
  })
  it('open yard gets the full day length (equinox ≈ 12 h)', () => {
    const e = exposure({ width: 4, depth: 4, cell: 1, obstacles: [], lat: 0, lng: 0, date: '2025-03-20', rot: 0 })
    expect(e.dayLength).toBeGreaterThan(11.8)
    expect(e.dayLength).toBeLessThan(12.4)
    expect(e.hours[0]).toBeCloseTo(e.dayLength, 5)
  })
  it('north side of a tall wall is in shade all winter day (London)', () => {
    const wall = { id: 'w', kind: 'box' as const, name: 'Wall', x: 0, z: 0, w: 40, d: 0.3, h: 6 }
    const e = exposure({ width: 4, depth: 2, cell: 1, obstacles: [{ ...wall, z: 1.5 }], lat: 51.5, lng: 0, date: '2025-12-21', rot: 0 })
    // yard spans z -1..1, wall at z=1.5 is south of it
    expect(Math.max(...e.hours)).toBeLessThan(0.5)
    expect(e.dayLength).toBeGreaterThan(7.5)
    expect(e.dayLength).toBeLessThan(8.2)
  })
  it('categories', () => {
    expect(category(7)).toBe('Full sun')
    expect(category(1)).toBe('Full shade')
  })
})
