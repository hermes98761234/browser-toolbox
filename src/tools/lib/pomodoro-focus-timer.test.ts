import { describe, expect, it } from 'vitest'
import { byHour, dailyBySubject, mmss, nextPhase, streak, type Session } from './pomodoro-focus-timer'

const at = (d: number, h: number) => new Date(2026, 9, d, h).getTime()
const S = (ts: number, subject = 'Math', rating = 4): Session => ({ id: String(ts), start: ts, min: 25, subject, interruptions: 0, rating })

describe('pomodoro-focus-timer', () => {
  it('cycles phases with a long break every N', () => {
    expect(nextPhase('focus', 1, 4)).toBe('short')
    expect(nextPhase('focus', 4, 4)).toBe('long')
    expect(nextPhase('long', 4, 4)).toBe('focus')
    expect(nextPhase('short', 2, 4)).toBe('focus')
  })
  it('formats mm:ss rounding up', () => {
    expect(mmss(25 * 60000)).toBe('25:00')
    expect(mmss(59_001)).toBe('01:00')
    expect(mmss(-5)).toBe('00:00')
  })
  it('daily totals by subject', () => {
    const log = [S(at(15, 9)), S(at(15, 10), 'Bio'), S(at(17, 9)), S(at(17, 11))]
    const d = dailyBySubject(log, 3, at(17, 20), ['Math', 'Bio'])
    expect(d.map((x) => x.values)).toEqual([[25, 25], [0, 0], [50, 0]])
    expect(d[2].key).toBe('2026-10-17')
  })
  it('streak counts days meeting the goal', () => {
    const log = [S(at(14, 9)), S(at(14, 10)), S(at(15, 9)), S(at(15, 10)), S(at(16, 9)), S(at(16, 10)), S(at(17, 9))]
    expect(streak(log, 2, at(17, 12))).toBe(3) // today not done yet → counts 14,15,16
    expect(streak(log, 1, at(17, 12))).toBe(4)
    expect(streak(log, 3, at(17, 12))).toBe(0)
  })
  it('by hour', () => {
    const h = byHour([S(at(15, 9), 'M', 5), S(at(16, 9), 'M', 3)])
    expect(h[9]).toEqual({ h: 9, n: 2, rating: 4 })
  })
})
