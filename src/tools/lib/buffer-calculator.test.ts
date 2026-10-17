import { describe, expect, it } from 'vitest'
import { BUFFERS, davies, ionicStrength, phOf, pKaAt, recipe } from './buffer-calculator'

const B = (id: string) => BUFFERS.find((b) => b.id === id)!

describe('buffer calculator', () => {
  it('Henderson–Hasselbalch ratios', () => {
    const r = recipe(B('acetate'), 5.76, 0.1, 1, 25, false)
    expect(r.ratio).toBeCloseTo(10, 6)
    expect(r.cb).toBeCloseTo(0.1 * (10 / 11), 9)
    expect(phOf(4.76, 1, 10)).toBeCloseTo(5.76, 9)
  })
  it('phosphate at pKa gives equal parts and correct masses', () => {
    const r = recipe(B('phosphate'), 7.2, 0.1, 0.5, 25, false)
    expect(r.ca).toBeCloseTo(0.05, 9)
    expect(r.massAcid).toBeCloseTo(0.05 * 0.5 * 137.99, 6)
    expect(r.massBase).toBeCloseTo(0.05 * 0.5 * 141.96, 6)
  })
  it('Tris temperature dependence (−0.028/°C)', () => {
    expect(pKaAt(B('tris'), 4)).toBeCloseTo(8.648, 3)
    expect(pKaAt(B('tris'), 37)).toBeCloseTo(7.724, 3)
  })
  it('ionic strength and Davies correction', () => {
    // 0.05 M NaH2PO4 + 0.05 M Na2HPO4: I = 0.5(0.05·1 + 0.05·4 + 0.15·1) = 0.2
    expect(ionicStrength(B('phosphate'), 0.05, 0.05)).toBeCloseTo(0.2, 9)
    expect(davies(0.1)).toBeCloseTo(0.509 * (Math.sqrt(0.1) / (1 + Math.sqrt(0.1)) - 0.03), 2)
    // Phosphate apparent pKa2 drops to ≈ 6.8–6.9 at 0.1 M total
    const r = recipe(B('phosphate'), 7.2, 0.1, 1, 25, true)
    expect(r.pKa).toBeGreaterThan(6.75)
    expect(r.pKa).toBeLessThan(6.9)
  })
  it('buffer capacity peaks at pKa', () => {
    const at = recipe(B('hepes'), 7.48, 0.05, 1, 25, false).beta
    const off = recipe(B('hepes'), 8.48, 0.05, 1, 25, false).beta
    expect(at).toBeCloseTo(2.303 * 0.05 / 4, 3)
    expect(off).toBeLessThan(at)
  })
})
