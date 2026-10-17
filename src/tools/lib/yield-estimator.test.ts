import { describe, expect, it } from 'vitest'
import { ACRE_M2, buPerAc, FT, gPerM2, moistureAdjust, rowFor1000thAcre, sampleArea, summarize, tPerHa } from './yield-estimator'

describe('yield-estimator', () => {
  it('matches the corn kernel-factor method (ears × rows × kernels / 90)', () => {
    const len = rowFor1000thAcre(30) // 17.42 ft
    expect(len).toBeCloseTo(17.424, 3)
    const area = sampleArea('row', len * FT, 30 * 0.0254, 0)
    expect(area).toBeCloseTo(ACRE_M2 / 1000, 6)
    const g = gPerM2(30, [16, 35], 0.282, area)
    const kf = (30 * 16 * 35) / 90
    expect(buPerAc(g, 56) / kf).toBeGreaterThan(0.99)
    expect(buPerAc(g, 56) / kf).toBeLessThan(1.01)
  })
  it('wheat from a 1 m² quadrat', () => {
    const g = gPerM2(550, [30], 0.038, 1) // 627 g/m²
    expect(tPerHa(g)).toBeCloseTo(6.27, 2)
    expect(buPerAc(g, 60)).toBeCloseTo(93.23, 1)
  })
  it('adjusts moisture and summarizes samples', () => {
    expect(moistureAdjust(200, 20, 15.5)).toBeCloseTo((200 * 80) / 84.5, 6)
    expect(moistureAdjust(200, 20, 0)).toBe(200)
    const s = summarize([10, 12, 14])
    expect(s.mean).toBe(12)
    expect(s.sd).toBe(2)
    expect(s.hi - s.mean).toBeCloseTo(4.303 * (2 / Math.sqrt(3)), 2)
    expect(gPerM2(1, [1], 1, 0)).toBeNaN()
  })
})
