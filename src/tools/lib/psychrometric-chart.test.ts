import { describe, expect, it } from 'vitest'
import { pws, wsat, wFromRh, enthalpy, specVolume, wetBulb, pressureAt, mix, wFromWb, stateFrom } from './psychrometric-chart'

describe('psychrometrics (ASHRAE Fundamentals table 2/3 values)', () => {
  it('saturation pressure', () => {
    expect(pws(0)).toBeCloseTo(0.6112, 3)
    expect(pws(20)).toBeCloseTo(2.3392, 3)
    expect(pws(40)).toBeCloseTo(7.3849, 2)
    expect(pws(-20)).toBeCloseTo(0.10326, 4)
  })
  it('saturation humidity ratio at 101.325 kPa', () => {
    expect(wsat(20, 101.325)).toBeCloseTo(0.014758, 4)
    expect(wsat(30, 101.325)).toBeCloseTo(0.027329, 4)
  })
  it('enthalpy and volume', () => {
    // ASHRAE table 2, 20 °C saturated: h = 57.55 kJ/kg, v = 0.8497 m3/kg
    const W = wsat(20, 101.325)
    expect(enthalpy(20, W)).toBeCloseTo(57.55, 0)
    expect(specVolume(20, W, 101.325)).toBeCloseTo(0.8497, 2)
  })
  it('ASHRAE Fundamentals ch.1 example 2: 40 °C db, 20 °C wb at 101.325 kPa', () => {
    const W = wFromWb(40, 20, 101.325)
    expect(W).toBeCloseTo(0.00646, 4)
    expect(wetBulb(40, W, 101.325)).toBeCloseTo(20, 2)
    const s = stateFrom(40, W, 101.325)
    expect(s.tdp).toBeCloseTo(7.3, 0) // textbook ≈ 7.0 °C
    expect(s.rh).toBeCloseTo(0.14, 2)
    expect(s.h).toBeCloseTo(56.7, 0)
    expect(s.v).toBeCloseTo(0.896, 2)
  })
  it('round trip RH', () => {
    const W = wFromRh(25, 0.5, 101.325)
    expect(stateFrom(25, W, 101.325).rh).toBeCloseTo(0.5, 6)
  })
  it('altitude pressure', () => {
    expect(pressureAt(0)).toBeCloseTo(101.325, 3)
    expect(pressureAt(1500)).toBeCloseTo(84.556, 1)
  })
  it('mixing conserves mass and energy', () => {
    const a = { t: 30, W: 0.015 }, b = { t: 20, W: 0.008 }
    const m = mix(a, 1, b, 3)
    expect(m.W).toBeCloseTo(0.00975, 6)
    expect(enthalpy(m.t, m.W)).toBeCloseTo((enthalpy(30, 0.015) + 3 * enthalpy(20, 0.008)) / 4, 6)
  })
})
