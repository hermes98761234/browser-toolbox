import { describe, expect, it } from 'vitest'
import { integrateRadial, isosurface, laguerre, legendre, meanR, meshArea, orbitalName, psi, radial, radiusFor, realY, sampleField } from './atomic-orbital-viewer'

describe('special functions', () => {
  it('Laguerre and Legendre reference values', () => {
    expect(laguerre(2, 1, 0.5)).toBeCloseTo(((0.5 ** 2) - 6 * 0.5 + 6) / 2, 12) // L2^1(x) = (x² − 6x + 6)/2
    expect(legendre(2, 0, 0.3)).toBeCloseTo((3 * 0.09 - 1) / 2, 12)
    expect(legendre(2, 1, 0.3)).toBeCloseTo(-3 * 0.3 * Math.sqrt(1 - 0.09), 12)
    expect(legendre(3, 3, 0.3)).toBeCloseTo(-15 * (1 - 0.09) ** 1.5, 12)
  })
  it('known closed forms', () => {
    expect(radial(1, 0, 0.7)).toBeCloseTo(2 * Math.exp(-0.7), 12)
    expect(radial(2, 1, 1.3)).toBeCloseTo((1 / Math.sqrt(24)) * 1.3 * Math.exp(-0.65), 12)
    // p_x real harmonic is positive along +x
    expect(realY(1, 1, Math.PI / 2, 0)).toBeCloseTo(Math.sqrt(3 / (4 * Math.PI)), 12)
    expect(psi(2, 1, 1, -2, 0, 0)).toBeLessThan(0)
  })
})

describe('normalisation', () => {
  it('radial functions integrate to 1', () => {
    for (const [n, l] of [[1, 0], [2, 0], [2, 1], [3, 2], [4, 3], [5, 1]]) expect(integrateRadial(n, l)).toBeCloseTo(1, 6)
    expect(integrateRadial(2, 1, 3, 80)).toBeCloseTo(1, 6)
  })
  it('real harmonics integrate to 1 over the sphere', () => {
    for (const [l, m] of [[0, 0], [1, -1], [2, 2], [3, -2], [3, 3]]) {
      let s = 0
      const nt = 200, np = 400
      for (let i = 0; i < nt; i++) for (let j = 0; j < np; j++) {
        const th = ((i + 0.5) * Math.PI) / nt, ph = ((j + 0.5) * 2 * Math.PI) / np
        s += realY(l, m, th, ph) ** 2 * Math.sin(th) * (Math.PI / nt) * ((2 * Math.PI) / np)
      }
      expect(s).toBeCloseTo(1, 4)
    }
  })
  it('mean radius and extent', () => {
    expect(meanR(1, 0)).toBe(1.5)
    expect(meanR(3, 2)).toBe(10.5)
    expect(radiusFor(1, 0, 1, 0.5)).toBeGreaterThan(1.33)
    expect(radiusFor(1, 0, 1, 0.5)).toBeLessThan(1.35) // median radius of 1s ≈ 1.337 a0
  })
  it('names', () => {
    expect(orbitalName(3, 2, 2)).toBe('3d_x²−y²')
    expect(orbitalName(1, 0, 0)).toBe('1s')
  })
})

describe('marching tetrahedra', () => {
  it('sphere isosurface area ≈ 4πr²', () => {
    const f = sampleField((x, y, z) => 2 - Math.hypot(x, y, z), 41, 3)
    const m = isosurface(f, 1) // r = 1
    expect(meshArea(m)).toBeGreaterThan(4 * Math.PI * 0.95)
    expect(meshArea(m)).toBeLessThan(4 * Math.PI * 1.02)
    // outward normals at vertices
    let ok = 0
    for (let i = 0; i < m.positions.length; i += 3) if (m.positions[i] * m.normals[i] + m.positions[i + 1] * m.normals[i + 1] + m.positions[i + 2] * m.normals[i + 2] > 0) ok++
    expect(ok).toBe(m.positions.length / 3)
  })
})
