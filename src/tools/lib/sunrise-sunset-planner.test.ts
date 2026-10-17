import { describe, expect, it } from 'vitest'
import { dayInfo, phase, solarNoon, sunCore, sunPosition } from './sunrise-sunset-planner'

const utc = (s: string) => Date.parse(s + 'Z')
const near = (ms: number | null, ref: string, minutes = 2) => {
  expect(ms).not.toBeNull()
  expect(Math.abs(ms! - utc(ref)) / 60000).toBeLessThan(minutes)
}

describe('NOAA solar algorithm', () => {
  it('declination at the June solstice ≈ +23.44°, December ≈ −23.44°', () => {
    expect(sunCore(utc('2024-06-20T20:51:00')).decl).toBeCloseTo(23.44, 1)
    expect(sunCore(utc('2024-12-21T09:20:00')).decl).toBeCloseTo(-23.44, 1)
  })
  it('equation of time extremes (≈ +16.4 min early Nov, ≈ −14.2 min mid Feb)', () => {
    expect(sunCore(utc('2024-11-03T12:00:00')).eqTime).toBeCloseTo(16.4, 0)
    expect(sunCore(utc('2024-02-11T12:00:00')).eqTime).toBeCloseTo(-14.2, 0)
  })
  it('solar noon at Greenwich on 2024-11-03 ≈ 11:43:36 UTC', () => {
    near(solarNoon(utc('2024-11-03T00:00:00'), 0), '2024-11-03T11:43:36', 0.5)
  })
  it('New York, 2024-06-21: sunrise 05:25 EDT, sunset 20:31 EDT', () => {
    const d = dayInfo('2024-06-21', 40.7128, -74.006)
    near(d.sunrise, '2024-06-21T09:25:00')
    near(d.sunset, '2024-06-22T00:31:00')
    expect(d.noonElevation).toBeCloseTo(72.7, 0)
  })
  it('London, 2024-12-21: sunrise 08:04, sunset 15:54 GMT', () => {
    const d = dayInfo('2024-12-21', 51.5074, -0.1278)
    near(d.sunrise, '2024-12-21T08:04:00')
    near(d.sunset, '2024-12-21T15:54:00')
    expect(d.dayLength).toBeGreaterThan(7 * 60 + 45)
    expect(d.dayLength).toBeLessThan(7 * 60 + 53)
    // civil twilight ends ≈ 16:35
    near(d.civilDusk, '2024-12-21T16:35:00', 3)
  })
  it('Sydney, 2024-12-21: sunrise 05:41, sunset 20:05 AEDT', () => {
    const d = dayInfo('2024-12-21', -33.8688, 151.2093)
    near(d.sunrise, '2024-12-20T18:41:00')
    near(d.sunset, '2024-12-21T09:05:00')
  })
  it('polar night and midnight sun in Tromsø', () => {
    expect(dayInfo('2024-12-21', 69.6492, 18.9553).kind).toBe('polar-night')
    const s = dayInfo('2024-06-21', 69.6492, 18.9553)
    expect(s.kind).toBe('polar-day')
    expect(s.dayLength).toBe(1440)
  })
  it('position: sun near due south and high at noon in summer', () => {
    const p = sunPosition(solarNoon(utc('2024-06-21T00:00:00'), -74.006), 40.7128, -74.006)
    expect(p.azimuth).toBeGreaterThan(178)
    expect(p.azimuth).toBeLessThan(182)
    expect(phase(p.elevation)).toBe('day')
    expect(phase(-5)).toBe('civil')
    expect(phase(-20)).toBe('night')
  })
})
