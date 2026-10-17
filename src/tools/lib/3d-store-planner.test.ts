import { describe, expect, it } from 'vitest'
import { aisles, CATALOG, clampFix, doorBlockers, foot, overlaps, shelfMeters, type Fixture } from './3d-store-planner'

const mk = (i: number, x: number, z: number, rot = 0, id = `${i}-${x}-${z}`): Fixture => ({ ...CATALOG[i], id, x, z, rot })
const store = { w: 10, d: 8, h: 3, door: 5, doorW: 2 }

describe('store planner geometry', () => {
  it('footprint and clamping', () => {
    expect(foot({ w: 2.4, d: 1, rot: 90 }).fw).toBeCloseTo(1)
    const c = clampFix(mk(0, 0, 0), store)
    expect(c.x).toBeCloseTo(1.2)
    expect(c.z).toBeCloseTo(0.5)
  })
  it('measures the aisle between two parallel gondolas', () => {
    const a = mk(0, 3, 3, 0, 'a'), b = mk(0, 3, 5, 0, 'b') // z gap = 5-0.5 - (3+0.5) = 1.0
    const al = aisles([a, b], store).filter((x) => x.b !== 'wall')
    expect(al).toHaveLength(1)
    expect(al[0].gap).toBeCloseTo(1.0)
    expect(al[0].axis).toBe('z')
  })
  it('ignores pairs blocked by a fixture in between and detects overlaps', () => {
    const a = mk(0, 3, 2, 0, 'a'), m = mk(0, 3, 4, 0, 'm'), b = mk(0, 3, 6, 0, 'b')
    const al = aisles([a, m, b], store).filter((x) => x.b !== 'wall')
    expect(al.map((x) => [x.a, x.b].sort().join())).toEqual(['a,m', 'b,m'])
    expect(overlaps([a, mk(1, 3.5, 2.2)])).toHaveLength(1)
    expect(overlaps([a, b])).toHaveLength(0)
  })
  it('shelf metres and door clearance', () => {
    expect(shelfMeters([mk(0, 3, 3), mk(2, 5, 0.25)])).toBeCloseTo(2.4 * 5 * 2 + 3 * 6)
    expect(doorBlockers([mk(5, 5, 7.2), mk(5, 1, 7.2)], store).map((f) => f.x)).toEqual([5])
  })
})
