import { describe, expect, it } from 'vitest'
import { bestRecipe, deltaE00, fitWeights, hexLab, ksOf, mixLab, mixRgb, rOf, toParts, xyzToLab, rgbToXyz } from './paint-mixing-guide'

describe('Kubelka–Munk paint mixing', () => {
  it('K/S round trip', () => {
    for (const r of [0.02, 0.3, 0.9]) expect(rOf(ksOf(r))).toBeCloseTo(r, 9)
  })
  it('CIEDE2000 reference pair (Sharma et al. test data #1)', () => {
    expect(deltaE00([50, 2.6772, -79.7751], [50, 0, -82.7485])).toBeCloseTo(2.0425, 3)
    expect(deltaE00([50, 0, 0], [50, -1, 2])).toBeCloseTo(2.3669, 3)
  })
  it('sRGB white maps to L* 100', () => {
    expect(xyzToLab(rgbToXyz([255, 255, 255]))[0]).toBeCloseTo(100, 3)
  })
  it('subtractive behaviour: blue + yellow is greener than either', () => {
    const [, a] = mixLab([{ id: 'phthaloblue', w: 1 }, { id: 'cadyellow', w: 1 }])
    expect(a).toBeLessThan(-10)
    const [r, g, b] = mixRgb([{ id: 'phthaloblue', w: 1 }, { id: 'cadyellow', w: 1 }])
    expect(g).toBeGreaterThan(r)
    expect(g).toBeGreaterThan(b)
  })
  it('adding white lightens', () => {
    expect(mixLab([{ id: 'cadred', w: 1 }, { id: 'white', w: 3 }])[0]).toBeGreaterThan(mixLab([{ id: 'cadred', w: 1 }])[0] + 15)
  })
  it('fits a mixture the model itself produced', () => {
    const target = mixLab([{ id: 'ultramarine', w: 0.2 }, { id: 'white', w: 0.8 }])
    const f = fitWeights(['ultramarine', 'white'], target)
    expect(f.dE).toBeLessThan(0.5)
    expect(f.w[0]).toBeCloseTo(0.2, 1)
    const b = bestRecipe(['white', 'black', 'cadyellow', 'cadred', 'ultramarine'], hexLab('#6b8e23'))
    expect(b[0].dE).toBeLessThan(b[b.length - 1].dE)
  })
  it('weights to whole parts', () => {
    expect(toParts([0.625, 0.375])).toEqual([5, 3])
    expect(toParts([0.5, 0.5])).toEqual([1, 1])
  })
})
