import { describe, expect, it } from 'vitest'
import { brown, bumps, impulses, lag1, pink, rms, swells, white } from './focus-soundscape-mixer'

describe('noise generators', () => {
  const N = 48000
  it('noise colours have increasing low-frequency correlation', () => {
    const w = white(N), p = pink(N), b = brown(N)
    expect(Math.abs(lag1(w))).toBeLessThan(0.05)
    expect(lag1(p)).toBeGreaterThan(0.3)
    expect(lag1(b)).toBeGreaterThan(0.95)
    for (const a of [w, p, b]) {
      expect(rms(a)).toBeGreaterThan(0.05)
      expect(Math.max(...a.map(Math.abs))).toBeLessThanOrEqual(1.2)
    }
  })
  it('impulses are sparse and clipped', () => {
    const d = impulses(N, 48000, 20, 10)
    const nonzero = d.filter((v) => v !== 0).length
    expect(nonzero).toBeGreaterThan(1000)
    expect(nonzero).toBeLessThan(N * 0.6)
    expect(Math.max(...d.map(Math.abs))).toBeLessThanOrEqual(1)
  })
  it('envelopes stay in 0..1 and swells end at the floor', () => {
    const e = bumps(N, 48000, 4, 0.3)
    expect(Math.min(...e)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...e)).toBeLessThanOrEqual(1)
    const s = swells(4000 * 30, 4000)
    expect(Math.min(...s)).toBeGreaterThanOrEqual(0.12 - 1e-6)
    expect(Math.max(...s)).toBeLessThanOrEqual(1)
  })
})
