import { describe, expect, it } from 'vitest'
import { applyPattern, lanczos, planSize, resampleRGBA, taps } from './batch-image-resizer'

const o = { mode: 'exact' as const, w: 100, h: 100, pct: 50, fit: 'stretch' as const, noUpscale: false }

describe('planSize', () => {
  it('handles simple modes', () => {
    expect(planSize(4000, 3000, { ...o, mode: 'percent', pct: 25 })).toMatchObject({ outW: 1000, outH: 750 })
    expect(planSize(4000, 3000, { ...o, mode: 'width', w: 800 })).toMatchObject({ outW: 800, outH: 600 })
    expect(planSize(4000, 3000, { ...o, mode: 'height', h: 300 })).toMatchObject({ outW: 400, outH: 300 })
    expect(planSize(4000, 3000, { ...o, mode: 'fit', w: 1000, h: 1000 })).toMatchObject({ outW: 1000, outH: 750 })
    expect(planSize(400, 300, { ...o, mode: 'fit', w: 1000, h: 1000, noUpscale: true })).toMatchObject({ outW: 400, outH: 300 })
  })
  it('handles exact fits', () => {
    expect(planSize(4000, 3000, { ...o, w: 1080, h: 1080 })).toMatchObject({ outW: 1080, outH: 1080, dw: 1080, dh: 1080, sw: 4000 })
    expect(planSize(4000, 3000, { ...o, w: 1080, h: 1080, fit: 'contain' })).toMatchObject({ outW: 1080, outH: 1080, dw: 1080, dh: 810, dx: 0, dy: 135 })
    expect(planSize(4000, 3000, { ...o, w: 1080, h: 1080, fit: 'cover' })).toMatchObject({ outW: 1080, outH: 1080, sx: 500, sy: 0, sw: 3000, sh: 3000, dw: 1080 })
  })
})

describe('lanczos', () => {
  it('kernel basics', () => {
    expect(lanczos(0)).toBe(1)
    expect(lanczos(1)).toBeCloseTo(0, 10)
    expect(lanczos(3.2)).toBe(0)
  })
  it('taps are normalised', () => {
    const t = taps(100, 30)
    for (let i = 0; i < 30; i++) {
      let s = 0
      for (let k = 0; k < t.n; k++) s += t.w[i * t.n + k]
      expect(s).toBeCloseTo(1, 5)
    }
  })
  it('keeps flat colour and averages a checkerboard', () => {
    const flat = new Uint8ClampedArray(16 * 16 * 4).map((_, i) => [200, 100, 50, 255][i % 4])
    const r = resampleRGBA(flat, 16, 16, 5, 7)
    expect([r[0], r[1], r[2], r[3]]).toEqual([200, 100, 50, 255])
    const chk = new Uint8ClampedArray(64 * 64 * 4)
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const v = (x + y) % 2 ? 255 : 0; chk.set([v, v, v, 255], (y * 64 + x) * 4) }
    const c = resampleRGBA(chk, 64, 64, 8, 8)
    expect(Math.abs(c[4 * 27] - 128)).toBeLessThan(6)
  })
})

describe('applyPattern', () => {
  it('fills tokens', () => {
    expect(applyPattern('{name}-{w}x{h}', 'beach.photo.JPG', 800, 600, 3, 'jpg')).toBe('beach.photo-800x600.jpg')
    expect(applyPattern('img_{n}', 'a.png', 1, 1, 3, 'webp')).toBe('img_03.webp')
  })
})
