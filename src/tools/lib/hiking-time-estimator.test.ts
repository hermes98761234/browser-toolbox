import { describe, expect, it } from 'vitest'
import { profile, parseCsv } from './hike-elevation-profile'
import { clock, estimateLeg, estimateProfile, hm, langmuirAdj, naismithHours, parseClock, reverseProfile, toblerLeg, toblerTimeline, withBreaks } from './hiking-time-estimator'

describe('hiking time estimator', () => {
  it('Naismith: 1 h per 5 km plus 1 h per 600 m', () => {
    expect(naismithHours(10, 0)).toBe(2)
    expect(naismithHours(10, 600)).toBe(3)
    expect(naismithHours(8, 300, 4, 600)).toBeCloseTo(2.5, 9)
  })
  it('Langmuir: ±10 min per 300 m', () => {
    expect(langmuirAdj(300, 0)).toBeCloseTo(-1 / 6, 9)
    expect(langmuirAdj(0, 600)).toBeCloseTo(1 / 3, 9)
  })
  it('Tobler: flat 5 km/h-ish, uphill slower', () => {
    expect(toblerLeg(5, 0, 0)).toBeCloseTo(5 / (6 * Math.exp(-0.175)), 9)
    expect(toblerLeg(5, 500, 0)).toBeGreaterThan(toblerLeg(5, 0, 0))
    // leg split: 10 km, 500 up / 500 down → two 5 km sections at ±10 %
    const up = 5 / (6 * Math.exp(-3.5 * 0.15)), down = 5 / (6 * Math.exp(-3.5 * 0.05))
    expect(toblerLeg(10, 500, 500)).toBeCloseTo(up + down, 9)
  })
  it('manual leg estimate', () => {
    const e = estimateLeg({ distKm: 12, ascent: 900, descent: 900, steepFrac: 1, gentleFrac: 0 })
    expect(e.naismith).toBeCloseTo(12 / 5 + 1.5, 9)
    expect(e.langmuir).toBeCloseTo(e.naismith + 0.5, 9)
  })
  it('profile estimate and reverse direction', () => {
    const p = profile(parseCsv('km,ele\n0,100\n2,400\n4,700').pts, 0)
    const fwd = estimateProfile(p), back = estimateProfile(reverseProfile(p))
    expect(fwd.naismith).toBeCloseTo(4 / 5 + 1, 2)
    expect(back.naismith).toBeCloseTo(0.8, 2)
    expect(toblerTimeline(p).at(-1)).toBeCloseTo(fwd.tobler, 9)
  })
  it('breaks, formatting and clocks', () => {
    expect(withBreaks(4, 1.1, 5, 30).total).toBeCloseTo(4.4 + 4.4 * 5 / 60 + 0.5, 9)
    expect(hm(2.5)).toBe('2 h 30 min')
    expect(clock(25 * 60 + 5)).toBe('01:05')
    expect(parseClock('07:30')).toBe(450)
  })
})
