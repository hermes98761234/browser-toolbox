import { describe, expect, it } from 'vitest'
import { apply, classify, cubicRoots, det3, eigenvalues, eigenvectors, I3, inverse, mul, rank, type M3 } from './linear-transformation-visualizer'

const close = (a: number[], b: number[], d = 9) => a.forEach((x, i) => expect(x).toBeCloseTo(b[i], d))

describe('linear transformation math', () => {
  it('det, inverse, rank', () => {
    const m: M3 = [2, 1, 0, 0, 1, 3, 1, 0, 1]
    expect(det3(m)).toBe(5)
    close(mul(m, inverse(m)!), I3)
    expect(inverse([1, 2, 3, 2, 4, 6, 0, 0, 1])).toBeNull()
    expect(rank([1, 2, 3, 2, 4, 6, 0, 0, 1])).toBe(2)
    expect(rank([1, 2, 3, 2, 4, 6, 3, 6, 9])).toBe(1)
    expect(rank([0, 0, 0, 0, 0, 0, 0, 0, 0])).toBe(0)
  })
  it('cubic roots', () => {
    const r = cubicRoots(-6, 11, -6).map((z) => z.re).sort()
    close(r, [1, 2, 3])
    const c = cubicRoots(0, 0, -1) // x³ = 1
    expect(c.filter((z) => Math.abs(z.im) > 1e-9)).toHaveLength(2)
    expect(c[0].re).toBeCloseTo(1, 9)
  })
  it('eigenvalues of a rotation are complex', () => {
    const th = Math.PI / 6
    const rot: M3 = [Math.cos(th), -Math.sin(th), 0, Math.sin(th), Math.cos(th), 0, 0, 0, 1]
    const e = eigenvalues(rot)
    expect(e.some((z) => Math.abs(z.re - 1) < 1e-9 && z.im === 0)).toBe(true)
    expect(e.filter((z) => Math.abs(z.im - Math.sin(th)) < 1e-9)).toHaveLength(1)
    const e2 = eigenvalues(rot, true)
    expect(e2[0].re).toBeCloseTo(Math.cos(th), 9)
    expect(Math.abs(e2[0].im)).toBeCloseTo(Math.sin(th), 9)
  })
  it('eigenvectors satisfy Mv = λv', () => {
    const m: M3 = [2, 1, 0, 1, 2, 0, 0, 0, 5]
    for (const z of eigenvalues(m)) {
      for (const v of eigenvectors(m, z.re)) close(apply(m, v), v.map((x) => x * z.re), 6)
    }
    // repeated eigenvalue with a 2-D eigenspace
    expect(eigenvectors([3, 0, 0, 0, 3, 0, 0, 0, 1], 3)).toHaveLength(2)
    expect(eigenvectors([2, 1, 0, 0, 2, 0, 0, 0, 1], 2, true)).toHaveLength(1)
  })
  it('classifies', () => {
    expect(classify(I3, false)).toMatch(/Identity/)
    expect(classify([0, -1, 0, 1, 0, 0, 0, 0, 1], true)).toMatch(/Rotation/)
    expect(classify([1, 0, 0, 0, -1, 0, 0, 0, 1], true)).toMatch(/Reflection/)
    expect(classify([1, 1, 0, 0, 1, 0, 0, 0, 1], true)).toMatch(/Volume-preserving/)
    expect(classify([1, 2, 0, 2, 4, 0, 0, 0, 1], true)).toMatch(/rank 1.*line/)
  })
})
