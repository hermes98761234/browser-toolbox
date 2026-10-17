import { describe, expect, it } from 'vitest'
import { centroid, ellipsoidArea, fromGeoJSON, parseCoords, perimeter, quadArea, R_AUTHALIC, selfIntersects, sphereArea, toGeoJSON, vincenty, type LonLat } from './site-area-mapper'

const box = (lon: number, lat: number, d: number): LonLat[] => [[lon, lat], [lon + d, lat], [lon + d, lat + d], [lon, lat + d]]

describe('site area geodesy', () => {
  it('authalic radius matches WGS84', () => {
    expect(R_AUTHALIC).toBeCloseTo(6371007.181, 2)
  })
  it('whole-earth check: hemisphere band', () => {
    // Area between equator and the north pole = half the ellipsoid surface (5.10065622e14 m² / 2).
    expect(quadArea(0, 90, 360)).toBeCloseTo(5.10065621724e14 / 2, -7)
  })
  it('small parcels match the exact quadrangle area', () => {
    for (const lat of [0, 37.5, 60]) {
      const ring = box(10, lat, 0.001)
      const ref = quadArea(lat, lat + 0.001, 0.001)
      expect(Math.abs(ellipsoidArea(ring) / ref - 1)).toBeLessThan(1e-6)
    }
  })
  it('spherical (Turf-style) area differs by latitude', () => {
    const r = box(10, 60, 0.001)
    const diff = Math.abs(sphereArea(r) / ellipsoidArea(r) - 1)
    expect(diff).toBeGreaterThan(0.003)
    expect(diff).toBeLessThan(0.01)
  })
  it('orientation and closing vertex do not matter', () => {
    const r = box(-122.68, 45.52, 0.002)
    expect(ellipsoidArea([...r].reverse())).toBeCloseTo(ellipsoidArea(r), 6)
    expect(ellipsoidArea([...r, r[0]])).toBeCloseTo(ellipsoidArea(r), 6)
  })
  it('Vincenty reference (Flinders Peak → Buninyong)', () => {
    const p1: LonLat = [144 + 25 / 60 + 29.52440 / 3600, -(37 + 57 / 60 + 3.72030 / 3600)]
    const p2: LonLat = [143 + 55 / 60 + 35.38390 / 3600, -(37 + 39 / 60 + 10.15610 / 3600)]
    const r = vincenty(p1, p2)
    expect(r.dist).toBeCloseTo(54972.271, 2)
    expect(r.az1).toBeCloseTo(306 + 52 / 60 + 5.37 / 3600, 4)
  })
  it('perimeter of 1 km-ish square', () => {
    const r = box(0, 0, 0.01)
    expect(perimeter(r)).toBeCloseTo(2 * 1113.19 + 2 * 1105.74, -1)
  })
  it('validation and parsing', () => {
    expect(selfIntersects([[0, 0], [1, 1], [1, 0], [0, 1]])).toBe(true)
    expect(selfIntersects(box(0, 0, 1))).toBe(false)
    expect(parseCoords('45.5, -122.6\n45.6;-122.7\nbad')).toEqual([[-122.6, 45.5], [-122.7, 45.6]])
    expect(parseCoords('-122.6 45.5', true)).toEqual([[-122.6, 45.5]])
    const c = centroid(box(0, 0, 2))
    expect(c[0]).toBeCloseTo(1, 6)
    expect(c[1]).toBeCloseTo(1, 6)
  })
  it('GeoJSON round trip', () => {
    const g = toGeoJSON([{ id: 'a', name: 'Lot A', color: '#f00', ring: box(1, 1, 0.001) }])
    const back = fromGeoJSON(JSON.parse(JSON.stringify(g)))
    expect(back).toHaveLength(1)
    expect(back[0].name).toBe('Lot A')
    expect(back[0].ring).toHaveLength(4)
  })
})
