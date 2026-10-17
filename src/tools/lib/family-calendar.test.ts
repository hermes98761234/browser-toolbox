import { describe, expect, it } from 'vitest'
import { occurrences, parseIcs, toIcs, type Ev } from './family-calendar'

const base: Ev = { id: 'a', title: 'Swim, class; kids', date: '2026-01-05', start: '17:00', end: '18:00', member: 'm', freq: 'NONE', interval: 1, byday: [], until: '', count: 0, exdates: [] }

describe('family calendar recurrence', () => {
  it('weekly with BYDAY, interval, exdate and until', () => {
    const e = { ...base, freq: 'WEEKLY' as const, byday: [1, 3], exdates: ['2026-01-07'], until: '2026-01-21' }
    expect(occurrences(e, '2026-01-01', '2026-02-28')).toEqual(['2026-01-05', '2026-01-12', '2026-01-14', '2026-01-19', '2026-01-21'])
    const bi = { ...base, freq: 'WEEKLY' as const, interval: 2 }
    expect(occurrences(bi, '2026-01-01', '2026-02-10')).toEqual(['2026-01-05', '2026-01-19', '2026-02-02'])
  })
  it('monthly skips short months, count limits, yearly leap day', () => {
    const m = { ...base, date: '2026-01-31', freq: 'MONTHLY' as const }
    expect(occurrences(m, '2026-01-01', '2026-05-31')).toEqual(['2026-01-31', '2026-03-31', '2026-05-31'])
    const c = { ...base, freq: 'DAILY' as const, count: 3 }
    expect(occurrences(c, '2026-01-06', '2026-12-31')).toEqual(['2026-01-06', '2026-01-07'])
    const y = { ...base, date: '2024-02-29', freq: 'YEARLY' as const }
    expect(occurrences(y, '2024-01-01', '2028-12-31')).toEqual(['2024-02-29', '2028-02-29'])
  })
  it('round-trips ICS', () => {
    const e = { ...base, freq: 'WEEKLY' as const, byday: [1, 3], interval: 2, until: '2026-06-30', exdates: ['2026-01-07'], notes: 'Bring towel\nand goggles' }
    const allDay = { ...base, id: 'b', title: 'Grandma birthday', date: '2026-03-14', start: '', end: '', freq: 'YEARLY' as const }
    const ics = toIcs([e, allDay], () => 'Anna')
    expect(ics).toContain('RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;UNTIL=20260630')
    const p = parseIcs(ics)
    expect(p).toHaveLength(2)
    expect(p[0]).toMatchObject({ title: 'Swim, class; kids', date: '2026-01-05', start: '17:00', end: '18:00', freq: 'WEEKLY', interval: 2, byday: [1, 3], until: '2026-06-30', exdates: ['2026-01-07'], category: 'Anna', notes: 'Bring towel\nand goggles' })
    expect(p[1]).toMatchObject({ date: '2026-03-14', start: '', freq: 'YEARLY' })
  })
})
