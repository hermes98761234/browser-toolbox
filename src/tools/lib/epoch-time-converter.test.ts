import { describe, expect, it } from 'vitest'
import { dayOfYear, detectUnit, duration, fmtOffset, isoWeek, parseInput, relative, rfc2822, toUnit, wallToEpoch, zoneOffset } from './epoch-time-converter'

describe('epoch time converter', () => {
  it('detects units by magnitude', () => {
    expect(detectUnit(1700000000)).toBe('s')
    expect(detectUnit(1700000000000)).toBe('ms')
    expect(detectUnit(1700000000000000)).toBe('us')
    expect(detectUnit(1700000000000000000)).toBe('ns')
  })
  it('parses timestamps and date strings', () => {
    expect(parseInput('1700000000')!.ms).toBe(1700000000000)
    expect(parseInput('1_700_000_000_123')!.ms).toBe(1700000000123)
    const ns = parseInput('1700000000123456789')!
    expect(ns.unit).toBe('ns')
    expect(ns.ms).toBe(1700000000123)
    expect(ns.fraction).toBe('456789')
    expect(parseInput('2023-11-14T22:13:20Z')!.ms).toBe(1700000000000)
    expect(parseInput('1.5', 's')!.ms).toBe(1500)
    expect(parseInput('hello')).toBeNull()
  })
  it('converts back to every unit', () => {
    expect(toUnit(1700000000123, 's')).toBe('1700000000')
    expect(toUnit(1700000000123, 'ns')).toBe('1700000000123000000')
  })
  it('computes calendar facts', () => {
    expect(isoWeek(Date.UTC(2021, 0, 3))).toEqual({ year: 2020, week: 53 })
    expect(isoWeek(Date.UTC(2024, 11, 30))).toEqual({ year: 2025, week: 1 })
    expect(dayOfYear(Date.UTC(2024, 11, 31))).toBe(366)
    expect(rfc2822(0)).toBe('Thu, 01 Jan 1970 00:00:00 +0000')
  })
  it('formats relative times and durations', () => {
    expect(relative(0, 3 * 864e5)).toBe('3 days ago')
    expect(relative(2 * 36e5, 0)).toBe('in 2 hours')
    expect(duration(864e5 + 3661000)).toBe('1d 01:01:01')
  })
  it('handles zones and DST', () => {
    expect(zoneOffset('America/New_York', Date.UTC(2024, 0, 10))).toBe(-300)
    expect(zoneOffset('Asia/Kolkata', Date.UTC(2024, 0, 10))).toBe(330)
    expect(fmtOffset(330)).toBe('UTC+05:30')
    expect(wallToEpoch('2024-07-01', '12:00', 'Europe/Berlin')).toBe(Date.UTC(2024, 6, 1, 10))
    expect(wallToEpoch('2024-01-01', '00:00:00', 'UTC')).toBe(Date.UTC(2024, 0, 1))
  })
})
