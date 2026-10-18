import { describe, expect, it } from 'vitest'
import { dayWindow, moonHourAngle, phaseScore, solunarDay } from './solunar-fishing-planner'

describe('solunar-fishing-planner', () => {
  it('builds the local day window', () => {
    const [a, b] = dayWindow('2024-06-01', 2)
    expect(new Date(a).toISOString()).toBe('2024-05-31T22:00:00.000Z')
    expect(b - a).toBe(86400000)
  })
  it('scores new/full moon above quarters', () => {
    expect(phaseScore(0)).toBeCloseTo(1, 10)
    expect(phaseScore(180)).toBeCloseTo(1, 10)
    expect(phaseScore(90)).toBeLessThan(1e-6)
  })
  it('finds a full-moon day with transits about 12 h apart', () => {
    // full moon 2024-01-25 17:54 UTC; Greenwich
    const d = solunarDay('2024-01-25', 51.48, 0, 0)
    expect(d.phase.name).toBe('Full Moon')
    // transits drift ~50 min/day, so some days have only one of them
    expect(d.lower).not.toBeNull()
    expect(Math.abs(Math.abs(moonHourAngle(d.lower!, 0)) - 180)).toBeLessThan(0.5)
    const prev = solunarDay('2024-01-24', 51.48, 0, 0)
    expect(Math.abs(moonHourAngle(prev.upper!, 0))).toBeLessThan(0.5)
    expect(new Date(prev.upper!).getUTCHours()).toBeGreaterThanOrEqual(22)
    // a full moon is underfoot near local noon and overhead near midnight
    const lowerH = new Date(d.lower!).getUTCHours() + new Date(d.lower!).getUTCMinutes() / 60
    expect(Math.abs(lowerH - 12)).toBeLessThan(1.5)
    expect(d.moonrise).not.toBeNull()
    expect(d.moonset).not.toBeNull()
    // sunrise in London late January ≈ 07:50 UTC
    const sr = new Date(d.sunrise!)
    expect(sr.getUTCHours() * 60 + sr.getUTCMinutes()).toBeGreaterThan(7 * 60 + 35)
    expect(sr.getUTCHours() * 60 + sr.getUTCMinutes()).toBeLessThan(8 * 60 + 5)
    expect(d.periods.filter((p) => p.kind === 'major').every((p) => p.end - p.start === 2 * 3600000)).toBe(true)
    expect(d.score).toBeGreaterThanOrEqual(60)
  })
})
