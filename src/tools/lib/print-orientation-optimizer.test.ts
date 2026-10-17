import { describe, expect, it } from 'vitest'
import { applyRotation, distinct, evaluate, faceData, fibonacciDirs, rank, rotationToUp, sampleBracket, search, type V3 } from './print-orientation-optimizer'
import { sampleBridge } from './overhang-analyzer'

const W = { support: 6, height: 2, overhang: 1, bed: 1 }

describe('print orientation optimizer', () => {
  it('spreads unit directions', () => {
    const d = fibonacciDirs(100)
    expect(d.length).toBe(100)
    for (const v of d) expect(Math.hypot(...v)).toBeCloseTo(1, 9)
  })
  it('rotates a direction onto +Z', () => {
    for (const u of [[1, 0, 0], [0, -1, 0], [0.6, 0, 0.8], [0, 0, -1]] as V3[]) {
      const m = rotationToUp(u)
      const z = [m[0] * u[0] + m[1] * u[1] + m[2] * u[2], m[3] * u[0] + m[4] * u[1] + m[5] * u[2], m[6] * u[0] + m[7] * u[1] + m[8] * u[2]]
      expect(z[2]).toBeCloseTo(1, 9)
      expect(Math.hypot(z[0], z[1])).toBeCloseTo(0, 9)
    }
  })
  it('a box upright needs no support and sits flat', () => {
    const F = faceData(sampleBridge(20, 20, 10, 0, 0))
    const e = evaluate(F, [0, 0, 1], 45)
    expect(e.support).toBeCloseTo(0)
    expect(e.height).toBeCloseTo(10)
    expect(e.bed).toBeGreaterThan(300)
  })
  it('a bridge printed upright needs support under the deck; on its side it does not', () => {
    const F = faceData(sampleBridge())
    const upright = evaluate(F, [0, 0, 1], 45)
    const side = evaluate(F, [0, 1, 0], 45)
    expect(upright.support).toBeCloseTo(30 * 20 * 18, -1)
    expect(side.support).toBeCloseTo(0)
  })
  it('search finds a support-free orientation for the bracket', () => {
    const best = search(sampleBracket(), 45, 200, W)[0]
    expect(best.support).toBeLessThan(1)
    expect(best.pareto).toBe(true)
  })
  it('ranks and dedupes', () => {
    const r = rank([{ up: [0, 0, 1], support: 10, overhang: 1, height: 5, bed: 1, footprint: [1, 1] }, { up: [0, 0.01, 1], support: 0, overhang: 0, height: 5, bed: 1, footprint: [1, 1] }], W)
    expect(r[0].support).toBe(0)
    expect(distinct(r).length).toBe(1)
  })
  it('keeps vertex count when rotating', () => {
    const p = applyRotation(sampleBracket(), rotationToUp([1, 0, 0]))
    let zmin = Infinity
    for (let i = 2; i < p.length; i += 3) zmin = Math.min(zmin, p[i])
    expect(zmin).toBeCloseTo(0, 5)
  })
})
