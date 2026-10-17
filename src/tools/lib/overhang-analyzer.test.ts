import { describe, expect, it } from 'vitest'
import { analyze, autoOrient, samplePawn, sampleBridge, transform } from './overhang-analyzer'

const cube = () => {
  const s = 10
  const v = [[0, 0, 0], [s, 0, 0], [s, s, 0], [0, s, 0], [0, 0, s], [s, 0, s], [s, s, s], [0, s, s]]
  const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]]
  return new Float32Array(f.flatMap((t) => t.flatMap((i) => v[i])))
}

describe('overhang-analyzer', () => {
  it('a cube needs no support in any axis-aligned pose', () => {
    for (const [rx, ry] of [[0, 0], [180, 0], [90, 0], [0, 90]]) {
      const a = analyze(transform(cube(), rx, ry, 0), 45)
      expect(a.overhangArea).toBeCloseTo(0, 6)
      expect(a.bedArea).toBeCloseTo(100, 3)
      expect(a.area).toBeCloseTo(600, 3)
    }
  })
  it('transform drops onto the bed and centres', () => {
    const p = transform(cube(), 30, 20, 10)
    let zmin = Infinity
    for (let i = 2; i < p.length; i += 3) zmin = Math.min(zmin, p[i])
    expect(zmin).toBeCloseTo(0, 5)
  })
  it('bridge ceiling is an overhang with support volume = span·width·clearance', () => {
    const a = analyze(sampleBridge(), 45)
    // underside of the deck between the legs: 30 × 20 at z = 18, plus the legs' footprint is on the bed
    expect(a.shadow).toBeCloseTo(30 * 20, 3)
    expect(a.supportVolume).toBeCloseTo(30 * 20 * 18, 1)
    expect(a.bedArea).toBeCloseTo(2 * 15 * 20, 3)
  })
  it('pawn: upright is better than upside down, auto-orient finds a good pose', () => {
    const p = samplePawn()
    const up = analyze(transform(p, 0, 0, 0), 45).supportVolume
    const down = analyze(transform(p, 180, 0, 0), 45).supportVolume
    expect(up).toBeGreaterThan(0)
    expect(down).toBeGreaterThan(up)
    const [rx, ry] = autoOrient(p, 45, 30)
    expect(analyze(transform(p, rx, ry, 0), 45).supportVolume).toBeLessThanOrEqual(up * 1.05)
  })
})
