import { describe, expect, it } from 'vitest'
import { age, gains, inWithdrawal, isoDate, mapRows, overallAdg, parseCsv, project, withdrawalEnd } from './herd-record-book'

describe('herd-record-book', () => {
  it('computes average daily gain', () => {
    const ws = [{ date: '2025-03-01', kg: 300 }, { date: '2025-01-01', kg: 241 }, { date: '2025-05-30', kg: 380 }]
    expect(overallAdg(ws)).toBeCloseTo(139 / 149, 6)
    const g = gains(ws)
    expect(g[0].adg).toBeNull()
    expect(g[1].adg).toBeCloseTo(59 / 59, 6)
    expect(g[2].adg).toBeCloseTo(80 / 90, 6)
    expect(project([{ date: '2025-01-01', kg: 100 }, { date: '2025-01-11', kg: 110 }], '2025-01-21')).toBeCloseTo(120, 6)
  })
  it('handles ages and withdrawal periods', () => {
    expect(age('2023-01-15', '2025-04-20')).toBe('2 y 3 mo')
    expect(age('2025-04-01', '2025-04-20')).toBe('19 d')
    expect(age('2024-11-20', '2025-04-19')).toBe('4 mo')
    expect(withdrawalEnd('2025-06-01', 28)).toBe('2025-06-29')
    expect(inWithdrawal('2025-06-01', 28, '2025-06-28')).toBe(true)
    expect(inWithdrawal('2025-06-01', 28, '2025-06-29')).toBe(false)
  })
  it('parses CSV with quotes and maps headers', () => {
    const rows = parseCsv('Tag,Name,"Date of birth"\r\nIE123,"Bella, the cow",03/02/2022\n\nIE124,"Say ""moo""",2023-1-5\n')
    expect(rows).toEqual([['Tag', 'Name', 'Date of birth'], ['IE123', 'Bella, the cow', '03/02/2022'], ['IE124', 'Say "moo"', '2023-1-5']])
    const m = mapRows(rows, { tag: ['id', 'ear tag'], dob: ['date of birth', 'born'] })
    expect(m[0]).toEqual({ tag: 'IE123', dob: '03/02/2022' })
    expect(isoDate(m[0].dob)).toBe('2022-02-03')
    expect(isoDate(m[1].dob)).toBe('2023-01-05')
  })
})
