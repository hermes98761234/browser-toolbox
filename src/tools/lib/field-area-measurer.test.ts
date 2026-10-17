import { describe, expect, it } from 'vitest'
import { haversine, perimeter, project, R_AREA, ringArea, ringFromGeoJSON, toGeoJSON, unproject, type LonLat } from './field-area-measurer'

describe('field area', () => {
  it('matches the analytic area of a lat/lon rectangle', () => {
    const ring: LonLat[] = [[0, 0], [1, 0], [1, 1], [0, 1]]
    const exact = R_AREA * R_AREA * (Math.PI / 180) * Math.sin(Math.PI / 180)
    expect(ringArea(ring)).toBeCloseTo(exact, 0)
    expect(ringArea([...ring, ring[0]])).toBeCloseTo(exact, 0) // closed ring same result
    expect(ringArea([[0, 0], [1, 0]])).toBe(0)
  })
  it('measures a ~100 m square at mid latitude as ~1 ha', () => {
    const lat = 50, dLat = 100 / 111194.9, dLon = dLat / Math.cos((lat * Math.PI) / 180)
    const ring: LonLat[] = [[30, lat], [30 + dLon, lat], [30 + dLon, lat + dLat], [30, lat + dLat]]
    expect(ringArea(ring) / 10000).toBeCloseTo(1, 1)
    expect(perimeter(ring)).toBeCloseTo(400, -1)
  })
  it('haversine: 1° of latitude ≈ 111.195 km', () => {
    expect(haversine([0, 0], [0, 1])).toBeCloseTo(111195, -1)
  })
  it('projects and unprojects web mercator', () => {
    const p: LonLat = [-100.86, 37.97]
    const [lon, lat] = unproject(project(p, 15), 15)
    expect(lon).toBeCloseTo(p[0], 9)
    expect(lat).toBeCloseTo(p[1], 9)
    expect(project([0, 0], 0)).toEqual([128, 128])
  })
  it('round-trips GeoJSON', () => {
    const ring: LonLat[] = [[1, 1], [2, 1], [2, 2]]
    expect(ringFromGeoJSON(toGeoJSON(ring, 'x'))).toEqual(ring)
    expect(ringFromGeoJSON({ type: 'FeatureCollection', features: [toGeoJSON(ring, 'x')] })).toEqual(ring)
  })
})
