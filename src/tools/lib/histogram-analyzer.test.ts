import { describe, expect, it } from 'vitest'
import { applyOverlay, chanStats, histogram, luma, quantile, verdict } from './histogram-analyzer'

const img = (pixels: [number, number, number, number?][]) => new Uint8ClampedArray(pixels.flatMap(([r, g, b, a = 255]) => [r, g, b, a]))

describe('histogram analyzer', () => {
  it('counts channels and Rec.709 luma, skipping transparent pixels', () => {
    const h = histogram(img([[255, 0, 0], [0, 255, 0], [0, 0, 255], [10, 10, 10, 0]]))
    expect(h.n).toBe(3)
    expect(h.r[255]).toBe(1)
    expect(h.r[0]).toBe(2)
    expect(h.l[Math.round(0.2126 * 255)]).toBe(1)
    expect(h.l[Math.round(0.7152 * 255)]).toBe(1)
    expect(luma(255, 255, 255)).toBeCloseTo(255, 6)
  })
  it('computes stats and clipping fractions', () => {
    const h = new Uint32Array(256)
    h[0] = 10; h[100] = 80; h[255] = 10
    const s = chanStats(h, 2, 253)
    expect(s.mean).toBeCloseTo((80 * 100 + 10 * 255) / 100, 6)
    expect(s.median).toBe(100)
    expect(s.min).toBe(0)
    expect(s.max).toBe(255)
    expect(s.low).toBeCloseTo(0.1, 6)
    expect(s.high).toBeCloseTo(0.1, 6)
    expect(quantile(h, 0)).toBe(0)
    expect(quantile(h, 1)).toBe(255)
    const sd = Math.sqrt((80 * 100 ** 2 + 10 * 255 ** 2) / 100 - s.mean ** 2)
    expect(s.sd).toBeCloseTo(sd, 6)
  })
  it('gives exposure verdicts', () => {
    const flat = new Uint32Array(256).fill(1)
    expect(verdict(chanStats(flat, 0, 255)).tone).toBe('ok')
    const blown = new Uint32Array(256); blown[255] = 30; blown[128] = 70
    expect(verdict(chanStats(blown, 0, 255)).text).toMatch(/Highlights/)
    const dark = new Uint32Array(256); dark[20] = 100; dark[60] = 100
    expect(verdict(chanStats(dark, 2, 253)).tone).toBe('warn')
  })
  it('paints clipping and zebra overlays', () => {
    const src = img([[255, 128, 0], [1, 1, 1], [128, 128, 128], [250, 250, 250]])
    const out = new Uint8ClampedArray(src.length)
    applyOverlay(src, out, 4, 'clip', 2, 254, 95)
    expect([...out.slice(0, 3)]).toEqual([255, 0, 0])
    expect([...out.slice(4, 7)]).toEqual([0, 80, 255])
    expect([...out.slice(8, 11)]).toEqual([128, 128, 128])
    applyOverlay(src, out, 4, 'zebra', 2, 254, 95)
    expect([...out.slice(8, 11)]).toEqual([128, 128, 128])
    expect([0, 255]).toContain(out[12])
  })
})
