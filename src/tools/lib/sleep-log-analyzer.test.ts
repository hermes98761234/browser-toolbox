import { describe, expect, it } from 'vitest'
import { bedClock, clock, corr, hm, nightStats, rolling, sd, summary, timeInBed, toMin, type Night } from './sleep-log-analyzer'

const n = (date: string, bed: string, wake: string, latency = 0, waso = 0): Night => ({ id: date, date, bed, wake, latency, waso, quality: 3, note: '' })

describe('sleep log', () => {
  it('parses times and crosses midnight', () => {
    expect(toMin('07:30')).toBe(450)
    expect(toMin('25:00')).toBeNaN()
    expect(timeInBed('23:00', '07:00')).toBe(480)
    expect(timeInBed('01:30', '09:00')).toBe(450)
    expect(timeInBed('13:00', '14:30')).toBe(90)
  })
  it('computes sleep and efficiency', () => {
    const s = nightStats(n('2026-01-05', '23:00', '07:00', 20, 40))
    expect(s.sleep).toBe(420)
    expect(s.eff).toBeCloseTo(0.875)
    expect(bedClock('23:00')).toBe(660)
    expect(clock(s.mid)).toBe('03:00')
  })
  it('summarises consistency and social jet lag', () => {
    // Mon–Thu 23:00–07:00, Fri+Sat 01:00–09:00 → midpoint shifts by 2 h
    const nights = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08'].map((d) => n(d, '23:00', '07:00'))
      .concat([n('2026-01-09', '01:00', '09:00'), n('2026-01-10', '01:00', '09:00')])
    const s = summary(nights, 8)
    expect(s.jetLag).toBe(120)
    expect(s.avgSleep).toBe(480)
    expect(s.debt7).toBe(0)
    expect(s.sdBed).toBeCloseTo(sd([660, 660, 660, 660, 780, 780]))
  })
  it('helpers', () => {
    expect(hm(-95)).toBe('−1h 35m')
    expect(rolling([1, 2, 3, 4], 2)).toEqual([1, 1.5, 2.5, 3.5])
    expect(corr([1, 2, 3], [2, 4, 6])).toBeCloseTo(1)
  })
})
