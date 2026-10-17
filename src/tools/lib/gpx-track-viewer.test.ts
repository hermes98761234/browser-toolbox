import { describe, expect, it } from 'vitest'
import { demoTrack, fitZoom, haversine, lat2y, lon2x, parseGpx, simplify, toGpx, trackStats, x2lon, y2lat } from './gpx-track-viewer'

const GPX = `<?xml version="1.0"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <wpt lat="46.0" lon="7.0"><name>Hut &amp; café</name></wpt>
  <trk><name>Morning run</name>
    <trkseg>
      <trkpt lon="7.0" lat="46.0"><ele>100</ele><time>2024-01-01T10:00:00Z</time></trkpt>
      <trkpt lat="46.001" lon="7.0"><ele>110</ele><time>2024-01-01T10:01:00Z</time></trkpt>
    </trkseg>
    <trkseg>
      <trkpt lat="46.002" lon="7.0"><ele>104</ele><time>2024-01-01T10:02:00Z</time></trkpt>
    </trkseg>
  </trk>
  <rte><name>Plan</name><rtept lat="1" lon="2"/><rtept lat="1.1" lon="2"/></rte>
</gpx>`

describe('gpx-track-viewer', () => {
  it('parses tracks, routes and waypoints', () => {
    const g = parseGpx(GPX)
    expect(g.tracks.map((t) => t.name)).toEqual(['Morning run', 'Plan'])
    expect(g.tracks[0].points).toHaveLength(3)
    expect(g.tracks[0].points[0]).toEqual({ lat: 46, lon: 7, ele: 100, time: Date.UTC(2024, 0, 1, 10) })
    expect(g.wpts[0].name).toBe('Hut & café')
    expect(() => parseGpx('<kml/>')).toThrow()
  })
  it('measures distances', () => {
    // 0.001° of latitude ≈ 111.2 m
    expect(haversine({ lat: 46, lon: 7 }, { lat: 46.001, lon: 7 })).toBeCloseTo(111.19, 1)
    const s = trackStats(parseGpx(GPX).tracks[0].points)
    expect(s.distance).toBeCloseTo(222.4, 0)
    expect(s.duration).toBe(120)
    expect(s.gain).toBe(10)
    expect(s.loss).toBe(6)
    expect(s.avgMoving).toBeCloseTo(222.4 / 120, 2)
  })
  it('simplifies collinear points', () => {
    const pts = Array.from({ length: 11 }, (_, i) => ({ lat: 46 + i * 0.001, lon: 7 }))
    expect(simplify(pts, 1)).toHaveLength(2)
    const bent = [...pts, { lat: 46.01, lon: 7.01 }]
    expect(simplify(bent, 1)).toHaveLength(3)
  })
  it('round-trips through GPX export', () => {
    const t = demoTrack()
    const back = parseGpx(toGpx(t.name, t.points)).tracks[0]
    expect(back.name).toBe(t.name)
    expect(back.points).toHaveLength(t.points.length)
    expect(back.points[5].lat).toBeCloseTo(t.points[5].lat, 6)
    expect(back.points[5].time).toBe(t.points[5].time)
  })
  it('projects Web Mercator both ways', () => {
    expect(lon2x(0, 0)).toBe(128)
    expect(lat2y(0, 0)).toBeCloseTo(128, 9)
    expect(x2lon(lon2x(7.5, 12), 12)).toBeCloseTo(7.5, 9)
    expect(y2lat(lat2y(46.2, 12), 12)).toBeCloseTo(46.2, 9)
    expect(fitZoom(demoTrack().points, 800, 450)).toBeGreaterThanOrEqual(12)
  })
})
