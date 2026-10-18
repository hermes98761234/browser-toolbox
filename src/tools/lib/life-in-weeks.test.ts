import { describe, expect, it } from 'vitest'
import { age, birthday, cellOf, cellRange, eraOf, ERAS, stats, validDate } from './life-in-weeks'

describe('life-in-weeks', () => {
  it('birthdays and age (incl. Feb 29)', () => {
    expect(birthday('2000-02-29', 1)).toBe('2001-02-28')
    expect(birthday('2000-02-29', 4)).toBe('2004-02-29')
    expect(age('1990-06-15', '2026-06-14')).toBe(35)
    expect(age('1990-06-15', '2026-06-15')).toBe(36)
  })
  it('cells start on birthdays; week 52 absorbs extra days', () => {
    expect(cellOf('1990-06-15', '1990-06-15')).toEqual({ row: 0, col: 0 })
    expect(cellOf('1990-06-15', '1990-06-22')).toEqual({ row: 0, col: 1 })
    expect(cellOf('1990-06-15', '1991-06-14')).toEqual({ row: 0, col: 51 })
    expect(cellOf('1990-06-15', '2026-10-18')).toEqual({ row: 36, col: 17 })
    expect(cellRange('1990-06-15', { row: 0, col: 51 })).toEqual(['1991-06-07', '1991-06-14'])
    expect(cellRange('1990-06-15', { row: 0, col: 0 })).toEqual(['1990-06-15', '1990-06-21'])
  })
  it('stats', () => {
    const s = stats('1990-06-15', '2026-10-18', 80)
    expect(s.weeks).toBe(36 * 52 + 17)
    expect(s.totalWeeks).toBe(4160)
    expect(s.weeksLeft).toBe(4160 - 1889)
    expect(s.nextBirthday).toBe('2027-06-15')
    expect(s.daysToBirthday).toBe(240)
    expect(s.days).toBe(13274)
  })
  it('eras and validation', () => {
    expect(eraOf(ERAS, 10)?.name).toBe('School')
    expect(validDate('2023-02-29')).toBe(false)
    expect(validDate('2024-02-29')).toBe(true)
  })
})
