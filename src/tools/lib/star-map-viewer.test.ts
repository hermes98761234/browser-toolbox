import { describe, expect, it } from 'vitest'
import { catalogue, formatDec, formatRA, lookDirection, nearestConstellation, search, separation } from './star-map-viewer'

describe('star-map-viewer', () => {
  it('formats coordinates', () => {
    expect(formatRA(101.2875)).toBe('6h 45m 09s') // Sirius
    expect(formatDec(-16.7161)).toBe('−16° 43′')
    expect(formatDec(89.264)).toBe('+89° 16′')
  })
  it('computes angular separation', () => {
    expect(separation(0, 0, 90, 0)).toBeCloseTo(90)
    expect(separation(10, 89.9, 190, 89.9)).toBeCloseTo(0.2, 3)
    // Dubhe–Merak ≈ 5.4°
    expect(separation(165.93, 61.75, 165.46, 56.38)).toBeCloseTo(5.37, 1)
  })
  it('finds the constellation of a star', () => {
    expect(nearestConstellation({ ra: 88.79, dec: 7.41 }).name).toBe('Orion') // Betelgeuse
    expect(nearestConstellation({ ra: 279.23, dec: 38.78 }).name).toBe('Lyra') // Vega
  })
  it('turns phone orientation into a viewing direction', () => {
    const north = lookDirection(0, 90, 0)
    expect(north.alt).toBeCloseTo(0)
    expect(north.az).toBeCloseTo(0)
    expect(lookDirection(90, 90, 0).az).toBeCloseTo(270) // alpha counter-clockwise: top points west
    expect(lookDirection(0, 135, 0).alt).toBeCloseTo(45) // tilted back, looking up
    expect(lookDirection(0, 0, 0).alt).toBeCloseTo(-90) // flat on a table, camera looks down
  })
  it('searches the catalogue', () => {
    const cat = catalogue()
    expect(search(cat, 'sir')[0].name).toBe('Sirius')
    expect(search(cat, 'major').map((o) => o.name)).toContain('Ursa Major')
    expect(search(cat, '')).toEqual([])
  })
})
