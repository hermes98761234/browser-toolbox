import { describe, expect, it } from 'vitest'
import { area, compute, heaterW, segment, stockingCm } from './aquarium-volume-calculator'

describe('aquarium-volume-calculator', () => {
  it('areas', () => {
    expect(area('rect', { l: 60, w: 30, h: 36, bow: 0 })).toBe(1800)
    expect(area('cylinder', { l: 20, w: 0, h: 10, bow: 0 })).toBeCloseTo(314.159, 2)
    expect(area('corner', { l: 10, w: 0, h: 10, bow: 0 })).toBeCloseTo(78.54, 2)
    // semicircle: chord 2r, sagitta r
    expect(segment(20, 10)).toBeCloseTo(Math.PI * 50, 4)
  })
  it('60×30×36 standard tank ≈ 64.8 L gross', () => {
    const r = compute('rect', { l: 60, w: 30, h: 36, bow: 0 }, { glass: 0, fill: 36, substrate: 0, decor: 0, salt: false })
    expect(r.gross).toBeCloseTo(64.8)
    expect(r.water).toBeCloseTo(64.8)
  })
  it('net water subtracts glass, substrate and decor', () => {
    const r = compute('rect', { l: 60, w: 30, h: 36, bow: 0 }, { glass: 5, fill: 33, substrate: 5, decor: 10, salt: true })
    // inner 59 × 29, water column 28 cm, × 0.9
    expect(r.water).toBeCloseTo((59 * 29 * 28 * 0.9) / 1000, 6)
    expect(r.waterWeight).toBeCloseTo(r.water * 1.025)
  })
  it('equipment rules', () => {
    expect(heaterW(100, 6)).toBe(150)
    expect(heaterW(10, 1)).toBe(25)
    expect(stockingCm(60, 1800)).toBe(40)
  })
})
