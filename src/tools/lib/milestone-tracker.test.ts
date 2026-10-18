import { describe, expect, it } from 'vitest'
import { addDays, age, PRESETS, status, winAnsi, wrap } from './milestone-tracker'

describe('milestone tracker', () => {
  it('has unique ids and sane windows', () => {
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length)
    PRESETS.forEach((p) => expect(p.to).toBeGreaterThanOrEqual(p.from))
  })
  it('computes calendar age', () => {
    expect(age('2025-01-31', '2025-03-01').months).toBe(1)
    expect(age('2025-01-15', '2025-07-14').months).toBe(5)
    expect(age('2025-01-15', '2025-07-15').months).toBe(6)
    expect(age('2025-01-15', '2025-07-29').label).toBe('6 mo 2 wk')
    expect(age('2025-01-15', '2025-01-25').label).toBe('10 days')
    expect(age('2023-01-15', '2025-04-20').label).toBe('2 y 3 mo')
    expect(age('2025-01-01', addDays('2025-01-01', 365)).exact).toBeCloseTo(11.99, 1)
  })
  it('describes status against the typical window', () => {
    expect(status(9, 16, 6, false)).toBe('upcoming')
    expect(status(9, 16, 12, false)).toBe('window')
    expect(status(9, 16, 18, false)).toBe('later')
    expect(status(9, 16, 18, true)).toBe('done')
  })
  it('sanitises and wraps text for PDF fonts', () => {
    expect(winAnsi('“Ba-ba” — 😀 café')).toBe('"Ba-ba" -  café')
    expect(wrap('one two three four', 9, (s) => s.length)).toEqual(['one two', 'three', 'four'])
  })
})
