import { describe, expect, it } from 'vitest'
import { addDays, diffDays, interval, simulate } from './watering-schedule'

const o = { season: 'Summer', rainCounts: 5, hot: 30 }

describe('watering-schedule', () => {
  it('date helpers', () => {
    expect(addDays('2026-02-27', 3)).toBe('2026-03-02')
    expect(diffDays('2026-03-02', '2026-02-27')).toBe(3)
  })
  it('season and heat change the interval', () => {
    expect(interval({ days: 7, where: 'indoor' }, 1, { ...o, season: 'Winter' })).toBeCloseTo(12.6)
    expect(interval({ days: 10, where: 'outdoor' }, 1, o, { date: 'x', rain: 0, tmax: 33 })).toBeCloseTo(7)
  })
  it('indoor plant waters every interval', () => {
    const ev = simulate({ days: 7, where: 'indoor' }, 1, '2026-06-01', '2026-06-05', 14, [], o)
    expect(ev.map((e) => e.date)).toEqual(['2026-06-08', '2026-06-15'])
  })
  it('overdue plant is watered today', () => {
    const ev = simulate({ days: 3, where: 'indoor' }, 1, '2026-06-01', '2026-06-10', 3, [], o)
    expect(ev[0]).toEqual({ date: '2026-06-10', kind: 'water', note: 'overdue' })
  })
  it('rain resets outdoor plants', () => {
    const w = [{ date: '2026-06-03', rain: 12, tmax: 20 }]
    const ev = simulate({ days: 4, where: 'outdoor' }, 1, '2026-06-01', '2026-06-02', 6, w, o)
    expect(ev[0].kind).toBe('rain')
    expect(ev.find((e) => e.kind === 'water')!.date).toBe('2026-06-07')
  })
})
