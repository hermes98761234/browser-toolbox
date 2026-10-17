import { describe, expect, it } from 'vitest'
import { addDays, daysBetween, schedule, toIcs, weekday, type PlanInput } from './study-planner'

const base: PlanInput = {
  start: '2026-01-05', // Monday
  exams: [
    { id: 'a', name: 'Math', date: '2026-01-09', topics: [{ id: '1', name: 'Algebra', hours: 4 }, { id: '2', name: 'Calculus', hours: 2 }] },
    { id: 'b', name: 'History', date: '2026-01-12', topics: [{ id: '3', name: 'WWII', hours: 3 }] },
  ],
  week: [2, 2, 2, 2, 2, 4, 0],
  blocked: [],
  block: 0.5,
  review: 1,
}

describe('study planner', () => {
  it('date helpers', () => {
    expect(weekday('2026-01-05')).toBe(0)
    expect(weekday('2026-01-11')).toBe(6)
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(daysBetween('2026-01-05', '2026-01-12')).toBe(7)
  })
  it('schedules everything when time allows, never on/after the exam', () => {
    const p = schedule(base)
    expect(p.unscheduled).toEqual({ a: 0, b: 0 })
    for (const d of p.days) {
      expect(d.slots.reduce((a, s) => a + s.hours, 0)).toBeLessThanOrEqual(d.cap + 1e-9)
      for (const s of d.slots) expect(d.date < base.exams.find((e) => e.id === s.examId)!.date).toBe(true)
    }
    // review the day before Math
    expect(p.days.find((d) => d.date === '2026-01-08')!.slots.some((s) => s.review && s.examId === 'a')).toBe(true)
    expect(p.planned.a).toBe(7)
  })
  it('reports shortfall and respects blocked days', () => {
    const p = schedule({ ...base, week: [1, 1, 1, 1, 1, 1, 1], blocked: ['2026-01-06'] })
    expect(p.days.find((d) => d.date === '2026-01-06')!.slots.length).toBe(0)
    expect(p.unscheduled.a + p.unscheduled.b).toBeGreaterThan(0)
  })
  it('ICS output', () => {
    const ics = toIcs(schedule(base), base.exams)
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true)
    expect(ics).toContain('SUMMARY:EXAM: Math')
    expect(ics).toContain('DTSTART:20260105T170000')
  })
})
