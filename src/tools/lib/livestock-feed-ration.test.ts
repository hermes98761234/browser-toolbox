import { describe, expect, it } from 'vitest'
import { formulate, simplex, type Feed } from './livestock-feed-ration'

const F = (id: string, dm: number, tdn: number, cp: number, ca: number, p: number, ndf: number, cost: number, extra: Partial<Feed> = {}): Feed => ({ id, name: id, dm, tdn, cp, ca, p, ndf, cost, use: true, min: 0, max: 100, ...extra })

describe('livestock-feed-ration', () => {
  it('solves textbook LPs', () => {
    const a = simplex([2, 3], [{ a: [1, 1], rel: '>=', b: 4 }, { a: [1, 3], rel: '>=', b: 6 }, { a: [1, 0], rel: '<=', b: 3 }])
    expect(a.status).toBe('optimal')
    expect(a.value).toBeCloseTo(9)
    expect(a.x[0]).toBeCloseTo(3)
    const b = simplex([1, 1], [{ a: [1, 2], rel: '=', b: 4 }, { a: [1, -1], rel: '>=', b: 1 }])
    expect(b.value).toBeCloseTo(3)
    expect(simplex([1, 1], [{ a: [1, 1], rel: '<=', b: 1 }, { a: [1, 1], rel: '>=', b: 2 }]).status).toBe('infeasible')
    expect(simplex([-1], [{ a: [1], rel: '>=', b: 1 }]).status).toBe('unbounded')
    const neg = simplex([1], [{ a: [-1], rel: '<=', b: -5 }])
    expect(neg.x[0]).toBeCloseTo(5)
  })
  it('formulates a feasible least-cost ration', () => {
    const feeds = [
      F('grass hay', 88, 55, 10, 0.5, 0.22, 64, 150),
      F('alfalfa', 89, 58, 19, 1.4, 0.24, 46, 220),
      F('corn', 88, 88, 9.5, 0.03, 0.3, 10, 210),
      F('sbm', 89, 84, 49.9, 0.4, 0.71, 15, 450),
      F('limestone', 100, 0, 0, 38, 0, 0, 300),
    ]
    const req = { dmi: 7.3, tdn: 68, cp: 13, ca: 0.48, p: 0.24, ndfMin: 20, ndfMax: 60, caPMin: 1.2, caPMax: 7 }
    const r = formulate(feeds, req)
    expect(r.status).toBe('optimal')
    expect(r.dm.reduce((a, b) => a + b, 0)).toBeCloseTo(7.3)
    expect(r.supply.tdn).toBeGreaterThanOrEqual(68 - 1e-6)
    expect(r.supply.cp).toBeGreaterThanOrEqual(13 - 1e-6)
    expect(r.caP).toBeGreaterThanOrEqual(1.2 - 1e-6)
    expect(r.asFed[0]).toBeCloseTo(r.dm[0] / 0.88)
    // forcing too much straw-like hay makes TDN impossible
    expect(formulate(feeds.map((f) => (f.id === 'grass hay' ? { ...f, min: 90 } : f)), req).status).toBe('infeasible')
  })
})
