import { describe, expect, it } from 'vitest'
import { advice, behaviorStats, dailyKcal, perMinute, treatShare, type Rep } from './clicker-trainer'

describe('clicker-trainer', () => {
  it('computes per-behaviour success', () => {
    const reps: Rep[] = [...Array(8)].map((_, i) => ({ t: i, behavior: 'sit', ok: i !== 3 })).concat([{ t: 9, behavior: 'down', ok: false }])
    const s = behaviorStats(reps, 'sit')
    expect(s.tries).toBe(8)
    expect(s.clicks).toBe(7)
    expect(s.rate).toBeCloseTo(0.875)
    expect(behaviorStats(reps, 'down').misses).toBe(1)
  })
  it('gives 80% rule advice', () => {
    expect(advice(0.9, 10).tone).toBe('ok')
    expect(advice(0.4, 10).tone).toBe('warn')
    expect(advice(0.6, 10).tone).toBe('info')
    expect(advice(1, 2).text).toMatch(/5 tries/)
  })
  it('rates and calories', () => {
    expect(perMinute(30, 120)).toBe(15)
    expect(dailyKcal(10)).toBeCloseTo(1.6 * 70 * 5.6234, 1)
    expect(treatShare(40, 3, 1200)).toBeCloseTo(0.1)
  })
})
