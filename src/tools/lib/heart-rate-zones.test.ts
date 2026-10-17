import { describe, expect, it } from 'vitest'
import { hrrFraction, karvonen, maxHr, zoneOf, zones } from './heart-rate-zones'

describe('heart-rate-zones', () => {
  it('max HR formulas', () => {
    expect(maxHr('fox', 40)).toBe(180)
    expect(maxHr('tanaka', 40)).toBe(180)
    expect(maxHr('gellish', 30)).toBeCloseTo(186)
    expect(maxHr('measured', 30, 195)).toBe(195)
  })
  it('karvonen', () => {
    // max 180, rest 60, 70% → 60 + 0.7·120 = 144
    expect(karvonen(180, 60, 0.7)).toBe(144)
    expect(hrrFraction(180, 60, 144)).toBeCloseTo(0.7)
  })
  it('zones and lookup', () => {
    const z = zones(180, 60, 'karvonen')
    expect(z[0].bpmLo).toBe(120)
    expect(z[4].bpmHi).toBe(180)
    expect(zoneOf(z, 100)).toBe(-1)
    expect(zoneOf(z, 150)).toBe(2)
    expect(zoneOf(z, 180)).toBe(4)
    expect(zoneOf(z, 190)).toBe(5)
    expect(zones(200, 60, 'percent')[1].bpmLo).toBe(120)
  })
})
