import { describe, expect, it } from 'vitest'
import { parse, render } from './math-equation-editor'

const R = (s: string) => render(s, { size: 32, color: '#000', display: true })

describe('math-equation-editor', () => {
  it('parses fractions, scripts and Greek', () => {
    const { nodes, errors } = parse('\\frac{a}{b} + x^{2}_i - \\alpha')
    expect(errors).toEqual([])
    expect(nodes.map((n) => n.t)).toEqual(['frac', 'sym', 'scripts', 'sym', 'sym'])
    const sc = nodes[2]
    expect(sc.t === 'scripts' && sc.sup && sc.sub).toBeTruthy()
  })
  it('renders text glyphs and fraction bars', () => {
    const r = R('x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}')
    expect(r.errors).toEqual([])
    expect(r.svg).toContain('<line')
    expect(r.svg).toContain('±')
    expect(r.svg).toContain('<path') // radical sign
    expect(r.width).toBeGreaterThan(100)
    expect(r.height).toBeGreaterThan(60)
  })
  it('handles matrices, cases, left/right and big operators', () => {
    expect(parse('\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}').nodes[0]).toMatchObject({ t: 'matrix', env: 'pmatrix' })
    const m = parse('\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}').nodes[0]
    expect(m.t === 'matrix' && m.rows.length === 2 && m.rows[1].length === 2).toBe(true)
    expect(R('f(x)=\\begin{cases} 1 & x>0 \\\\ 0 & \\text{otherwise} \\end{cases}').errors).toEqual([])
    expect(R('\\left( \\sum_{k=1}^{n} k \\right)^2').svg).toContain('∑')
    expect(R('\\int_0^\\infty e^{-x^2} dx').svg).toContain('∞')
  })
  it('reports errors but still renders', () => {
    const r = R('\\foo + \\frac{1}{2')
    expect(r.errors).toContain('Unknown command \\foo')
    expect(r.errors).toContain('Missing "}"')
    expect(r.svg).toContain('\\foo')
  })
  it('escapes XML and supports multiple lines', () => {
    const one = R('a < b')
    expect(one.svg).toContain('&lt;')
    const two = R('a \\\\ b')
    expect(two.height).toBeGreaterThan(one.height)
  })
})
