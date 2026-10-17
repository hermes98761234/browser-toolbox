import { describe, expect, it } from 'vitest'
import { addDays, adherence, dosesOn, dueOn, minutesUntil, nextDose, slots, weekday, type Med } from './medication-schedule-planner'

const base: Med = { id: 'a', name: 'Metformin', dose: '500 mg', purpose: '', times: ['08:00', '20:00'], freq: 'daily', weekdays: [], every: 1, start: '2025-03-01', end: '', food: 'with', color: '#000', notes: '' }

describe('medication-schedule-planner', () => {
  it('handles dates', () => {
    expect(weekday('2025-03-03')).toBe(1) // Monday
    expect(addDays('2025-02-28', 1)).toBe('2025-03-01')
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
  })
  it('decides due days', () => {
    expect(dueOn(base, '2025-02-28')).toBe(false)
    expect(dueOn(base, '2025-03-10')).toBe(true)
    expect(dueOn({ ...base, end: '2025-03-05' }, '2025-03-06')).toBe(false)
    const weekly = { ...base, freq: 'weekdays' as const, weekdays: [1, 4] }
    expect(dueOn(weekly, '2025-03-03')).toBe(true)
    expect(dueOn(weekly, '2025-03-04')).toBe(false)
    const alt = { ...base, freq: 'interval' as const, every: 3 }
    expect([0, 1, 2, 3, 6].map((i) => dueOn(alt, addDays('2025-03-01', i)))).toEqual([true, false, false, true, true])
    expect(dueOn({ ...base, freq: 'prn' }, '2025-03-10')).toBe(false)
  })
  it('builds the timetable and stats', () => {
    const b: Med = { ...base, id: 'b', name: 'Aspirin', times: ['08:00', 'bad'] }
    const d = dosesOn([base, b], '2025-03-02')
    expect(d.map((x) => `${x.time} ${x.med.name}`)).toEqual(['08:00 Aspirin', '08:00 Metformin', '20:00 Metformin'])
    expect(slots(d).map(([t, xs]) => [t, xs.length])).toEqual([['08:00', 2], ['20:00', 1]])
    const a = adherence([base], { '2025-03-01|a|08:00': '1', '2025-03-02|a|20:00': '1' }, '2025-03-01', '2025-03-02')
    expect(a).toEqual({ due: 4, done: 2, rate: 0.5 })
    expect(nextDose([base], '2025-03-02', '21:00')).toMatchObject({ date: '2025-03-03', dose: { time: '08:00' } })
    expect(minutesUntil('21:00', '08:00', 1)).toBe(660)
  })
})
