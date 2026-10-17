import { describe, expect, it } from 'vitest'
import { budget, dailyPerHead, seasonDays } from './hay-inventory-planner'

const horse = { id: 'h', kind: 'Horse', count: 2, weightKg: 500, intakePct: 2, pasturePct: 0 }

describe('hay planner', () => {
  it('daily as-fed hay with DM and waste', () => {
    // 10 kg DM / 0.88 DM = 11.36 kg; with 10% waste = 12.63 kg
    expect(dailyPerHead(horse, 88, 0)).toBeCloseTo(11.364, 2)
    expect(dailyPerHead(horse, 88, 10)).toBeCloseTo(12.626, 2)
    expect(dailyPerHead({ ...horse, pasturePct: 50 }, 88, 0)).toBeCloseTo(5.682, 2)
  })
  it('season days inclusive', () => {
    expect(seasonDays('2026-11-01', '2027-03-31')).toBe(151)
  })
  it('budget totals', () => {
    const b = budget([horse], [{ id: 'b', type: 'r', count: 5, weightKg: 400 }], 88, 0, 100, 10)
    expect(b.daily).toBeCloseTo(22.727, 2)
    expect(b.need).toBeCloseTo(2500, 0)
    expect(b.onHand).toBe(2000)
    expect(b.shortfall).toBeCloseTo(500, 0)
    expect(b.daysCovered).toBeCloseTo(88, 0)
  })
})
