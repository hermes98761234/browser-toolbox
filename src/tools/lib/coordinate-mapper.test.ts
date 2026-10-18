import { describe, expect, it } from 'vitest'
import { bbox, colorOf, colorScale, detect, gridCluster, parseCoord, toGeoJSON, toPoints } from './coordinate-mapper'

describe('parseCoord', () => {
  it('reads decimal, DMS and DDM, checking the axis', () => {
    expect(parseCoord('48.8566', true)).toBe(48.8566)
    expect(parseCoord(`48°51'24"N`, true)).toBeCloseTo(48.8567, 4)
    expect(parseCoord('2 21 7.9 E', false)).toBeCloseTo(2.3522, 4)
    expect(parseCoord(`33°52.1'S`, true)).toBeCloseTo(-33.8683, 4)
    expect(parseCoord('151,2093', false)).toBeCloseTo(151.2093, 4)
    expect(parseCoord('10 E', true)).toBeNull()
    expect(parseCoord('95', true)).toBeNull()
    expect(parseCoord('', true)).toBeNull()
  })
})

describe('detect', () => {
  it('uses header names', () => {
    expect(detect(['Name', 'Latitude', 'Longitude'], [['a', '1.5', '2.5']])).toEqual({ lat: 1, lon: 2, combined: -1 })
    expect(detect(['id', 'lng', 'lat'], [['1', '30.52', '50.45']])).toEqual({ lat: 2, lon: 1, combined: -1 })
  })
  it('finds a combined column', () => {
    expect(detect(['Place', 'Coordinates'], [['x', '50.45, 30.52'], ['y', `40°42'46"N 74°0'21"W`]])).toEqual({ lat: -1, lon: -1, combined: 1 })
  })
  it('falls back to content, ignoring integer columns', () => {
    const rows = [['Kyiv', '2950000', '50.4501', '30.5234'], ['Lviv', '717000', '49.8397', '24.0297']]
    expect(detect(['City', 'Pop', 'A', 'B'], rows)).toEqual({ lat: 2, lon: 3, combined: -1 })
  })
})

describe('points and clusters', () => {
  const rows = [['P', '48.85', '2.35'], ['Q', 'bad', '2.3'], ['R', '48.86', '2.36'], ['S', '-33.87', '151.21'], ['T', '0', '0']]
  it('converts rows and reports unreadable ones', () => {
    const { pts, bad } = toPoints(rows, { lat: 1, lon: 2, combined: -1 })
    expect(pts.map((p) => p.row)).toEqual([0, 2, 3])
    expect(bad).toEqual([1, 4])
    expect(bbox(pts)).toEqual({ s: -33.87, n: 48.86, w: 2.35, e: 151.21 })
  })
  it('clusters nearby points at low zoom and separates them at high zoom', () => {
    const { pts } = toPoints(rows, { lat: 1, lon: 2, combined: -1 })
    const low = gridCluster(pts, 3, 60)
    expect(low).toHaveLength(2)
    const big = low.find((c) => c.members.length === 2)!
    expect(big.lat).toBeCloseTo(48.855, 3)
    expect(gridCluster(pts, 14, 60)).toHaveLength(3)
  })
})

describe('colour and export', () => {
  it('builds categorical and numeric scales', () => {
    const rows = [['a', '1'], ['b', '5'], ['a', '9'], ['c', '3'], ['d', '4'], ['e', '6'], ['f', '7'], ['g', '8']]
    const cat = colorScale(rows, 0)
    expect(cat.kind === 'cat' && cat.values[0]).toBe('a')
    expect(colorOf(cat, 'a', ['#111', '#222'])).toBe('#111')
    const n = colorScale(rows, 1)
    expect(n).toEqual({ kind: 'num', min: 1, max: 9 })
    expect(colorOf(n, '1', [])).toBe('#440154')
    expect(colorOf(n, '9', [])).toBe('#fde725')
  })
  it('writes GeoJSON with lon,lat order and typed properties', () => {
    const g = JSON.parse(toGeoJSON(['Name', 'Lat', 'Lon', 'Pop'], [['Kyiv', '50.45', '30.52', '2950000']], [{ lat: 50.45, lon: 30.52, row: 0 }], [1, 2]))
    expect(g.features[0].geometry.coordinates).toEqual([30.52, 50.45])
    expect(g.features[0].properties).toEqual({ Name: 'Kyiv', Pop: 2950000 })
  })
})
