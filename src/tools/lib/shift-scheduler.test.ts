import { describe, expect, it } from 'vitest'
import { autoFill, coverage, empHours, hours, ics, issues, key, monday, span, type Emp, type Tpl } from './shift-scheduler'

const T: Tpl[] = [
  { id: 'm', name: 'Morning', start: '06:00', end: '14:00', brk: 30, color: '', need: [1, 1, 1, 1, 1, 1, 1] },
  { id: 'e', name: 'Evening', start: '14:00', end: '22:00', brk: 30, color: '', need: [1, 1, 1, 1, 1, 0, 0] },
  { id: 'n', name: 'Night', start: '22:00', end: '06:00', brk: 0, color: '', need: [0, 0, 0, 0, 0, 0, 0] },
]
const E: Emp[] = ['a', 'b', 'c'].map((id) => ({ id, name: id.toUpperCase(), role: '', color: '', max: 40, rate: 0 }))

describe('shift-scheduler', () => {
  it('handles overnight shifts and breaks', () => {
    expect(span(T[2])).toEqual([1320, 1800])
    expect(hours(T[2])).toBe(8)
    expect(hours(T[0])).toBe(7.5)
  })
  it('totals and flags short rest', () => {
    const cells = { [key('a', 0)]: 'e', [key('a', 1)]: 'm', [key('b', 0)]: 'n', [key('b', 1)]: 'e' }
    expect(empHours('a', cells, T)).toBe(15)
    const is = issues(E, cells, T)
    expect(is.filter((i) => i.kind === 'rest').map((i) => i.emp)).toEqual(['a', 'b'])
    // 22:00→06:00 then 14:00 next day = 8 h rest
    expect(issues(E, { [key('b', 0)]: 'n', [key('b', 1)]: 'm' }, T).length).toBe(1)
  })
  it('auto-fills needs fairly within limits', () => {
    const { cells, short } = autoFill(E, T, {})
    expect(short).toEqual([])
    for (let d = 0; d < 7; d++) expect(coverage(cells, E, 'm', d)).toBe(1)
    expect(issues(E, cells, T).length).toBe(0)
    const hs = E.map((e) => empHours(e.id, cells, T))
    expect(Math.max(...hs) - Math.min(...hs)).toBeLessThanOrEqual(7.5)
  })
  it('reports shortages', () => {
    const { short } = autoFill(E.slice(0, 1), T, {})
    expect(short.length).toBeGreaterThan(0)
  })
  it('exports ICS with overnight end dates', () => {
    const s = ics('2026-10-19', E, { [key('a', 6)]: 'n' }, T, { stamp: '20261001T000000Z', weeks: 4 })
    expect(s).toContain('DTSTART:20261025T220000')
    expect(s).toContain('DTEND:20261026T060000')
    expect(s).toContain('RRULE:FREQ=WEEKLY;COUNT=4')
    expect(s.split('\r\n').every((l) => l.length <= 75)).toBe(true)
    expect(monday('2026-10-17')).toBe('2026-10-12')
  })
})
