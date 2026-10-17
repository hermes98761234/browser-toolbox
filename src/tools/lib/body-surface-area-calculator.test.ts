import { describe, expect, it } from 'vitest'
import { bmi, bsa, FORMULAS } from './body-surface-area-calculator'

describe('BSA formulas (70 kg, 170 cm)', () => {
  it('reference values', () => {
    expect(bsa('mosteller', 70, 170)).toBeCloseTo(1.818, 3)
    expect(bsa('dubois', 70, 170)).toBeCloseTo(1.809, 2)
    expect(bsa('haycock', 70, 170)).toBeCloseTo(1.826, 2)
  })
  it('all formulas agree within ~5% for an average adult', () => {
    const v = FORMULAS.map((f) => f.f(70, 170, 'male'))
    const m = v.reduce((a, b) => a + b) / v.length
    for (const x of v) expect(Math.abs(x - m) / m).toBeLessThan(0.06)
  })
  it('child and BMI', () => {
    expect(bsa('mosteller', 20, 110)).toBeCloseTo(0.782, 2)
    expect(bmi(70, 175)).toBeCloseTo(22.86, 2)
  })
})
