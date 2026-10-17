import { describe, expect, it } from 'vitest'
import { css, ease, overshoot, parseCurve, type Curve } from './cubic-bezier-editor'

describe('cubic bezier', () => {
  it('linear is identity', () => {
    for (const x of [0, 0.1, 0.5, 0.77, 1]) expect(ease([0, 0, 1, 1], x)).toBeCloseTo(x, 6)
  })
  it('matches known CSS ease values', () => {
    const e: Curve = [0.25, 0.1, 0.25, 1]
    expect(ease(e, 0.5)).toBeCloseTo(0.8024, 3)
    expect(ease([0.42, 0, 0.58, 1], 0.5)).toBeCloseTo(0.5, 6)
    expect(ease([0.42, 0, 1, 1], 0.5)).toBeCloseTo(0.3153, 3)
  })
  it('parses and formats', () => {
    expect(parseCurve('cubic-bezier(.17,.67,.83,.67)')).toEqual([0.17, 0.67, 0.83, 0.67])
    expect(parseCurve('ease-out')).toEqual([0, 0, 0.58, 1])
    expect(parseCurve('1.2, 0, 0, 1')).toBeNull()
    expect(parseCurve('nope')).toBeNull()
    expect(css([0.34, 1.56, 0.64, 1])).toBe('cubic-bezier(.34, 1.56, .64, 1)')
  })
  it('detects overshoot', () => {
    expect(overshoot([0.34, 1.56, 0.64, 1]).max).toBeGreaterThan(1.05)
    expect(overshoot([0.25, 0.1, 0.25, 1])).toEqual({ min: 0, max: 1 })
  })
})
