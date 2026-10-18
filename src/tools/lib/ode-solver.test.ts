import { describe, expect, it } from 'vitest'
import { buildSystem, dopri45, luSolver, PRESETS, resample, rosenbrock23 } from './ode-solver'

const last = (s: { y: number[][] }) => s.y[s.y.length - 1]

describe('Dormand–Prince RK45', () => {
  it('exponential decay y = e^{-t}', () => {
    const s = dopri45((_t, y) => [-y[0]], 0, [1], 5, { rtol: 1e-9, atol: 1e-12 })
    expect(s.status).toBe('ok')
    expect(s.t[s.t.length - 1]).toBeCloseTo(5, 12)
    expect(last(s)[0]).toBeCloseTo(Math.exp(-5), 9)
  })
  it('harmonic oscillator x = cos(2t) over many periods', () => {
    const { f } = buildSystem(PRESETS.find((p) => p.id === 'osc')!.eqs, [{ name: 'w', value: 2 }])
    const s = dopri45(f, 0, [1, 0], 10, { rtol: 1e-10, atol: 1e-12 })
    expect(last(s)[0]).toBeCloseTo(Math.cos(20), 7)
    expect(last(s)[1]).toBeCloseTo(-2 * Math.sin(20), 7)
  })
  it('logistic equation and time-dependent RHS', () => {
    const s = dopri45((_t, y) => [y[0] * (1 - y[0])], 0, [0.1], 4)
    const exact = 1 / (1 + 9 * Math.exp(-4))
    expect(last(s)[0]).toBeCloseTo(exact, 6)
    const s2 = dopri45((t) => [Math.cos(t)], 0, [0], 3)
    expect(last(s2)[0]).toBeCloseTo(Math.sin(3), 6)
  })
  it('integrates backwards in time', () => {
    const s = dopri45((_t, y) => [-y[0]], 2, [1], 0)
    expect(last(s)[0]).toBeCloseTo(Math.exp(2), 5)
  })
  it('resamples smoothly with Hermite interpolation', () => {
    const s = dopri45((_t, y) => [y[1], -y[0]], 0, [0, 1], 6)
    const r = resample(s, 61)
    r.t.forEach((t, i) => expect(r.y[i][0]).toBeCloseTo(Math.sin(t), 4))
  })
})

describe('implicit Rosenbrock 2(3)', () => {
  it('decay and oscillator', () => {
    const s = rosenbrock23((_t, y) => [-y[0]], 0, [1], 3, { rtol: 1e-7, atol: 1e-10 })
    expect(last(s)[0]).toBeCloseTo(Math.exp(-3), 5)
    const o = rosenbrock23((_t, y) => [y[1], -y[0]], 0, [1, 0], 2 * Math.PI, { rtol: 1e-7, atol: 1e-10 })
    expect(last(o)[0]).toBeCloseTo(1, 4)
  })
  it('stiff problem y\' = -1000 (y - cos t) is cheap for the implicit method', () => {
    const f = (t: number, y: number[]) => [-1000 * (y[0] - Math.cos(t))]
    // at a loose tolerance the explicit method is limited by stability, not accuracy
    const imp = rosenbrock23(f, 0, [0], 2, { rtol: 1e-3, atol: 1e-6 })
    const exp = dopri45(f, 0, [0], 2, { rtol: 1e-3, atol: 1e-6 })
    // quasi-steady solution y ≈ (1000² cos t + 1000 sin t)/(1000² + 1)
    const ref = (1e6 * Math.cos(2) + 1000 * Math.sin(2)) / (1e6 + 1)
    expect(last(imp)[0]).toBeCloseTo(ref, 3)
    expect(last(exp)[0]).toBeCloseTo(ref, 3)
    expect(imp.steps * 5).toBeLessThan(exp.steps)
  })
  it('Robertson kinetics conserves mass', () => {
    const p = PRESETS.find((x) => x.id === 'rob')!
    const { f } = buildSystem(p.eqs, p.params)
    const s = rosenbrock23(f, 0, [1, 0, 0], 40)
    expect(s.status).toBe('ok')
    const y = last(s)
    expect(y[0] + y[1] + y[2]).toBeCloseTo(1, 6)
    expect(y[0]).toBeCloseTo(0.7158, 2) // reference value at t = 40
  })
})

describe('system builder', () => {
  it('rejects bad names and expressions', () => {
    expect(() => buildSystem([{ name: 'x', expr: 'x +', y0: 0 }], [])).toThrow(/x'/)
    expect(() => buildSystem([{ name: 't', expr: '1', y0: 0 }], [])).toThrow(/valid/)
    expect(() => buildSystem([{ name: 'x', expr: '1', y0: 0 }], [{ name: 'x', value: 1 }])).toThrow(/twice/)
  })
  it('LU solver', () => {
    const s = luSolver([[0, 2], [3, 4]])
    const x = s([4, 11])
    expect(x[0]).toBeCloseTo(1)
    expect(x[1]).toBeCloseTo(2)
  })
})
