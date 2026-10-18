import { describe, expect, it } from 'vitest'
import { dec, hm, parseClock, pay, roundTo, shiftMinutes, splitWeek } from './timesheet-calculator'

describe('parseClock', () => {
  it('accepts common formats', () => {
    expect(parseClock('9')).toBe(540)
    expect(parseClock('9:30')).toBe(570)
    expect(parseClock('0930')).toBe(570)
    expect(parseClock('5:45 pm')).toBe(1065)
    expect(parseClock('12am')).toBe(0)
    expect(parseClock('12:15pm')).toBe(735)
    expect(parseClock('17.45')).toBe(1065)
    expect(parseClock('24:00')).toBe(1440)
  })
  it('rejects junk', () => {
    expect(parseClock('')).toBeNaN()
    expect(parseClock('13pm')).toBeNaN()
    expect(parseClock('9:75')).toBeNaN()
    expect(parseClock('25:00')).toBeNaN()
    expect(parseClock('abc')).toBeNaN()
  })
})

describe('shifts and rounding', () => {
  it('handles breaks and overnight', () => {
    expect(shiftMinutes(540, 1050, 30)).toBe(480)
    expect(shiftMinutes(1320, 360, 0)).toBe(480) // 22:00 → 06:00
    expect(shiftMinutes(NaN, 600, 0)).toBe(0)
  })
  it('rounds to increments (7-minute rule for 15)', () => {
    expect(roundTo(9 * 60 + 7, 15)).toBe(540)
    expect(roundTo(9 * 60 + 8, 15)).toBe(555)
    expect(roundTo(9 * 60 + 7, 0)).toBe(547)
    expect(roundTo(9 * 60 + 3, 6)).toBe(546)
  })
  it('formats', () => {
    expect(hm(450)).toBe('7:30')
    expect(hm(59.6)).toBe('1:00')
    expect(dec(450)).toBe(7.5)
    expect(dec(20)).toBe(0.33)
  })
})

describe('splitWeek', () => {
  it('weekly 40h overtime only (FLSA style)', () => {
    const r = splitWeek([600, 600, 600, 600, 300], { dailyOt: null, dailyDt: null, weeklyOt: 2400 })
    expect(r.map((d) => d.reg)).toEqual([600, 600, 600, 600, 0])
    expect(r[4].ot).toBe(300)
  })
  it('daily 8 / 12 plus weekly 40 without double counting (California style)', () => {
    const r = splitWeek([780, 480, 480, 480, 480, 240], { dailyOt: 480, dailyDt: 720, weeklyOt: 2400 })
    expect(r[0]).toEqual({ worked: 780, reg: 480, ot: 240, dt: 60 })
    // reg after 5 days = 2400 → Saturday's 4 h all overtime
    expect(r[5]).toEqual({ worked: 240, reg: 0, ot: 240, dt: 0 })
    const tot = r.reduce((a, d) => a + d.reg + d.ot + d.dt, 0)
    expect(tot).toBe(780 + 480 * 4 + 240)
  })
  it('pay', () => {
    const p = pay({ reg: 2400, ot: 120, dt: 60 }, 20)
    expect(p.reg).toBe(800)
    expect(p.ot).toBe(60)
    expect(p.dt).toBe(40)
    expect(p.total).toBe(900)
  })
})
