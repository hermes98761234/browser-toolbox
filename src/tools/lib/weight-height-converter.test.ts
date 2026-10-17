import { describe, expect, it } from 'vitest'
import { bmi, fromCm, fromKg, ftIn, lbOz, round, stLb, toCm, toKg } from './weight-height-converter'

describe('weight', () => {
  it('uses exact definitions', () => {
    expect(toKg(1, 'lb')).toBe(0.45359237)
    expect(fromKg(1, 'lb')).toBeCloseTo(2.20462262, 8)
    expect(toKg(1, 'st')).toBeCloseTo(6.35029318, 8)
    expect(fromKg(1, 'oz')).toBeCloseTo(35.2739619, 6)
    expect(fromKg(1.5, 'g')).toBeCloseTo(1500, 9)
  })
  it('formats compound units with carry', () => {
    expect(stLb(70, 1)).toBe('11 st 0.3 lb')
    expect(stLb(toKg(13.999, 'lb'), 1)).toBe('1 st 0 lb')
    expect(lbOz(1, 1)).toBe('2 lb 3.3 oz')
  })
})

describe('height', () => {
  it('converts', () => {
    expect(toCm(1, 'in')).toBe(2.54)
    expect(toCm(6, 'ft')).toBeCloseTo(182.88, 9)
    expect(fromCm(180, 'in')).toBeCloseTo(70.866, 3)
    expect(fromCm(180, 'm')).toBe(1.8)
  })
  it('formats feet and inches', () => {
    expect(ftIn(180, 1)).toBe('5′ 10.9″')
    expect(ftIn(182.87, 0)).toBe('6′ 0″')
    expect(ftIn(152.4, 1)).toBe('5′ 0″')
  })
  it('rounds and computes BMI', () => {
    expect(round(1.5, 2)).toBe('1.5')
    expect(round(2, 0)).toBe('2')
    expect(bmi(70, 175).v).toBeCloseTo(22.857, 3)
    expect(bmi(70, 175).cat).toBe('Healthy weight')
  })
})
