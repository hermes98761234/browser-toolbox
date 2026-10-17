import { describe, expect, it } from 'vitest'
import { borderColor, colorDist, contrast, hexRgb, removeBackground, segments, wrap } from './thumbnail-maker'

function img(w: number, h: number, fg: (x: number, y: number) => boolean): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const c = fg(x, y) ? [200, 30, 30] : [0, 177, 64]
      d.set([...c, 255], i)
    }
  return d
}

describe('thumbnail-maker', () => {
  it('measures colour distance', () => {
    expect(colorDist(10, 10, 10, 10, 10, 10)).toBe(0)
    expect(colorDist(0, 0, 0, 255, 255, 255)).toBeGreaterThan(200)
  })
  it('removes a green-screen background but keeps the subject', () => {
    const w = 20, h = 20
    const d = img(w, h, (x, y) => x >= 5 && x < 15 && y >= 5 && y < 15)
    expect(borderColor(d, w, h)).toEqual([0, 177, 64])
    const frac = removeBackground(d, w, h, 30, 0)
    expect(frac).toBeCloseTo(300 / 400)
    expect(d[3]).toBe(0)
    expect(d[(10 * w + 10) * 4 + 3]).toBe(255)
  })
  it('flood fill keeps enclosed background-coloured holes unless global', () => {
    const w = 20, h = 20
    const ring = (x: number, y: number) => x >= 4 && x < 16 && y >= 4 && y < 16 && !(x >= 8 && x < 12 && y >= 8 && y < 12)
    const a = img(w, h, ring)
    removeBackground(a, w, h, 30, 0)
    expect(a[(10 * w + 10) * 4 + 3]).toBe(255)
    const b = img(w, h, ring)
    removeBackground(b, w, h, 30, 0, true)
    expect(b[(10 * w + 10) * 4 + 3]).toBe(0)
  })
  it('parses highlighted words and wraps lines', () => {
    expect(segments('I *TRIED* it')).toEqual([{ t: 'I ', hot: false }, { t: 'TRIED', hot: true }, { t: ' it', hot: false }])
    expect(wrap('aa bb cc', 5, (s) => s.length)).toEqual(['aa bb', 'cc'])
    expect(wrap('one\ntwo', 100, (s) => s.length)).toEqual(['one', 'two'])
  })
  it('computes WCAG contrast', () => {
    expect(contrast(hexRgb('#000'), hexRgb('#fff'))).toBeCloseTo(21)
    expect(contrast(hexRgb('#777777'), hexRgb('#777777'))).toBe(1)
  })
})
