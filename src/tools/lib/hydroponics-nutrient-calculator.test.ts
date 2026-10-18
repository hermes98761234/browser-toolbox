import { describe, expect, it } from 'vitest'
import { calibrate, ecToPpm, elementalPpm, perLitre, phDose, ppmToEc, predictedEc, strengthForEc, type Product } from './hydroponics-nutrient-calculator'

const prod = (p: Partial<Product>): Product => ({
  id: 'x', name: 'x', role: 'a', amount: 5, unit: 'ml', per: 1, perUnit: 'gal', ec: 0.5, n: 5, p: 0, k: 0, liquid: true, density: 1, on: true, ...p,
})

describe('hydroponics', () => {
  it('converts EC to ppm on the three scales', () => {
    expect(ecToPpm(1.6, '500')).toBeCloseTo(800, 6)
    expect(ecToPpm(1.6, '640')).toBeCloseTo(1024, 6)
    expect(ecToPpm(1.6, '700')).toBeCloseTo(1120, 6)
    expect(ppmToEc(700, '700')).toBeCloseTo(1, 9)
  })
  it('per-litre label dose', () => {
    expect(perLitre(prod({ amount: 5, per: 1, perUnit: 'gal' }))).toBeCloseTo(5 / 3.785411784, 9)
    expect(perLitre(prod({ amount: 2, per: 1, perUnit: 'L' }))).toBe(2)
  })
  it('scales the label dose to hit the target EC', () => {
    const ps = [prod({ ec: 0.6 }), prod({ ec: 0.6 }), prod({ ec: 0.3, on: false })]
    const f = strengthForEc(1.5, 0.3, ps)
    expect(f).toBeCloseTo(1, 9)
    expect(predictedEc(f, 0.3, ps)).toBeCloseTo(1.5, 9)
    expect(strengthForEc(0.2, 0.3, ps)).toBe(0)
  })
  it('elemental ppm from N-P2O5-K2O', () => {
    // 1 g/L of 10-10-10 powder → 100 ppm N, 43.6 ppm P, 83 ppm K
    const r = elementalPpm(prod({ amount: 1, unit: 'g', per: 1, perUnit: 'L', liquid: false, n: 10, p: 10, k: 10 }), 1)
    expect(r.n).toBeCloseTo(100, 6)
    expect(r.p).toBeCloseTo(43.64, 2)
    expect(r.k).toBeCloseTo(83.01, 2)
  })
  it('pH dose and calibration', () => {
    const rate = calibrate(2, 20, 0.5) // 2 ml in 20 L moved pH by 0.5
    expect(rate).toBeCloseTo(0.2, 9)
    expect(phDose(50, -0.8, rate)).toBeCloseTo(8, 9)
  })
})
