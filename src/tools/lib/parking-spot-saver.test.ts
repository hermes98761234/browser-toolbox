import { describe, expect, it } from 'vitest'
import { bearing, compass, meterIcs, meterLeft, walkMinutes } from './parking-spot-saver'

describe('parking', () => {
  it('meter countdown', () => {
    expect(meterLeft(1_000_000 + 3_725_000, 1_000_000).text).toBe('1:02:05')
    expect(meterLeft(1_000_000 + 65_000, 1_000_000).text).toBe('1:05')
    const e = meterLeft(0, 90_000)
    expect(e.expired).toBe(true)
    expect(e.text).toBe('−1:30')
  })
  it('walk time and direction', () => {
    expect(walkMinutes(648)).toBeCloseTo(10, 6)
    expect(compass(bearing([0, 0], [-1, 0]))).toBe('S')
  })
  it('ics', () => {
    const ics = meterIcs(Date.UTC(2026, 0, 2, 10, 0), 10, 'Level 2, B14', Date.UTC(2026, 0, 1))
    expect(ics).toContain('DTSTART:20260102T095000Z')
    expect(ics).toContain('DESCRIPTION:Level 2\\, B14')
  })
})
