import { describe, expect, it } from 'vitest'
import { measure, parseStl, sampleCube, sampleTorus, sampleVase, toBinaryStl } from './stl-viewer'

describe('stl', () => {
  it('cube volume, area, manifold', () => {
    const m = measure(sampleCube(20))
    expect(m.volume).toBeCloseTo(8000, 6)
    expect(m.area).toBeCloseTo(2400, 6)
    expect(m.size).toEqual([20, 20, 20])
    expect(m.openEdges).toBe(0)
    expect(m.centroid.map((v) => +v.toFixed(6))).toEqual([10, 10, 10])
  })
  it('binary round-trip', () => {
    const p = sampleCube(10)
    const back = parseStl(toBinaryStl(p, 'cube'))
    expect(back.name).toBe('cube')
    expect([...back.pos]).toEqual([...p])
  })
  it('ascii parsing', () => {
    const txt = `solid tri\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid tri`
    const m = parseStl(new TextEncoder().encode(txt).buffer as ArrayBuffer)
    expect(m.pos.length).toBe(9)
    expect(measure(m.pos).area).toBeCloseTo(0.5)
    expect(measure(m.pos).openEdges).toBe(3)
  })
  it('torus volume approaches 2π²Rr²', () => {
    const m = measure(sampleTorus(30, 10, 200, 100))
    expect(Math.abs(m.volume - 2 * Math.PI ** 2 * 30 * 100) / m.volume).toBeLessThan(0.002)
    expect(m.openEdges).toBe(0)
    expect(measure(sampleVase()).openEdges).toBe(0)
  })
})
