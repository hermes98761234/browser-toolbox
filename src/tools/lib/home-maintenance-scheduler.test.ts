import { describe, expect, it } from 'vitest'
import { addInterval, addMonths, nextDue, status, type Task, toIcs } from './home-maintenance-scheduler'

const T = (p: Partial<Task>): Task => ({ id: 'x', name: 'Task', area: 'Home', every: 3, unit: 'months', month: 0, history: [], notes: '', ...p })

describe('home-maintenance-scheduler', () => {
  it('adds intervals with month clamping', () => {
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29')
    expect(addMonths('2023-11-15', 3)).toBe('2024-02-15')
    expect(addInterval('2024-12-30', 2, 'weeks')).toBe('2025-01-13')
    expect(addInterval('2024-02-29', 1, 'years')).toBe('2025-02-28')
  })
  it('computes next due from the latest completion', () => {
    expect(nextDue(T({ history: ['2024-01-10', '2024-03-05'] }), '2024-04-01')).toBe('2024-06-05')
    expect(nextDue(T({}), '2024-04-01')).toBe('2024-04-01')
  })
  it('snaps seasonal yearly tasks to the preferred month', () => {
    expect(nextDue(T({ every: 1, unit: 'years', month: 4 }), '2024-06-01')).toBe('2025-04-01')
    expect(nextDue(T({ every: 1, unit: 'years', month: 4, history: ['2024-04-20'] }), '2024-06-01')).toBe('2025-04-01')
    expect(nextDue(T({ every: 1, unit: 'years', month: 4, history: ['2024-10-02'] }), '2024-11-01')).toBe('2025-04-01')
    expect(nextDue(T({ every: 12, unit: 'months', month: 10, history: ['2024-09-28'] }), '2024-11-01')).toBe('2025-10-01')
  })
  it('classifies status', () => {
    expect(status('2024-03-01', '2024-03-02')).toBe('overdue')
    expect(status('2024-03-10', '2024-03-02')).toBe('soon')
    expect(status('2024-05-10', '2024-03-02')).toBe('ok')
  })
  it('exports recurring all-day events', () => {
    const ics = toIcs([T({ name: 'Replace HVAC filter, now', history: ['2024-01-01'] })], '2024-02-01', new Date(Date.UTC(2024, 1, 1)))
    expect(ics).toContain('DTSTART;VALUE=DATE:20240401')
    expect(ics).toContain('RRULE:FREQ=MONTHLY;INTERVAL=3')
    expect(ics).toContain('Replace HVAC filter\\, now')
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
  })
})
