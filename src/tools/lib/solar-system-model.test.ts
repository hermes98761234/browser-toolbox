import { describe, expect, it } from 'vitest'
import { bodyRadius, centuries, dayLength, distAu, helio, lightMinutes, nextEvent, noonAltitude, orbitPoints, radial, scalePos, season, sunDec } from './solar-system-model'

const day = 86400000

describe('solar system model', () => {
  it('Earth at perihelion/aphelion distances', () => {
    expect(distAu(helio('Earth', centuries(Date.UTC(2026, 0, 3))))).toBeCloseTo(0.9833, 3)
    expect(distAu(helio('Earth', centuries(Date.UTC(2026, 6, 6))))).toBeCloseTo(1.0167, 3)
  })
  it('scaling keeps direction and compresses distance', () => {
    expect(radial(1, 'true')).toBe(10)
    expect(radial(30, 'visible')).toBeCloseTo(54.77, 2)
    const p = scalePos([3, 4, 0], 'visible')
    expect(p[0] / p[1]).toBeCloseTo(0.75)
    expect(bodyRadius(6371, 'true', 1)).toBeCloseTo(4.26e-4, 6)
  })
  it('orbit samples close on themselves', () => {
    const o = orbitPoints('Mars', Date.UTC(2026, 0, 1), 120)
    expect(distAu([o[0][0] - o[120][0], o[0][1] - o[120][1], o[0][2] - o[120][2]])).toBeLessThan(0.02)
  })
  it('seasons, declination and day length', () => {
    expect(sunDec(Date.UTC(2026, 5, 21, 8))).toBeCloseTo(23.44, 1)
    expect(Math.abs(sunDec(Date.UTC(2026, 2, 20, 14)))).toBeLessThan(0.1)
    expect(dayLength(0, 23.44)).toBeCloseTo(12, 6)
    expect(dayLength(50, 23.44)).toBeCloseTo(16.15, 2)
    expect(dayLength(70, 23.44)).toBe(24)
    expect(dayLength(70, -23.44)).toBe(0)
    expect(noonAltitude(50, 23.44)).toBeCloseTo(63.44)
    expect(season(Date.UTC(2026, 6, 1), 50)).toBe('Summer')
    expect(season(Date.UTC(2026, 6, 1), -34)).toBe('Winter')
  })
  it('next solstice within an hour of 2026-06-21 08:24 UTC', () => {
    const e = nextEvent(Date.UTC(2026, 4, 1))
    expect(e.name).toBe('June solstice')
    expect(Math.abs(e.t - Date.UTC(2026, 5, 21, 8, 24))).toBeLessThan(day / 24)
    expect(lightMinutes(1)).toBeCloseTo(8.317, 2)
  })
})
