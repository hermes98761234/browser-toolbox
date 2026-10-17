import { describe, expect, it } from 'vitest'
import { blobs, eigSym, iris, parseTable, pca } from './pca-visualizer'

describe('pca visualizer', () => {
  it('diagonalizes a symmetric matrix', () => {
    const A = [[4, 1, 2], [1, 3, 0], [2, 0, 5]]
    const { values, vectors } = eigSym(A)
    for (let k = 0; k < 3; k++) {
      const v = vectors.map((r) => r[k])
      const Av = A.map((r) => r.reduce((s, x, j) => s + x * v[j], 0))
      Av.forEach((x, i) => expect(x).toBeCloseTo(values[k] * v[i], 9))
    }
    expect(values[0]).toBeGreaterThanOrEqual(values[1])
    expect(values.reduce((a, b) => a + b)).toBeCloseTo(12, 9)
  })
  it('reproduces the textbook Iris results', () => {
    const d = iris()
    expect(d.rows).toHaveLength(150)
    const cov = pca(d.rows, false)
    cov.mean.forEach((m, i) => expect(m).toBeCloseTo([5.8433, 3.0573, 3.758, 1.1993][i], 3))
    expect(cov.explained[0]).toBeCloseTo(0.9246, 3)
    expect(cov.explained[1]).toBeCloseTo(0.0531, 3)
    expect(cov.values[0]).toBeCloseTo(4.228, 2)
    const cor = pca(d.rows, true)
    expect(cor.explained[0]).toBeCloseTo(0.7296, 3)
    expect(cor.explained[1]).toBeCloseTo(0.2285, 3)
    expect(cor.cumulative[3]).toBeCloseTo(1, 9)
    // scores have variance equal to the eigenvalue
    const v0 = cor.scores.reduce((s, r) => s + r[0] ** 2, 0) / 149
    expect(v0).toBeCloseTo(cor.values[0], 9)
  })
  it('finds the 2-D structure in synthetic blobs', () => {
    const r = pca(blobs().rows, false)
    expect(r.cumulative[1]).toBeGreaterThan(0.95)
  })
  it('parses CSV with a label column', () => {
    const d = parseTable('a,b,kind\n1,2,x\n3,4,y\n5,7,x')
    expect(typeof d).toBe('object')
    if (typeof d === 'object') {
      expect(d.features).toEqual(['a', 'b'])
      expect(d.labels).toEqual(['x', 'y', 'x'])
    }
    expect(typeof parseTable('a\n1')).toBe('string')
  })
})
