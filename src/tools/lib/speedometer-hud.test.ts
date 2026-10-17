import { describe, expect, it } from 'vitest'
import { addFix, bearing, compass, emptyTrip, FACTOR, haversine } from './speedometer-hud'

describe('speedometer', () => {
  it('distance and bearing', () => {
    expect(haversine(0, 0, 0, 1)).toBeCloseTo(111195, -1) // 1° of longitude at the equator
    expect(haversine(51.5007, -0.1246, 40.6892, -74.0445) / 1000).toBeCloseTo(5575, -1)
    expect(bearing(0, 0, 1, 0)).toBeCloseTo(0)
    expect(bearing(0, 0, 0, 1)).toBeCloseTo(90)
    expect(compass(350)).toBe('N')
    expect(compass(225)).toBe('SW')
  })
  it('units', () => {
    expect(10 * FACTOR.kmh).toBe(36)
    expect(10 * FACTOR.mph).toBeCloseTo(22.369, 2)
  })
  it('derives speed from fixes when Doppler speed is missing', () => {
    let t = emptyTrip()
    t = addFix(t, { lat: 0, lon: 0, t: 0, speed: null, acc: 5, heading: null })
    // ~111.2 m north in 10 s → 11.1 m/s
    t = addFix(t, { lat: 0.001, lon: 0, t: 10000, speed: null, acc: 5, heading: null }, 1)
    expect(t.speed).toBeCloseTo(11.12, 1)
    expect(t.dist).toBeCloseTo(111.2, 0)
    expect(t.heading).toBeCloseTo(0)
    // jitter inside accuracy radius while parked
    const j = addFix(t, { lat: 0.00101, lon: 0, t: 11000, speed: null, acc: 20, heading: null }, 1)
    expect(j.speed).toBe(0)
  })
  it('prefers Doppler speed', () => {
    let t = addFix(emptyTrip(), { lat: 0, lon: 0, t: 0, speed: 20, acc: 5, heading: 90 })
    t = addFix(t, { lat: 0, lon: 0.002, t: 10000, speed: 22, acc: 5, heading: 90 }, 1)
    expect(t.speed).toBe(22)
    expect(t.max).toBe(22)
  })
})
