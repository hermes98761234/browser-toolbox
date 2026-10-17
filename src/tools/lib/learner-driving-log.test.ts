import { describe, expect, it } from 'vitest'
import { dayNight, hm, progress, type Session } from './learner-driving-log'

// Chicago, 2024-06-21: sunset ≈ 20:29 CDT = 01:29 UTC (June 22).
const LAT = 41.88, LON = -87.63

describe('learner-driving-log', () => {
  it('classifies a midday drive as day', () => {
    const s = Date.UTC(2024, 5, 21, 17, 0) // 12:00 CDT
    expect(dayNight(s, s + 3600000, LAT, LON)).toEqual({ day: 60, night: 0 })
  })
  it('classifies a midnight drive as night', () => {
    const s = Date.UTC(2024, 5, 22, 5, 0) // 00:00 CDT
    expect(dayNight(s, s + 45 * 60000, LAT, LON)).toEqual({ day: 0, night: 45 })
  })
  it('splits a drive across sunset', () => {
    const s = Date.UTC(2024, 5, 22, 1, 0) // 20:00 CDT
    const r = dayNight(s, s + 60 * 60000, LAT, LON)
    expect(r.day + r.night).toBe(60)
    expect(r.day).toBeGreaterThanOrEqual(27)
    expect(r.day).toBeLessThanOrEqual(32)
  })
  it('sums progress against a requirement', () => {
    const S = (day: number, night: number): Session => ({ id: '', start: 0, end: 0, supervisor: '', road: '', weather: '', km: 10, notes: '', day, night })
    const p = progress([S(600, 0), S(30, 90)], { total: 50, night: 10 })
    expect(p.total).toBe(720)
    expect(p.totalLeft).toBe(2280)
    expect(p.nightLeft).toBe(510)
    expect(p.km).toBe(20)
    expect(hm(125)).toBe('2h 05m')
  })
})
