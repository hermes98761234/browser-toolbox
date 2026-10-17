import { describe, expect, it } from 'vitest'
import { analyze, type Load, type Support } from './beam-deflection-calculator'

const EI = 210e9 * 1943e-8 // IPE 200, N·m²
const run = (support: Support, loads: Partial<Load>[], L = 6, a = 0, b = 6) =>
  analyze({ L, EI, support, a, b, loads: loads.map((l, i) => ({ id: String(i), kind: 'point', x: 0, x2: 0, v: 0, ...l })) })
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b)

describe('beam analysis', () => {
  it('simply supported point load at midspan', () => {
    const r = run('simple', [{ kind: 'point', x: 3, v: 10 }])
    expect(rel(-r.maxDefl.v, (10e3 * 6 ** 3) / (48 * EI))).toBeLessThan(1e-4)
    expect(rel(r.maxM.v, (10e3 * 6) / 4)).toBeLessThan(1e-6)
    expect(r.reactions[0].F).toBeCloseTo(5000)
  })
  it('simply supported UDL', () => {
    const r = run('simple', [{ kind: 'udl', x: 0, x2: 6, v: 5 }])
    expect(rel(-r.maxDefl.v, (5 * 5e3 * 6 ** 4) / (384 * EI))).toBeLessThan(1e-4)
    expect(rel(r.maxM.v, (5e3 * 36) / 8)).toBeLessThan(1e-4)
  })
  it('cantilever', () => {
    const p = run('cantilever', [{ kind: 'point', x: 6, v: 10 }])
    expect(rel(-p.y[p.y.length - 1], (10e3 * 216) / (3 * EI))).toBeLessThan(1e-4)
    expect(p.reactions[0].M).toBeCloseTo(-60000)
    const u = run('cantilever', [{ kind: 'udl', x: 0, x2: 6, v: 5 }])
    expect(rel(-u.y[u.y.length - 1], (5e3 * 6 ** 4) / (8 * EI))).toBeLessThan(1e-4)
  })
  it('propped cantilever UDL', () => {
    const r = run('propped', [{ kind: 'udl', x: 0, x2: 6, v: 5 }])
    expect(rel(r.reactions[1].F, (3 * 5e3 * 6) / 8)).toBeLessThan(1e-4)
    expect(rel(r.reactions[0].M!, (-5e3 * 36) / 8)).toBeLessThan(1e-4)
    expect(rel(-r.maxDefl.v, (5e3 * 6 ** 4) / (185 * EI))).toBeLessThan(2e-3)
  })
  it('fixed-fixed', () => {
    const u = run('fixed', [{ kind: 'udl', x: 0, x2: 6, v: 5 }])
    expect(rel(u.reactions[0].M!, (-5e3 * 36) / 12)).toBeLessThan(1e-4)
    expect(rel(u.maxM.v, (5e3 * 36) / 24)).toBeLessThan(1e-4)
    expect(rel(-u.maxDefl.v, (5e3 * 6 ** 4) / (384 * EI))).toBeLessThan(1e-4)
    const p = run('fixed', [{ kind: 'point', x: 3, v: 10 }])
    expect(rel(-p.maxDefl.v, (10e3 * 216) / (192 * EI))).toBeLessThan(1e-4)
  })
  it('overhang with tip load', () => {
    const r = run('overhang', [{ kind: 'point', x: 6, v: 10 }], 6, 0, 4)
    expect(r.reactions[0].F).toBeCloseTo(-5000)
    expect(r.reactions[1].F).toBeCloseTo(15000)
    expect(rel(-r.y[r.y.length - 1], (10e3 * 4 * 6) / (3 * EI))).toBeLessThan(1e-4)
  })
  it('applied moment at midspan gives zero centre deflection', () => {
    const r = run('simple', [{ kind: 'moment', x: 3, v: 12 }])
    const i = r.xs.findIndex((x) => x >= 3)
    expect(Math.abs(r.y[i])).toBeLessThan(1e-9)
    expect(r.reactions[0].F).toBeCloseTo(-2000)
  })
})
