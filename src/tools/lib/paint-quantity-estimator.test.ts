import { describe, expect, it } from 'vitest'
import { DEFAULT_PRODUCTS, estimate, grossArea, surfaceAreas, type Surface } from './paint-quantity-estimator'

const S = (p: Partial<Surface>): Surface => ({ id: 'r', name: '', kind: 'room', a: 12, b: 10, c: 8, qty: 1, product: 'wall', texture: 'smooth', primer: false, ...p })

describe('paint quantity estimator', () => {
  it('computes gross areas', () => {
    expect(grossArea(S({}), 'imperial')).toBe(352)
    expect(grossArea(S({ kind: 'ceiling' }), 'imperial')).toBe(120)
    expect(grossArea(S({ kind: 'trim', a: 44, b: 6 }), 'imperial')).toBe(22)
    expect(grossArea(S({ kind: 'door', a: 3, b: 7, qty: 2 }), 'imperial')).toBe(84)
    expect(grossArea(S({ kind: 'trim', a: 10, b: 10 }), 'metric')).toBe(1)
  })
  it('deducts openings only from their wall and never below zero', () => {
    const r = surfaceAreas([S({}), S({ id: 'c', kind: 'ceiling' })], [{ id: 'o', name: '', w: 3, h: 7, qty: 2, surface: 'r' }, { id: 'p', name: '', w: 3, h: 7, qty: 1, surface: 'c' }], 'imperial')
    expect(r[0].net).toBe(352 - 42)
    expect(r[1].net).toBe(120)
    expect(surfaceAreas([S({ kind: 'wall', a: 2, b: 2 })], [{ id: 'o', name: '', w: 3, h: 3, qty: 1, surface: 'r' }], 'imperial')[0].net).toBe(0)
  })
  it('applies texture, coats, waste and colour change', () => {
    const P = DEFAULT_PRODUCTS.imperial
    const e = estimate([S({ texture: 'heavy' })], [], P, 'imperial', 10, true)
    const wall = e.products.find((p) => p.id === 'wall')!
    expect(wall.area).toBeCloseTo(440)
    expect(wall.coats).toBe(3)
    expect(wall.volume).toBeCloseTo(((440 * 3) / 375) * 1.1)
    expect(wall.plan!.volume).toBeGreaterThanOrEqual(wall.volume)
    expect(e.products.find((p) => p.id === 'primer')!.volume).toBe(0)
  })
  it('primes flagged surfaces with one coat', () => {
    const e = estimate([S({ primer: true })], [], DEFAULT_PRODUCTS.imperial, 'imperial', 0, false)
    expect(e.products.find((p) => p.id === 'primer')!.volume).toBeCloseTo(352 / 300)
  })
})
