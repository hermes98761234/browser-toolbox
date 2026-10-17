import { describe as group, expect, it } from 'vitest'
import { adherence, describe, doseKey, doses, dueOn, type Med, nextDate } from './pet-medication-scheduler'

const M = (p: Partial<Med>): Med => ({ id: 'm', pet: 'Rex', name: 'Med', dose: '1 tab', repeat: 'daily', every: 1, days: [], times: ['08:00'], start: '2024-01-01', end: '', notes: '', ...p })

group('pet-medication-scheduler', () => {
  it('handles monthly with end-of-month clamping', () => {
    const m = M({ repeat: 'monthly', start: '2024-01-31' })
    expect(dueOn(m, '2024-02-29')).toBe(true)
    expect(dueOn(m, '2024-03-31')).toBe(true)
    expect(dueOn(m, '2024-03-29')).toBe(false)
    expect(nextDate(M({ repeat: 'monthly', every: 3, start: '2024-01-15' }), '2024-02-01')).toBe('2024-04-15')
  })
  it('handles every-N-days, weekly, once and ranges', () => {
    expect(dueOn(M({ repeat: 'everyNDays', every: 3 }), '2024-01-07')).toBe(true)
    expect(dueOn(M({ repeat: 'everyNDays', every: 3 }), '2024-01-08')).toBe(false)
    expect(dueOn(M({ repeat: 'weekly', days: [1] }), '2024-01-08')).toBe(true) // Monday
    expect(dueOn(M({ repeat: 'once', start: '2024-01-05' }), '2024-01-05')).toBe(true)
    expect(dueOn(M({ end: '2024-01-10' }), '2024-01-11')).toBe(false)
    expect(dueOn(M({}), '2023-12-31')).toBe(false)
  })
  it('lists doses in order and computes adherence', () => {
    const meds = [M({ id: 'a', times: ['20:00', '08:00'] }), M({ id: 'b', repeat: 'once', start: '2024-01-02', times: ['12:00'] })]
    const ds = doses(meds, '2024-01-02', '2024-01-02')
    expect(ds.map((d) => d.time)).toEqual(['08:00', '12:00', '20:00'])
    const given = { [doseKey('a', '2024-01-01', '08:00')]: 'x', [doseKey('b', '2024-01-02', '12:00')]: 'x' }
    expect(adherence(meds, given, '2024-01-01', '2024-01-02T13:00')).toEqual({ due: 4, done: 2, missed: 2 })
  })
  it('describes rules', () => {
    expect(describe(M({ repeat: 'monthly' }))).toBe('monthly on day 1 at 08:00')
    expect(describe(M({ repeat: 'weekly', days: [1, 4] }))).toBe('every Mon, Thu at 08:00')
  })
})
