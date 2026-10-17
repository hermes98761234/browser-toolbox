import { describe, expect, it } from 'vitest'
import { addDaysMs, byDayProject, dayKey, type Entry, hhmm, hms, invoiceLines, roundUp, splitByDay, weekStart } from './time-tracker'

const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime()
const E = (p: Partial<Entry>): Entry => ({ id: 'e', project: 'a', start: 0, end: 0, note: '', billable: true, ...p })

describe('time-tracker', () => {
  it('formats and rounds', () => {
    expect(hhmm(90 * 60000)).toBe('1:30')
    expect(hms(3723000)).toBe('1:02:03')
    expect(roundUp(7 * 60000, 6)).toBe(12 * 60000)
    expect(roundUp(12 * 60000, 6)).toBe(12 * 60000)
    expect(roundUp(61000, 0)).toBe(61000)
  })
  it('finds Monday week start', () => {
    expect(dayKey(weekStart(at(2024, 3, 10, 15)))).toBe('2024-03-04') // Sunday → previous Monday
    expect(dayKey(weekStart(at(2024, 3, 11, 9)))).toBe('2024-03-11')
    expect(dayKey(addDaysMs(at(2024, 2, 28), 2))).toBe('2024-03-01')
  })
  it('splits across midnight', () => {
    const parts = splitByDay(E({ start: at(2024, 3, 1, 22), end: at(2024, 3, 2, 1, 30) }), 0)
    expect(parts).toEqual([{ day: '2024-03-01', ms: 2 * 3600000 }, { day: '2024-03-02', ms: 1.5 * 3600000 }])
  })
  it('aggregates by day and project, clipped to range', () => {
    const r = byDayProject([E({ start: at(2024, 3, 3, 23), end: at(2024, 3, 4, 2) }), E({ project: 'b', start: at(2024, 3, 4, 9), end: at(2024, 3, 4, 10) })], at(2024, 3, 4), at(2024, 3, 11), 0)
    expect(r['2024-03-04']).toEqual({ a: 2 * 3600000, b: 3600000 })
    expect(r['2024-03-03']).toBeUndefined()
  })
  it('builds invoice lines with rounding and running timers', () => {
    const projects = [{ id: 'a', name: 'Site', client: 'ACME', rate: 80, color: '#000' }]
    const lines = invoiceLines([E({ start: at(2024, 3, 4, 9), end: at(2024, 3, 4, 9, 50) }), E({ start: at(2024, 3, 5, 9), end: null }), E({ billable: false, start: at(2024, 3, 4, 12), end: at(2024, 3, 4, 13) })], projects, at(2024, 3, 1), at(2024, 4, 1), 15, at(2024, 3, 5, 9, 20))
    expect(lines.map((l) => l.hours)).toEqual([1, 0.5])
    expect(lines[0].amount).toBe(80)
    expect(lines[1].amount).toBe(40)
  })
})
