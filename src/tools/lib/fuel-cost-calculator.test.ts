import { describe, expect, it } from 'vitest'
import { from100km, per100km, pricePerUnit, tripCost } from './fuel-cost-calculator'

describe('fuel cost calculator', () => {
  it('converts consumption units', () => {
    expect(per100km(30, 'mpgus')).toBeCloseTo(7.84, 2) // 235.215 / 30
    expect(per100km(30, 'mpguk')).toBeCloseTo(9.416, 2)
    expect(per100km(20, 'kml')).toBe(5)
    expect(per100km(4, 'mikwh')).toBeCloseTo(15.53, 2)
    expect(from100km(per100km(42, 'mpgus'), 'mpgus')).toBeCloseTo(42, 9)
    expect(per100km(0, 'kml')).toBeNaN()
  })
  it('converts prices', () => {
    expect(pricePerUnit(3.785411784, 'galUS')).toBeCloseTo(1, 9)
    expect(pricePerUnit(4.54609, 'galUK')).toBeCloseTo(1, 9)
  })
  it('computes a trip', () => {
    const r = tripCost({ km: 250, roundTrip: true, l100: 6, price: 1.8, passengers: 3, extras: 12 })
    expect(r.km).toBe(500)
    expect(r.fuel).toBeCloseTo(30)
    expect(r.fuelCost).toBeCloseTo(54)
    expect(r.total).toBeCloseTo(66)
    expect(r.perPassenger).toBeCloseTo(22)
  })
})
