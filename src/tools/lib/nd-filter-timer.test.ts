import { describe, expect, it } from 'vitest'
import { clock, formatShutter, ndTime, parseShutter, reciprocity, settingsStops, stopsFromDensity, stopsFromFactor, stopsNeeded } from './nd-filter-timer'

describe('nd-filter-timer', () => {
  it('parses shutter text', () => {
    expect(parseShutter('1/125')).toBeCloseTo(0.008, 6)
    expect(parseShutter('2"')).toBe(2)
    expect(parseShutter('0.5')).toBe(0.5)
    expect(parseShutter('1m30s')).toBe(90)
    expect(parseShutter('abc')).toBeNaN()
    expect(parseShutter('1/0')).toBeNaN()
  })
  it('formats', () => {
    expect(formatShutter(1 / 125)).toBe('1/125')
    expect(formatShutter(2)).toBe('2″')
    expect(formatShutter(128)).toBe('2m 08s')
    expect(formatShutter(3840)).toBe('1h 04m 00s')
    expect(clock(65.25)).toBe('01:05.3')
  })
  it('stop math', () => {
    expect(stopsFromFactor(1000)).toBeCloseTo(9.966, 3)
    expect(stopsFromDensity(3)).toBeCloseTo(9.966, 3)
    expect(ndTime(1 / 125, 10)).toBeCloseTo(8.192, 3)
    expect(ndTime(1 / 60, 6)).toBeCloseTo(1.0667, 3)
    expect(stopsNeeded(1 / 30, 30)).toBeCloseTo(9.81, 2)
    expect(settingsStops(400, 100, 8, 8)).toBe(2)
    expect(settingsStops(100, 100, 8, 16)).toBe(2)
  })
  it('reciprocity', () => {
    expect(reciprocity(0.5, 1.31)).toBe(0.5)
    expect(reciprocity(10, 1.31)).toBeCloseTo(20.42, 2)
    expect(reciprocity(10, 1)).toBe(10)
  })
})
