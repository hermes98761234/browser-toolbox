import { describe, expect, it } from 'vitest'
import { catchLpm, flowForRate, gpa, pressureFor, rateLha, speedKmh, tankPlan, uniformity } from './sprayer-calibration'

describe('sprayer calibration', () => {
  it('rate formulas', () => {
    expect(rateLha(1.2, 8, 50)).toBeCloseTo(180, 9) // 600*1.2/(8*0.5)
    expect(flowForRate(180, 8, 50)).toBeCloseTo(1.2, 9)
    expect(gpa(0.3, 6, 20)).toBeCloseTo(14.85, 9)
    expect(speedKmh(100, 45)).toBeCloseTo(8, 9)
    expect(catchLpm(600, 30)).toBeCloseTo(1.2, 9)
    expect(pressureFor(3, 1, 1.2)).toBeCloseTo(4.32, 9)
  })
  it('uniformity', () => {
    const u = uniformity([600, 610, 590, 700])
    expect(u.mean).toBe(625)
    expect(u.flagged).toEqual([3])
  })
  it('tank plan', () => {
    const t = tankPlan(3000, 200, 40)
    expect(t.haPerTank).toBe(15)
    expect(t.fullTanks).toBe(2)
    expect(t.lastTankL).toBe(2000)
    expect(t.totalWater).toBe(8000)
  })
})
