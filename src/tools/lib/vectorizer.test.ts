import { describe, expect, it } from 'vitest'
import { bezAt, contours, corners, DEFAULTS, fitCurve, kmeans, mergeSmall, quantize, rdpClosed, signedArea, trace, type P } from './vectorizer'

function img(w: number, h: number, f: (x: number, y: number) => [number, number, number, number]) {
  const px = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.set(f(x, y), (y * w + x) * 4)
  return px
}

describe('vectorizer', () => {
  it('marching squares traces a square with cut corners', () => {
    const m = new Uint8Array(16)
    for (const [x, y] of [[1, 1], [2, 1], [1, 2], [2, 2]]) m[y * 4 + x] = 1
    const c = contours(m, 4, 4)
    expect(c).toHaveLength(1)
    expect(signedArea(c[0])).toBeCloseTo(3.5, 9)
    const xs = c[0].map((p) => p[0])
    expect(Math.min(...xs)).toBe(1)
    expect(Math.max(...xs)).toBe(3)
  })
  it('holes have opposite orientation', () => {
    const w = 7, m = new Uint8Array(w * w)
    for (let y = 1; y < 6; y++) for (let x = 1; x < 6; x++) m[y * w + x] = x === 3 && y === 3 ? 0 : 1
    const c = contours(m, w, w).map(signedArea).sort((a, b) => a - b)
    expect(c).toHaveLength(2)
    expect(c[0]).toBeLessThan(0)
    expect(c[1]).toBeGreaterThan(0)
  })
  it('k-means finds the two colours', () => {
    const px = img(20, 10, (x) => (x < 10 ? [250, 10, 10, 255] : [10, 10, 250, 255]))
    const pal = kmeans(px, 2).sort((a, b) => b[0] - a[0])
    expect(pal[0][0]).toBeGreaterThan(240)
    expect(pal[1][2]).toBeGreaterThan(240)
    const q = quantize(px, pal)
    expect(new Set(q).size).toBe(2)
  })
  it('merges small regions into their neighbours', () => {
    const idx = new Int16Array(25).fill(0)
    idx[12] = 1
    idx[0] = 2
    const m = mergeSmall(idx, 5, 5, 2)
    expect([...m].every((v) => v === 0)).toBe(true)
  })
  it('RDP keeps the corners of a noisy square', () => {
    const ring: P[] = []
    for (let i = 0; i < 10; i++) ring.push([i, 0.05 * (i % 2)])
    for (let i = 0; i < 10; i++) ring.push([10, i])
    for (let i = 10; i > 0; i--) ring.push([i, 10])
    for (let i = 10; i > 0; i--) ring.push([0, i])
    expect(rdpClosed(ring, 0.3)).toHaveLength(4)
    expect(corners(ring, 60).length).toBe(4)
  })
  it('Bézier fitting approximates a quarter circle within tolerance', () => {
    const pts: P[] = Array.from({ length: 40 }, (_, i) => {
      const a = (i / 39) * (Math.PI / 2)
      return [100 * Math.cos(a), 100 * Math.sin(a)]
    })
    const bz = fitCurve(pts, 0.5)
    expect(bz.length).toBeLessThanOrEqual(2)
    for (const p of pts) {
      let best = Infinity
      for (const b of bz) for (let t = 0; t <= 1; t += 0.002) {
        const q = bezAt(b, t)
        best = Math.min(best, Math.hypot(q[0] - p[0], q[1] - p[1]))
      }
      expect(best).toBeLessThan(0.6)
    }
  })
  it('full trace of a disc produces stacked layers', () => {
    const px = img(40, 40, (x, y) => ((x - 20) ** 2 + (y - 20) ** 2 < 144 ? [255, 200, 0, 255] : [255, 255, 255, 255]))
    const r = trace(px, 40, 40, { ...DEFAULTS, colors: 2 })
    expect(r.layers).toHaveLength(2)
    expect(r.layers[0].color).toBe('#ffffff')
    expect(r.svg).toContain('<path fill="#ffc800"')
    expect(r.layers[1].d.match(/C/g)!.length).toBeLessThan(16)
    const poly = trace(px, 40, 40, { ...DEFAULTS, colors: 2, mode: 'polygons' })
    expect(poly.layers[1].d).toMatch(/^M[\d. L]+Z$/)
  })
})
