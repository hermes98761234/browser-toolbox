import { describe, expect, it } from 'vitest'
import { businessBetween, countDays, easter, nthWeekday, parseCustom, roll, toIcs, ukEnglandWales, usFederal, type Cal } from './deadline-calculator'

describe('easter', () => {
  it('matches known dates', () => {
    expect(easter(2019)).toBe('2019-04-21')
    expect(easter(2024)).toBe('2024-03-31')
    expect(easter(2025)).toBe('2025-04-20')
    expect(easter(2026)).toBe('2026-04-05')
    expect(easter(2038)).toBe('2038-04-25')
    expect(easter(2008)).toBe('2008-03-23')
  })
  it('nth weekday', () => {
    expect(nthWeekday(2026, 11, 4, 4)).toBe('2026-11-26')
    expect(nthWeekday(2026, 5, 1, -1)).toBe('2026-05-25')
    expect(nthWeekday(2026, 1, 1, 3)).toBe('2026-01-19')
  })
})

describe('US federal', () => {
  it('2026 with observed Independence Day', () => {
    expect(usFederal(2026).map((h) => h.date)).toEqual([
      '2026-01-01', '2026-01-19', '2026-02-16', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-10-12', '2026-11-11', '2026-11-26', '2026-12-25',
    ])
  })
  it('New Year on Saturday is observed on 31 Dec of the prior year', () => {
    expect(usFederal(2021).some((h) => h.date === '2021-12-31')).toBe(true)
    expect(usFederal(2022).some((h) => h.date.startsWith('2022-01-0'))).toBe(false)
    expect(usFederal(2020).some((h) => h.name.startsWith('Juneteenth'))).toBe(false)
  })
})

describe('UK England & Wales', () => {
  const d = (y: number) => ukEnglandWales(y).map((h) => h.date)
  it('2026', () => expect(d(2026)).toEqual(['2026-01-01', '2026-04-03', '2026-04-06', '2026-05-04', '2026-05-25', '2026-08-31', '2026-12-25', '2026-12-28']))
  it('2027 Christmas on Saturday', () => expect(d(2027)).toEqual(['2027-01-01', '2027-03-26', '2027-03-29', '2027-05-03', '2027-05-31', '2027-08-30', '2027-12-27', '2027-12-28']))
  it('2022 jubilee and state funeral; 2022 Christmas on Sunday', () => {
    expect(d(2022)).toEqual(['2022-01-03', '2022-04-15', '2022-04-18', '2022-05-02', '2022-06-02', '2022-06-03', '2022-08-29', '2022-09-19', '2022-12-26', '2022-12-27'])
  })
  it('2020 VE day move', () => expect(d(2020)).toContain('2020-05-08'))
})

const US: Cal = { weekend: [0, 6], holidays: new Map(usFederal(2026).map((h) => [h.date, h.name])) }
describe('counting', () => {
  it('business days skip weekends and holidays', () => {
    // Thu 2 Jul 2026 + 2 business days: Fri 3 Jul is observed holiday → Mon 6, Tue 7
    const r = countDays('2026-07-02', 2, US, { mode: 'business', includeStart: false, rollForward: true })
    expect(r.due).toBe('2026-07-07')
    expect(r.skipped.map((s) => s.date)).toEqual(['2026-07-03', '2026-07-04', '2026-07-05'])
    expect(countDays('2026-07-07', -2, US, { mode: 'business', includeStart: false, rollForward: true }).due).toBe('2026-07-02')
    expect(countDays('2026-07-06', 1, US, { mode: 'business', includeStart: true, rollForward: true }).due).toBe('2026-07-06')
  })
  it('calendar days with court-style roll forward', () => {
    // 14 days after Mon 22 Jun 2026 = Mon 6 Jul (fine); 11 days = Fri 3 Jul (holiday) → Mon 6 Jul
    expect(countDays('2026-06-22', 14, US, { mode: 'calendar', includeStart: false, rollForward: true }).due).toBe('2026-07-06')
    const r = countDays('2026-06-22', 11, US, { mode: 'calendar', includeStart: false, rollForward: true })
    expect(r.rawEnd).toBe('2026-07-03')
    expect(r.due).toBe('2026-07-06')
    expect(r.rolled).toBe(true)
    expect(countDays('2026-06-22', 11, US, { mode: 'calendar', includeStart: false, rollForward: false }).due).toBe('2026-07-03')
    expect(countDays('2026-06-22', 11, US, { mode: 'calendar', includeStart: true, rollForward: false }).due).toBe('2026-07-02')
    // backwards: lands on Sun 5 Jul → previous business day Thu 2 Jul
    expect(countDays('2026-07-15', -10, US, { mode: 'calendar', includeStart: false, rollForward: true }).due).toBe('2026-07-02')
  })
  it('between and roll', () => {
    expect(businessBetween('2026-07-02', '2026-07-07', US)).toBe(2)
    expect(businessBetween('2026-07-07', '2026-07-02', US)).toBe(-2)
    expect(roll('2026-07-04', US)).toBe('2026-07-06')
  })
})

describe('custom + ics', () => {
  it('parses custom lines', () => {
    const r = parseCustom('2026-12-24 Office closed\n# comment\n2026-02-30 bad\nnope\n2026-12-31')
    expect(r.list).toEqual([{ date: '2026-12-24', name: 'Office closed' }, { date: '2026-12-31', name: 'Custom holiday' }])
    expect(r.bad).toBe(2)
  })
  it('builds ICS', () => {
    const t = toIcs([{ date: '2026-07-06', title: 'Reply, due', desc: 'x' }], [1, 7], new Date(Date.UTC(2026, 0, 1)))
    expect(t).toContain('DTSTART;VALUE=DATE:20260706')
    expect(t).toContain('DTEND;VALUE=DATE:20260707')
    expect(t).toContain('SUMMARY:Reply\\, due')
    expect(t).toContain('TRIGGER:-P0DT15H')
    expect(t).toContain('TRIGGER:-P6DT15H')
    expect(t.split('\r\n').filter((l) => l === 'BEGIN:VALARM')).toHaveLength(2)
  })
})
