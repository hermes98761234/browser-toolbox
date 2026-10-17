import { describe, expect, it } from 'vitest'
import { minutesFrom, running, shiftIndex, shiftLabels, totals, urineRate, type Entry } from './fluid-balance-log'

const e = (t: string, kind: 'in' | 'out', route: string, ml: number): Entry => ({ id: t + route, t, kind, route, ml, note: '' })

describe('fluid-balance-log', () => {
  it('minutes and shifts across midnight', () => {
    expect(minutesFrom('2025-03-01', '2025-03-01T07:30')).toBe(450)
    expect(minutesFrom('2025-03-01', '2025-03-02T02:00')).toBe(1560)
    expect(shiftIndex('2025-03-01', '2025-03-01T07:00', 7, 3)).toBe(0)
    expect(shiftIndex('2025-03-01', '2025-03-01T22:59', 7, 3)).toBe(1)
    expect(shiftIndex('2025-03-01', '2025-03-02T06:59', 7, 3)).toBe(2)
    expect(shiftIndex('2025-03-01', '2025-03-02T07:00', 7, 3)).toBe(-1)
    expect(shiftIndex('2025-03-01', '2025-03-01T06:00', 7, 2)).toBe(-1)
    expect(shiftLabels(7, 2)).toEqual(['07:00–19:00', '19:00–07:00'])
  })
  it('totals and urine rate', () => {
    const t = totals([e('2025-03-01T08:00', 'in', 'Oral', 300), e('2025-03-01T09:00', 'out', 'Urine', 200), e('2025-03-01T10:00', 'out', 'Drain', 50)])
    expect(t).toMatchObject({ inMl: 300, outMl: 250, balance: 50, urine: 200 })
    expect(urineRate(280, 70, 8)).toBeCloseTo(0.5, 10)
  })
  it('running balance is a step series', () => {
    const pts = running('2025-03-01', [e('2025-03-01T09:00', 'out', 'Urine', 100), e('2025-03-01T08:00', 'in', 'Oral', 250)], 7)
    expect(pts).toEqual([[0, 0], [1, 0], [1, 250], [2, 250], [2, 150]])
  })
})
