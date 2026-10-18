import { describe, expect, it } from 'vitest'
import { addDays, adherence, avgDaily, dosesOn, streak, supply, weekday, type Med, type TakenLog } from './medication-schedule'

const all = [true, true, true, true, true, true, true]
const med = (p: Partial<Med> = {}): Med => ({
  id: 'a', name: 'A', strength: '', perSlot: { am: 1, noon: 0, pm: 1, bed: 0 }, days: all, onHand: 30, countDate: '2026-10-01', color: '#000', ...p,
})

describe('medication schedule', () => {
  it('weekday helpers', () => {
    expect(weekday('2026-10-19')).toBe(0) // Monday
    expect(weekday('2026-10-18')).toBe(6) // Sunday
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
  it('doses and averages', () => {
    const m = med({ days: [true, false, true, false, true, false, false] })
    expect(dosesOn(m, '2026-10-19')).toBe(2)
    expect(dosesOn(m, '2026-10-20')).toBe(0)
    expect(avgDaily(m)).toBeCloseTo(6 / 7)
  })
  it('projects supply and refill date', () => {
    // 30 pills, 2/day, counted on Oct 1 → on Oct 6 used 10 → 20 left → lasts 10 days → runs out Oct 16
    const s = supply(med(), '2026-10-06', 3)
    expect(s.left).toBe(20)
    expect(s.daysLeft).toBe(10)
    expect(s.runOut).toBe('2026-10-16')
    expect(s.refillBy).toBe('2026-10-13')
  })
  it('odd pill counts: partial day counts as run-out', () => {
    const s = supply(med({ onHand: 5 }), '2026-10-01', 0)
    expect(s.runOut).toBe('2026-10-03')
  })
  it('no schedule → no run-out', () => {
    expect(supply(med({ perSlot: { am: 0, noon: 0, pm: 0, bed: 0 } }), '2026-10-06', 3).runOut).toBeNull()
  })
  it('streak and adherence', () => {
    const m = med({ perSlot: { am: 1, noon: 0, pm: 0, bed: 0 } })
    const taken: TakenLog = {
      '2026-10-15': { 'a:am': true },
      '2026-10-16': { 'a:am': true },
      '2026-10-17': { 'a:am': true },
      '2026-10-13': { 'a:am': true },
    }
    expect(streak([m], taken, '2026-10-18')).toBe(3) // today not done yet → counts back from yesterday
    taken['2026-10-18'] = { 'a:am': true }
    expect(streak([m], taken, '2026-10-18')).toBe(4)
    expect(adherence([m], taken, '2026-10-18', 7)).toBeCloseTo(5 / 6) // log starts Oct 13 → 6 days counted
  })
})
