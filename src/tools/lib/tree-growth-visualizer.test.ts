import { describe, expect, it } from 'vitest'
import { advice, ageForHeight, autumn, growth, leafless, rng, sizeAt, speciesById } from './tree-growth-visualizer'

describe('tree growth', () => {
  it('reaches 90 % of mature size at the species age', () => {
    expect(growth(40, 40)).toBeCloseTo(0.9, 6)
    expect(growth(0, 40)).toBe(0)
    expect(growth(400, 40)).toBeCloseTo(1, 4)
    expect(growth(10, 40)).toBeLessThan(growth(20, 40))
  })
  it('sizes are monotonic and capped by mature size', () => {
    const sp = speciesById('redmaple')
    const a = sizeAt(sp, 5), b = sizeAt(sp, 25), c = sizeAt(sp, 150)
    expect(a.h).toBeLessThan(b.h)
    expect(c.h).toBeLessThanOrEqual(sp.h)
    expect(c.h).toBeGreaterThan(sp.h * 0.99)
    expect(sizeAt(sp, 0).h).toBeGreaterThanOrEqual(1.8)
  })
  it('finds age for a height', () => {
    const sp = speciesById('poplar')
    const a = ageForHeight(sp, 10)!
    expect(sizeAt(sp, a).h).toBeGreaterThanOrEqual(10)
    expect(sizeAt(sp, a - 1).h).toBeLessThan(10)
    expect(ageForHeight(sp, 50)).toBeNull()
  })
  it('planting advice', () => {
    const willow = speciesById('willow')
    expect(advice(willow, 5, sizeAt(willow, 10)).minDist).toBe(12)
    expect(advice(willow, 5, sizeAt(willow, 10)).ok).toBe(false)
    const jm = speciesById('jmaple')
    expect(advice(jm, 5, sizeAt(jm, 10)).ok).toBe(true)
  })
  it('seasons and rng', () => {
    expect(leafless(0, 45)).toBe(true)
    expect(leafless(6, 45)).toBe(false)
    expect(leafless(6, -33)).toBe(true)
    expect(autumn(9, 45)).toBe(true)
    const r1 = rng(7), r2 = rng(7)
    expect(r1()).toBe(r2())
  })
})
