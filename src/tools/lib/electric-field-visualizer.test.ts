import { describe, expect, it } from 'vitest'
import { field, fieldLines, isosurface, K, mag, potential, sampleGrid, traceLine, type Charge } from './electric-field-visualizer'

const one: Charge[] = [{ id: 'a', q: 1, p: [0, 0, 0] }]
const dip: Charge[] = [{ id: 'a', q: 2, p: [-1.5, 0, 0] }, { id: 'b', q: -2, p: [1.5, 0, 0] }]

describe('coulomb', () => {
  it('single charge field and potential', () => {
    // 1 nC at 1 cm: E = kq/r² = 89,875 V/m, V = 898.8 V
    const e = field(one, [1, 0, 0])
    expect(e[0]).toBeCloseTo(K * 1e-9 / 1e-4, 3)
    expect(e[1]).toBe(0)
    expect(potential(one, [0, 2, 0])).toBeCloseTo((K * 1e-9) / 0.02, 6)
  })
  it('superposition: dipole potential vanishes on the bisector plane and E points from + to −', () => {
    expect(Math.abs(potential(dip, [0, 1.3, -0.7]))).toBeLessThan(1e-6)
    const e = field(dip, [0, 0, 0])
    expect(e[0]).toBeGreaterThan(0)
    expect(Math.abs(e[1]) + Math.abs(e[2])).toBeLessThan(1e-6)
  })
  it('field is minus the gradient of potential', () => {
    const p: [number, number, number] = [0.4, 0.9, -0.3], h = 1e-4
    const g = [0, 1, 2].map((i) => {
      const a = [...p] as [number, number, number], b = [...p] as [number, number, number]
      a[i] += h; b[i] -= h
      return -(potential(dip, a) - potential(dip, b)) / (2 * h * 0.01)
    })
    const e = field(dip, p)
    for (let i = 0; i < 3; i++) expect(g[i] / e[i]).toBeCloseTo(1, 4)
  })
})

describe('field lines', () => {
  it('a dipole line from + ends on −', () => {
    const r = traceLine(dip, [-1.35, 0.05, 0], 1, 10)
    expect(r.end).toBe('charge')
    expect(r.pts[r.pts.length - 1]).toEqual([1.5, 0, 0])
  })
  it('lines from a lone charge leave the box radially', () => {
    const r = traceLine(one, [0.2, 0, 0], 1, 3)
    expect(r.end).toBe('box')
    const last = r.pts[r.pts.length - 1]
    expect(Math.abs(last[1]) + Math.abs(last[2])).toBeLessThan(1e-6)
  })
  it('seeds lines in proportion to charge', () => {
    expect(fieldLines(dip, 12, 6).length).toBe(12)
  })
})

describe('equipotential isosurface', () => {
  it('is a sphere of radius kq/V around a point charge', () => {
    const L = 3, n = 31
    const g = sampleGrid((p) => potential(one, p), n, L)
    const V = 600 // r = kq/V = 8.98755/600 m ≈ 1.498 cm
    const tri = isosurface(g, n, L, V)
    expect(tri.length).toBeGreaterThan(300)
    const r0 = (K * 1e-9) / V / 0.01
    for (let i = 0; i < tri.length; i += 3) expect(Math.abs(Math.hypot(tri[i], tri[i + 1], tri[i + 2]) - r0)).toBeLessThan(0.08)
    expect(mag([3, 4, 0])).toBe(5)
  })
})
