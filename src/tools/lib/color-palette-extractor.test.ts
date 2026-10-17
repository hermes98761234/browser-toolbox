import { describe, expect, it } from 'vitest'
import { mix, mmcq, roles } from './color-palette-extractor'

function img(parts: [number, number, number, number][]): Uint8ClampedArray {
  const n = parts.reduce((a, p) => a + p[3], 0)
  const d = new Uint8ClampedArray(n * 4)
  let o = 0
  for (const [r, g, b, k] of parts) for (let i = 0; i < k; i++) { d[o++] = r; d[o++] = g; d[o++] = b; d[o++] = 255 }
  return d
}

describe('color-palette-extractor', () => {
  it('finds solid colours with correct shares', () => {
    const p = mmcq(img([[200, 30, 30, 300], [20, 40, 220, 100]]), 4)
    expect(p.length).toBe(2)
    expect(p[0].share).toBeCloseTo(0.75)
    expect(Math.abs(p[0].rgb[0] - 200)).toBeLessThan(8)
    expect(Math.abs(p[1].rgb[2] - 220)).toBeLessThan(8)
  })
  it('respects k and ignores white / transparent', () => {
    const parts: [number, number, number, number][] = []
    for (let i = 0; i < 20; i++) parts.push([i * 12, 255 - i * 12, (i * 50) % 255, 10])
    parts.push([255, 255, 255, 500])
    const p = mmcq(img(parts), 5, { ignoreWhite: true })
    expect(p.length).toBeLessThanOrEqual(5)
    expect(p.every((s) => !(s.rgb[0] > 245 && s.rgb[1] > 245 && s.rgb[2] > 245))).toBe(true)
    const t = new Uint8ClampedArray([10, 10, 10, 0])
    expect(mmcq(t, 3)).toEqual([])
  })
  it('assigns roles', () => {
    const r = roles(mmcq(img([[230, 30, 30, 100], [120, 120, 130, 100], [40, 10, 60, 50]]), 6))
    expect(r.find((x) => x.role === 'Vibrant')?.swatch?.rgb[0]).toBeGreaterThan(200)
  })
  it('mixes tints and shades', () => {
    expect(mix([100, 100, 100], 0.5)).toEqual([178, 178, 178])
    expect(mix([100, 100, 100], -0.5)).toEqual([50, 50, 50])
  })
})
