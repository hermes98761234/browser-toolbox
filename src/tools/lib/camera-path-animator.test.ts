import { describe, expect, it } from 'vitest'
import { ease, fovAt, locate, orbitKeys, retime, type Key } from './camera-path-animator'

const k = (t: number, fov = 50): Key => ({ id: String(t), t, pos: [t, 0, 0], target: [0, 0, 0], fov })

describe('camera path timing', () => {
  it('easing endpoints and symmetry', () => {
    for (const e of ['linear', 'inOut', 'in', 'out', 'perKey'] as const) {
      expect(ease(e, 0)).toBe(0)
      expect(ease(e, 1)).toBe(1)
    }
    expect(ease('inOut', 0.5)).toBeCloseTo(0.5)
    expect(ease('in', 0.5)).toBeLessThan(0.5)
    expect(ease('out', 0.5)).toBeGreaterThan(0.5)
  })
  it('hits each key exactly at its time', () => {
    const keys = [k(0), k(2), k(6)]
    expect(locate(keys, 2, 'linear').u).toBeCloseTo(0.5)
    expect(locate(keys, 4, 'linear')).toMatchObject({ i: 1, f: 0.5, u: 0.75 })
    expect(locate(keys, 2, 'perKey').u).toBeCloseTo(0.5)
    expect(locate(keys, 99, 'inOut').u).toBe(1)
    expect(locate(keys, -1, 'linear').u).toBe(0)
  })
  it('interpolates fov and retimes evenly', () => {
    expect(fovAt([k(0, 40), k(4, 60)], 1, 'linear')).toBeCloseTo(45)
    expect(retime([k(5), k(0), k(1)], 10).map((x) => x.t)).toEqual([0, 5, 10])
    const o = orbitKeys(4, 5, 2, 8)
    expect(o).toHaveLength(5)
    expect(o[4].pos[2]).toBeCloseTo(5)
  })
})
