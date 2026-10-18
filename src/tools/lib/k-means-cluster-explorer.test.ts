import { describe, expect, it } from 'vitest'
import { iris } from './pca-visualizer'
import { adjustedRand, elbow, kmeans, silhouette, standardize, sweep } from './k-means-cluster-explorer'

describe('k-means', () => {
  it('separates obvious clusters', () => {
    const X = [[0, 0], [0, 1], [1, 0], [10, 10], [10, 11], [11, 10]]
    const r = kmeans(X, 2)
    expect(r.labels[0]).toBe(r.labels[2])
    expect(r.labels[3]).toBe(r.labels[5])
    expect(r.labels[0]).not.toBe(r.labels[3])
    expect(r.inertia).toBeCloseTo(8 / 3, 6)
    expect(silhouette(X, r.labels, 2)).toBeGreaterThan(0.85)
  })
  it('iris k=3 matches the known optimum', () => {
    const d = iris()
    const r = kmeans(d.rows, 3, { restarts: 10 })
    expect(r.inertia).toBeCloseTo(78.85, 1) // scikit-learn reference inertia (78.851…)
    expect(adjustedRand(r.labels, d.labels)).toBeCloseTo(0.730, 2)
    const s = sweep(standardize(d.rows).Z, 8)
    expect(elbow(s)).toBeGreaterThanOrEqual(2)
    expect(elbow(s)).toBeLessThanOrEqual(4)
  })
  it('ARI is 1 for relabelled identical partitions', () => {
    expect(adjustedRand([0, 0, 1, 1, 2], ['b', 'b', 'a', 'a', 'c'])).toBeCloseTo(1, 9)
  })
})
