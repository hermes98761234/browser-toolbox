import { describe, expect, it } from 'vitest'
import { climb, haversine, naismith, parseCsv, parseGpx, profile, sampleGpx, tobler } from './hike-elevation-profile'

describe('hike elevation profile', () => {
  it('haversine: 1° of latitude ≈ 111.2 km', () => {
    expect(haversine({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(111195, -1)
  })
  it('parses GPX track points incl. self-closing and missing ele', () => {
    const r = parseGpx('<gpx><trk><name>Test</name><trkseg><trkpt lat="46" lon="8"><ele>100</ele></trkpt><trkpt lon="8.001" lat="46.001"/><trkpt lat=\'46.002\' lon=\'8.002\'><ele>130</ele><time>2026-01-01T10:00:00Z</time></trkpt></trkseg></trk></gpx>')
    expect(r.name).toBe('Test')
    expect(r.pts.map((p) => p.ele)).toEqual([100, 100, 130])
    expect(r.pts[2].time).toBe(Date.parse('2026-01-01T10:00:00Z'))
  })
  it('climb with hysteresis ignores noise', () => {
    expect(climb([100, 101, 100, 101, 100, 150, 149, 150, 120], 3)).toEqual({ gain: 50, loss: 30 })
  })
  it('Naismith: 10 km flat = 2 h; +600 m = +1 h', () => {
    const flat = profile(parseCsv('km,ele\n0,100\n5,100\n10,100').pts, 0)
    expect(naismith(flat).hours).toBeCloseTo(2, 2)
    const up = profile(parseCsv('km,ele\n0,100\n5,400\n10,700').pts, 0)
    expect(naismith(up).hours).toBeCloseTo(3, 1)
  })
  it('Tobler peaks at 6 km/h on a −5% slope, ~5 km/h flat', () => {
    expect(tobler(-0.05)).toBeCloseTo(6)
    expect(tobler(0)).toBeCloseTo(5.04, 2)
  })
  it('sample route parses into a sensible loop', () => {
    const p = profile(parseGpx(sampleGpx()).pts)
    expect(p.length).toBe(401)
    expect(p[p.length - 1].d / 1000).toBeGreaterThan(8)
  })
})
