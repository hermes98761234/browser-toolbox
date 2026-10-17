import { describe, expect, it } from 'vitest'
import { ASIAN, bmi, bmiImperial, category, healthyRange, newBmi, ponderal } from './bmi-reference-calculator'

describe('bmi', () => {
  it('computes metric and imperial BMI', () => {
    expect(bmi(70, 1.75)).toBeCloseTo(22.857, 3)
    expect(bmiImperial(150, 65)).toBeCloseTo(24.96, 2) // 703.07 × 150 / 65²
    expect(bmi(0, 1.7)).toBeNaN()
  })
  it('classifies with WHO and Asian cut-offs', () => {
    expect(category(22.9)!.name).toBe('Normal weight')
    expect(category(25)!.name).toBe('Overweight (pre-obese)')
    expect(category(15.2)!.name).toContain('severe')
    expect(category(41)!.name).toBe('Obesity class III')
    expect(category(24, ASIAN)!.name).toContain('Overweight')
  })
  it('gives healthy weight range and other indices', () => {
    const [lo, hi] = healthyRange(1.8)
    expect(lo).toBeCloseTo(59.94, 2)
    expect(hi).toBeCloseTo(81, 2)
    expect(ponderal(70, 1.75)).toBeCloseTo(13.06, 2)
    expect(newBmi(70, 1.75)).toBeCloseTo(22.46, 2)
  })
})
