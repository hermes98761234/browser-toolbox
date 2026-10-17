import { describe, expect, it } from 'vitest'
import { clampCss, fluidAt, lineHeight, scale, stepName } from './type-scale-calculator'

describe('type-scale-calculator', () => {
  it('builds a modular scale', () => {
    const s = scale(16, 1.25, 3, 1)
    expect(s.map((x) => x.name)).toEqual(['2xl', 'xl', 'lg', 'base', 'sm'])
    expect(s[0].min).toBeCloseTo(31.25, 6)
    expect(s[4].min).toBeCloseTo(12.8, 6)
    expect(stepName(-2)).toBe('xs')
  })
  it('clamp formula hits both endpoints', () => {
    const css = clampCss(16, 20, 320, 1280)
    // slope 4/960 → 0.4167vw; intercept 16 − 320·4/960 = 14.6667px = 0.9167rem
    expect(css).toBe('clamp(1rem, 0.9167rem + 0.4167vw, 1.25rem)')
    expect(fluidAt(16, 20, 320, 1280, 320)).toBe(16)
    expect(fluidAt(16, 20, 320, 1280, 1280)).toBe(20)
    expect(fluidAt(16, 20, 320, 1280, 800)).toBe(18)
    expect(clampCss(16, 16, 320, 1280)).toBe('1rem')
    expect(clampCss(12, 10, 320, 1280)).toBe('clamp(0.625rem, 0.7917rem - 0.2083vw, 0.75rem)')
  })
  it('line heights', () => {
    expect(lineHeight(16)).toBe(1.6)
    expect(lineHeight(72)).toBe(1.1)
    expect(Math.round(lineHeight(18, 4) * 18) % 4).toBe(0)
  })
})
