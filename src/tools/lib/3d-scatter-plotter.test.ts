import { describe, expect, it } from 'vitest'
import { bounds, compile, fitPlane, parametric, parsePoints, solve3, surface } from './3d-scatter-plotter'

describe('3d-scatter-plotter', () => {
  it('parses points with headers, comments and mixed separators', () => {
    const r = parsePoints('x,y,z\n1,2,3\n4 5 6 # note\n7;8;9\nbad line\n')
    expect(r.pts).toEqual([[1, 2, 3], [4, 5, 6], [7, 8, 9]])
    expect(r.bad).toEqual([5])
  })
  it('compiles expressions with precedence, functions and implicit multiplication', () => {
    expect(compile('1 + 2*3^2', [])({})).toBe(19)
    expect(compile('-2^2', [])({})).toBe(-4)
    expect(compile('2x + sin(pi/2)', ['x'])({ x: 3 })).toBe(7)
    expect(compile('max(1, x, 4) % 3', ['x'])({ x: 2 })).toBe(1)
    expect(() => compile('alert(1)', [])).toThrow()
    expect(() => compile('(1+2', [])).toThrow()
  })
  it('samples parametric curves and surfaces', () => {
    const h = parametric('cos(t)', 'sin(t)', 't', 0, Math.PI, 3)
    expect(h[1][0]).toBeCloseTo(0)
    expect(h[1][1]).toBeCloseTo(1)
    expect(h[2][2]).toBeCloseTo(Math.PI)
    const s = surface('x*y', -1, 1, -1, 1, 3)
    expect(s).toHaveLength(9)
    expect(s[0]).toEqual([-1, -1, 1])
  })
  it('solves 3x3 systems', () => {
    expect(solve3([[2, 1, -1], [-3, -1, 2], [-2, 1, 2]], [8, -11, -3])!.map((v) => +v.toFixed(9))).toEqual([2, 3, -1])
    expect(solve3([[1, 2, 3], [2, 4, 6], [0, 0, 1]], [1, 2, 3])).toBeNull()
  })
  it('fits an exact plane with R² = 1', () => {
    const pts: [number, number, number][] = []
    for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) pts.push([x, y, 2 + 0.5 * x - 0.3 * y])
    const p = fitPlane(pts)!
    expect(p.a).toBeCloseTo(2)
    expect(p.b).toBeCloseTo(0.5)
    expect(p.c).toBeCloseTo(-0.3)
    expect(p.r2).toBeCloseTo(1)
    expect(fitPlane(pts.slice(0, 2))).toBeNull()
  })
  it('computes bounds with padding for flat axes', () => {
    expect(bounds([[1, 2, 3], [1, 5, -1]])).toEqual({ min: [0, 2, -1], max: [2, 5, 3] })
  })
})
