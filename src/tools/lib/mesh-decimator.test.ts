import { describe, expect, it } from 'vitest'
import { noise3, parseObj, rockFactor, targetTriangles } from './mesh-decimator'

describe('mesh-decimator', () => {
  it('parses OBJ quads and negative indices', () => {
    const p = parseObj('# quad\nv 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf 1/1/1 2/2/2 3/3/3 4/4/4\nf -4 -3 -2\n')
    expect(p.length).toBe(27)
    expect([...p.slice(0, 9)]).toEqual([0, 0, 0, 1, 0, 0, 1, 1, 0])
    expect([...p.slice(18, 27)]).toEqual([0, 0, 0, 1, 0, 0, 1, 1, 0])
  })
  it('rejects bad OBJ', () => {
    expect(() => parseObj('v 0 0 0\n')).toThrow()
    expect(() => parseObj('v 0 0 0\nf 1 2 3\n')).toThrow()
  })
  it('noise is deterministic and bounded', () => {
    expect(noise3(1.3, 2.7, 0.2)).toBe(noise3(1.3, 2.7, 0.2))
    for (let i = 0; i < 200; i++) {
      const r = rockFactor(Math.cos(i), Math.sin(i), Math.cos(i * 0.3))
      expect(r).toBeGreaterThan(0.4)
      expect(r).toBeLessThan(1.6)
    }
  })
  it('target triangles', () => {
    expect(targetTriangles(1000, 0.25)).toBe(250)
    expect(targetTriangles(10, 0.01)).toBe(4)
    expect(targetTriangles(10, 2)).toBe(10)
  })
})
