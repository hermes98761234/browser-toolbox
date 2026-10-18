import { describe, expect, it } from 'vitest'
import { align, boxBlur, focusMap, phaseCorrelate, pyramidBlend, selectSharpest, warp, type Img } from './focus-stacking-merger'

function texture(w: number, h: number, seed = 3): Img {
  let s = seed
  const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296)
  const base = new Float32Array(w * h).map(() => rnd() * 255)
  return { w, h, d: boxBlur(base, w, h, 1) }
}

describe('focus-stacking-merger', () => {
  it('box blur preserves the mean of a constant image', () => {
    const a = new Float32Array(50).fill(7)
    expect(boxBlur(a, 10, 5, 2).every((v) => Math.abs(v - 7) < 1e-5)).toBe(true)
  })
  it('phase correlation recovers an integer shift', () => {
    const a = texture(96, 80)
    const b: Img = { w: 96, h: 80, d: warp(a.d, 96, 80, { s: 1, tx: -5, ty: 3 }) } // b(p) = a(p − (5, −3))
    const r = phaseCorrelate(a, b)
    expect([r.dx, r.dy]).toEqual([5, -3])
  })
  it('aligns translation and scale', () => {
    const w = 240, h = 180
    const a = texture(w, h, 9)
    const t = { s: 1.02, tx: 4.5, ty: -2.25 }
    const b: Img = { w, h, d: warp(a.d, w, h, { s: 1 / t.s, tx: -t.tx / t.s, ty: -t.ty / t.s }) }
    const est = align(a, b)
    // aligned(p) = b(c + s(p − c) + t) ≈ a(p)
    expect(est.s).toBeCloseTo(t.s, 2)
    expect(Math.abs(est.tx - t.tx)).toBeLessThan(0.6)
    expect(Math.abs(est.ty - t.ty)).toBeLessThan(0.6)
  })
  it('prefers the sharp frame and blends identical frames losslessly', () => {
    const w = 64, h = 48
    const sharp = texture(w, h, 5)
    const soft: Img = { w, h, d: boxBlur(boxBlur(sharp.d, w, h, 3), w, h, 3) }
    const sel = selectSharpest([focusMap(soft, 2), focusMap(sharp, 2)])
    const share = sel.idx.reduce((a, v) => a + v, 0) / sel.idx.length
    expect(share).toBeGreaterThan(0.9)
    const ones = new Float32Array(w * h).fill(1)
    const out = pyramidBlend([sharp.d, sharp.d], [ones, ones], w, h, 4)
    let err = 0
    for (let i = 0; i < out.length; i++) err = Math.max(err, Math.abs(out[i] - sharp.d[i]))
    expect(err).toBeLessThan(1e-3)
  })
})
