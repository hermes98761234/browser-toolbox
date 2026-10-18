import { describe, expect, it } from 'vitest'
import { hourly, meetingCost, perYear, whatIf, type Meeting, type Role, type Settings } from './meeting-cost-calculator'

const S: Settings = { mode: 'annual', hoursPerYear: 2000, overhead: 25, switchMin: 0, weeksPerYear: 48 }
const roles: Role[] = [{ id: 'e', name: 'Engineer', salary: 120000 }, { id: 'm', name: 'Manager', salary: 160000 }]
const M: Meeting = { id: 'x', name: 'Planning', freq: 'weekly', minutes: 60, prep: 0, attendees: { e: 4, m: 1 } }

describe('meeting cost', () => {
  it('loaded hourly rate', () => {
    expect(hourly(120000, S)).toBeCloseTo(75)
    expect(hourly(50, { ...S, mode: 'hourly' })).toBeCloseTo(62.5)
  })
  it('one-hour meeting with 4 engineers and a manager', () => {
    const c = meetingCost(M, roles, S)
    expect(c.people).toBe(5)
    expect(c.meeting).toBeCloseTo(4 * 75 + 100)
    expect(c.perMinute).toBeCloseTo(400 / 60)
    expect(c.annual).toBeCloseTo(400 * 48)
    expect(c.annualHours).toBeCloseTo(5 * 48)
  })
  it('adds prep and context switching', () => {
    const c = meetingCost({ ...M, prep: 15 }, roles, { ...S, switchMin: 15 })
    expect(c.total).toBeCloseTo(400 * 1.5)
  })
  it('frequency', () => {
    expect(perYear('daily', 48)).toBe(240)
    expect(perYear('biweekly', 48)).toBe(24)
  })
  it('what-if removes the most expensive optional seats first and shortens', () => {
    const c = whatIf({ ...M, attendees: { e: 4, m: 2 } }, roles, S, 50, 1)
    expect(c.people).toBe(5)
    expect(c.meeting).toBeCloseTo((4 * 75 + 100) / 2)
  })
})
