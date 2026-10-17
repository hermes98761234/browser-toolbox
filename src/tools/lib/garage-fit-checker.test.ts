import { describe, expect, it } from 'vitest'
import { CARS, doorAngle, fit, gapForAngle, GARAGES, verdict } from './garage-fit-checker'

describe('garage-fit-checker', () => {
  it('door angle geometry', () => {
    expect(doorAngle(0.55, 1.1)).toBeCloseTo(30, 6)
    expect(doorAngle(2, 1.1)).toBe(90)
    expect(doorAngle(-0.1, 1.1)).toBe(0)
    expect(gapForAngle(30, 1.1)).toBeCloseTo(0.55, 6)
    expect(verdict(50)).toBe('comfortable')
    expect(verdict(20)).toBe('squeeze')
  })
  it('computes clearances', () => {
    const car = CARS[1], g = GARAGES[1]
    const f = fit(car, g, 0, 0.3)
    expect(f.left).toBeCloseTo((3.0 - 1.79) / 2)
    expect(f.right).toBeCloseTo(f.left)
    expect(f.front).toBeCloseTo(6.0 - 4.28 - 0.3)
    expect(f.doorSide).toBeCloseTo((2.4 - 2.03) / 2)
    expect(f.fits).toBe(true)
    const off = fit(car, g, 0.2)
    expect(off.left - off.right).toBeCloseTo(0.4)
    const two = fit(car, GARAGES[3], 0, 0.3, 0, 2)
    expect(two.left).toBeCloseTo((6.1 - 3.58) / 3)
    expect(fit(CARS[8], GARAGES[0]).fits).toBe(false)
  })
})
