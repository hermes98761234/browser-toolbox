import { describe, expect, it } from 'vitest'
import { bestBlend, PRODUCTS, solveLP, supplied } from './fertilizer-blend-calculator'

describe('LP solver', () => {
  it('solves a >= minimisation', () => {
    const r = solveLP([2, 3], [{ a: [1, 1], op: '>=', b: 4 }, { a: [1, 3], op: '>=', b: 6 }])
    expect(r.status).toBe('optimal')
    if (r.status === 'optimal') {
      expect(r.value).toBeCloseTo(9)
      expect(r.x[0]).toBeCloseTo(3)
    }
  })
  it('solves the classic Wyndor problem', () => {
    const r = solveLP([-3, -5], [{ a: [1, 0], op: '<=', b: 4 }, { a: [0, 2], op: '<=', b: 12 }, { a: [3, 2], op: '<=', b: 18 }])
    expect(r.status === 'optimal' && r.value).toBeCloseTo(-36)
  })
  it('detects infeasibility', () => {
    expect(solveLP([1], [{ a: [1], op: '>=', b: 5 }, { a: [1], op: '<=', b: 3 }]).status).toBe('infeasible')
  })
})

describe('fertilizer blend', () => {
  it('picks the cheapest N source', () => {
    const r = bestBlend(PRODUCTS, { n: 100, p: 0, k: 0, s: 0 })
    const urea = r.rates.find((x) => x.p.id === 'urea')!
    expect(urea.kg).toBeCloseTo(100 / 0.46, 3)
    expect(r.cost).toBeCloseTo((100 / 0.46) * 0.42, 3)
  })
  it('meets every target in a full NPK blend', () => {
    const t = { n: 120, p: 60, k: 60, s: 20 }
    const r = bestBlend(PRODUCTS, t)
    const got = supplied(r.rates)
    for (const k of ['n', 'p', 'k', 's'] as const) expect(got[k]).toBeGreaterThanOrEqual(t[k] - 1e-6)
    expect(r.cost).toBeGreaterThan(0)
  })
  it('respects an over-application cap or reports infeasible', () => {
    const t = { n: 120, p: 60, k: 60, s: 0 }
    const r = bestBlend(PRODUCTS, t, 0.1)
    const got = supplied(r.rates)
    expect(got.p).toBeLessThanOrEqual(66 + 1e-6)
    expect(bestBlend(PRODUCTS.filter((p) => p.id === 'npk15'), { n: 100, p: 30, k: 0, s: 0 }, 0.1).status).toBe('infeasible')
  })
})
