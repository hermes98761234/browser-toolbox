import { describe, expect, it } from 'vitest'
import { BRETTEL, closestPair, deltaE, hexToRgb, lab, simulate } from './colorblind-simulator'

describe('colorblind simulator', () => {
  it('keeps white, black and greys unchanged', () => {
    for (const cvd of ['protan', 'deutan', 'tritan', 'achroma'] as const)
      for (const algo of ['machado', 'brettel'] as const) {
        expect(simulate([255, 255, 255], cvd, algo)).toEqual([255, 255, 255])
        expect(simulate([0, 0, 0], cvd, algo)).toEqual([0, 0, 0])
        const g = simulate([128, 128, 128], cvd, algo)
        g.forEach((c) => expect(Math.abs(c - 128)).toBeLessThanOrEqual(1))
      }
  })
  it('Brettel matrices preserve white (rows sum to 1)', () => {
    for (const b of Object.values(BRETTEL)) for (const m of [b.m1, b.m2]) for (let r = 0; r < 3; r++) expect(m[3 * r] + m[3 * r + 1] + m[3 * r + 2]).toBeCloseTo(1, 3)
  })
  it('makes red and green confusable for deutans but not for normal vision', () => {
    const red: [number, number, number] = [214, 39, 40], green: [number, number, number] = [44, 160, 44]
    const normal = deltaE(red, green)
    const deut = deltaE(simulate(red, 'deutan', 'machado'), simulate(green, 'deutan', 'machado'))
    expect(normal).toBeGreaterThan(80)
    expect(deut).toBeLessThan(normal / 2)
    // severity 0 is identity
    expect(simulate(red, 'protan', 'machado', 0)).toEqual(red)
  })
  it('computes Lab and palette distances', () => {
    const w = lab([255, 255, 255])
    expect(w[0]).toBeCloseTo(100, 1)
    expect(Math.abs(w[1])).toBeLessThan(0.5)
    expect(hexToRgb('#f80')).toEqual([255, 136, 0])
    expect(closestPair([[0, 0, 0], [250, 250, 250], [255, 255, 255]]).slice(0, 2)).toEqual([1, 2])
  })
})
