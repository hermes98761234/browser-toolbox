import { describe, expect, it } from 'vitest'
import { haversine, hhmm, ics, parseCoords, timeline, travelMin } from './itinerary-planner'

describe('itinerary-planner', () => {
  it('haversine', () => {
    // Paris → London ≈ 343.5 km
    expect(haversine({ lat: 48.8566, lon: 2.3522 }, { lat: 51.5074, lon: -0.1278 })).toBeCloseTo(343.5, 0)
  })
  it('travel time', () => {
    expect(travelMin(0, 'walk')).toBe(0)
    // 1.5 km walk × 1.3 / 4.5 km/h = 26 min → 30
    expect(travelMin(1.5, 'walk')).toBe(30)
  })
  it('timeline and format', () => {
    const t = timeline([{ id: 'a', name: 'A', lat: 0, lon: 0, stay: 60 }, { id: 'b', name: 'B', lat: 0, lon: 0.01, stay: 30 }], 540, 'walk')
    expect(t[0].arrive).toBe(540)
    expect(t[1].arrive).toBe(600 + t[1].travel)
    expect(hhmm(545)).toBe('09:05')
    expect(hhmm(1500)).toBe('01:00 +1d')
  })
  it('coords parsing', () => {
    expect(parseCoords('41.8902, 12.4922')).toEqual({ lat: 41.8902, lon: 12.4922 })
    expect(parseCoords('https://www.google.com/maps/@41.9,12.45,15z')).toEqual({ lat: 41.9, lon: 12.45 })
    expect(parseCoords('https://www.openstreetmap.org/#map=17/41.89/12.49')).toEqual({ lat: 41.89, lon: 12.49 })
    expect(parseCoords('nowhere')).toBeNull()
  })
  it('ics', () => {
    const t = timeline([{ id: 'a', name: 'Colosseum, Rome', lat: 41.89, lon: 12.49, stay: 90 }], 540, 'walk')
    const s = ics('Rome', '2026-05-01', [t])
    expect(s).toContain('DTSTART:20260501T090000')
    expect(s).toContain('DTEND:20260501T103000')
    expect(s).toContain('SUMMARY:Colosseum\\, Rome')
  })
})
