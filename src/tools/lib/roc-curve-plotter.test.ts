import { describe, expect, it } from 'vitest'
import { averagePrecision, confusion, parseData, rocAuc, rocCurve, sampleCsv, youden } from './roc-curve-plotter'

describe('roc-curve-plotter', () => {
  const y = [0, 0, 1, 1], s = [0.1, 0.4, 0.35, 0.8]
  it('matches scikit-learn reference values', () => {
    const pts = rocCurve(s, y)
    expect(pts.map((p) => [p.fpr, p.tpr])).toEqual([[0, 0], [0, 0.5], [0.5, 0.5], [0.5, 1], [1, 1]])
    expect(rocAuc(pts)).toBeCloseTo(0.75, 10)
    expect(averagePrecision(pts)).toBeCloseTo(0.8333333, 6)
  })
  it('handles ties and extremes', () => {
    expect(rocAuc(rocCurve([0.5, 0.5, 0.5, 0.5], y))).toBeCloseTo(0.5, 10)
    expect(rocAuc(rocCurve([1, 2, 3, 4], y))).toBe(1)
    expect(rocAuc(rocCurve([4, 3, 2, 1], y))).toBe(0)
  })
  it('computes a confusion matrix', () => {
    const c = confusion(s, y, 0.35)
    expect([c.tp, c.fp, c.tn, c.fn]).toEqual([2, 1, 1, 0])
    expect(c.precision).toBeCloseTo(2 / 3, 10)
    expect(c.f1).toBeCloseTo(0.8, 10)
    expect(c.mcc).toBeCloseTo(1 / Math.sqrt(3), 10)
    expect(youden(rocCurve(s, y)).thr).toBe(0.8)
  })
  it('parses CSV with header and label words', () => {
    const d = parseData('score,label\n0.9,pos\n0.2,neg\nx,1\n0.4,yes')
    expect(d.labels).toEqual([1, 0, 1])
    expect(d.models[0]).toEqual({ name: 'score', scores: [0.9, 0.2, 0.4] })
    expect(d.errors.length).toBe(1)
    const smp = parseData(sampleCsv(200))
    expect(smp.models.map((m) => m.name)).toEqual(['gradient_boost', 'logistic', 'baseline'])
    expect(smp.labels.length).toBe(200)
    const a = smp.models.map((m) => rocAuc(rocCurve(m.scores, smp.labels)))
    expect(a[0]).toBeGreaterThan(a[1])
    expect(a[1]).toBeGreaterThan(a[2])
  })
})
