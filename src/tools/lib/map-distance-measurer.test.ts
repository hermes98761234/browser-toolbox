import { describe, expect, it } from 'vitest'
import { bearing, circle, compass, destination, finalBearing, fmtDist, fmtDur, greatCirclePath, haversine, legs, linesFromGeoJSON, rhumbBearing, rhumbDistance, toGeoJSON, toGpx, type LonLat } from './map-distance-measurer'

const LHR: LonLat = [-0.4614, 51.4775], JFK: LonLat = [-73.7781, 40.6413]

describe('spherical route maths', () => {
  it('great-circle distance and bearings London → New York', () => {
    expect(haversine(LHR, JFK) / 1000).toBeCloseTo(5539, -1)
    expect(bearing(LHR, JFK)).toBeCloseTo(288.1, 0)
    expect(finalBearing(LHR, JFK)).toBeGreaterThan(220)
    expect(finalBearing(LHR, JFK)).toBeLessThan(270)
  })
  it('rhumb line is longer than the great circle and has constant bearing', () => {
    const r = rhumbDistance(LHR, JFK)
    expect(r).toBeGreaterThan(haversine(LHR, JFK))
    expect(r / 1000).toBeCloseTo(5794, -2)
    expect(rhumbBearing([0, 0], [1, 0])).toBeCloseTo(90, 6)
    expect(rhumbDistance([0, 10], [0, 11])).toBeCloseTo(haversine([0, 10], [0, 11]), 3)
  })
  it('destination point inverts distance + bearing', () => {
    const p = destination(LHR, 45, 100000)
    expect(haversine(LHR, p)).toBeCloseTo(100000, 0)
    expect(bearing(LHR, p)).toBeCloseTo(45, 4)
    const c = circle([10, 50], 5000, 36)
    expect(c).toHaveLength(36)
    c.forEach((q) => expect(haversine([10, 50], q)).toBeCloseTo(5000, 3))
  })
  it('great-circle path stays on the circle', () => {
    const path = greatCirclePath(LHR, JFK, 10)
    expect(path[0][0]).toBeCloseTo(LHR[0], 6)
    expect(path[10][1]).toBeCloseTo(JFK[1], 6)
    expect(path[5][1]).toBeGreaterThan(51.5) // bows north of both ends
    expect(greatCirclePath([0, 0], [0.01, 0])).toHaveLength(2)
  })
  it('legs accumulate', () => {
    const l = legs([[0, 0], [0, 1], [1, 1]], 'gc')
    expect(l).toHaveLength(2)
    expect(l[1].cum).toBeCloseTo(l[0].d + l[1].d, 6)
    expect(compass(l[0].brg)).toBe('N')
    expect(compass(l[1].brg)).toBe('E')
  })
  it('formats and converts', () => {
    expect(fmtDist(850, 'km')).toBe('850 m')
    expect(fmtDist(12345, 'km')).toBe('12.3 km')
    expect(fmtDist(1852, 'nmi')).toBe('1.00 nmi')
    expect(fmtDur(1.5)).toBe('1 h 30 min')
    expect(fmtDur(0.25)).toBe('15 min')
    const gj = toGeoJSON([{ name: 'A', pts: [[0, 0], [1, 1]] }], [{ c: [0, 0], r: 1000 }], 'gc')
    expect(linesFromGeoJSON(gj)[0].pts).toEqual([[0, 0], [1, 1]])
    expect(toGpx([{ name: 'A&B', pts: [[0, 0], [1, 1]] }])).toContain('<name>A&amp;B</name>')
  })
})
