import { describe, expect, it } from 'vitest'
import { compile, sample } from './3d-function-plotter'

const ev = (s: string, x = 0, y = 0) => compile(s, ['x', 'y', 't'])({ x, y, t: 0 })

describe('expression compiler', () => {
  it('precedence and associativity', () => {
    expect(ev('1+2*3')).toBe(7)
    expect(ev('2^3^2')).toBe(512)
    expect(ev('-2^2')).toBe(-4)
    expect(ev('(1+2)*3')).toBe(9)
    expect(ev('10 % 4')).toBe(2)
    expect(ev('2**3')).toBe(8)
  })
  it('variables, functions, constants, implicit multiplication', () => {
    expect(ev('x^2 - y^2', 3, 2)).toBe(5)
    expect(ev('sin(pi/2)')).toBeCloseTo(1)
    expect(ev('2x', 3)).toBe(6)
    expect(ev('2(x+1)', 3)).toBe(8)
    expect(ev('x y', 3, 4)).toBe(12)
    expect(ev('max(x, y, 7)', 3, 4)).toBe(7)
    expect(ev('sqrt(x^2+y^2)', 3, 4)).toBe(5)
    expect(ev('2 sin(x)', Math.PI / 2)).toBeCloseTo(2)
  })
  it('errors', () => {
    expect(() => compile('x +')).toThrow()
    expect(() => compile('foo(x)')).toThrow()
    expect(() => compile('alert(1)')).toThrow()
    expect(() => compile('x $ y')).toThrow()
    expect(() => compile('(x')).toThrow()
  })
  it('samples a grid', () => {
    const g = sample(compile('x*y', ['x', 'y', 't']), -1, 1, -1, 1, 3)
    expect([...g.z]).toEqual([1, -0, -1, -0, 0, 0, -1, 0, 1])
    expect(g.min).toBe(-1)
    expect(g.max).toBe(1)
    expect(sample(compile('log(x)', ['x', 'y', 't']), -1, 1, 0, 1, 3).bad).toBe(6)
  })
})
