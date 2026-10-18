import { describe, expect, it } from 'vitest'
import { cycle, fmtMin, opTime, rpmFor, type Machine, type Op } from './cycle-time-calculator'

const m: Machine = { units: 'metric', maxRpm: 12000, rapidRate: 30000, toolChange: 6, handling: 30, setup: 30, batch: 10, rate: 60, tapReturn: 1 }
const op = (p: Partial<Op>): Op => ({ id: 'x', name: 'x', type: 'mill', d: 10, z: 4, vc: 100, f: 0.05, len: 100, extra: 0, passes: 1, count: 1, rapid: 0, peck: 0, newTool: false, ...p })

describe('cycle time', () => {
  it('spindle speed', () => {
    expect(rpmFor(100, 10, 'metric')).toBeCloseTo(3183.1, 1)
    expect(rpmFor(400, 0.5, 'inch')).toBeCloseTo(3055.8, 1) // 12·400/(π·0.5)
  })
  it('milling feed and time', () => {
    const r = opTime(op({}), m)
    expect(r.feed).toBeCloseTo(0.05 * 4 * 3183.1, 0) // ≈ 636.6 mm/min
    expect(r.cut).toBeCloseTo(100 / r.feed, 9)
  })
  it('caps rpm at the machine maximum', () => {
    const r = opTime(op({ d: 1, vc: 200 }), m)
    expect(r.capped).toBe(true)
    expect(r.rpm).toBe(12000)
  })
  it('turning uses feed per rev and multiple passes', () => {
    const r = opTime(op({ type: 'turn', d: 50, vc: 200, f: 0.25, len: 80, extra: 2, passes: 3 }), { ...m, rapidRate: 10000 })
    const n = (1000 * 200) / (Math.PI * 50)
    expect(r.cut).toBeCloseTo((82 * 3) / (0.25 * n), 9)
    expect(r.rapid).toBeCloseTo((2 * 82) / 10000, 9)
  })
  it('drilling adds point length, repetitions and peck retracts', () => {
    const r = opTime(op({ type: 'drill', d: 10, vc: 80, f: 0.2, len: 20, count: 4 }), m)
    const n = (1000 * 80) / (Math.PI * 10)
    expect(r.cut).toBeCloseTo((4 * 23) / (0.2 * n), 9)
    const p = opTime(op({ type: 'drill', d: 10, vc: 80, f: 0.2, len: 20, peck: 10 }), m)
    expect(p.rapid).toBeGreaterThan(opTime(op({ type: 'drill', d: 10, vc: 80, f: 0.2, len: 20 }), m).rapid)
  })
  it('tapping goes in and out at pitch × rpm', () => {
    const r = opTime(op({ type: 'tap', d: 8, vc: 10, f: 1.25, len: 16, extra: 2 }), m)
    const n = (1000 * 10) / (Math.PI * 8)
    expect(r.cut).toBeCloseTo((2 * 18) / (1.25 * n), 9)
  })
  it('batch totals', () => {
    const c = cycle([op({ newTool: true })], m)
    const cutT = opTime(op({}), m).cut
    expect(c.part).toBeCloseTo(cutT + 0.1 + 0.5, 9)
    expect(c.perPart).toBeCloseTo((30 + 10 * c.part) / 10, 9)
    expect(c.cost).toBeCloseTo((c.perPart / 60) * 60, 9)
  })
  it('formats minutes', () => {
    expect(fmtMin(0.5)).toBe('30 s')
    expect(fmtMin(2.5)).toBe('2:30')
    expect(fmtMin(75)).toBe('1 h 15 min')
  })
})
