import { describe, expect, it } from 'vitest'
import { bearingDistance, cardinal, fromMgrs, fromUtm, headingFromAlpha, parseAny, toDdm, toDms, toMgrs, toUtm } from './compass-and-coordinates'

describe('compass-and-coordinates', () => {
  it('converts to UTM', () => {
    const u = toUtm(40.689247, -74.044502)
    expect(u.zone).toBe(18)
    expect(u.band).toBe('T')
    expect(u.easting).toBeCloseTo(580735.64, 1)
    expect(u.northing).toBeCloseTo(4504700.38, 1)
    const z = toUtm(0, 0)
    expect(z.zone).toBe(31)
    expect(z.easting).toBeCloseTo(166021.44, 1)
    expect(z.northing).toBeCloseTo(0, 3)
    const s = toUtm(-33.8568, 151.2153)
    expect(s.zone).toBe(56)
    expect(s.hemi).toBe('S')
    expect(s.easting).toBeCloseTo(334900.57, 1)
    expect(s.northing).toBeCloseTo(6252288.75, 1)
    expect(toUtm(60, 5).zone).toBe(32)
    expect(toUtm(78, 15).zone).toBe(33)
  })
  it('round-trips UTM', () => {
    for (const [la, lo] of [[51.5007, -0.1246], [-22.95, -43.21], [64.1, -21.9], [-45, 170]]) {
      const u = toUtm(la, lo)
      const b = fromUtm(u.zone, u.hemi, u.easting, u.northing)
      expect(b.lat).toBeCloseTo(la, 7)
      expect(b.lon).toBeCloseTo(lo, 7)
    }
  })
  it('converts to and from MGRS', () => {
    expect(toMgrs(0, 0, 5, false)).toBe('31NAA6602100000')
    expect(toMgrs(40.689247, -74.044502)).toBe('18T WL 80735 04700')
    expect(toMgrs(38.8977, -77.0365, 5, false).slice(0, 5)).toBe('18SUJ')
    for (const [la, lo] of [[40.689247, -74.044502], [-33.8568, 151.2153], [51.5007, -0.1246], [-75, 10], [70, 25]]) {
      const p = fromMgrs(toMgrs(la, lo))!
      expect(p.lat).toBeCloseTo(la, 4)
      expect(p.lon).toBeCloseTo(lo, 4)
    }
    expect(fromMgrs('18TWL')).not.toBeNull()
    expect(fromMgrs('hello')).toBeNull()
  })
  it('formats and parses DMS', () => {
    expect(toDms(40.689247, true)).toBe('40°41′21.3″N')
    expect(toDms(-74.044502, false)).toBe('74°02′40.2″W')
    expect(toDdm(-74.5, false, 3)).toBe('74°30.000′W')
    const p = parseAny('40°41′21.3″N, 74°02′40.2″W')!
    expect(p.lat).toBeCloseTo(40.68925, 4)
    expect(p.lon).toBeCloseTo(-74.04450, 4)
    expect(parseAny('51.5, -0.12')).toEqual({ lat: 51.5, lon: -0.12 })
    expect(parseAny('51.5 -0.12')).toEqual({ lat: 51.5, lon: -0.12 })
    const u = parseAny('18T 580735.64 4504700.38')!
    expect(u.lat).toBeCloseTo(40.68925, 4)
    expect(parseAny('95, 10')).toBeNull()
  })
  it('compass helpers', () => {
    expect(cardinal(0)).toBe('N')
    expect(cardinal(350)).toBe('N')
    expect(cardinal(225)).toBe('SW')
    expect(headingFromAlpha(90)).toBe(270)
    const bd = bearingDistance(51.5007, -0.1246, 48.8584, 2.2945)
    expect(bd.distance / 1000).toBeCloseTo(340.6, 0)
    expect(bd.bearing).toBeGreaterThan(145)
    expect(bd.bearing).toBeLessThan(150)
  })
})
