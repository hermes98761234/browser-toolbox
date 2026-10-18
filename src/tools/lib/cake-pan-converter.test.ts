import { describe, expect, it } from 'vitest'
import { bakeTime, convert, panArea, panVolume, scaleRecipe, type Pan } from './cake-pan-converter'

const pan = (p: Partial<Pan>): Pan => ({ shape: 'round', a: 9, b: 0, h: 2, n: 12, ...p })

describe('cake pan geometry', () => {
  it('areas', () => {
    expect(panArea(pan({ a: 9 }))).toBeCloseTo(63.617, 2)
    expect(panArea(pan({ shape: 'rect', a: 9, b: 13 }))).toBe(117)
    expect(panArea(pan({ shape: 'square', a: 8 }))).toBe(64)
    expect(panArea(pan({ shape: 'tube', a: 10, b: 4 }))).toBeCloseTo((Math.PI * 84) / 4, 6)
    expect(panArea(pan({ shape: 'oval', a: 8, b: 12 }))).toBeCloseTo(Math.PI * 24, 6)
  })
  it('muffin cup volume (frustum) ≈ 1/2 cup', () => {
    const v = panVolume(pan({ shape: 'muffin', a: 2.75, b: 2, h: 1.375, n: 1 }))
    expect(v).toBeGreaterThan(5.5)
    expect(v).toBeLessThan(6.5)
  })
  it('8" round → 9" round scales by 81/64 at the same depth', () => {
    const c = convert(pan({ a: 8 }), pan({ a: 9 }), 1.25, 'area')
    expect(c.factor).toBeCloseTo(81 / 64, 6)
    expect(c.depthScaled).toBeCloseTo(1.25, 6)
    expect(c.depthUnscaled).toBeCloseTo(1.25 * 64 / 81, 6)
  })
  it('two 9" rounds ≈ one 9×13', () => {
    const c = convert(pan({ a: 9 }), pan({ shape: 'rect', a: 9, b: 13 }), 1.5, 'area')
    expect(c.factor).toBeCloseTo(117 / 63.617, 3) // ≈ 1.84
  })
  it('volume mode uses pan heights', () => {
    const c = convert(pan({ a: 8, h: 2 }), pan({ a: 8, h: 3 }), 1.3, 'volume')
    expect(c.factor).toBeCloseTo(1.5, 6)
  })
  it('bake time grows with depth', () => {
    expect(bakeTime(30, 1, 1)).toBe(30)
    expect(bakeTime(30, 1, 2)).toBeCloseTo(30 * 2 ** 1.3, 6)
  })
  it('scales recipe lines', () => {
    const r = scaleRecipe('2 cups flour\n3 eggs\nPinch of salt', 1.5)
    expect(r[0].line).toBe('3 cups flour')
    expect(r[1].line).toMatch(/^4 ½ eggs|^4½ eggs|4 ½/)
    expect(r[1].note).toBeTruthy()
    expect(r[2].line).toBe('Pinch of salt')
  })
})
