import { describe, expect, it } from 'vitest'
import { detectCuts, difference, duplicates, histDiff, histogram, sampleStep, scenes, signature, ssim, suggestThreshold } from './video-frame-extractor'

const solid = (w: number, h: number, r: number, g: number, b: number) => {
  const a: number[] = []
  for (let i = 0; i < w * h; i++) a.push(r, g, b, 255)
  return a
}
const noise = (w: number, h: number, seed: number) => {
  const a: number[] = []
  let s = seed
  for (let i = 0; i < w * h; i++) {
    s = (s * 1103515245 + 12345) % 2147483648
    const v = s % 256
    a.push(v, v, v, 255)
  }
  return a
}

describe('video-frame-extractor', () => {
  it('builds normalised histograms', () => {
    const h = histogram(solid(4, 4, 255, 0, 128), 4)
    expect(h[3]).toBe(1)
    expect(h[4]).toBe(1)
    expect(h[10]).toBe(1)
  })
  it('measures histogram distance', () => {
    const a = histogram(solid(4, 4, 10, 10, 10)), b = histogram(solid(4, 4, 250, 250, 250))
    expect(histDiff(a, a)).toBeCloseTo(0)
    expect(histDiff(a, b)).toBeCloseTo(1)
  })
  it('computes SSIM', () => {
    const a = signature(noise(16, 16, 1), 16, 16), b = signature(noise(16, 16, 99), 16, 16)
    expect(ssim(a.gray, a.gray, 16, 16)).toBeCloseTo(1)
    expect(ssim(a.gray, b.gray, 16, 16)).toBeLessThan(0.2)
    expect(difference(a, a, 'both')).toBeCloseTo(0)
    expect(difference(a, b, 'ssim')).toBeGreaterThan(0.4)
  })
  it('detects cuts with a minimum gap', () => {
    const t = [0, 0.5, 1, 1.5, 2, 2.5, 3]
    const sc = [0, 0.02, 0.9, 0.7, 0.03, 0.8, 0.01]
    expect(detectCuts(t, sc, 0.5, 1)).toEqual([0, 2, 5])
    expect(detectCuts(t, sc, 0.5, 0)).toEqual([0, 2, 3, 5])
    const sc2 = [0, 0.02, 0.6, 0.9, 0.03, 0.01, 0.01]
    expect(detectCuts(t, sc2, 0.5, 1)).toEqual([0, 3])
  })
  it('builds scenes and keyframes', () => {
    const t = [0, 1, 2, 3, 4, 5]
    const sc = scenes(t, [0, 0, 0, 0.9, 0, 0], [0, 3], 6, 'middle')
    expect(sc).toHaveLength(2)
    expect(sc[0]).toMatchObject({ start: 0, end: 3, key: 1 })
    expect(sc[1]).toMatchObject({ start: 3, end: 6, key: 4, score: 0.9 })
  })
  it('finds near-duplicates', () => {
    const red = signature(solid(8, 8, 200, 20, 20), 8, 8), blue = signature(solid(8, 8, 20, 20, 200), 8, 8)
    expect(duplicates([red, blue, red], 'hist', 0.1)).toEqual([-1, -1, 0])
  })
  it('suggests thresholds and steps', () => {
    expect(suggestThreshold([0, 0.01, 0.01, 0.01, 0.01])).toBe(0.05)
    expect(sampleStep(10, 10)).toBeCloseTo(0.1)
    expect(sampleStep(3000, 10)).toBe(2)
  })
})
