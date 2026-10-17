import { describe, expect, it } from 'vitest'
import { estimate, pickJoist, stockFor, type DeckInput } from './deck-builder-estimator'

const base: DeckInput = { width: 16, depth: 12, height: 3, spacing: 16, joist: 'auto', postSpacing: 8, boardWidth: 5.5, gap: 0.1875, stock: 16, waste: 0, railing: true, stairs: true, stairWidth: 4 }

describe('deck estimator', () => {
  it('picks joists by span table', () => {
    expect(pickJoist(11.5, 16)).toBe('2x8')
    expect(pickJoist(9, 16)).toBe('2x6')
    expect(pickJoist(17, 16)).toBe('2x12')
    expect(pickJoist(19, 16)).toBeNull()
    expect(stockFor(11.9)).toBe(12)
    expect(stockFor(12.1)).toBe(14)
  })
  it('counts framing and decking', () => {
    const e = estimate(base)
    expect(e.joists).toBe(13) // 16 ft at 16" o.c. → 12 bays + 1
    expect(e.posts).toBe(3)
    expect(e.rows).toBe(Math.ceil(144 / 5.6875)) // 26
    expect(e.boards).toBe(26)
    expect(e.joist).toBe('2x8')
    expect(e.spanOk).toBe(true)
  })
  it('stairs and railing', () => {
    const e = estimate(base)
    expect(e.risers).toBe(5) // 36" / 7.75 → 5 risers of 7.2"
    expect(e.riserH).toBeCloseTo(7.2)
    expect(e.treads).toBe(4)
    expect(e.railFt).toBe(16 + 24 - 4)
    expect(e.railNeeded).toBe(true)
    expect(estimate({ ...base, height: 2 }).railNeeded).toBe(false)
  })
  it('flags undersized joists', () => {
    expect(estimate({ ...base, joist: '2x6' }).spanOk).toBe(false)
  })
})
