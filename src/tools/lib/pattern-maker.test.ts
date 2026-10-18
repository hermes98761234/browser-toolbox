import { describe, expect, it } from 'vitest'
import { applyM, copies, corners, demoShapes, latticeOffset, pathD, sheetSvg, symMatrices, tileSvg, type Shape } from './pattern-maker'

describe('pattern maker', () => {
  it('symmetry groups have the right order and map the tile onto itself', () => {
    expect(symMatrices('kaleido').length).toBe(8)
    expect(symMatrices('rot4').length).toBe(4)
    const T = 100
    for (const m of symMatrices('kaleido')) {
      const [x, y] = applyM(m, [0, 0], T)
      expect([0, 100]).toContain(Math.round(x))
      expect([0, 100]).toContain(Math.round(y))
    }
    expect(applyM(symMatrices('rot4')[1], [60, 50], 100)).toEqual([50, 60])
  })
  it('lattices', () => {
    expect(latticeOffset('grid', 1, 1, 100)).toEqual([100, 100])
    expect(latticeOffset('brick', 0, 1, 100)).toEqual([50, 100])
    expect(latticeOffset('halfdrop', 1, 0, 100)).toEqual([100, 50])
  })
  it('a stroke crossing the right edge reappears on the left (wrap-around)', () => {
    const sh: Shape = { kind: 'line', pts: [[90, 50], [110, 50]], color: '#000', width: 4, fill: false }
    const cs = copies(sh, 'none', 'grid', 100)
    expect(cs.length).toBe(2)
    expect(cs.some((p) => p[0][0] === -10)).toBe(true)
    // brick: crossing the bottom edge wraps with a half-tile shift
    const b: Shape = { kind: 'line', pts: [[20, 95], [20, 105]], color: '#000', width: 2, fill: false }
    const bc = copies(b, 'none', 'brick', 100)
    expect(bc.some((p) => p[0][0] === 70 && p[0][1] === -5) || bc.some((p) => p[0][0] === -30 && p[0][1] === -5)).toBe(true)
  })
  it('a shape inside the tile, away from edges, is drawn once per symmetry element', () => {
    const sh: Shape = { kind: 'ellipse', pts: corners([30, 30], [40, 40]), color: '#000', width: 1, fill: true }
    expect(copies(sh, 'quad', 'grid', 100).length).toBe(4)
  })
  it('SVG output', () => {
    expect(pathD([[0, 0], [10, 10], [20, 0]])).toBe('M0,0Q10,10 15,5L20,0')
    const svg = tileSvg(demoShapes(200), 'quad', 'grid', 200, '#fff')
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('clip-path')
    expect((svg.match(/<ellipse/g) ?? []).length).toBeGreaterThanOrEqual(8)
    const sheet = sheetSvg(demoShapes(100), 'none', 'brick', 100, '#fff', 3)
    expect(sheet).toContain('<use href="#t"')
  })
})
