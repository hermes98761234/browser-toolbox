import { describe, expect, it } from 'vitest'
import { consumed, optimize } from './lumber-cut-optimizer'

describe('lumber-cut-optimizer', () => {
  it('kerf accounting', () => {
    expect(consumed([{ label: 'a', len: 10 }, { label: 'b', len: 20 }], 0.5, 1)).toBe(31.5)
    expect(consumed([], 0.5, 1)).toBe(0)
  })
  it('packs exactly when kerf is zero', () => {
    const p = optimize([{ label: 'A', len: 48, qty: 4 }], [{ len: 96, price: 5, qty: 0 }], 0)
    expect(p.boards.length).toBe(2)
    expect(p.waste).toBe(0)
  })
  it('kerf forces an extra board', () => {
    const p = optimize([{ label: 'A', len: 48, qty: 4 }], [{ len: 96, price: 5, qty: 0 }], 0.125)
    expect(p.boards.length).toBe(4)
  })
  it('chooses cheaper mix of stock', () => {
    const p = optimize([{ label: 'A', len: 70, qty: 1 }, { label: 'B', len: 40, qty: 1 }], [{ len: 96, price: 6, qty: 0 }, { len: 120, price: 7, qty: 0 }], 0.125)
    expect(p.boards.length).toBe(1)
    expect(p.cost).toBe(7)
  })
  it('reports pieces longer than any stock', () => {
    const p = optimize([{ label: 'X', len: 200, qty: 1 }], [{ len: 96, price: 5, qty: 0 }], 0)
    expect(p.unplaced.length).toBe(1)
  })
  it('respects stock quantity limits', () => {
    const p = optimize([{ label: 'A', len: 90, qty: 3 }], [{ len: 96, price: 5, qty: 2 }, { len: 144, price: 9, qty: 0 }], 0.125)
    expect(p.boards.filter((b) => b.stock === 96).length).toBeLessThanOrEqual(2)
    expect(p.unplaced.length).toBe(0)
  })
})
