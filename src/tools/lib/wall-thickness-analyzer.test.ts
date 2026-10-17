import { describe, expect, it } from 'vitest'
import { analyzeThickness, heatColor, sampleModel, thinAreaFraction } from './wall-thickness-analyzer'
import { sampleCube } from './stl-viewer'

describe('wall thickness', () => {
  it('measures a cube as its edge length', () => {
    const r = analyzeThickness(sampleCube(10))
    for (const t of r.thickness) expect(t).toBeCloseTo(10, 4)
    expect(thinAreaFraction(r, 11)).toBeCloseTo(1)
    expect(thinAreaFraction(r, 9)).toBe(0)
  })
  it('finds the 0.6 mm wall and the thin pin in the sample', () => {
    const r = analyzeThickness(sampleModel())
    expect(r.min).toBeGreaterThan(0.55)
    expect(r.min).toBeLessThan(0.75)
    const frac = thinAreaFraction(r, 0.8)
    expect(frac).toBeGreaterThan(0)
    expect(frac).toBeLessThan(0.3)
  })
  it('colours thin areas red and open rays grey', () => {
    expect(heatColor(0.3, 0.8)).toEqual([0.9, 0.15, 0.15])
    expect(heatColor(Infinity, 0.8)[0]).toBeCloseTo(0.55)
  })
})
