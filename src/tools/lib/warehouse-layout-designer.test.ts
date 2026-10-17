import { describe, expect, it } from 'vitest'
import { autoFill, checks, footprint, positions, type Rack } from './warehouse-layout-designer'

const r = (p: Partial<Rack>): Rack => ({ id: 'a', name: 'A', x: 0, z: 0, along: 'x', bays: 10, bayW: 2.7, depth: 1.1, levels: 5, levelH: 1.6, double: false, ...p })
const floor = { w: 50, d: 40, h: 10 }

describe('warehouse', () => {
  it('footprint and capacity', () => {
    expect(footprint(r({ double: true }))).toEqual({ x: 0, z: 0, w: 27, d: 2.5 })
    expect(footprint(r({ along: 'z' })).w).toBeCloseTo(1.1)
    expect(positions(r({ double: true }), 3)).toBe(300)
  })
  it('aisle check finds narrow aisles and collisions', () => {
    const a = r({ id: 'a', name: 'A' }), b = r({ id: 'b', name: 'B', z: 1.1 + 2.5 }), c = r({ id: 'c', name: 'C', z: 1.1 + 2.5 + 1.1 + 3.0 })
    const iss = checks([a, b, c], [], floor, 2.8)
    expect(iss.filter((i) => i.kind === 'aisle').length).toBe(1)
    expect(iss[0].msg).toContain('2.50')
    expect(checks([a, r({ id: 'd', name: 'D', x: 5 })], [], floor, 2.8)[0].kind).toBe('collision')
  })
  it('bounds and height', () => {
    const iss = checks([r({ x: 30, levels: 6 })], [], floor, 2.8)
    expect(iss.map((i) => i.kind).sort()).toEqual(['bounds', 'height'])
  })
  it('auto fill respects aisles', () => {
    const racks = autoFill(floor, { aisle: 3, cross: 3, bayW: 2.7, depth: 1.1, levels: 5, levelH: 1.6, z0: 8, z1: 40 })
    expect(racks.length).toBeGreaterThan(3)
    expect(checks(racks, [], floor, 3).length).toBe(0)
    expect(racks[0].bays).toBe(16)
  })
})
