import { describe, expect, it } from 'vitest'
import { acceptFix, bearing, fitView, haversine, loopRoute, niceScale, pathLength, project, thin, toGpx, toScreen } from './dog-walk-tracker'

describe('geo', () => {
  it('haversine and bearing', () => {
    expect(haversine([51.5007, -0.1246], [40.6892, -74.0445]) / 1000).toBeCloseTo(5574.8, 0) // Big Ben → Statue of Liberty
    expect(haversine([0, 0], [0, 1])).toBeCloseTo(111195, -1)
    expect(bearing([0, 0], [1, 0])).toBeCloseTo(0, 6)
    expect(bearing([0, 0], [0, 1])).toBeCloseTo(90, 6)
  })
  it('mercator', () => {
    expect(project([0, 0], 0)).toEqual([128, 128])
    const [x, y] = project([51.5, -0.12], 10)
    expect(Math.floor(x / 256)).toBe(511)
    expect(Math.floor(y / 256)).toBe(340)
  })
  it('fit view contains all points', () => {
    const pts = loopRoute([48.8584, 2.2945], 3, 2000)
    const v = fitView(pts, 800, 500)
    for (const p of pts) {
      const [sx, sy] = toScreen(p, v)
      expect(sx).toBeGreaterThanOrEqual(0)
      expect(sx).toBeLessThanOrEqual(800)
      expect(sy).toBeGreaterThanOrEqual(0)
      expect(sy).toBeLessThanOrEqual(500)
    }
    expect(pathLength(pts)).toBeGreaterThan(1850)
    expect(pathLength(pts)).toBeLessThan(2100)
  })
  it('filters jitter', () => {
    const a = { lat: 0, lon: 0, t: 0, acc: 5 }
    expect(acceptFix(a, { lat: 0, lon: 0.00001, t: 1000, acc: 5 })).toBe(false) // ~1 m
    expect(acceptFix(a, { lat: 0, lon: 0.0001, t: 5000, acc: 5 })).toBe(true) // ~11 m
    expect(acceptFix(a, { lat: 0, lon: 0.01, t: 5000, acc: 5 })).toBe(false) // 1.1 km in 5 s
    expect(acceptFix(a, { lat: 0, lon: 0.0001, t: 5000, acc: 80 })).toBe(false)
  })
  it('helpers', () => {
    expect(niceScale(730)).toBe(500)
    expect(niceScale(180)).toBe(100)
    expect(thin([1, 2, 3, 4, 5, 6, 7, 8, 9], 3)).toEqual([1, 5, 9])
    expect(toGpx('Walk', [{ lat: 1, lon: 2, t: 0 }])).toContain('<trkpt lat="1.000000" lon="2.000000">')
  })
})
