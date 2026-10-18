import { describe, expect, it } from 'vitest'
import { ACTIVITIES, annualKwh, electricTankless, firstHourRating, FIXTURES, heatBtuh, hotFraction, maxFlow, mixingBoost, peakHourDemand, recommendTank, recoveryGph, tanklessFlow, tankSpec } from './water-heater-sizer'

describe('water heater sizer', () => {
  it('mixing fraction', () => {
    expect(hotFraction(105, 50, 120)).toBeCloseTo(55 / 70, 10)
    expect(hotFraction(130, 50, 120)).toBe(1)
  })
  it('tankless power: 500 × gpm × ΔT', () => {
    expect(heatBtuh(1, 1)).toBeCloseTo(500.4, 6)
    expect(heatBtuh(4, 70)).toBeCloseTo(140112, 0)
    expect(maxFlow(199000, 70, 0.95)).toBeCloseTo((199000 * 0.95) / (500.4 * 70), 6)
    // 3 gpm, 60 °F rise → ~26.6 kW, ~111 A at 240 V
    const e = electricTankless(3, 60)
    expect(e.kw).toBeGreaterThan(26)
    expect(e.kw).toBeLessThan(27.2)
    expect(e.amps).toBeCloseTo((e.kw * 1000) / 240, 6)
  })
  it('tank recovery and first-hour rating', () => {
    const t = tankSpec('electric', 50)
    // 4.5 kW, 98 %: 15355 × 0.98 / (8.34 × 90) ≈ 20 gph
    expect(recoveryGph(t, 90)).toBeCloseTo(20.05, 1)
    expect(firstHourRating(t, 90)).toBeCloseTo(35 + 20.05, 1)
    const g = tankSpec('gas', 40)
    expect(recoveryGph(g, 90)).toBeCloseTo((38000 * 0.78) / (8.34 * 90), 6)
  })
  it('peak demand, simultaneous flow and recommendation', () => {
    const d = peakHourDemand(ACTIVITIES, 105, 50, 120)
    expect(d).toBeGreaterThan(30)
    expect(d).toBeLessThan(45)
    expect(tanklessFlow(FIXTURES, 105, 50, 120)).toBeCloseTo((2 * 2 + 1.8) * (55 / 70), 6)
    expect(recommendTank('gas', 60, 70)?.gal).toBe(30)
    expect(recommendTank('gas', 70, 70)?.gal).toBe(40)
    expect(recommendTank('electric', 300, 70)).toBeNull()
  })
  it('mixing valve boost and annual energy', () => {
    expect(mixingBoost(140, 50, 120)).toBeCloseTo(90 / 70, 10)
    expect(mixingBoost(120, 50, 120)).toBe(1)
    // 64 gal/day, 70 °F rise, UEF 0.93 → ~4,200 kWh/yr
    expect(annualKwh(64, 70, 0.93)).toBeCloseTo((64 * 365 * 8.34 * 70) / 0.93 / 3412.14, 6)
  })
})
