import { describe, expect, it } from 'vitest'
import { events, fToC, nextDate, plan, SEEDS, toIcs } from './seed-starting-calculator'

const seed = (n: string) => SEEDS.find((s) => s.name === n)!

describe('seed starting', () => {
  it('tomato with last frost 2027-04-20: sow 8–6 weeks before, transplant 1 week after', () => {
    const p = plan(seed('Tomato'), '2027-04-20')
    expect(p.sowFrom).toBe('2027-02-23')
    expect(p.sowTo).toBe('2027-03-09')
    expect(p.germFrom).toBe('2027-02-28')
    expect(p.transplant).toBe('2027-04-27')
    expect(p.hardenFrom).toBe('2027-04-20')
    expect(p.weeksIndoors).toBe(9)
  })
  it('safety margin delays tender crops only', () => {
    expect(plan(seed('Tomato'), '2027-04-20', 2).transplant).toBe('2027-05-11')
    expect(plan(seed('Kale'), '2027-04-20', 2).transplant).toBe('2027-03-30')
  })
  it('next frost date rolls into next year', () => {
    expect(nextDate(4, 20, '2026-10-17')).toBe('2027-04-20')
    expect(nextDate(4, 20, '2026-01-10')).toBe('2026-04-20')
  })
  it('ICS uses exclusive end dates', () => {
    const ics = toIcs(events([plan(seed('Tomato'), '2027-04-20')]))
    expect(ics).toContain('DTSTART;VALUE=DATE:20270223\r\nDTEND;VALUE=DATE:20270310')
    expect(ics).toContain('SUMMARY:Transplant Tomato outside')
    expect(fToC(77)).toBeCloseTo(25)
  })
})
