import { describe, expect, it } from 'vitest'
import { conflicts, makeSeats, neighbours, shuffleSeating } from './seating-chart-builder'

describe('seating chart', () => {
  it('builds the right number of seats', () => {
    expect(makeSeats('rows', 6, 5)).toHaveLength(30)
    expect(makeSeats('groups', 3, 2)).toHaveLength(24)
    expect(makeSeats('ushape', 6, 4)).toHaveLength(14)
  })
  it('detects neighbours', () => {
    const s = makeSeats('rows', 3, 3)
    expect(neighbours(s[0], s[1])).toBe(true)
    expect(neighbours(s[0], s[2])).toBe(false)
    expect(neighbours(s[0], s[4])).toBe(true)
  })
  it('separates keep-apart pairs and seats front students in front', () => {
    const seats = makeSeats('rows', 5, 4)
    const ids = Array.from({ length: 20 }, (_, i) => 's' + i)
    const apart: [string, string][] = [['s0', 's1'], ['s2', 's3'], ['s4', 's5'], ['s0', 's6']]
    const r = shuffleSeating(ids, seats, apart, ['s9'], 7)
    expect(r.conflicts).toBe(0)
    expect(conflicts(r.assign, seats, apart)).toBe(0)
    const at = r.assign.indexOf('s9')
    expect(seats[at].y).toBe(Math.min(...seats.map((s) => s.y)))
    expect(new Set(r.assign).size).toBe(20)
  })
})
