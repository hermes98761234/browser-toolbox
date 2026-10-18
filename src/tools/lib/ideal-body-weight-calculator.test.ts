import { describe, expect, it } from 'vitest'
import { adjustedBW, bmiWeights, cmToFtIn, FORMULAS, ftInToCm, ibw, leanBW } from './ideal-body-weight-calculator'

const f = (id: string) => FORMULAS.find((x) => x.id === id)!
describe('ideal body weight', () => {
  it('Devine at 5 ft 10 in', () => {
    const cm = ftInToCm(5, 10)
    expect(ibw(f('devine'), 'male', cm)).toBeCloseTo(73, 8)
    expect(ibw(f('devine'), 'female', cm)).toBeCloseTo(68.5, 8)
    expect(ibw(f('robinson'), 'male', cm)).toBeCloseTo(71, 8)
    expect(ibw(f('miller'), 'male', cm)).toBeCloseTo(70.3, 8)
    expect(ibw(f('hamwi'), 'female', cm)).toBeCloseTo(67.5, 8)
  })
  it('adjusted and BMI weights', () => {
    expect(adjustedBW(70, 120)).toBeCloseTo(90, 10)
    expect(bmiWeights(180).bmi22).toBeCloseTo(71.28, 6)
    expect(leanBW('male', 80, 180)).toBeCloseTo((9270 * 80) / (6680 + 216 * (80 / 3.24)), 8)
  })
  it('unit conversion', () => {
    expect(ftInToCm(6, 0)).toBeCloseTo(182.88, 8)
    expect(cmToFtIn(182.88)).toEqual([6, 0])
  })
})
