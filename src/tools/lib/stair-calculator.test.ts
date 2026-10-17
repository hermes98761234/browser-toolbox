import { describe, expect, it } from 'vitest'
import { CODES, checks, compute, stringerProfile } from './stair-calculator'

const base = { rise: 2700, tread: 254, risers: 0, maxRiser: 196, treadThick: 25, board: 286, floorThick: 250, headroom: 2032 }

describe('stairs', () => {
  it('splits the rise into equal risers', () => {
    const r = compute(base)
    expect(r.n).toBe(14)
    expect(r.riser).toBeCloseTo(192.857, 2)
    expect(r.treads).toBe(13)
    expect(r.totalRun).toBe(3302)
    expect(r.pitch).toBeCloseTo(37.2, 1)
    expect(r.lineLength).toBeCloseTo(Math.hypot(2700, 3302), 6)
  })
  it('stringer notch and throat', () => {
    const r = compute({ ...base, rise: 7 * 180, tread: 240 })
    expect(r.notchDepth).toBeCloseTo(144, 6) // 3-4-5 triangle: 180·240/300
    expect(r.throat).toBeCloseTo(142, 6)
  })
  it('code checks and profile', () => {
    const r = compute(base)
    const c = checks(r, base, CODES.irc, (x) => x.toFixed(0))
    expect(c.every((x) => x.ok)).toBe(true)
    const p = stringerProfile(r, 254, 25)
    expect(p.length).toBe(2 + 2 * 13)
    expect(p[p.length - 1][1]).toBeCloseTo(2700 - 25, 6)
  })
})
