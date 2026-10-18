import { describe, expect, it } from 'vitest'
import { capacity, check, clampInside, outside, overlaps, type Module } from './barn-layout-designer'

const m = (p: Partial<Module>): Module => ({ id: 'x', type: 'dairy', name: '', x: 0, z: 0, w: 10, d: 10, count: 10, ...p })
describe('barn layout', () => {
  it('capacity and checks', () => {
    expect(capacity(m({}))).toBe(10) // 100 m² / 9.3
    expect(check(m({ count: 10 })).status).toBe('ok')
    expect(check(m({ count: 11 })).status).toBe('tight') // 9.09 m² = 97.8%
    expect(check(m({ count: 13 })).status).toBe('over')
    expect(check(m({ type: 'horse', w: 2.5, d: 6, count: 1 })).status).toBe('narrow')
    expect(capacity(m({ type: 'horse', w: 3.7, d: 3.7 }))).toBe(1)
    expect(check(m({ type: 'alley', count: 0 })).status).toBe('n/a')
  })
  it('geometry', () => {
    expect(overlaps(m({}), m({ x: 10 }))).toBe(false) // touching
    expect(overlaps(m({}), m({ x: 9.9 }))).toBe(true)
    expect(outside(m({ x: 6 }), 20, 20)).toBe(true)
    expect(clampInside(m({ x: 6 }), 20, 20).x).toBe(5)
  })
})
