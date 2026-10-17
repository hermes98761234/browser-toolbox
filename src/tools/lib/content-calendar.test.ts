import { describe, expect, it } from 'vitest'
import { addDays, fold, icsEscape, isoWeek, monthGrid, toIcs, weekStart } from './content-calendar'

describe('content-calendar', () => {
  it('does date arithmetic', () => {
    expect(addDays('2026-02-27', 3)).toBe('2026-03-02')
    expect(weekStart('2026-10-17')).toBe('2026-10-12') // Saturday → Monday
    expect(weekStart('2026-10-17', false)).toBe('2026-10-11')
    const g = monthGrid(2026, 9)
    expect(g).toHaveLength(42)
    expect(g[0]).toBe('2026-09-28')
    expect(isoWeek('2026-01-01')).toBe(1)
    expect(isoWeek('2027-01-01')).toBe(53)
  })
  it('escapes and folds ICS text', () => {
    expect(icsEscape('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne')
    const f = fold('X'.repeat(160))
    const parts = f.split('\r\n')
    expect(parts[0]).toHaveLength(75)
    expect(parts[1]).toBe(' ' + 'X'.repeat(74))
  })
  it('builds a calendar', () => {
    const ics = toIcs(
      [
        { id: 'a', date: '2026-10-20', time: '09:30', title: 'Launch, part 1', channel: 'ig', status: 'scheduled', notes: '' },
        { id: 'b', date: '2026-10-21', time: '', title: 'Blog', channel: 'x', status: 'idea', notes: 'n' },
      ],
      [{ id: 'ig', name: 'Instagram', color: '#000' }],
      new Date(Date.UTC(2026, 9, 1, 12, 0, 0)),
    )
    expect(ics).toContain('DTSTART:20261020T093000\r\nDURATION:PT30M')
    expect(ics).toContain('SUMMARY:[Instagram] Launch\\, part 1')
    expect(ics).toContain('DTSTART;VALUE=DATE:20261021\r\nDTEND;VALUE=DATE:20261022')
    expect(ics).toContain('DTSTAMP:20261001T120000Z')
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true)
  })
})
