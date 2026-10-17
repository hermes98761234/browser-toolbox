import { describe, expect, it } from 'vitest'
import { f0FromIor, generate, heightToNormal, vnoise } from './material-previewer'

describe('material-previewer', () => {
  it('F0 from IOR', () => {
    expect(f0FromIor(1.5)).toBeCloseTo(0.04, 3)
    expect(f0FromIor(1)).toBe(0)
  })
  it('noise tiles with its period', () => {
    expect(vnoise(0.3, 0.7, 4)).toBeCloseTo(vnoise(4.3, 0.7, 4), 10)
    expect(vnoise(0.3, 0.7, 4)).toBeCloseTo(vnoise(0.3, 4.7, 4), 10)
  })
  it('flat height gives straight-up normals', () => {
    const n = heightToNormal(new Float32Array(16).fill(0.5), 4)
    expect([n[0], n[1], n[2]]).toEqual([128, 128, 255])
  })
  it('generates complete sets', () => {
    for (const k of ['bricks', 'tiles', 'brushed', 'wood', 'hammered'] as const) {
      const t = generate(k, 32)
      expect(t.albedo.length).toBe(32 * 32 * 4)
      expect(Math.max(...t.height)).toBeLessThanOrEqual(1)
    }
  })
})
