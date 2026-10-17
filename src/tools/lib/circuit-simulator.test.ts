import { describe, expect, it } from 'vitest'
import { type Comp, formatEng, parseEng, solveDC, transient } from './circuit-simulator'

const c = (id: string, kind: Comp['kind'], a: [number, number], b: [number, number], value = 0, extra: Partial<Comp> = {}): Comp => ({ id, kind, a, b, value, ...extra })

describe('circuit simulator', () => {
  it('parses engineering notation', () => {
    expect(parseEng('4.7k')).toBeCloseTo(4700)
    expect(parseEng('10u')).toBeCloseTo(1e-5)
    expect(parseEng('2.2meg')).toBeCloseTo(2.2e6)
    expect(parseEng('100nF')).toBeCloseTo(1e-7)
    expect(parseEng('abc')).toBeNull()
    expect(formatEng(4700, 'Ω')).toBe('4.7 kΩ')
    expect(formatEng(1e-6, 'F')).toBe('1 µF')
  })
  it('solves a voltage divider', () => {
    const r = solveDC([
      c('v', 'V', [0, 0], [0, 4], 10),
      c('r1', 'R', [0, 0], [4, 0], 1000),
      c('r2', 'R', [4, 0], [4, 4], 3000),
      c('w', 'W', [4, 4], [0, 4]),
      c('g', 'G', [0, 4], [0, 4]),
    ])
    expect(r.ok).toBe(true)
    expect(r.v[r.nl.nodeOf.get('4,0')!]).toBeCloseTo(7.5, 6)
    expect(r.i.get('v')).toBeCloseTo(0.0025, 8)
  })
  it('joins T-junctions on wires', () => {
    const r = solveDC([
      c('v', 'V', [0, 0], [0, 4], 6),
      c('w1', 'W', [0, 0], [8, 0]),
      c('r', 'R', [4, 0], [4, 4], 100),
      c('w2', 'W', [4, 4], [0, 4]),
      c('g', 'G', [0, 4], [0, 4]),
    ])
    expect(r.i.get('r')).toBeCloseTo(0.06, 8)
  })
  it('RC charging reaches 63.2% at t = RC (trapezoidal and BE)', () => {
    const comps = [
      c('v', 'V', [0, 0], [0, 4], 5, { wave: 'step' }),
      c('r', 'R', [0, 0], [4, 0], 1000),
      c('c', 'C', [4, 0], [4, 4], 1e-6),
      c('w', 'W', [4, 4], [0, 4]),
      c('g', 'G', [0, 4], [0, 4]),
    ]
    for (const method of ['trap', 'be'] as const) {
      const tr = transient(comps, { tStop: 1e-3, dt: 1e-6, method, fromOp: true })
      const n = tr.nl.nodeOf.get('4,0')!
      expect(tr.v[tr.v.length - 1][n]).toBeCloseTo(5 * (1 - Math.exp(-1)), 2)
    }
  })
  it('LC tank oscillates at 1/(2π√LC)', () => {
    // C pre-charged by DC source through switch-less trick: use fromOp with a source in series R, then compare period of current
    const comps = [
      c('i', 'I', [0, 4], [0, 0], 0, { wave: 'step' }),
      c('l', 'L', [0, 0], [0, 4], 1e-3),
      c('cap', 'C', [0, 0], [4, 0], 1e-6),
      c('w', 'W', [4, 0], [4, 4]),
      c('w2', 'W', [4, 4], [0, 4]),
      c('g', 'G', [0, 4], [0, 4]),
    ]
    comps[0].value = 0.01
    const tr = transient(comps, { tStop: 2e-3, dt: 1e-7, method: 'trap', fromOp: false })
    const il = tr.i.get('l')!
    // inductor current oscillates around 10 mA with period 2π√(LC) ≈ 198.7 µs
    const zc: number[] = []
    for (let k = 1; k < il.length; k++) if ((il[k - 1] - 0.01) < 0 && (il[k] - 0.01) >= 0) zc.push(tr.t[k])
    const period = (zc[zc.length - 1] - zc[0]) / (zc.length - 1)
    expect(period).toBeCloseTo(2 * Math.PI * Math.sqrt(1e-9), 6)
  })
  it('diode forward drop ≈ 0.65 V at ~4 mA', () => {
    const r = solveDC([
      c('v', 'V', [0, 0], [0, 4], 5),
      c('r', 'R', [0, 0], [4, 0], 1000),
      c('d', 'D', [4, 0], [4, 4]),
      c('w', 'W', [4, 4], [0, 4]),
      c('g', 'G', [0, 4], [0, 4]),
    ])
    expect(r.ok).toBe(true)
    const vd = r.v[r.nl.nodeOf.get('4,0')!]
    expect(vd).toBeGreaterThan(0.6)
    expect(vd).toBeLessThan(0.75)
    expect(r.i.get('d')).toBeCloseTo((5 - vd) / 1000, 9)
  })
  it('inductor is a short in DC', () => {
    const r = solveDC([
      c('v', 'V', [0, 0], [0, 4], 2),
      c('r', 'R', [0, 0], [4, 0], 10),
      c('l', 'L', [4, 0], [4, 4], 1e-3),
      c('w', 'W', [4, 4], [0, 4]),
      c('g', 'G', [0, 4], [0, 4]),
    ])
    expect(r.i.get('l')).toBeCloseTo(0.2, 8)
  })
})
