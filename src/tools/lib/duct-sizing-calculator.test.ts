import { describe, expect, it } from 'vitest'
import { CFM, FRICTION_IP, flow, frictionFactor, IN, rectEquivalent, sizeSection, solveDiameter, solveRectAspect, solveRectWidth, standardSize } from './duct-sizing-calculator'

describe('duct sizing', () => {
  it('Colebrook friction factor', () => {
    // Moody chart: Re = 1e5, ε/D = 1e-4 → f ≈ 0.0185
    expect(frictionFactor(1e5, 1e-4)).toBeCloseTo(0.0185, 3)
    expect(frictionFactor(1000, 0.001)).toBeCloseTo(0.064, 6)
  })
  it('ASHRAE friction chart point: 1000 cfm at 0.1 in.wg/100 ft ≈ 13.6 in (ductulator)', () => {
    const d = solveDiameter(1000 * CFM, 0.1 * FRICTION_IP, 0.00009)
    expect(d / IN).toBeGreaterThan(13.3)
    expect(d / IN).toBeLessThan(14)
    const v = flow(1000 * CFM, 12 * IN, 0.00009).v / 0.00508
    expect(v).toBeCloseTo(1273, -1)
    // 12 in at 1000 cfm sits near 0.2 in.wg/100 ft on the chart
    expect(flow(1000 * CFM, 12 * IN, 0.00009).dpm / FRICTION_IP).toBeCloseTo(0.2, 1)
  })
  it('round-trip: solved diameter reproduces the target rate', () => {
    const d = solveDiameter(0.5, 1, 0.00009)
    expect(flow(0.5, d, 0.00009).dpm).toBeCloseTo(1, 6)
  })
  it('Huebscher equivalent diameter', () => {
    expect(rectEquivalent(12, 12)).toBeCloseTo(13.12, 2)
    expect(rectEquivalent(24, 12)).toBeCloseTo(18.3, 1)
    const w = solveRectWidth(0.4, 0.3)
    expect(rectEquivalent(w, 0.3)).toBeCloseTo(0.4, 6)
    const r = solveRectAspect(0.5, 2)
    expect(r.w / r.h).toBeCloseTo(2, 9)
    expect(rectEquivalent(r.w, r.h)).toBeCloseTo(0.5, 6)
  })
  it('standard sizes', () => {
    expect(standardSize(0.27, true)).toBeCloseTo(0.3, 9)
    expect(standardSize(0.27, true, 'nearest')).toBeCloseTo(0.25, 9)
    expect(standardSize(11.2 * IN, false) / IN).toBeCloseTo(12, 9)
  })
  it('section totals', () => {
    const r = sizeSection({ id: 'a', name: 'A', q: 2400 / 3600, len: 10, k: 0.5, kind: 'main', path: true }, { rate: 1, eps: 0.00009, metric: true, rectH: 0.3, mode: 'up' })
    expect(r.dStd).toBeGreaterThanOrEqual(r.dCalc)
    expect(r.flow.dpm).toBeLessThanOrEqual(1)
    expect(r.total).toBeCloseTo(r.flow.dpm * 10 + 0.5 * r.flow.pv, 9)
    expect(r.rect.h).toBeLessThanOrEqual(0.3)
    expect(r.rect.de).toBeGreaterThanOrEqual(r.dCalc - 1e-9)
  })
})
