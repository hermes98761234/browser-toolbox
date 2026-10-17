import { describe, expect, it } from 'vitest'
import { dcTaper, fmtDuration, kwh100kmToMiPerKwh, miPerKwhToKwh100km, powerAt, simulate } from './ev-charging-calculator'

const base = { battery: 60, from: 20, to: 80, charger: 7.4, kind: 'ac' as const, onboardAc: 11, dcPeak: 150, loss: 10 }

describe('ev-charging-calculator', () => {
  it('AC session is energy / (power × efficiency)', () => {
    const r = simulate(base)
    expect(r.battery).toBeCloseTo(36)
    expect(r.grid).toBeCloseTo(40)
    expect(r.minutes / 60).toBeCloseTo(36 / (7.4 * 0.9), 3)
  })
  it('onboard charger caps AC power', () => {
    expect(powerAt({ ...base, charger: 22, onboardAc: 11 }, 50)).toBe(11)
  })
  it('DC tapers after 50 %', () => {
    expect(dcTaper(30)).toBe(1)
    expect(dcTaper(80)).toBeCloseTo(0.42)
    const dc = { ...base, kind: 'dc' as const, charger: 350, loss: 5 }
    const fast = simulate({ ...dc, from: 10, to: 50 })
    const slow = simulate({ ...dc, from: 50, to: 90 })
    expect(slow.minutes).toBeGreaterThan(fast.minutes * 1.5)
    expect(powerAt(dc, 30)).toBe(150)
    expect(powerAt({ ...dc, charger: 50 }, 30)).toBe(50)
  })
  it('units and formatting', () => {
    expect(miPerKwhToKwh100km(kwh100kmToMiPerKwh(16))).toBeCloseTo(16)
    expect(kwh100kmToMiPerKwh(16)).toBeCloseTo(3.88, 2)
    expect(fmtDuration(125)).toBe('2 h 05 min')
    expect(fmtDuration(42)).toBe('42 min')
  })
})
