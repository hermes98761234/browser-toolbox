import { describe, expect, it } from 'vitest'
import { band, bestSlots, fmtOffset, local, midnight, offset } from './time-zone-planner'

describe('time zone planner', () => {
  it('computes DST-aware offsets', () => {
    expect(offset(Date.UTC(2026, 0, 15, 12), 'America/New_York')).toBe(-300)
    expect(offset(Date.UTC(2026, 6, 15, 12), 'America/New_York')).toBe(-240)
    expect(offset(Date.UTC(2026, 6, 15, 12), 'Asia/Kolkata')).toBe(330)
    expect(offset(Date.UTC(2026, 6, 15, 12), 'UTC')).toBe(0)
    expect(fmtOffset(330)).toBe('UTC+5:30')
    expect(fmtOffset(-240)).toBe('UTC−4')
  })
  it('finds local midnight', () => {
    const t = midnight('2026-07-15', 'Europe/Kyiv')
    expect(new Date(t).toISOString()).toBe('2026-07-14T21:00:00.000Z')
    expect(local(t, 'Europe/Kyiv').h).toBe(0)
    // DST start day in New York (2026-03-08)
    expect(local(midnight('2026-03-08', 'America/New_York'), 'America/New_York').h).toBe(0)
  })
  it('bands and best slots', () => {
    expect(band(10)).toBe(2)
    expect(band(20)).toBe(1)
    expect(band(3)).toBe(0)
    const t0 = midnight('2026-07-15', 'UTC')
    const best = bestSlots(t0, 48, 30, 2, [{ zone: 'Europe/London', start: 9, end: 17 }, { zone: 'America/New_York', start: 9, end: 17 }])
    // London BST 9–17 = 08–16 UTC, New York EDT 9–17 = 13–21 UTC → overlap 13:00–16:00 UTC
    expect(best[0].allWork).toBe(true)
    expect(best[0].i).toBe(26)
  })
})
