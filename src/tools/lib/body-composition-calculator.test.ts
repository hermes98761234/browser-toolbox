import { describe, expect, it } from 'vitest'
import { bandOf, bmi, bmiBodyFat, BMI_BANDS, devineIbw, mifflinBmr, navyBodyFat } from './body-composition-calculator'

describe('body composition', () => {
  it('computes BMI', () => {
    expect(bmi(70, 175)).toBeCloseTo(22.857, 3)
  })
  it('Navy male agrees with the imperial formula', () => {
    // 86.010·log10(34−15) − 70.041·log10(70) + 36.76 ≈ 17.51
    const imperial = 86.01 * Math.log10(34 - 15) - 70.041 * Math.log10(70) + 36.76
    expect(navyBodyFat('male', 70 * 2.54, 15 * 2.54, 34 * 2.54)).toBeCloseTo(imperial, 0)
    expect(imperial).toBeCloseTo(17.51, 1)
  })
  it('Navy female agrees with the imperial formula', () => {
    const imperial = 163.205 * Math.log10(30 + 38 - 13) - 97.684 * Math.log10(65) - 78.387
    expect(navyBodyFat('female', 65 * 2.54, 13 * 2.54, 30 * 2.54, 38 * 2.54)).toBeCloseTo(imperial, 0)
  })
  it('rejects impossible input', () => {
    expect(navyBodyFat('male', 180, 40, 38)).toBeNaN()
  })
  it('Deurenberg, Mifflin, Devine', () => {
    expect(bmiBodyFat('male', 25, 40)).toBeCloseTo(1.2 * 25 + 9.2 - 10.8 - 5.4, 6)
    expect(mifflinBmr('male', 80, 180, 30)).toBe(1780)
    expect(mifflinBmr('female', 60, 165, 30)).toBeCloseTo(1320.25, 2)
    expect(devineIbw('male', 152.4)).toBeCloseTo(50, 6)
  })
  it('classifies bands', () => {
    expect(bandOf(BMI_BANDS, 22)?.label).toBe('Healthy')
    expect(bandOf(BMI_BANDS, 10)?.label).toBe('Underweight')
    expect(bandOf(BMI_BANDS, 60)?.label).toBe('Obesity II+')
  })
})
