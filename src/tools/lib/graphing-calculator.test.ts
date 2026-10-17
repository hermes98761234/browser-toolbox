import { describe, expect, it } from 'vitest'
import { compile, findExtrema, findZeros, gridStep, sampleCurve } from './graphing-calculator'

const ev = (s: string, x = 0, extra: Record<string, number> = {}) => compile(s, ['x', 'a', 'b', 'c'])({ x, a: 2, b: 3, c: 0, ...extra })

describe('graphing-calculator parser', () => {
  it('respects precedence and associativity', () => {
    expect(ev('1 + 2 * 3')).toBe(7)
    expect(ev('2^3^2')).toBe(512)
    expect(ev('-x^2', 3)).toBe(-9)
    expect(ev('2^-1')).toBe(0.5)
    expect(ev('8 / 2 / 2')).toBe(2)
  })
  it('supports implicit multiplication, functions and constants', () => {
    expect(ev('2x', 4)).toBe(8)
    expect(ev('ax + b', 5)).toBe(13)
    expect(ev('2 sin x', Math.PI / 2)).toBeCloseTo(2, 12)
    expect(ev('x(x+1)', 3)).toBe(12)
    expect(ev('(x+1)(x-1)', 3)).toBe(8)
    expect(ev('|x - 5|', 2)).toBe(3)
    expect(ev('2pi')).toBeCloseTo(2 * Math.PI, 12)
    expect(ev('y = sqrt(x)', 9)).toBe(3)
    expect(ev('log(100)')).toBeCloseTo(2, 12)
    expect(ev('log(8, 2)')).toBeCloseTo(3, 12)
    expect(ev('5!')).toBe(120)
    expect(ev('max(1, x, 3)', 7)).toBe(7)
  })
  it('reports errors', () => {
    expect(() => compile('2 +')).toThrow()
    expect(() => compile('foo(x)')).toThrow(/Unknown/)
    expect(() => compile('(x + 1')).toThrow(/Expected/)
  })
})

describe('graphing-calculator numerics', () => {
  it('finds roots, intersections and extrema', () => {
    const r = findZeros((x) => x * x - 2, -3, 3)
    expect(r.length).toBe(2)
    expect(r[1]).toBeCloseTo(Math.SQRT2, 9)
    // 1/x changes sign at a pole, which must not count as a root
    expect(findZeros((x) => 1 / (x - 0.5), -2, 2).length).toBe(0)
    const ix = findZeros((x) => Math.sin(x) - x / 2, -3, 3)
    expect(ix.length).toBe(3)
    const ex = findExtrema(Math.sin, 0, 7)
    expect(ex.map((e) => e.kind)).toEqual(['max', 'min'])
    expect(ex[0].x).toBeCloseTo(Math.PI / 2, 5)
  })
  it('breaks curves at asymptotes and gaps', () => {
    const segs = sampleCurve((x) => 1 / (x - 1), -5, 5, -10, 10, 800, 600)
    expect(segs.length).toBe(2)
    expect(sampleCurve(Math.sqrt, -5, 5, -1, 3, 800, 600).length).toBe(1)
    expect(sampleCurve(Math.tan, -5, 5, -5, 5, 800, 600).length).toBe(5) // poles at ±π/2, ±3π/2
  })
  it('chooses nice grid steps', () => {
    expect(gridStep(20, 800)).toBe(2)
    expect(gridStep(1, 600)).toBe(0.1)
  })
})
