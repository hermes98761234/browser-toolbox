import { describe, expect, it } from 'vitest'
import { RULES, checkRule, intervals, mmss, summary, type Contraction } from './contraction-timer'

const M = 60000
const series = (n: number, gapMin: number, durS: number, t0 = 0): Contraction[] => Array.from({ length: n }, (_, i) => ({ start: t0 + i * gapMin * M, end: t0 + i * gapMin * M + durS * 1000 }))

describe('contraction-timer', () => {
  it('computes intervals and summary', () => {
    const l = series(4, 6, 50)
    expect(intervals(l)).toEqual([null, 360, 360, 360])
    const s = summary(l, 18 * M + 50000)
    expect(s.count).toBe(4)
    expect(s.avgDur).toBeCloseTo(50)
    expect(s.avgGap).toBeCloseTo(360)
    expect(s.lastGap).toBe(360)
  })
  it('checks 5-1-1', () => {
    const almost = checkRule(series(14, 4.5, 70), RULES['511'].r) // 13 × 4.5 = 58.5 min: not yet
    expect(almost.met).toBe(false)
    expect(almost.minutes).toBeCloseTo(58.5)
    expect(checkRule(series(15, 4.5, 70), RULES['511'].r).met).toBe(true) // 63 min
    expect(checkRule(series(15, 4.5, 50), RULES['511'].r).met).toBe(false) // too short
    expect(checkRule(series(15, 6, 70), RULES['511'].r).met).toBe(false) // too far apart
    // an old long gap does not break a recent qualifying run
    const mixed = [...series(3, 10, 60), ...series(16, 4, 65, 40 * M)]
    expect(checkRule(mixed, RULES['511'].r).met).toBe(true)
  })
  it('formats time', () => {
    expect(mmss(75)).toBe('1:15')
    expect(mmss(3725)).toBe('1:02:05')
    expect(mmss(NaN)).toBe('—')
  })
})
