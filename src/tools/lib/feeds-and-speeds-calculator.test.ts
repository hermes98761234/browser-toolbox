import { describe, expect, it } from 'vitest'
import { chipLoad, chipThinning, drill, MATERIALS, mill, rpmFor, sfmFor } from './feeds-and-speeds-calculator'

describe('feeds-and-speeds-calculator', () => {
  it('converts surface speed and RPM', () => {
    expect(rpmFor(1000, 0.5)).toBeCloseTo(7639.44, 2)
    expect(sfmFor(7639.437, 0.5)).toBeCloseTo(1000, 3)
  })
  it('computes chip thinning', () => {
    expect(chipThinning(0.05, 0.5)).toBeCloseTo(1 / 0.6, 9)
    expect(chipThinning(0.25, 0.5)).toBe(1)
    expect(chipThinning(0.5, 0.5)).toBe(1)
  })
  it('computes milling feed, MRR and power', () => {
    const r = mill({ d: 0.5, flutes: 3, sfm: 1000, chip: 0.004, ae: 0.25, ap: 0.5, maxRpm: 0, maxFeed: 0, kp: 0.25, efficiency: 0.8, thinning: true })
    expect(r.feed).toBeCloseTo(7639.44 * 3 * 0.004, 1)
    expect(r.mrr).toBeCloseTo(0.25 * 0.5 * r.feed, 9)
    expect(r.hpMotor).toBeCloseTo((r.mrr * 0.25) / 0.8, 9)
    expect(r.torque).toBeCloseTo((r.hpCut * 63025) / r.rpm, 9)
    const c = mill({ d: 0.5, flutes: 3, sfm: 1000, chip: 0.004, ae: 0.05, ap: 0.5, maxRpm: 6000, maxFeed: 100, kp: 0.25, efficiency: 1, thinning: true })
    expect(c.rpm).toBe(6000)
    expect(c.rpmCapped).toBe(true)
    expect(c.feed).toBe(100)
    expect(c.fz).toBeCloseTo(100 / 18000, 9)
  })
  it('scales chip load and drills', () => {
    const al = MATERIALS[0]
    expect(chipLoad(al, 0.5)).toBe(0.005)
    expect(chipLoad(al, 1)).toBe(0.01)
    expect(chipLoad(al, 0.25)).toBeLessThan(0.005)
    const d = drill(al, 0.5, 300, 0)
    expect(d.ipr).toBeCloseTo(0.01, 9)
    expect(d.feed).toBeCloseTo(rpmFor(300, 0.5) * 0.01, 9)
  })
})
