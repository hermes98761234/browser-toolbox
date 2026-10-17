import { describe, expect, it } from 'vitest'
import { indeterminacy, PRESETS, solveLinear, solveTruss, type TNode } from './space-truss-analyzer'

const node = (id: string, x: number, y: number, z: number, fix = false, load: [number, number, number] = [0, 0, 0]): TNode => ({
  id, x, y, z, rx: fix, ry: fix, rz: fix, px: load[0], py: load[1], pz: load[2],
})

describe('space-truss-analyzer', () => {
  it('solves a linear system', () => {
    expect(solveLinear([[2, 1], [1, 3]], [3, 5])!.map((v) => +v.toFixed(9))).toEqual([0.8, 1.4])
    expect(solveLinear([[1, 2], [2, 4]], [1, 2])).toBeNull()
  })
  it('matches PL/EA for a single bar', () => {
    const nodes = [node('A', 0, 0, 0, true), { ...node('B', 2, 0, 0), ry: true, rz: true, px: 10 }]
    const r = solveTruss(nodes, [{ id: 'm', a: 'A', b: 'B', area: 10 }], 200)
    expect(r.ok).toBe(true)
    expect(r.force[0]).toBeCloseTo(10, 9)
    expect(r.disp[1][0]).toBeCloseTo((10 * 2) / (200e6 * 10e-4), 12)
    expect(r.stress[0]).toBeCloseTo(10, 9) // 10 kN / 10 cm² = 10 MPa
    expect(r.reactions[0][0]).toBeCloseTo(-10, 9)
  })
  it('solves a symmetric pyramid', () => {
    const P = 100
    const nodes = [node('1', 2, 0, 2, true), node('2', -2, 0, 2, true), node('3', -2, 0, -2, true), node('4', 2, 0, -2, true), node('T', 0, 3, 0, false, [0, -P, 0])]
    const members = ['1', '2', '3', '4'].map((a) => ({ id: a, a, b: 'T', area: 5 }))
    const r = solveTruss(nodes, members, 200)
    const expected = (-P * Math.sqrt(17)) / 12
    for (const f of r.force) expect(f).toBeCloseTo(expected, 6)
    const Ry = r.reactions.reduce((a, rr) => a + rr[1], 0)
    expect(Ry).toBeCloseTo(P, 6)
    expect(indeterminacy(nodes, members)).toBe(1)
  })
  it('detects mechanisms and bad input', () => {
    const nodes = [node('A', 0, 0, 0, true), node('B', 1, 0, 0)]
    const r = solveTruss(nodes, [{ id: 'm', a: 'A', b: 'B', area: 1 }], 200)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/Unstable/)
    expect(solveTruss(nodes, [{ id: 'm', a: 'A', b: 'X', area: 1 }], 200).error).toMatch(/missing/)
  })
})

describe('space-truss-analyzer presets', () => {
  for (const [name, make] of Object.entries(PRESETS)) {
    it(`${name} is stable and in equilibrium`, () => {
      const m = make()
      const r = solveTruss(m.nodes, m.members, 200)
      expect(r.error).toBeUndefined()
      for (const ax of [0, 1, 2] as const) {
        const load = m.nodes.reduce((a, n) => a + [n.px, n.py, n.pz][ax], 0)
        const react = r.reactions.reduce((a, rr) => a + rr[ax], 0)
        expect(load + react).toBeCloseTo(0, 6)
      }
    })
  }
})
