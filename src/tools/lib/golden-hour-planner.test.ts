import { describe, expect, it } from 'vitest'
import { compass, dayEvents, hhmm, localMidnight, moonIllumination, sunPosition, tzOffset } from './golden-hour-planner'

const min = (a: string) => { const [h, m] = a.split(':').map(Number); return h * 60 + m }

describe('golden hour planner', () => {
  it('handles time zones', () => {
    expect(tzOffset('Europe/London', Date.UTC(2024, 5, 21, 12))).toBe(60)
    expect(tzOffset('America/New_York', Date.UTC(2024, 0, 10, 12))).toBe(-300)
    expect(localMidnight('2024-06-21', 'Europe/London')).toBe(Date.UTC(2024, 5, 20, 23))
  })
  it('matches published London sunrise/sunset on the June solstice', () => {
    const e = dayEvents(localMidnight('2024-06-21', 'Europe/London'), 51.5074, -0.1278)
    expect(Math.abs(min(hhmm(e.sunrise, 'Europe/London')) - min('04:43'))).toBeLessThanOrEqual(2)
    expect(Math.abs(min(hhmm(e.sunset, 'Europe/London')) - min('21:21'))).toBeLessThanOrEqual(2)
    expect(e.noonAlt).toBeCloseTo(90 - 51.5074 + 23.44, 0)
    expect(e.eveningGolden![0]).toBeLessThan(e.sunset!)
    expect(e.eveningBlue![0]).toBeGreaterThan(e.sunset!)
  })
  it('puts the sun due south at solar noon in the northern hemisphere', () => {
    const e = dayEvents(localMidnight('2024-03-20', 'UTC'), 40, 0)
    expect(sunPosition(e.noon, 40, 0).az).toBeGreaterThan(170)
    expect(sunPosition(e.noon, 40, 0).az).toBeLessThan(190)
  })
  it('knows a full moon', () => {
    expect(moonIllumination(Date.UTC(2024, 0, 25, 18)).fraction).toBeGreaterThan(0.98)
    expect(compass(92)).toBe('E')
  })
})
