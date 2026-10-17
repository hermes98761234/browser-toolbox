import { describe, expect, it } from 'vitest'
import { dueDate, gestationalAge, lmpEquivalent, naegeleCalendar, sizeAt, toIcs, trimester, type Input } from './due-date-calculator'

const base: Input = { method: 'lmp', date: '2026-01-01', cycle: 28, usWeeks: 0, usDays: 0 }

describe('due date', () => {
  it('Naegele: LMP + 280 days', () => {
    expect(dueDate(base)).toBe('2026-10-08')
    expect(naegeleCalendar('2026-01-01')).toBe('2026-10-08')
  })
  it('longer cycle shifts the date', () => {
    expect(dueDate({ ...base, cycle: 32 })).toBe('2026-10-12')
  })
  it('conception and IVF transfers', () => {
    expect(dueDate({ ...base, method: 'conception', date: '2026-01-15' })).toBe('2026-10-08')
    expect(dueDate({ ...base, method: 'ivf5', date: '2026-01-20' })).toBe('2026-10-08')
    expect(dueDate({ ...base, method: 'ivf3', date: '2026-01-18' })).toBe('2026-10-08')
  })
  it('ultrasound dating', () => {
    expect(lmpEquivalent({ ...base, method: 'ultrasound', date: '2026-03-12', usWeeks: 10, usDays: 0 })).toBe('2026-01-01')
  })
  it('gestational age and trimester', () => {
    expect(gestationalAge('2026-01-01', '2026-03-12')).toEqual({ weeks: 10, days: 0, total: 70 })
    expect(gestationalAge('2026-01-01', '2026-03-15')).toMatchObject({ weeks: 10, days: 3 })
    expect(trimester(13 * 7 + 6)).toBe(1)
    expect(trimester(14 * 7)).toBe(2)
    expect(trimester(28 * 7)).toBe(3)
    expect(sizeAt(21)![0]).toBe(20)
    expect(sizeAt(5)).toBeNull()
  })
  it('ics escapes text and uses exclusive end', () => {
    const s = toIcs([{ date: '2026-10-08', title: 'Due date, estimated' }])
    expect(s).toContain('SUMMARY:Due date\\, estimated')
    expect(s).toContain('DTEND;VALUE=DATE:20261009')
  })
})
