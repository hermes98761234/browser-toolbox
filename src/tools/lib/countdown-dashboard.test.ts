import { describe, expect, it } from 'vitest'
import { decode, encode, monthsDays, parts, progress, target, type Countdown } from './countdown-dashboard'

const c = (p: Partial<Countdown>): Countdown => ({ id: '1', title: 'Trip ✈️ «Ålesund»', at: '2026-12-24T18:00', emoji: '🎄', color: '#ef4444', yearly: false, created: '2026-10-01T00:00:00', ...p })

describe('countdown dashboard', () => {
  it('splits durations', () => {
    expect(parts(90061000)).toEqual({ past: false, days: 1, hours: 1, minutes: 1, seconds: 1 })
    expect(parts(-61000).past).toBe(true)
  })
  it('yearly events roll forward', () => {
    const now = new Date('2026-12-25T00:00:00')
    expect(target(c({ yearly: true }), now).getFullYear()).toBe(2027)
    expect(target(c({}), now).getFullYear()).toBe(2026)
  })
  it('months and days', () => {
    expect(monthsDays(new Date('2026-01-31T00:00'), new Date('2026-03-05T00:00'))).toEqual({ months: 1, days: 2 })
    expect(monthsDays(new Date('2026-10-18T00:00'), new Date('2026-12-24T00:00'))).toEqual({ months: 2, days: 6 })
    expect(monthsDays(new Date('2026-10-18T20:46'), new Date('2027-01-01T00:00'))).toEqual({ months: 2, days: 13 })
  })
  it('progress', () => {
    expect(progress(c({}), new Date('2026-10-01T00:00:00'))).toBe(0)
    expect(progress(c({}), new Date('2027-01-01T00:00:00'))).toBe(1)
  })
  it('share link round trip with unicode', () => {
    const s = encode([c({}), c({ title: 'B', yearly: true })])
    expect(s).not.toMatch(/[+/=]/)
    const d = decode(s, () => 'x', 'now')!
    expect(d.map((x) => [x.title, x.at, x.emoji, x.yearly])).toEqual([['Trip ✈️ «Ålesund»', '2026-12-24T18:00', '🎄', false], ['B', '2026-12-24T18:00', '🎄', true]])
    expect(decode('%%%', () => 'x', 'now')).toBeNull()
  })
})
