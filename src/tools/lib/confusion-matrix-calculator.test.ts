import { describe, expect, it } from 'vitest'
import { binaryMetrics, computeMetrics, matrixFromPairs } from './confusion-matrix-calculator'

describe('confusion-matrix-calculator', () => {
  it('matches sklearn on the 3-class docs example', () => {
    // y_true = [0,1,2,0,1,2], y_pred = [0,2,1,0,0,1]
    const r = computeMetrics([[2, 0, 0], [1, 0, 1], [0, 2, 0]], ['0', '1', '2'])
    expect(r.accuracy).toBeCloseTo(1 / 3, 9)
    expect(r.macro.f1).toBeCloseTo(0.26666667, 6)
    expect(r.micro.f1).toBeCloseTo(0.33333333, 6)
    expect(r.weighted.f1).toBeCloseTo(0.26666667, 6)
    expect(r.perClass[0].precision).toBeCloseTo(2 / 3, 9)
    expect(r.perClass[0].recall).toBe(1)
  })
  it('computes kappa and MCC for a binary table', () => {
    const r = computeMetrics([[45, 5], [10, 40]], ['pos', 'neg'])
    expect(r.kappa).toBeCloseTo(0.7, 9)
    expect(r.mcc).toBeCloseTo(1750 / Math.sqrt(55 * 45 * 50 * 50), 9)
    expect(r.balancedAccuracy).toBeCloseTo(0.85, 9)
  })
  it('computes F-beta', () => {
    const r = computeMetrics([[45, 5], [10, 40]], ['pos', 'neg'], 2)
    const p = 45 / 55, rec = 0.9
    expect(r.perClass[0].fbeta).toBeCloseTo((5 * p * rec) / (4 * p + rec), 9)
  })
  it('computes binary diagnostics', () => {
    const b = binaryMetrics(90, 10, 20, 880)
    expect(b.tpr).toBeCloseTo(0.9, 9)
    expect(b.tnr).toBeCloseTo(880 / 900, 9)
    expect(b.lrPlus).toBeCloseTo(0.9 / (20 / 900), 9)
    expect(b.prevalence).toBeCloseTo(0.1, 9)
  })
  it('builds a matrix from label pairs', () => {
    const r = matrixFromPairs('actual,predicted\ncat,cat\ncat,dog\ndog,dog\nbird dog\n')
    expect(r.labels).toEqual(['bird', 'cat', 'dog'])
    expect(r.m).toEqual([[0, 0, 1], [0, 1, 1], [0, 0, 1]])
    expect(r.pairs).toBe(4)
  })
})
