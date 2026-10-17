import { describe, expect, it } from 'vitest'
import { aWeight, bandLevel, leq, smooth, zone } from './noise-meter'

describe('noise meter', () => {
  it('A-weighting reference points', () => {
    expect(aWeight(1000)).toBeCloseTo(0, 1)
    expect(aWeight(100)).toBeCloseTo(-19.1, 0)
    expect(aWeight(10000)).toBeCloseTo(-2.5, 0)
  })
  it('Leq is an energy average', () => {
    expect(leq([60, 60])).toBeCloseTo(60)
    expect(leq([60, 70])).toBeCloseTo(67.4, 1)
  })
  it('band level sums power', () => {
    const bins = new Float32Array(4).fill(-Infinity)
    bins[2] = -20
    bins[3] = -20
    expect(bandLevel(bins, 8000, false)).toBeCloseTo(-16.99, 1)
  })
  it('smoothing converges and zones', () => {
    let v = 40
    for (let i = 0; i < 100; i++) v = smooth(v, 70, 0.1, 0.125)
    expect(v).toBeCloseTo(70, 3)
    expect(zone(50, 60)).toBe('quiet')
    expect(zone(56, 60)).toBe('ok')
    expect(zone(61, 60)).toBe('loud')
  })
})
