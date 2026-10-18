import { describe, expect, it } from 'vitest'
import { coefficients, errorStats, overshoot, partial, sample, squareB, wave } from './fourier-series-visualizer'

describe('Fourier series', () => {
  it('square wave coefficients match 4/(πn) on odd harmonics', () => {
    const c = coefficients(sample('square'), 9)
    for (let n = 1; n <= 9; n++) {
      expect(c.b[n - 1]).toBeCloseTo(squareB(n), 5)
      expect(c.a[n - 1]).toBeCloseTo(0, 6)
    }
    expect(c.a0).toBeCloseTo(0, 10)
  })
  it('sawtooth 2t−1 has b_n = −2/(πn); triangle has only cosine terms 8/(π²n²)', () => {
    const s = coefficients(sample('sawtooth'), 4)
    expect(s.b[0]).toBeCloseTo(-2 / Math.PI, 4)
    expect(s.b[2]).toBeCloseTo(-2 / (3 * Math.PI), 4)
    const t = coefficients(sample('triangle'), 3)
    expect(Math.abs(t.a[0])).toBeCloseTo(8 / Math.PI ** 2, 4)
    expect(t.b[0]).toBeCloseTo(0, 6)
  })
  it('pulse train mean equals duty cycle', () => {
    expect(coefficients(sample('pulse', 4096, 0.3), 1).a0).toBeCloseTo(0.3, 3)
  })
  it('Gibbs overshoot approaches ≈ 8.95 % of the jump', () => {
    const f = sample('square')
    const c = coefficients(f, 151)
    const o = overshoot(f, c, 151, 20000)
    expect(o).toBeGreaterThan(0.085)
    expect(o).toBeLessThan(0.093)
  })
  it('partial sums converge in mean square (Parseval)', () => {
    const f = sample('triangle', 2048)
    const c = coefficients(f, 25)
    const e5 = errorStats(f, c, 5), e25 = errorStats(f, c, 25)
    expect(e25.rms).toBeLessThan(e5.rms)
    expect(e25.energy).toBeGreaterThan(0.999)
    expect(partial(c, 0.25, 25)).toBeCloseTo(wave('triangle', 0.25), 2)
  })
  it('custom samples interpolate periodically', () => {
    expect(wave('custom', 0.5, 0, [0, 1])).toBeCloseTo(1, 10)
    expect(wave('custom', 0.75, 0, [0, 1])).toBeCloseTo(0.5, 10)
    expect(wave('custom', 0.25, 0, [0, 1])).toBeCloseTo(0.5, 10)
  })
})
