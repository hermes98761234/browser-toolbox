import { describe, expect, it } from 'vitest'
import { fitGrowth, maxSlope, model, parsePlate, samplePlate, toLn, type ModelId } from './growth-curve-fitter'

const T = Array.from({ length: 49 }, (_, i) => i * 0.5)

describe('growth curve fitter', () => {
  it('Zwietering parameters have their meaning: max slope μ, tangent lag λ, asymptote A', () => {
    for (const id of ['gompertz', 'logistic'] as ModelId[]) {
      const p = [0, 4, 0.8, 3]
      const ys = T.map((t) => model(id, t, p))
      const fine = Array.from({ length: 2001 }, (_, i) => i * 0.012)
      let best = 0, at = 0
      for (const t of fine) {
        const d = (model(id, t + 1e-4, p) - model(id, t - 1e-4, p)) / 2e-4
        if (d > best) { best = d; at = t }
      }
      expect(best).toBeCloseTo(0.8, 3)
      expect(at - model(id, at, p) / best).toBeCloseTo(3, 2) // tangent hits y=0 at λ
      expect(ys.at(-1)!).toBeGreaterThan(3.9)
    }
  })
  it('Baranyi: starts at y0, plateaus at y0 + A, slope μ', () => {
    const p = [0.1, 12, 0.7, 2.5]
    expect(model('baranyi', 0, p)).toBeCloseTo(0.1, 9)
    expect(model('baranyi', 200, p)).toBeCloseTo(12.1, 6)
    const d = (model('baranyi', 9.0001, p) - model('baranyi', 8.9999, p)) / 2e-4
    expect(d).toBeCloseTo(0.7, 1)
  })
  it('recovers parameters from noiseless data for every model', () => {
    const cases: [ModelId, number[]][] = [['gompertz', [0, 4, 0.9, 2]], ['logistic', [0, 3.5, 0.7, 3]], ['richards', [0, 4, 0.8, 2.5, 0.6]], ['baranyi', [0, 4, 0.6, 3]]]
    for (const [id, p] of cases) {
      const y = T.map((t) => model(id, t, p))
      const f = fitGrowth(id, T, y)
      expect(f.ok).toBe(true)
      expect(f.r2).toBeGreaterThan(0.9999)
      expect(f.p[2]).toBeCloseTo(p[2], 2)
      expect(f.p[3]).toBeCloseTo(p[3], 1)
      expect(f.td).toBeCloseTo(Math.LN2 / p[2], 2)
    }
  })
  it('sample plate parses and fits plausibly', () => {
    const pl = parsePlate(samplePlate())
    if ('error' in pl) throw new Error(pl.error)
    expect(pl.wells.length).toBe(6)
    const { t, y } = toLn(pl.time, pl.wells[0].od, 0.05)
    const f = fitGrowth('gompertz', t, y)
    expect(f.p[2]).toBeGreaterThan(0.75)
    expect(f.p[2]).toBeLessThan(1.05)
    expect(f.p[3]).toBeGreaterThan(1)
    expect(f.p[3]).toBeLessThan(2.1)
  })
  it('parses hh:mm time and reports errors', () => {
    const pl = parsePlate('t;A\n0:00;0.1\n0:30;0.2\n1:00;0.4\n')
    expect('error' in pl ? null : pl.time).toEqual([0, 0.5, 1])
    expect('error' in parsePlate('x')).toBe(true)
    expect(maxSlope([0, 1, 2, 3, 4], [0, 1, 2, 3, 4], 3).slope).toBeCloseTo(1)
  })
})
