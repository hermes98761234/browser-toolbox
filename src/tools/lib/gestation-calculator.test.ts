import { describe, expect, it } from 'vitest'
import { addDays, diffDays, due, ics, monthGrid, speciesById, validISO } from './gestation-calculator'

describe('dates', () => {
  it('adds days across months, leap years and DST-free UTC', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30')
    expect(diffDays('2026-01-01', '2026-12-31')).toBe(364)
    expect(validISO('2026-02-30')).toBe(false)
    expect(validISO('2026-02-28')).toBe(true)
  })
  it('computes cattle due date (283 days)', () => {
    const d = due(speciesById('cattle'), '2026-01-01', '2026-06-01')
    expect(d.due).toBe('2026-10-11')
    expect(d.early).toBe('2026-10-07')
    expect(d.late).toBe('2026-10-18')
    expect(d.check).toBe('2026-02-05')
    expect(d.prep).toBe('2026-08-12')
    expect(d.day).toBe(151)
    expect(d.status).toBe('mid')
  })
  it('pig 3 months 3 weeks 3 days rule and statuses', () => {
    expect(due(speciesById('pig'), '2026-05-01', '2026-05-02').due).toBe('2026-08-23')
    expect(due(speciesById('chicken'), '2026-05-01', '2026-05-21').status).toBe('window')
    expect(due(speciesById('chicken'), '2026-05-01', '2026-05-25').status).toBe('overdue')
    expect(due(speciesById('chicken'), '2026-05-01', '2026-07-01').status).toBe('done')
    expect(due(speciesById('sheep'), '2026-01-01', '2026-01-02', 150).due).toBe('2026-05-31')
  })
  it('builds a Monday-first month grid and ICS', () => {
    const g = monthGrid(2026, 9) // October 2026 starts on a Thursday
    expect(g[0]).toBe('2026-09-28')
    expect(g[3]).toBe('2026-10-01')
    const c = ics([{ date: '2026-10-11', title: 'Daisy, due', uid: 'x' }])
    expect(c).toContain('DTSTART;VALUE=DATE:20261011')
    expect(c).toContain('DTEND;VALUE=DATE:20261012')
    expect(c).toContain('SUMMARY:Daisy\\, due')
  })
})
