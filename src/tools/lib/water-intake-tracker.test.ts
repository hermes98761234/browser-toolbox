import { describe, expect, it } from 'vitest'
import { addDays, lastDays, reminderDue, streak, suggestGoal } from './water-intake-tracker'

describe('water intake', () => {
  it('suggests a goal', () => {
    expect(suggestGoal(70, 0, false)).toBe(2450)
    expect(suggestGoal(70, 30, true)).toBe(3300)
  })
  it('date math and totals', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    const log = { '2026-03-01': [{ t: '08:00', ml: 500 }, { t: '09:00', ml: 250 }], '2026-02-28': [{ t: '10:00', ml: 2000 }] }
    const w = lastDays(log, '2026-03-01', 3)
    expect(w.map((x) => x.ml)).toEqual([0, 2000, 750])
    expect(streak(log, '2026-03-01', 2000)).toBe(1)
    expect(streak(log, '2026-03-01', 700)).toBe(2)
  })
  it('reminders', () => {
    expect(reminderDue(600, 500, 90, '08:00', '21:00')).toBe(true)
    expect(reminderDue(600, 550, 90, '08:00', '21:00')).toBe(false)
    expect(reminderDue(1300, 500, 90, '08:00', '21:00')).toBe(false)
  })
})
