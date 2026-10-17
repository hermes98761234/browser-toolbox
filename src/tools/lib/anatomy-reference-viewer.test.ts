import { describe, expect, it } from 'vitest'
import { cutAt, LAYERS, PARTS, searchParts } from './anatomy-reference-viewer'

describe('anatomy-reference-viewer data', () => {
  it('has unique ids, a known layer and info for every part', () => {
    expect(new Set(PARTS.map((p) => p.id)).size).toBe(PARTS.length)
    const layers = new Set(LAYERS.map((l) => l[0]))
    for (const p of PARTS) {
      expect(layers.has(p.layer)).toBe(true)
      expect(p.info.length).toBeGreaterThan(20)
      expect(p.shapes.length).toBeGreaterThan(0)
    }
  })
  it('places the heart left of the midline and the liver on the right', () => {
    const c = (id: string) => (PARTS.find((p) => p.id === id)!.shapes[0] as { c: number[] }).c
    expect(c('heart')[0]).toBeGreaterThan(0)
    expect(c('liver')[0]).toBeLessThan(0)
  })
  it('searches and maps cuts', () => {
    expect(searchParts('sciatic').map((p) => p.id)).toEqual(['nerves'])
    expect(searchParts('').length).toBe(PARTS.length)
    expect(cutAt(0, 0, 10)).toBe(5)
    expect(cutAt(-1, 2, 4)).toBe(2)
  })
})
