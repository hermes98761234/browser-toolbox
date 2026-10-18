import { describe, expect, it } from 'vitest'
import { bestPairs, closedLoopBw, diffCmrrDb, eng, fullPowerBw, idealGain, mag, nearestValue, noiseGain, OPAMPS, rcFreq, transfer, type Circuit } from './op-amp-circuit-calculator'

const base: Circuit = { topo: 'inverting', r1: 10e3, r2: 100e3, r3: 10e3, r4: 100e3, c: 10e-9, rpar: true }
const op = OPAMPS[0] // 1 MHz GBW, A0 = 1e5

describe('op-amp calculator', () => {
  it('ideal gains', () => {
    expect(idealGain(base)).toBe(-10)
    expect(idealGain({ ...base, topo: 'noninverting' })).toBe(11)
    expect(idealGain({ ...base, topo: 'follower' })).toBe(1)
    expect(noiseGain(base)).toBe(11)
  })
  it('finite-gain response matches ideal at low frequency and is −3 dB at GBW/NG', () => {
    expect(mag(transfer(base, op, 10))).toBeCloseTo(10, 2)
    const ni = { ...base, topo: 'noninverting' as const }
    const bw = closedLoopBw(ni, op)
    expect(bw).toBeCloseTo(1e6 / 11, 3)
    expect(mag(transfer(ni, op, bw)) / 11).toBeCloseTo(Math.SQRT1_2, 2)
    expect(mag(transfer({ ...base, topo: 'follower' }, op, 1e6))).toBeCloseTo(Math.SQRT1_2, 2)
  })
  it('integrator: unity gain at 1/(2πRC) when no DC resistor', () => {
    const integ = { ...base, topo: 'integrator' as const, rpar: false }
    const f0 = rcFreq(integ.r1, integ.c)
    expect(f0).toBeCloseTo(1591.55, 1)
    expect(mag(transfer(integ, op, f0))).toBeCloseTo(1, 2)
    expect(mag(transfer(integ, op, f0 / 10))).toBeCloseTo(10, 1)
  })
  it('differentiator gain grows 20 dB/decade', () => {
    const d = { ...base, topo: 'differentiator' as const }
    const f0 = rcFreq(d.r2, d.c)
    expect(mag(transfer(d, op, f0 / 10))).toBeCloseTo(0.1, 2)
  })
  it('slew-rate full power bandwidth', () => {
    expect(fullPowerBw(0.5, 10)).toBeCloseTo(7957.7, 0)
  })
  it('difference amp CMRR from mismatch', () => {
    expect(diffCmrrDb({ ...base, topo: 'difference' })).toBe(Infinity)
    const db = diffCmrrDb({ ...base, topo: 'difference', r4: 101e3 })
    expect(db).toBeGreaterThan(55)
    expect(db).toBeLessThan(70)
  })
  it('E-series pair search', () => {
    const p = bestPairs(10, 'E12')
    expect(p[0].errPct).toBeCloseTo(0, 6)
    expect(p[0].rin).toBe(10e3)
    expect(p[0].rf).toBe(100e3)
    const q = bestPairs(3.3 / 1.5 + 0.0001, 'E24')
    expect(Math.abs(q[0].errPct)).toBeLessThan(0.01)
    expect(nearestValue(4.5e-9, 'E6')).toBeCloseTo(4.7e-9, 12)
    expect(eng(4700, 'Ω')).toBe('4.7 kΩ')
    expect(eng(1e-8, 'F')).toBe('10 nF')
  })
})
