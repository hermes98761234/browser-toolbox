import { describe, expect, it } from 'vitest'
import { addDays, addWorkdays, daysBetween, generate, phaseOf, progress, ROLES, status } from './onboarding-checklist'

describe('onboarding-checklist', () => {
  it('adds working days across weekends', () => {
    expect(addWorkdays('2026-10-16', 1)).toBe('2026-10-19') // Fri → Mon
    expect(addWorkdays('2026-10-19', -1)).toBe('2026-10-16') // Mon → Fri
    expect(addWorkdays('2026-10-19', 5)).toBe('2026-10-26')
    expect(addWorkdays('2026-10-17', 0)).toBe('2026-10-19') // Sat start rolls to Mon
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
    expect(daysBetween('2026-10-01', '2026-10-31')).toBe(30)
  })
  it('generates sorted role checklists with phases', () => {
    for (const r of Object.keys(ROLES)) {
      const t = generate(r, '2026-11-02', true)
      expect(t.length).toBeGreaterThan(10)
      expect([...t].sort((a, b) => a.due.localeCompare(b.due)).map((x) => x.id)).toEqual(t.map((x) => x.id))
    }
    expect(phaseOf(-3)).toBe(0)
    expect(phaseOf(0)).toBe(1)
    expect(phaseOf(64)).toBe(5)
  })
  it('status and progress', () => {
    const t = generate('engineer', '2026-11-02', true)
    t[0].done = true
    expect(status(t[0], '2026-12-31')).toBe('done')
    expect(status(t[1], '2026-12-31')).toBe('overdue')
    expect(status({ ...t[1], due: '2027-01-02' }, '2026-12-31')).toBe('soon')
    expect(progress(t).done).toBe(1)
  })
})
