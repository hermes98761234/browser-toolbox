import { describe, expect, it } from 'vitest'
import { assembly, cToF, dewPoint, fToC, heatLoss, layerR, profile, RSI, type Layer } from './insulation-r-value-calculator'

const WALL: Layer[] = [
  { id: '1', mat: 'film-in', mm: 0 },
  { id: '2', mat: 'gyp', mm: 12.7 },
  { id: '3', mat: 'fg', mm: 88.9, cavity: true },
  { id: '4', mat: 'osb', mm: 11.1 },
  { id: '5', mat: 'vinyl', mm: 10 },
  { id: '6', mat: 'film-out', mm: 0 },
]

describe('insulation R-value', () => {
  it('layer R from per-inch and fixed values', () => {
    expect(layerR({ mat: 'fg', mm: 88.9 })).toBeCloseTo(12.95, 2)
    expect(layerR({ mat: 'xps', mm: 25.4 })).toBeCloseTo(5, 6)
    expect(layerR({ mat: 'cmu', mm: 999 })).toBe(1.11)
  })
  it('parallel path for a 2x4 wood-framed wall', () => {
    const r = assembly(WALL, 'wood', 0.25)
    const cav = 0.68 + 0.45 + 12.95 + 0.541 + 0.61 + 0.17
    const fr = cav - 12.95 + 4.375
    expect(r.rCavityPath).toBeCloseTo(cav, 2)
    expect(r.rFramePath).toBeCloseTo(fr, 2)
    expect(r.u).toBeCloseTo(0.25 / fr + 0.75 / cav, 4)
    expect(r.rEff).toBeGreaterThan(11)
    expect(r.rEff).toBeLessThan(12.5)
    expect(r.rEff * RSI).toBeCloseTo(r.rEff * 0.17611, 6)
  })
  it('steel studs and no framing', () => {
    expect(assembly(WALL, 'steel', 0.25).rEff).toBeCloseTo(assembly(WALL, 'none', 0).rEff - 12.95 / 2, 2)
    expect(assembly(WALL, 'none', 0.25).bridging).toBe(0)
  })
  it('temperature profile and dew point', () => {
    const p = profile(WALL, 20, 0)
    expect(p[0]).toBe(20)
    expect(p[p.length - 1]).toBeCloseTo(0, 6)
    expect(dewPoint(20, 50)).toBeCloseTo(9.26, 1)
    expect(fToC(cToF(21))).toBeCloseTo(21, 10)
  })
  it('heat loss', () => {
    const h = heatLoss(0.1, 1000, 70, 5000)
    expect(h.btuh).toBeCloseTo(7000)
    expect(h.watts).toBeCloseTo(2051.5, 0)
    expect(h.annualKwh).toBeCloseTo((0.1 * 1000 * 5000 * 24) / 3412.142, 3)
  })
})
