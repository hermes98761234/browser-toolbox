import { describe, expect, it } from 'vitest'
import { analyse, bearingFactors, coulombKa, EXAMPLE, rankineKa, rankineKp } from './retaining-wall-checker'

const near = (a: number, b: number, tol: number) => expect(Math.abs(a - b) / Math.abs(b)).toBeLessThan(tol)

describe('earth pressure coefficients (table values)', () => {
  it('Rankine', () => {
    near(rankineKa(30), 1 / 3, 1e-9)
    near(rankineKp(30), 3, 1e-9)
    near(rankineKa(30, 10), 0.3495, 1e-3)
    expect(rankineKa(30, 35)).toBeNaN()
  })
  it('Coulomb', () => {
    near(coulombKa(30, 0), 1 / 3, 1e-9) // δ = 0, vertical wall, level backfill = Rankine
    near(coulombKa(30, 20), 0.2973, 2e-3)
    near(coulombKa(35, 0), 0.271, 2e-3)
  })
  it('bearing capacity factors', () => {
    const f = bearingFactors(20)
    near(f.Nc, 14.83, 2e-3)
    near(f.Nq, 6.4, 2e-3)
    near(f.Ng, 5.39, 3e-3)
    near(bearingFactors(30).Nq, 18.4, 2e-3)
  })
})

describe('worked cantilever example', () => {
  const r = analyse(EXAMPLE)
  it('thrust', () => {
    near(r.Hp, 7.158, 1e-3)
    near(r.Pa, 161.4, 3e-3)
    near(r.Ph, 158.95, 3e-3)
    near(r.Pv, 28.03, 3e-3)
  })
  it('overturning', () => {
    near(r.V, 470.45, 2e-3)
    near(r.MR, 1128.98, 2e-3)
    near(r.MO, 379.25, 3e-3)
    near(r.FSo, 2.98, 5e-3)
  })
  it('sliding with passive resistance', () => {
    near(r.Pp, 215.0, 3e-3)
    near(r.FSs, 2.725, 5e-3)
  })
  it('bearing', () => {
    near(r.e, 0.406, 1e-2)
    near(r.qToe, 189.2, 5e-3)
    near(r.FSb, 3.04, 2e-2)
  })
  it('surcharge lowers the factors of safety', () => {
    const s = analyse({ ...EXAMPLE, q: 20 })
    expect(s.FSo).toBeLessThan(r.FSo)
    expect(s.FSs).toBeLessThan(r.FSs)
  })
})
