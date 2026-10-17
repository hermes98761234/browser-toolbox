import { describe, expect, it } from 'vitest'
import { accrualEvents, requestHours, timeline, usHolidays, workdays, type Policy, type Request } from './pto-tracker'

const none = new Set<string>()
const pol = (p: Partial<Policy> = {}): Policy => ({ id: 'v', name: 'Vacation', color: '#000', annual: 120, method: 'monthly', carryCap: 40, maxCap: 0, start: 0, ...p })
const req = (start: string, end: string, half = false): Request => ({ id: start, type: 'v', start, end, half, status: 'approved', note: '' })

describe('pto tracker', () => {
  it('counts workdays skipping weekends and holidays', () => {
    expect(workdays('2026-03-06', '2026-03-10', none)).toEqual(['2026-03-06', '2026-03-09', '2026-03-10'])
    expect(workdays('2026-03-06', '2026-03-10', new Set(['2026-03-09']))).toHaveLength(2)
    expect(requestHours(req('2026-03-06', '2026-03-06', true), none, 8)).toBe(4)
  })
  it('accrual schedules sum to the annual amount', () => {
    for (const m of ['biweekly', 'semimonthly', 'monthly', 'lump', 'hourly'] as const) {
      const ev = accrualEvents(m, 120, '2026-01-01', 8, none)
      expect(ev.reduce((a, e) => a + e.amount, 0)).toBeCloseTo(120)
    }
    expect(accrualEvents('monthly', 120, '2026-01-01', 8, none)[0].date).toBe('2026-01-31')
    expect(accrualEvents('biweekly', 120, '2026-01-01', 8, none)).toHaveLength(26)
  })
  it('balance timeline with usage, caps and forfeiture', () => {
    const t = timeline(pol({ start: 16 }), [req('2026-07-06', '2026-07-10')], '2026-01-01', 8, none)
    expect(t.used).toBe(40)
    expect(t.endBalance).toBeCloseTo(16 + 120 - 40)
    expect(t.forfeited).toBeCloseTo(96 - 40)
    const mid = timeline(pol(), [], '2026-01-01', 8, none, '2026-06-30')
    expect(mid.accrued).toBeCloseTo(60)
    const capped = timeline(pol({ maxCap: 50 }), [], '2026-01-01', 8, none)
    expect(capped.endBalance).toBe(50)
  })
  it('US holidays 2026', () => {
    const h = usHolidays(2026)
    expect(h).toContain('2026-07-03') // July 4 is a Saturday → observed Friday
    expect(h).toContain('2026-11-26') // Thanksgiving
    expect(h).toContain('2026-05-25') // Memorial Day
  })
})
