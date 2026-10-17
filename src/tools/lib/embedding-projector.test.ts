import { describe, expect, it } from 'vitest'
import { affinities, blobsCsv, neighbours, parseVectors, pca, sampleCsv, tsne } from './embedding-projector'

describe('embedding projector', () => {
  it('parses csv with header, label and category', () => {
    const d = parseVectors('label,cat,a,b,c\nx,A,1,2,3\ny,B,4,5,6\nbad,1')
    expect(d.dim).toBe(3)
    expect(d.labels).toEqual(['x', 'y'])
    expect(d.cats).toEqual(['A', 'B'])
    expect(d.skipped).toBe(1)
  })
  it('parses word2vec text', () => {
    const d = parseVectors('2 3\nking 0.1 0.2 0.3\nqueen 0.1 0.25 0.3')
    expect(d.labels).toEqual(['king', 'queen'])
    expect(d.cats).toBeNull()
  })
  it('sample has 71 words in 48-D', () => {
    const d = parseVectors(sampleCsv())
    expect(d.dim).toBe(48)
    expect(d.X.length).toBe(71)
    expect(d.skipped).toBe(0)
  })
  it('PCA finds the dominant direction', () => {
    const X = Array.from({ length: 50 }, (_, i) => [i, 2 * i + (i % 2 ? 0.01 : -0.01), 0])
    const r = pca(X, 3)
    expect(r.ratio[0]).toBeGreaterThan(0.9999)
    // variance of projection on PC1 equals total variance
    const v = r.Y.reduce((a, y) => a + y[0] * y[0], 0) / 49
    expect(v).toBeCloseTo(r.variance[0], 6)
  })
  it('affinities rows match perplexity and sum to 1', () => {
    const d = parseVectors(blobsCsv(10))
    const P = affinities(d.X, 5)
    let s = 0
    for (const p of P) s += p
    expect(s).toBeCloseTo(1, 6)
  })
  it('t-SNE keeps clusters apart', () => {
    const d = parseVectors(blobsCsv(15))
    const Y = tsne(d.X, { dims: 2, perplexity: 8, iterations: 300 })
    const n = d.X.length
    let ok = 0
    for (let i = 0; i < n; i++) {
      let best = -1, bd = Infinity
      for (let j = 0; j < n; j++) {
        if (i === j) continue
        const dd = (Y[i * 2] - Y[j * 2]) ** 2 + (Y[i * 2 + 1] - Y[j * 2 + 1]) ** 2
        if (dd < bd) { bd = dd; best = j }
      }
      if (d.cats![best] === d.cats![i]) ok++
    }
    expect(ok / n).toBeGreaterThan(0.95)
  })
  it('cosine neighbours', () => {
    const nb = neighbours([[1, 0], [0.9, 0.1], [0, 1]], 0, 2)
    expect(nb[0].j).toBe(1)
  })
})
