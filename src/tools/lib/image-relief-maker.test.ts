import { describe, expect, it } from 'vitest'
import { meshVolume } from './lithophane-maker'
import { bilateral, buildMesh, heightAt, monotoneCurve, normalMap, sample, soften, type ReliefOpts } from './image-relief-maker'

const rect: ReliefOpts = { shape: 'rect', width: 40, height: 20, base: 2, depth: 3, mode: 'emboss', border: 0, rim: 3 }

describe('image relief maker', () => {
  it('monotone curve passes through points and never overshoots', () => {
    const f = monotoneCurve([[0, 0], [0.3, 0.1], [0.5, 0.5], [0.7, 0.9], [1, 1]])
    expect(f(0.5)).toBeCloseTo(0.5, 6)
    expect(f(0.3)).toBeCloseTo(0.1, 6)
    let prev = -1
    for (let x = 0; x <= 1; x += 0.01) {
      const y = f(x)
      expect(y).toBeGreaterThanOrEqual(prev - 1e-9)
      expect(y).toBeLessThanOrEqual(1 + 1e-9)
      prev = y
    }
    expect(monotoneCurve([[0, 0], [1, 1]])(0.25)).toBeCloseTo(0.25, 6)
  })
  it('bilateral keeps a step edge sharper than a box blur', () => {
    const w = 20, h = 4, g = new Float32Array(w * h)
    for (let y = 0; y < h; y++) for (let x = 10; x < w; x++) g[y * w + x] = 1
    const b = bilateral(g, w, h, 3, 0.1), s = soften(g, w, h, 3, 1)
    expect(b[9]).toBeLessThan(0.01)
    expect(s[9]).toBeGreaterThan(0.2)
    expect(b[2]).toBeCloseTo(0, 6)
  })
  it('bilinear sampling', () => {
    const g = new Float32Array([0, 1, 1, 0])
    expect(sample(g, 2, 2, 0.5, 0)).toBeCloseTo(0.5)
    expect(sample(g, 2, 2, 0.5, 0.5)).toBeCloseTo(0.5)
  })
  it('flat rect plate is closed with volume W·H·t', () => {
    const f = new Float32Array([0.5])
    const m = buildMesh((x, y) => heightAt(f, 1, 1, rect, x, y), 21, 11, rect)
    expect(meshVolume(m)).toBeCloseTo(40 * 20 * 3.5, 1)
  })
  it('round plate volume ≈ π r² t and border rim height', () => {
    const o: ReliefOpts = { ...rect, shape: 'round', width: 30, border: 2, rim: 1, mode: 'engrave' }
    const f = new Float32Array([1])
    expect(heightAt(f, 1, 1, o, 14.5, 0)).toBeCloseTo(3)
    expect(heightAt(f, 1, 1, o, 0, 0)).toBeCloseTo(2)
    const m = buildMesh(() => 2, 81, 81, o)
    expect(meshVolume(m) / (Math.PI * 15 * 15 * 2)).toBeCloseTo(1, 2)
  })
  it('normal map of a flat plate points straight out', () => {
    const n = normalMap(() => 1, 4, 4, rect)
    expect([...n.slice(0, 4)]).toEqual([128, 128, 255, 255])
    const tilt = normalMap((x) => x, 4, 4, rect)
    expect(tilt[0]).toBeLessThan(128)
  })
})
