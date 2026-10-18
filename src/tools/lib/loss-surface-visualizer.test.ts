import { describe, expect, it } from 'vitest'
import { DEF_HYPER, distToMin, runPath, SURFACES } from './loss-surface-visualizer'

describe('loss surfaces', () => {
  it('analytic gradients match finite differences', () => {
    const h = 1e-6
    for (const s of SURFACES)
      for (const [x, y] of [[0.3, -0.7], [1.2, 0.4], [-1.1, 1.9]]) {
        const [gx, gy] = s.g(x, y)
        const nx = (s.f(x + h, y) - s.f(x - h, y)) / (2 * h)
        const ny = (s.f(x, y + h) - s.f(x, y - h)) / (2 * h)
        expect(gx).toBeCloseTo(nx, 3)
        expect(gy).toBeCloseTo(ny, 3)
      }
  })
  it('known minima have f ≈ 0', () => {
    for (const s of SURFACES) for (const [x, y] of s.minima) expect(Math.abs(s.f(x, y))).toBeLessThan(1e-6)
  })
  it('optimisers converge on the bowl', () => {
    const bowl = SURFACES[0]
    for (const o of ['sgd', 'momentum', 'nesterov', 'adam'] as const) {
      const p = runPath(bowl, o, bowl.start, { ...DEF_HYPER, lr: o === 'adam' ? 0.1 : 0.4 }, 600)
      expect(distToMin(bowl, p[p.length - 1])).toBeLessThan(0.05)
    }
  })
  it('momentum beats SGD on Rosenbrock', () => {
    const r = SURFACES[1]
    const h = { ...DEF_HYPER, lr: 0.0015 }
    const a = runPath(r, 'sgd', r.start, h, 2000)
    const b = runPath(r, 'momentum', r.start, h, 2000)
    expect(distToMin(r, b[b.length - 1])).toBeLessThan(distToMin(r, a[a.length - 1]))
  })
  it('diverging run stops early', () => {
    const p = runPath(SURFACES[0], 'sgd', [1, 1], { ...DEF_HYPER, lr: 5 }, 500)
    expect(p.length).toBeLessThan(500)
  })
})
