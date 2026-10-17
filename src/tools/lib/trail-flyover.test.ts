import { describe, expect, it } from 'vitest'
import { demoTrack } from './gpx-track-viewer'
import { along, bbox, decodeTerrarium, gridAt, gridFrom, projector, syntheticGrid, tileCover } from './trail-flyover'

describe('trail-flyover', () => {
  it('decodes terrarium pixels', () => {
    expect(decodeTerrarium(128, 0, 0)).toBe(0)
    expect(decodeTerrarium(134, 50, 128)).toBeCloseTo(1586.5)
  })
  it('bbox and tile cover', () => {
    const b = bbox(demoTrack().points)
    expect(b.maxLat).toBeGreaterThan(b.minLat)
    const c = tileCover(b, 16)
    expect((c.x1 - c.x0 + 1) * (c.y1 - c.y0 + 1)).toBeLessThanOrEqual(16)
    expect(c.z).toBeGreaterThanOrEqual(11)
  })
  it('grid bilinear lookup reproduces a plane', () => {
    const b = { minLat: 0, maxLat: 1, minLon: 0, maxLon: 1 }
    const g = gridFrom(b, 11, (lat, lon) => 100 * lat + 50 * lon)
    expect(gridAt(g, 0.33, 0.71)).toBeCloseTo(100 * 0.33 + 50 * 0.71, 6)
    expect(g.min).toBe(0)
    expect(g.max).toBe(150)
  })
  it('synthetic terrain follows the track elevation', () => {
    const t = demoTrack().points
    const g = syntheticGrid(t, bbox(t), 48)
    const errs = t.filter((_, i) => i % 40 === 0).map((p) => Math.abs(gridAt(g, p.lat, p.lon) - p.ele!))
    expect(Math.max(...errs)).toBeLessThan(120)
  })
  it('projection and path sampling', () => {
    const pr = projector({ minLat: 45, maxLat: 47, minLon: 6, maxLon: 8 })
    const [x, z] = pr(47, 7)
    expect(x).toBeCloseTo(0)
    expect(z).toBeCloseTo(-110540)
    expect(along([[0, 0], [10, 0], [10, 10]], [0, 10, 20], 15)).toEqual([10, 5])
  })
})
