import { describe, expect, it } from 'vitest'
import { balance, CLIMATES, CROPS, doy, esat, et0, hargreaves, kcOn, seasonLength, solar, synthWeather, windAt2m } from './irrigation-scheduler'

describe('FAO-56 reference values', () => {
  it('saturation vapour pressure (Annex 2)', () => {
    expect(esat(20)).toBeCloseTo(2.338, 3)
    expect(esat(35)).toBeCloseTo(5.623, 3)
  })
  it('Example 8/9: Ra and N at 20°S on 3 September', () => {
    const { Ra, N } = solar(-20, 246)
    expect(Ra).toBeCloseTo(32.2, 1)
    expect(N).toBeCloseTo(11.7, 1)
  })
  it('Example 14: wind 3.2 m/s at 10 m → 2.4 m/s at 2 m', () => {
    expect(windAt2m(3.2, 10)).toBeCloseTo(2.4, 1)
  })
  it('Example 18: Uccle, 6 July → ET0 ≈ 3.9 mm/day', () => {
    const J = doy('2024-07-06') - 1 // 2024 is a leap year; FAO uses J = 187
    expect(J).toBe(187)
    const r = et0({ tmax: 21.5, tmin: 12.3, rhmax: 84, rhmin: 63, u2: windAt2m(10 / 3.6, 10), sun: 9.25 }, 50.8, 100, 187)
    expect(r.method).toBe('Penman–Monteith')
    expect(r.Ra).toBeCloseTo(41.09, 1)
    expect(r.Rs).toBeCloseTo(22.07, 1)
    expect(r.ea).toBeCloseTo(1.409, 2)
    expect(r.Rn).toBeCloseTo(13.28, 1)
    expect(r.et0).toBeCloseTo(3.9, 1)
  })
  it('Hargreaves fallback when humidity is missing', () => {
    const r = et0({ tmax: 21.5, tmin: 12.3 }, 50.8, 100, 187)
    expect(r.method).toBe('Hargreaves')
    expect(r.et0).toBeCloseTo(hargreaves(21.5, 12.3, r.Ra))
    expect(r.et0).toBeCloseTo(4.06, 1)
  })
})

describe('crop coefficients and water balance', () => {
  const tomato = CROPS[0]
  it('Kc curve', () => {
    expect(kcOn(tomato, 0)).toBe(0.6)
    expect(kcOn(tomato, 50)).toBeCloseTo(0.6 + (20 / 40) * 0.55)
    expect(kcOn(tomato, 80)).toBe(1.15)
    expect(kcOn(tomato, seasonLength(tomato))).toBe(0.8)
  })
  it('irrigates at the allowed depletion and refills to field capacity', () => {
    const days = Array.from({ length: 10 }, () => ({ et0: 5, rain: 0, kc: 1 }))
    const rows = balance(days, { taw: 100, p: 0.5, mad: 0.5, eff: 0.8, startDepl: 0 })
    expect(rows[8].depl).toBe(45)
    expect(rows[9].irrNet).toBe(50)
    expect(rows[9].irrGross).toBeCloseTo(62.5)
    expect(rows[9].depl).toBe(0)
  })
  it('rain reduces depletion, excess percolates, stress lowers ET', () => {
    const r = balance([{ et0: 4, rain: 30, kc: 1 }], { taw: 100, p: 0.5, mad: 0.9, eff: 1, startDepl: 10 })
    expect(r[0].dp).toBeCloseTo(16)
    expect(r[0].depl).toBe(0)
    const st = balance([{ et0: 4, rain: 0, kc: 1 }], { taw: 100, p: 0.5, mad: 0.95, eff: 1, startDepl: 75 })
    expect(st[0].ks).toBeCloseTo(0.5)
    expect(st[0].etc).toBeCloseTo(2)
  })
  it('synthetic weather is stable and plausible', () => {
    const w = synthWeather(CLIMATES[0], '2025-04-01', 120, 40)
    expect(w).toHaveLength(120)
    expect(w[0]).toEqual(synthWeather(CLIMATES[0], '2025-04-01', 1, 40)[0])
    expect(w.every((d) => d.tmax > d.tmin - 5)).toBe(true)
  })
})
