import { describe, expect, it } from 'vitest'
import { exposureScore, haversine, keptTiff, level, nearestCity, PRESETS, riskOf, tileXY } from './exif-metadata-stripper'
import { parseTiff, writeTiff } from './exif-viewer'

const src = parseTiff(
  writeTiff(
    [{ id: 0x010f, type: 2, value: 'Apple' }, { id: 0x0112, type: 3, value: [6] }, { id: 0x8298, type: 2, value: '© Jane' }],
    [{ id: 0x829a, type: 5, value: [[1, 250]] }, { id: 0xa431, type: 2, value: 'SN123' }],
    [{ id: 0x01, type: 2, value: 'N' }, { id: 0x02, type: 5, value: [[48, 1], [51, 1], [2958, 100]] }],
  ),
).filter((t) => !/Pointer$/.test(t.name))

describe('exif privacy', () => {
  it('rates risk', () => {
    expect(riskOf('GPSLatitude').risk).toBe('high')
    expect(riskOf('BodySerialNumber').risk).toBe('high')
    expect(riskOf('DateTimeOriginal').risk).toBe('medium')
    expect(riskOf('FNumber').risk).toBe('low')
  })
  it('scores', () => {
    expect(exposureScore(['GPSLatitude', 'GPSLongitude'], [], false)).toBe(40)
    expect(level(exposureScore(['FNumber', 'ISO'], [], false))).toBe('low')
  })
  it('rebuilds EXIF with only kept tags', () => {
    const keep = new Set(PRESETS.Photographer(src.map((t) => t.name)))
    const t = keptTiff(src, keep)!
    const names = parseTiff(t).map((x) => x.name).filter((n) => !/Pointer$/.test(n))
    expect(names.sort()).toEqual(['Copyright', 'ExposureTime', 'Orientation'])
    expect(parseTiff(t).find((x) => x.name === 'Orientation')!.value).toBe(6)
    expect(keptTiff(src, new Set())).toBeNull()
  })
  it('geography', () => {
    expect(haversine(51.507, -0.128, 48.857, 2.352)).toBeCloseTo(344, -1)
    const c = nearestCity(48.85, 2.29)
    expect(c.name).toBe('Paris')
    expect(c.km).toBeLessThan(6)
    const [x, y] = tileXY(0, 0, 1)
    expect([x, y]).toEqual([1, 1])
  })
})
