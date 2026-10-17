import { describe, expect, it } from 'vitest'
import { daySamples, rayHitsBox, shadowLength, sunDir, sunHoursGrid } from './sun-path-simulator'
import { localMidnight } from './golden-hour-planner'

describe('sun path simulator', () => {
  it('maps azimuth/altitude to scene axes', () => {
    const s = sunDir(0, 180)
    expect(s[2]).toBeCloseTo(1, 9) // south = +z
    const e = sunDir(0, 90)
    expect(e[0]).toBeCloseTo(1, 9)
    expect(sunDir(90, 0)[1]).toBeCloseTo(1, 9)
    expect(shadowLength(10, 45)).toBeCloseTo(10, 9)
  })
  it('tests rays against rotated boxes', () => {
    const b = { x: 0, z: 0, w: 10, d: 2, h: 5, rot: 0 }
    expect(rayHitsBox([0, 1, 10], [0, 0, -1], b)).toBe(true)
    expect(rayHitsBox([0, 6, 10], [0, 0, -1], b)).toBe(false)
    expect(rayHitsBox([4, 1, 10], [0, 0, -1], b)).toBe(true)
    // rotated 90°: the long side now runs north–south, so x = 4 misses
    expect(rayHitsBox([4, 1, 10], [0, 0, -1], { ...b, rot: 90 })).toBe(false)
    expect(rayHitsBox([0, 1, 4], [1, 0, 0], { ...b, x: 5, rot: 90 })).toBe(true)
    // 45°: three.js rotation.y=+45° sends local +x toward (cos, -sin) → north-east
    expect(rayHitsBox([3, 1, -3], [0, -1, 0], { ...b, rot: 45 })).toBe(true)
    expect(rayHitsBox([3, 1, 3], [0, -1, 0], { ...b, rot: 45 })).toBe(false)
  })
  it('counts sun hours, shading north of a wall at noon in the northern hemisphere', () => {
    const start = localMidnight('2024-12-21', 'Europe/London')
    const smp = daySamples(start, 51.5, 0, 15)
    const total = (smp.length * 15) / 60
    expect(total).toBeGreaterThan(7.25)
    expect(total).toBeLessThan(8.25)
    const wall = { x: 0, z: 0, w: 40, d: 1, h: 10, rot: 0 }
    const g = sunHoursGrid([wall], smp.map((s) => s.dir), 15, 20, 8)
    const north = g[1 * 8 + 4], south = g[6 * 8 + 4]
    expect(south).toBeCloseTo(total, 6)
    expect(north).toBeLessThan(1)
  })
})
