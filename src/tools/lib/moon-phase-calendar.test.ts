import { describe, expect, it } from 'vitest'
import { litPath, localMidnight, moonDay, phaseEvents, tzOffset } from './moon-phase-calendar'

const U = (s: string) => Date.parse(s + 'Z')
const near = (q: number, iso: string, tolMin = 10) => {
  const t = U(iso)
  const ev = phaseEvents(t - 5 * 86400000, t + 5 * 86400000).filter((e) => e.q === q)
  expect(ev.length).toBe(1)
  expect(Math.abs(ev[0].t - t) / 60000).toBeLessThan(tolMin)
}

describe('moon phases against published instants (UTC)', () => {
  it('new moons (solar eclipses)', () => {
    near(0, '2024-04-08T18:21:00')
    near(0, '2025-09-21T19:54:00')
  })
  it('full moons (lunar eclipses)', () => {
    near(2, '2024-03-25T07:00:00')
    near(2, '2025-03-14T06:55:00')
    near(2, '2025-09-07T18:09:00')
  })
  it('quarters', () => {
    near(1, '2024-01-18T03:53:00')
    near(3, '2024-01-04T03:30:00')
  })
  it('about 12-13 full moons a year, ordered', () => {
    const ev = phaseEvents(U('2025-01-01T00:00:00'), U('2026-01-01T00:00:00'))
    const full = ev.filter((e) => e.q === 2)
    expect(full.length).toBeGreaterThanOrEqual(12)
    expect(full.length).toBeLessThanOrEqual(13)
    for (let i = 1; i < ev.length; i++) expect(ev[i].t).toBeGreaterThan(ev[i - 1].t)
  })
})

describe('day data and helpers', () => {
  it('illumination near full and new', () => {
    expect(moonDay(U('2025-03-14T00:00:00'), 51.5, 0, false).frac).toBeGreaterThan(0.98)
    expect(moonDay(U('2024-04-08T06:00:00'), 51.5, 0, false).frac).toBeLessThan(0.02)
  })
  it('moon rises roughly at sunset when full', () => {
    const d = moonDay(U('2025-09-07T00:00:00'), 51.5, 0)
    expect(d.rise).not.toBeNull()
    expect(d.sunset).not.toBeNull()
    expect(Math.abs(d.rise! - d.sunset!) / 3600000).toBeLessThan(1.5)
  })
  it('time zones', () => {
    expect(tzOffset(U('2026-07-01T12:00:00'), 'Europe/Kyiv')).toBe(180)
    expect(tzOffset(U('2026-01-15T12:00:00'), 'America/New_York')).toBe(-300)
    expect(tzOffset(U('2026-01-15T12:00:00'), 'UTC')).toBe(0)
    expect(localMidnight(2026, 6, 1, 'Europe/Kyiv')).toBe(U('2026-06-30T21:00:00'))
  })
  it('lit path shapes', () => {
    expect(litPath(180, 10, 0, 0)).toContain('A10.000,10')
    expect(litPath(90, 10, 0, 0)).toContain('A0.000,10')
  })
})
