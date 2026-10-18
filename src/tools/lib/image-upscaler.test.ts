import { describe, expect, it } from 'vitest'
import { edgeDouble, KERNELS, outSize, pixelScale, resize, tiled, unsharp, upscale, type Img } from './image-upscaler'

const make = (w: number, h: number, f: (x: number, y: number) => [number, number, number, number]): Img => {
  const d = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set(f(x, y), (y * w + x) * 4)
  return { w, h, d }
}
const px = (im: Img, x: number, y: number) => [...im.d.subarray((y * im.w + x) * 4, (y * im.w + x) * 4 + 4)]

describe('kernels', () => {
  it('have the textbook values', () => {
    expect(KERNELS.lanczos3.f(0)).toBe(1)
    expect(KERNELS.lanczos3.f(1)).toBeCloseTo(0, 10)
    expect(KERNELS.lanczos3.f(0.5)).toBeCloseTo(0.6079, 4)
    expect(KERNELS.bicubic.f(0.5)).toBeCloseTo(0.5625, 6)
    expect(KERNELS.bicubic.f(1.5)).toBeCloseTo(-0.0625, 6)
  })
})

describe('resize', () => {
  it('keeps flat colours flat (normalised weights) for every kernel', () => {
    const im = make(7, 5, () => [40, 120, 200, 255])
    for (const m of ['bilinear', 'bicubic', 'lanczos3'] as const) {
      const r = resize(im, 17, 11, m)
      expect(r.w).toBe(17)
      for (let i = 0; i < r.d.length; i += 4) expect([r.d[i], r.d[i + 1], r.d[i + 2], r.d[i + 3]]).toEqual([40, 120, 200, 255])
    }
  })
  it('does not darken colour next to transparent pixels (premultiplied alpha)', () => {
    const im = make(4, 1, (x) => (x < 2 ? [255, 0, 0, 255] : [0, 0, 0, 0]))
    const r = resize(im, 8, 1, 'bilinear')
    const mid = px(r, 4, 0)
    expect(mid[3]).toBeGreaterThan(0)
    expect(mid[0]).toBe(255)
  })
})

describe('edge-directed', () => {
  it('keeps the original samples on even coordinates', () => {
    const im = make(6, 6, (x, y) => [x * 40, y * 40, (x * y) % 255, 255])
    const r = edgeDouble(im)
    expect(r.w).toBe(12)
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) expect(px(r, 2 * x, 2 * y)).toEqual(px(im, x, y))
  })
  it('interpolates along a diagonal edge, not across it', () => {
    // black above the anti-diagonal x+y<6, white below
    const im = make(8, 8, (x, y) => (x + y < 6 ? [0, 0, 0, 255] : [255, 255, 255, 255]))
    const r = edgeDouble(im)
    // new pixel (5,5) sits between (2,2) black/(3,3) white (across the edge) and (3,2)/(2,3), both black (along it)
    expect(px(r, 5, 5)[0]).toBe(0)
  })
  it('tiled processing equals whole-image processing', () => {
    const im = make(40, 30, (x, y) => [(x * 37 + y * 11) % 256, (x * y) % 256, (y * 53) % 256, 255])
    const a = edgeDouble(im)
    const b = tiled(im, 2, edgeDouble, 16, 6)
    expect(b.d).toEqual(a.d)
  })
})

describe('pixel art', () => {
  it('leaves flat areas untouched and rounds a staircase', () => {
    const flat = pixelScale(make(3, 3, () => [9, 9, 9, 255]), 2)
    expect(new Set(flat.d).size).toBe(2)
    // 2x2 checker-free staircase: top-left black corner
    const B: [number, number, number, number] = [0, 0, 0, 255], W: [number, number, number, number] = [255, 255, 255, 255]
    const im = make(3, 3, (x, y) => (x === 0 || y === 0 ? B : W))
    const r = pixelScale(im, 2)
    // centre pixel E=(1,1) is white with black above and left → its top-left sub-pixel becomes black
    expect(px(r, 2, 2)).toEqual(B)
    expect(px(r, 3, 3)).toEqual(W)
    const r3 = pixelScale(im, 3)
    expect(px(r3, 3, 3)).toEqual(B)
    expect(px(r3, 4, 4)).toEqual(W)
    const t = tiled(im, 3, (x) => pixelScale(x, 3), 2, 2)
    expect(t.d).toEqual(r3.d)
  })
})

describe('pipeline', () => {
  it('computes output sizes and sharpens without touching flat areas', () => {
    expect(outSize(100, 50, { method: 'lanczos3', factor: 2.5 })).toEqual([250, 125])
    expect(outSize(100, 50, { method: 'pixelart', factor: 2.6 })).toEqual([300, 150])
    const flat = make(10, 10, () => [100, 100, 100, 255])
    expect(unsharp(flat, 1, 1, 0).d).toEqual(flat.d)
    const r = upscale(make(10, 8, (x) => [x * 20, 50, 50, 255]), { method: 'edge', factor: 3, sharpen: 0.5, sigma: 1, threshold: 2 })
    expect([r.w, r.h]).toEqual([30, 24])
  })
})
