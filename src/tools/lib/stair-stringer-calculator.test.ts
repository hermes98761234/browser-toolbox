import { describe, expect, it } from 'vitest'
import { checks, CODES, compute, fmtFtIn, fmtIn, lumber } from './stair-stringer-calculator'

const base = { rise: 108, maxRiser: 7.75, tread: 10, nosing: 1, stock: 11.25, treadThk: 1, flushTop: true }

describe('stair-stringer-calculator', () => {
  it('splits the rise into equal risers within the limit', () => {
    const o = compute(base)
    expect(o.n).toBe(14) // 108 / 7.75 = 13.94 → 14
    expect(o.riser).toBeCloseTo(108 / 14, 9)
    expect(o.treads).toBe(13)
    expect(o.run).toBe(130)
    expect(o.angle).toBeCloseTo((Math.atan2(108 / 14, 10) * 180) / Math.PI, 9)
    expect(compute({ ...base, rise: 31 }).n).toBe(4) // exact multiple of 7.75 stays 4
  })
  it('computes throat and comfort rules', () => {
    const o = compute({ ...base, rise: 7 * 7, maxRiser: 7, tread: 11 })
    expect(o.throat).toBeCloseTo(11.25 - (7 * 11) / Math.hypot(7, 11), 9)
    expect(o.twoRT).toBe(25)
    expect(o.rTimesT).toBe(77)
  })
  it('flags code problems', () => {
    const o = compute({ ...base, maxRiser: 8.5 })
    const c = checks({ ...base, maxRiser: 8.5 }, o, CODES.irc, 82, 36)
    expect(c.find((x) => x.label === 'Riser height')!.ok).toBe(false)
    expect(checks(base, compute(base), CODES.irc, 82, 36).find((x) => x.label === 'Riser height')!.ok).toBe(true)
    expect(checks(base, compute(base), CODES.irc, 70, 36).find((x) => x.label === 'Headroom')!.ok).toBe(false)
  })
  it('formats fractions', () => {
    expect(fmtIn(7.714)).toBe('7 11/16″')
    expect(fmtIn(0.5)).toBe('1/2″')
    expect(fmtIn(10)).toBe('10″')
    expect(fmtFtIn(130)).toBe('10′ 10″')
    expect(lumber(150)).toBe(14)
  })
})
describe('stringer length', () => {
  it('equals the projection of the top corner on the board axis', () => {
    const o = compute({ rise: 4 * 7, maxRiser: 7, tread: 10, nosing: 1, stock: 11.25, treadThk: 1, flushTop: true })
    const a = Math.atan2(7, 10)
    expect(o.stringerLen).toBeCloseTo(30 * Math.cos(a) + 28 * Math.sin(a), 9)
  })
})
