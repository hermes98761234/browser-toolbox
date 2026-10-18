import { describe, expect, it } from 'vitest'
import { DOWNSPOUTS, flowGpm, halfRoundCapacity, pitchFactor, PROFILES, profileCapacity, sizePlane } from './rain-gutter-sizer'

describe('gutter sizing', () => {
  it('reproduces the IPC table at its grid points', () => {
    expect(halfRoundCapacity(5, 1 / 16)).toBeCloseTo(1250, 6)
    expect(halfRoundCapacity(6, 1 / 4)).toBeCloseTo(3840, 6)
    expect(halfRoundCapacity(10, 1 / 2)).toBeCloseTo(20400, 6)
    const mid = halfRoundCapacity(5.5, 1 / 8)
    expect(mid).toBeGreaterThan(1760)
    expect(mid).toBeLessThan(2720)
  })
  it('K-style beats half-round of the same width', () => {
    const h5 = PROFILES.find((p) => p.id === 'h5')!, k5 = PROFILES.find((p) => p.id === 'k5')!
    expect(profileCapacity(k5, 1 / 16, 1)).toBeGreaterThan(profileCapacity(h5, 1 / 16, 1))
  })
  it('flow, pitch factor and plane sizing', () => {
    expect(flowGpm(1000, 1)).toBeCloseTo(10.39, 2) // 1000 ft² × 1 in/h = 623 gal/h
    expect(pitchFactor(6)).toBe(1.1)
    const r = sizePlane({ id: 'a', name: 'A', eave: 40, run: 15, rise: 6 }, 4, 1 / 16, DOWNSPOUTS[0], 40)
    expect(r.design).toBeCloseTo(660, 6)
    expect(r.outlets).toBeGreaterThanOrEqual(1)
    expect(halfRoundCapacity(r.needD, 1 / 16) / 4).toBeCloseTo(r.perOutlet, 3)
  })
})
