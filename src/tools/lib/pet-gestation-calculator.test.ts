import { describe, expect, it } from 'vitest'
import { addDays, cToF, dueInfo, fToC, ics, PETS, petById, tempCheck, validDay } from './pet-gestation-calculator'

describe('pet gestation', () => {
  it('species data is consistent', () => {
    for (const p of PETS) {
      expect(p.min).toBeLessThanOrEqual(p.days)
      expect(p.max).toBeGreaterThanOrEqual(p.days)
      expect(p.events.some((e) => e.kind === 'birth')).toBe(true)
    }
  })
  it('dog due date from a single mating', () => {
    const d = dueInfo(petById('dog'), '2026-08-01', '', '2026-09-15')
    expect(d.due).toBe('2026-10-03')
    expect(d.early).toBe('2026-09-28')
    expect(d.late).toBe('2026-10-08')
    expect(d.day).toBe(45)
    expect(d.week).toBe(7)
    expect(d.phase).toBe('pregnant')
  })
  it('two matings widen the window', () => {
    const d = dueInfo(petById('dog'), '2026-08-01', '2026-08-05', '2026-10-01')
    expect(d.due).toBe('2026-10-05')
    expect(d.late).toBe('2026-10-12')
    expect(d.phase).toBe('window')
    expect(dueInfo(petById('rabbit'), '2026-08-01', '', '2026-09-10').phase).toBe('overdue')
  })
  it('temperature drop detection', () => {
    const dog = petById('dog')
    const rs = [
      { id: '1', at: '2026-10-01T08:00', c: 38.6 }, { id: '2', at: '2026-10-01T20:00', c: 38.5 },
      { id: '3', at: '2026-10-02T08:00', c: 38.4 }, { id: '4', at: '2026-10-02T20:00', c: 38.6 },
    ]
    expect(tempCheck(dog, rs)!.alert).toBe(false)
    const t = tempCheck(dog, [...rs, { id: '5', at: '2026-10-03T08:00', c: 37.4 }])!
    expect(t.alert).toBe(true)
    expect(t.baseline).toBeCloseTo(38.55, 3)
    expect(tempCheck(petById('rabbit'), rs)).toBeNull()
  })
  it('helpers', () => {
    expect(cToF(37.8)).toBeCloseTo(100.04, 2)
    expect(fToC(100)).toBeCloseTo(37.78, 2)
    expect(validDay('2026-02-30')).toBe(false)
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    const s = ics([{ date: '2026-10-03', title: 'Due, maybe', uid: 'x' }], '20260101T000000Z')
    expect(s).toContain('SUMMARY:Due\\, maybe')
    expect(s).toContain('DTEND;VALUE=DATE:20261004')
  })
})
