import { describe, expect, it } from 'vitest'
import { ev100, fmtShutter, nearest, SHUTTERS, solve, stops } from './exposure-triangle-calculator'

describe('exposure math', () => {
  it('EV100 references', () => {
    expect(ev100({ n: 1, t: 1, iso: 100 })).toBeCloseTo(0)
    expect(ev100({ n: 16, t: 1 / 128, iso: 100 })).toBeCloseTo(15)
    expect(ev100({ n: 16, t: 1 / 128, iso: 200 })).toBeCloseTo(14)
  })
  it('solves each parameter back', () => {
    const e = { n: 5.6, t: 1 / 250, iso: 400 }
    const ev = ev100(e)
    expect(solve('t', e, ev)).toBeCloseTo(1 / 250)
    expect(solve('n', e, ev)).toBeCloseTo(5.6)
    expect(solve('iso', e, ev)).toBeCloseTo(400)
    // one stop wider aperture at same ISO needs half the time
    expect(solve('t', { ...e, n: 5.6 / Math.SQRT2 }, ev)).toBeCloseTo(1 / 500)
  })
  it('stops and snapping', () => {
    expect(stops('n', 2.8) - stops('n', 4)).toBeCloseTo(1, 1)
    const r = nearest('t', SHUTTERS, 1 / 128)
    expect(r.v).toBeCloseTo(1 / 125)
    expect(Math.abs(r.err)).toBeLessThan(0.05)
    expect(fmtShutter(1 / 125)).toBe('1/125')
    expect(fmtShutter(2)).toBe('2″')
  })
})
