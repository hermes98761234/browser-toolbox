import { describe, expect, it } from 'vitest'
import { dayNum, earliestEntry, firstViolation, isoOf, maxStay, presence, regainDate, usedOn, type Trip } from './visa-day-counter'

const t = (entry: string, exit: string): Trip => ({ id: entry, entry, exit, note: '' })
const D = dayNum

describe('rolling 90/180 window', () => {
  it('counts entry and exit days', () => {
    expect(usedOn(presence([t('2026-01-01', '2026-01-01')]), D('2026-01-01'))).toBe(1)
    expect(usedOn(presence([t('2026-01-01', '2026-01-10')]), D('2026-01-10'))).toBe(10)
  })
  it('same-day re-entry and overlaps count once', () => {
    const p = presence([t('2026-01-01', '2026-01-10'), t('2026-01-10', '2026-01-12'), t('2026-01-05', '2026-01-06')])
    expect(p.size).toBe(12)
  })
  it('window edges: day d−179 counts, d−180 does not', () => {
    const p = presence([t('2026-01-01', '2026-01-01')])
    const d0 = D('2026-01-01')
    expect(usedOn(p, d0 + 179)).toBe(1)
    expect(usedOn(p, d0 + 180)).toBe(0)
  })
  it('exactly 90 days is legal, 91 is not', () => {
    expect(firstViolation(presence([t('2026-01-01', '2026-03-31')]))).toBeNull() // 31+28+31 = 90
    expect(isoOf(firstViolation(presence([t('2026-01-01', '2026-04-01')]))!)).toBe('2026-04-01')
  })
  it('after a full 90-day stay you must wait 90 days', () => {
    const p = presence([t('2026-01-01', '2026-03-31')])
    expect(maxStay(p, D('2026-04-01'))).toBe(0)
    // Jan 1 leaves the window on Jun 30 (day 180), so Jun 29 is still blocked
    expect(maxStay(p, D('2026-06-29'))).toBe(0)
    expect(maxStay(p, D('2026-06-30'))).toBe(90)
    expect(isoOf(earliestEntry(p, D('2026-04-01'), 90)!)).toBe('2026-06-30')
    expect(isoOf(earliestEntry(p, D('2026-04-01'), 1)!)).toBe('2026-06-30')
  })
  it('max stay accounts for days that drop out of the window', () => {
    // 30 days in Jan; entering Mar 1 you can stay until the window would hold 91 days.
    const p = presence([t('2026-01-01', '2026-01-30')])
    const n = maxStay(p, D('2026-03-01'))
    // Through Jun 29 (Jan days start dropping on Jun 30) the window holds 30 + n ≤ 90 → n = 60 … then old days roll off
    expect(n).toBeGreaterThanOrEqual(60)
    const p2 = new Set(p)
    for (let d = D('2026-03-01'); d < D('2026-03-01') + n; d++) p2.add(d)
    expect(firstViolation(p2)).toBeNull()
    p2.add(D('2026-03-01') + n)
    expect(firstViolation(p2)).not.toBeNull()
  })
  it('respects planned future trips', () => {
    const p = presence([t('2026-06-01', '2026-06-30')])
    expect(maxStay(p, D('2026-04-01'))).toBe(60) // 60 + 30 planned = 90
  })
  it('regain date', () => {
    const p = presence([t('2026-01-01', '2026-03-31')])
    expect(isoOf(regainDate(p, D('2026-04-01'), 10)!)).toBe('2026-07-09') // Jan 1–10 must leave the window (Jan 10 + 180 days)
  })
})
