import { describe, expect, it } from 'vitest'
import { canStand, CATALOG, clampItem, clashes, metrics, walkways, type Item, type Kind } from './3d-office-layout'

const mk = (kind: Kind, x: number, z: number, rot = 0): Item => ({ id: `${kind}${x}${z}`, kind, ...CATALOG[kind], x, z, rot })
const room = { w: 10, d: 8 }

describe('3d-office-layout', () => {
  it('counts seats and density', () => {
    const m = metrics([mk('desk', 2, 2), mk('bench', 6, 3), mk('meet6', 3, 6), mk('sofa', 8, 7)], room)
    expect(m.work).toBe(5)
    expect(m.meet).toBe(6)
    expect(m.lounge).toBe(3)
    expect(m.perDesk).toBeCloseTo(16)
    expect(m.area).toBe(80)
  })
  it('detects clashes and clamps into the room', () => {
    expect(clashes([mk('desk', 2, 2), mk('desk', 2.5, 2)]).length).toBe(1)
    expect(clashes([mk('desk', 2, 2), mk('desk', 3.6, 2)]).length).toBe(0)
    const c = clampItem(mk('desk', 0, 0, 90), room)
    expect(c.x).toBeCloseTo(0.7)
    expect(c.z).toBeCloseTo(0.8)
  })
  it('measures walkways', () => {
    const w = walkways([mk('desk', 2, 2), mk('desk', 4.6, 2)], room)
    const between = w.find((a) => a.b !== 'wall')
    expect(between?.gap).toBeCloseTo(1.0)
  })
  it('blocks walking through furniture and walls', () => {
    const items = [mk('desk', 5, 4)]
    expect(canStand(5, 4, items, room)).toBe(false)
    expect(canStand(5, 6, items, room)).toBe(true)
    expect(canStand(0.1, 4, items, room)).toBe(false)
  })
})
