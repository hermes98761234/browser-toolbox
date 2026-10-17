import { describe, expect, it } from 'vitest'
import { fmtH, normalizeDelta, plan, toIcs, tzOffsetMin } from './jet-lag-planner'

const base = { bed: 23, wake: 7, preDays: 3, dir: 'auto' as const, advanceRate: 1, delayRate: 1.5, depart: '2026-11-10' }

describe('jet lag', () => {
  it('time zone offsets', () => {
    expect(tzOffsetMin('UTC', new Date('2026-01-15T12:00:00Z'))).toBe(0)
    expect(tzOffsetMin('Asia/Tokyo', new Date('2026-01-15T12:00:00Z'))).toBe(540)
    expect(tzOffsetMin('America/New_York', new Date('2026-01-15T12:00:00Z'))).toBe(-300)
    expect(tzOffsetMin('America/New_York', new Date('2026-07-15T12:00:00Z'))).toBe(-240)
    expect(tzOffsetMin('Asia/Kolkata', new Date('2026-07-15T12:00:00Z'))).toBe(330)
  })
  it('eastward advance', () => {
    const p = plan({ ...base, delta: 6 }) // New York → Paris
    expect(p.direction).toBe('advance')
    expect(p.need).toBe(6)
    expect(p.days[0].offset).toBe(-3)
    expect(fmtH(p.days[0].wake)).toBe('06:00')
    expect(fmtH(p.days[2].bed)).toBe('20:00') // 3 h earlier at home
    const last = p.days[p.days.length - 1]
    expect(last.behind).toBe(0)
    expect(fmtH(last.wake)).toBe('07:00') // back to the usual schedule in local time
    expect(fmtH(last.seek[0])).toBe('07:00')
  })
  it('westward delay and auto choice', () => {
    const p = plan({ ...base, delta: -8 })
    expect(p.direction).toBe('delay')
    expect(p.need).toBe(8)
    expect(normalizeDelta(13)).toBe(-11)
    expect(plan({ ...base, delta: 10 }).direction).toBe('delay') // 14 h delay at 1.5/day beats 10 h advance at 1/day
  })
  it('ics', () => {
    const ics = toIcs(plan({ ...base, delta: 2, preDays: 1 }), '20260101T000000Z')
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true)
    expect(ics).toContain('DTSTART:20261109T060000')
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(6)
  })
})
