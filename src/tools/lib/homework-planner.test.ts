import { describe, expect, it } from 'vitest'
import { addDays, bucket, daysLeft, dueReminders, reminderKey, sortTasks, week, weekStart, type Task } from './homework-planner'

const t = (p: Partial<Task>): Task => ({ id: 'a', title: 'A', subject: 'm', kid: 'K', due: '2026-10-20', time: '18:00', minutes: 30, priority: 2, done: false, notes: '', ...p })

describe('homework planner', () => {
  it('date helpers', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(weekStart('2026-10-18')).toBe('2026-10-12') // Sunday → previous Monday
    expect(weekStart('2026-10-19')).toBe('2026-10-19')
    expect(daysLeft(t({ due: '2026-10-20' }), '2026-10-18')).toBe(2)
  })
  it('buckets', () => {
    const now = new Date('2026-10-20T12:00:00')
    expect(bucket(t({}), now)).toBe('today')
    expect(bucket(t({ time: '09:00' }), now)).toBe('overdue')
    expect(bucket(t({ due: '2026-10-21' }), now)).toBe('tomorrow')
    expect(bucket(t({ due: '2026-11-21' }), now)).toBe('later')
    expect(bucket(t({ done: true }), now)).toBe('done')
  })
  it('sorting and week', () => {
    const s = sortTasks([t({ id: '1', done: true, due: '2026-10-01' }), t({ id: '2', priority: 1 }), t({ id: '3', priority: 3 })])
    expect(s.map((x) => x.id)).toEqual(['3', '2', '1'])
    const w = week([t({}), t({ id: 'b', minutes: 15 })], '2026-10-19')
    expect(w[1].minutes).toBe(45)
    expect(w).toHaveLength(7)
  })
  it('reminders fire once inside the lead window', () => {
    const x = t({})
    const now = new Date('2026-10-20T17:30:00')
    expect(dueReminders([x], now, 60, new Set())).toHaveLength(1)
    expect(dueReminders([x], now, 15, new Set())).toHaveLength(0)
    expect(dueReminders([x], now, 60, new Set([reminderKey(x)]))).toHaveLength(0)
  })
})
