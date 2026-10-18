import { describe, expect, it } from 'vitest'
import { diff, evalN, expand, factor, integrate, parse, simplify, solve, str, tex, verifyAntiderivative } from './symbolic-algebra-solver'

const S = (s: string) => str(parse(s))

describe('parser and canonical forms', () => {
  it('collects like terms with exact rationals', () => {
    expect(S('x + x + 1/2 + 0.25')).toBe('2*x + 3/4')
    expect(S('2x*3x')).toBe('6*x^2')
    expect(S('x^2/x')).toBe('x')
    expect(S('sqrt(8)')).toBe('2*sqrt(2)')
    expect(S('8^(2/3)')).toBe('4')
    expect(S('sin(pi/6) + cos(pi)')).toBe('-1/2')
    expect(S('ln(e^3)')).toBe('3')
    expect(S('sin^2(x)')).toBe('sin(x)^2')
    expect(() => parse('1/0')).toThrow()
  })
  it('expands and factors', () => {
    expect(str(expand(parse('(x+1)^3')))).toBe('x^3 + 3*x^2 + 3*x + 1')
    expect(str(factor(parse('x^3 - 6x^2 + 11x - 6'), 'x'))).toBe('(x - 1)*(x - 2)*(x - 3)')
    expect(str(factor(parse('2x^2 - 2'), 'x'))).toBe('2*(x + 1)*(x - 1)')
    expect(str(factor(parse('x^4 + 4'), 'x'))).toBe('(x^2 + 2*x + 2)*(x^2 - 2*x + 2)')
    expect(str(simplify(parse('(x^2 - 1)/(x - 1)'), 'x'))).toBe('x + 1')
    expect(str(simplify(parse('sin(x)^2 + cos(x)^2'), 'x'))).toBe('1')
  })
})

describe('differentiation', () => {
  const D = (s: string) => str(simplify(diff(parse(s), 'x'), 'x'))
  it('elementary rules', () => {
    expect(D('x^3 + 2x')).toBe('3*x^2 + 2')
    expect(D('sin(x^2)')).toBe('2*x*cos(x^2)')
    expect(D('ln(x)')).toBe('x^(-1)')
    expect(D('e^(3x)')).toBe('3*e^(3*x)')
    expect(D('atan(x)')).toBe('(x^2 + 1)^(-1)')
    expect(D('x^x')).toContain('ln(x)')
    // numeric check of a quotient
    const d = diff(parse('x/(1+x^2)'), 'x')
    expect(evalN(d, { x: 2 })).toBeCloseTo((1 - 4) / 25, 12)
  })
})

describe('integration (verified by differentiating back)', () => {
  const cases = [
    'x^3 - 2x + 5', '1/x', 'e^(2x+1)', 'sin(3x)', 'cos(x)^2', 'sin(x)^3', 'tan(x)', 'sec(x)^2', '2x*cos(x^2)', 'x*e^(x^2)',
    'x^2*e^x', 'x*sin(x)', 'x^2*cos(2x)', 'ln(x)', 'x*ln(x)', 'atan(x)', 'e^x*sin(x)', '1/(1+x^2)', '1/(x^2-1)', '(3x+5)/(x^2+2x-3)',
    '1/(x^2+2x+5)', 'x^3/(x^2+1)', '1/(x*(x+1)^2)', '1/(x^4+4)', '1/(x^2+1)^2', '1/sqrt(1-x^2)', '1/sqrt(4-x^2)', '1/sqrt(x^2+1)', 'ln(x)/x', 'sin(x)*cos(x)',
    'sqrt(x)', 'sqrt(1-x^2)', 'sqrt(x^2+2x+5)', 'tan(x)^3', '(2x+1)^5', 'x*sqrt(x^2+1)', 'e^x/(1+e^x)', 'cos(x)*e^(sin(x))', 'sinh(2x)', '3^x', 'x^3*e^(x^2)', 'sec(x)*tan(x)', '1/(x^3-1)',
  ]
  for (const c of cases)
    it(c, () => {
      const f = parse(c)
      const { result } = integrate(f, 'x')
      expect(result, `no antiderivative for ${c}`).not.toBeNull()
      expect(verifyAntiderivative(result!, f, 'x')).not.toBe('failed')
    })
  it('admits failure honestly', () => {
    expect(integrate(parse('e^(x^2)'), 'x').result).toBeNull()
    expect(integrate(parse('sin(x)/x'), 'x').result).toBeNull()
  })
})

describe('solving', () => {
  const sol = (s: string) => {
    const [l, r] = s.split('=')
    return solve(parse(l), parse(r), 'x').map((v) => (v.im ? `${v.numeric.toFixed(4)}${v.im > 0 ? '+' : '-'}${Math.abs(v.im).toFixed(4)}i` : v.exact && str(v.value) !== '0' ? str(v.value) : v.numeric.toFixed(6)))
  }
  it('linear, quadratic, rational roots', () => {
    expect(sol('3x + 4 = 10')).toEqual(['2'])
    expect(sol('x^2 - 5x + 6 = 0')).toEqual(['2', '3'])
    expect(sol('x^2 - 2 = 0')).toEqual(['-sqrt(2)', 'sqrt(2)'])
    expect(sol('x^2 + 1 = 0')).toEqual(['0.0000+1.0000i', '0.0000-1.0000i'])
    expect(sol('x^3 - 6x^2 + 11x - 6 = 0')).toEqual(['1', '2', '3'])
    expect(sol('(x^2-1)/(x-1) = 0')).toEqual(['-1'])
  })
  it('cubic, quartic and transcendental', () => {
    const c = solve(parse('x^3 + x - 1'), parse('0'), 'x')
    expect(c[0].numeric).toBeCloseTo(0.6823278, 6)
    const t = solve(parse('x^3 - 3x + 1'), parse('0'), 'x').map((v) => v.numeric).sort((a, b) => a - b)
    expect(t[0]).toBeCloseTo(-1.8793852, 6)
    expect(t[2]).toBeCloseTo(1.5320889, 6)
    expect(solve(parse('x^4 - 2'), parse('0'), 'x').filter((v) => !v.im).map((v) => +v.numeric.toFixed(6))).toEqual([-1.189207, 1.189207])
    expect(str(solve(parse('e^x'), parse('5'), 'x')[0].value)).toBe('ln(5)')
    expect(solve(parse('cos(x)'), parse('x'), 'x')[0].numeric).toBeCloseTo(0.7390851, 6)
    expect(str(solve(parse('a*x^2 + b*x + c'), parse('0'), 'x')[0].value)).toContain('sqrt')
  })
  it('renders LaTeX', () => {
    expect(tex(parse('x^2/2 + sqrt(x) + sin(x)^2'))).toBe('\\frac{x^{2}}{2} + \\sqrt{x} + \\sin^{2}\\left(x\\right)')
  })
})
