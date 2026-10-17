import { describe, expect, it } from 'vitest'
import { alphaFrom, boxBlur, components, DEFAULT_BG, decontaminate, rgbToLab, segment } from './background-remover'

function scene(w: number, h: number, bg: number[], fg: number[], inside: (x: number, y: number) => boolean): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = inside(x, y) ? fg : bg
      const n = ((x * 7 + y * 13) % 5) - 2 // mild noise
      px.set([c[0] + n, c[1] + n, c[2] + n, 255], (y * w + x) * 4)
    }
  return px
}

describe('rgbToLab', () => {
  it('matches reference values', () => {
    const [L, a, b] = rgbToLab(255, 255, 255)
    expect(L).toBeCloseTo(100, 1)
    expect(Math.abs(a)).toBeLessThan(0.5)
    expect(Math.abs(b)).toBeLessThan(0.5)
    expect(rgbToLab(255, 0, 0)[0]).toBeCloseTo(53.24, 1)
  })
})

describe('segment', () => {
  const w = 60, h = 40
  const px = scene(w, h, [40, 90, 200], [230, 60, 40], (x, y) => x >= 20 && x < 40 && y >= 10 && y < 30)
  it('separates a red square from a blue backdrop', () => {
    const bg = segment(px, w, h, DEFAULT_BG)
    expect(bg[0]).toBe(1)
    expect(bg[20 * w + 30]).toBe(0)
    let fg = 0
    for (const v of bg) fg += v ? 0 : 1
    expect(Math.abs(fg - 400)).toBeLessThan(40)
  })
  it('honours keep / remove hints', () => {
    const hints = new Uint8Array(w * h)
    hints[2 * w + 2] = 1
    hints[20 * w + 30] = 2
    const bg = segment(px, w, h, { ...DEFAULT_BG, iterations: 0 }, hints)
    expect(bg[20 * w + 30]).toBe(1)
  })
  it('colour key removes matching colours everywhere', () => {
    const g = scene(w, h, [0, 177, 64], [250, 220, 180], (x) => x > 30)
    const bg = segment(g, w, h, { ...DEFAULT_BG, mode: 'key', key: [0, 177, 64] })
    expect(bg[5]).toBe(1)
    expect(bg[10 * w + 50]).toBe(0)
  })
})

describe('helpers', () => {
  it('boxBlur keeps the mean of a constant field', () => {
    const f = new Float32Array(25).fill(3)
    expect([...boxBlur(f, 5, 5, 1)].every((v) => Math.abs(v - 3) < 1e-6)).toBe(true)
  })
  it('components counts blobs and border contact', () => {
    const m = new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0])
    const c = components(m, 4, 4, 1)
    expect(c.size).toEqual([1, 2])
    expect(c.border).toEqual([true, true])
  })
  it('alpha and decontamination', () => {
    const a = alphaFrom(new Uint8Array([1, 0, 0, 0]), 4, 1, 0)
    expect([...a]).toEqual([0, 255, 255, 255])
    const px = new Uint8ClampedArray([150, 150, 150, 255])
    decontaminate(px, new Uint8ClampedArray([128]), [100, 100, 100])
    expect(px[0]).toBeCloseTo(200, -1)
  })
})
