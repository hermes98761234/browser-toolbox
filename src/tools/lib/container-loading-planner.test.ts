import { describe, expect, it } from 'vitest'
import { packContainer, type Item } from './container-loading-planner'

const box = (p: Partial<Item>): Item => ({ id: 'a', name: 'A', l: 1, w: 1, h: 1, kg: 1, qty: 1, rotate: true, stackable: true, color: '#000', ...p })
const C = { L: 5, W: 2, H: 2, payload: 1e9 }

const noOverlap = (r: ReturnType<typeof packContainer>) => {
  for (let i = 0; i < r.placed.length; i++) for (let j = i + 1; j < r.placed.length; j++) {
    const a = r.placed[i], b = r.placed[j]
    const o = a.x < b.x + b.l && a.x + a.l > b.x && a.y < b.y + b.w && a.y + a.w > b.y && a.z < b.z + b.h && a.z + a.h > b.z
    if (o) return false
  }
  return true
}

describe('container packing', () => {
  it('fills a container with unit cubes exactly', () => {
    const r = packContainer(C, [box({ qty: 20 })])
    expect(r.placed).toHaveLength(20)
    expect(r.volumeUse).toBeCloseTo(1, 9)
    expect(noOverlap(r)).toBe(true)
  })
  it('reports overflow', () => {
    const r = packContainer(C, [box({ qty: 25 })])
    expect(r.placed).toHaveLength(20)
    expect(r.unplaced[0]).toBe(5)
  })
  it('respects non-stackable items', () => {
    const r = packContainer(C, [box({ qty: 20, stackable: false })])
    expect(r.placed).toHaveLength(10)
    expect(r.placed.every((p) => p.z === 0)).toBe(true)
  })
  it('respects payload', () => {
    const r = packContainer({ ...C, payload: 7 }, [box({ qty: 20, kg: 2 })])
    expect(r.placed).toHaveLength(3)
    expect(r.weight).toBe(6)
  })
  it('rotates long items when allowed', () => {
    const r = packContainer({ L: 2, W: 6, H: 1, payload: 1e9 }, [box({ l: 3, w: 1, h: 1, qty: 4 })])
    expect(r.placed).toHaveLength(4)
    expect(noOverlap(r)).toBe(true)
  })
  it('mixed load stays valid', () => {
    const r = packContainer({ L: 5898, W: 2352, H: 2393, payload: 28200 }, [
      box({ l: 1200, w: 800, h: 1000, kg: 300, qty: 12, rotate: false }),
      box({ l: 600, w: 400, h: 400, kg: 20, qty: 60 }),
    ])
    expect(noOverlap(r)).toBe(true)
    expect(r.placed.length).toBeGreaterThan(50)
    expect(r.placed.every((p) => p.x + p.l <= 5898 && p.y + p.w <= 2352 && p.z + p.h <= 2393)).toBe(true)
  })
})
