import { describe, expect, it } from 'vitest'
import { bitPlane, chi2Cdf, chiSeries, chiSquare, coverImage, embedLsb, histogram, rsAnalysis } from './steganography-detector'

const W = 480, H = 320

describe('steganography detector', () => {
  it('chi-square CDF matches known values', () => {
    expect(chi2Cdf(3.841, 1)).toBeCloseTo(0.95, 3)
    expect(chi2Cdf(18.307, 10)).toBeCloseTo(0.95, 3)
    expect(chi2Cdf(124.342, 100)).toBeCloseTo(0.95, 3)
  })
  it('bit plane extracts the requested bit', () => {
    const d = new Uint8ClampedArray([5, 0, 0, 255, 4, 0, 0, 255])
    const p = bitPlane(d, 0, 0)
    expect([p[0], p[4]]).toEqual([255, 0])
  })
  it('chi-square attack: clean cover → p ≈ 0, full embedding → p ≈ 1', () => {
    const clean = coverImage(W, H)
    const stego = embedLsb(clean, 1)
    expect(chiSquare(histogram(clean, 0)).p).toBeLessThan(0.05)
    expect(chiSquare(histogram(stego, 0)).p).toBeGreaterThan(0.9)
    // sequential 50 % embedding: high p early in the scan, dropping later
    const s = chiSeries(embedLsb(clean, 0.5), 1, 10)
    expect(s[2][1]).toBeGreaterThan(0.5)
    expect(s[9][1]).toBeLessThan(0.05)
  })
  it('RS analysis estimates the embedded fraction', () => {
    const clean = coverImage(W, H)
    expect(Math.abs(rsAnalysis(clean, W, H, 1).rate)).toBeLessThan(0.05)
    const r = rsAnalysis(embedLsb(clean, 0.6), W, H, 1).rate
    expect(r).toBeGreaterThan(0.45)
    expect(r).toBeLessThan(0.75)
  })
})
