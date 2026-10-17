import { describe, expect, it } from 'vitest'
import { cumulative, daily, monthly, parseCsv, sample, seasonOf, seasonTotals, summary, toDate, years, type Reading } from './rain-gauge-log'

const R = (date: string, mm: number): Reading => ({ id: date + mm, date, mm })
const RS = [R('2024-01-05', 10), R('2024-01-05', 2.5), R('2024-02-29', 4), R('2024-12-20', 8), R('2025-01-10', 6), R('2025-03-01', 0.1), R('bad', 3)]

describe('rain gauge log', () => {
  it('aggregates by day and month', () => {
    expect(daily(RS).get('2024-01-05')).toBe(12.5)
    expect(daily(RS).has('bad')).toBe(false)
    expect(monthly(RS, 2024)).toEqual([12.5, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8])
    expect(years(RS)).toEqual([2024, 2025])
  })
  it('builds cumulative year-to-date curves', () => {
    const c = cumulative(RS, 2024)
    expect(c[0]).toEqual([0, 0])
    expect(c.find(([d]) => d === 60)).toEqual([60, 16.5]) // Feb 29 is day 60 in a leap year
    expect(c[c.length - 1]).toEqual([366, 24.5])
    expect(toDate(RS, 2024, 59)).toBe(12.5)
    expect(cumulative(RS, 2025, 30)).toEqual([[0, 0], [10, 6], [30, 6]])
  })
  it('assigns December to the next winter', () => {
    expect(seasonOf('2024-12-20')).toEqual({ season: 'Winter', year: 2025 })
    expect(seasonOf('2024-07-01', true).season).toBe('Winter')
    const s = seasonTotals(RS)
    expect(s.get(2025)!.Winter).toBe(14)
    expect(s.get(2024)!.Winter).toBe(16.5)
    expect(s.get(2025)!.Spring).toBeCloseTo(0.1, 9)
  })
  it('summarises a year', () => {
    const s = summary(RS, 2024)
    expect(s.total).toBe(24.5)
    expect(s.rainDays).toBe(3)
    expect(s.wettest).toEqual({ date: '2024-01-05', mm: 12.5 })
    expect(s.longestDry).toBe(355 - 60 - 1) // Dec 20 = day 355
    expect(summary(RS, 2025).rainDays).toBe(1) // 0.1 mm is below the rain-day threshold
  })
  it('parses CSV in several formats', () => {
    const { readings, skipped } = parseCsv('date,mm\n2024-05-01,3.2\n02/05/2024;1,5;garden gauge\nxx,1\n2024-05-03,-1')
    expect(skipped).toBe(3)
    expect(readings).toEqual([{ date: '2024-05-01', mm: 3.2, note: undefined }, { date: '2024-05-02', mm: 1.5, note: 'garden gauge' }])
    expect(parseCsv('2024-05-01,1', true).readings[0].mm).toBeCloseTo(25.4, 9)
  })
  it('generates a plausible sample', () => {
    const s = sample('2026-10-17')
    expect(years(s)).toEqual([2024, 2025, 2026])
    const t = summary(s, 2025).total
    expect(t).toBeGreaterThan(400)
    expect(t).toBeLessThan(1400)
  })
})
