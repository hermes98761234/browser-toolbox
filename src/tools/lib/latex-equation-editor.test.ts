import { describe, expect, it } from 'vitest'
import { lineCol, parse, parseDisplay, render, TexError, toMathML } from './latex-equation-editor'

const err = (s: string) => {
  try {
    parse(s)
  } catch (e) {
    return e as TexError
  }
  throw new Error('expected an error for ' + s)
}

describe('latex-equation-editor', () => {
  it('parses scripts, fractions and roots into MathML', () => {
    expect(toMathML(parse('x^2'))).toContain('<msup><mi>x</mi><mn>2</mn></msup>')
    expect(toMathML(parse('\\frac{a}{b}'))).toContain('<mfrac><mi>a</mi><mi>b</mi></mfrac>')
    expect(toMathML(parse('\\sqrt[3]{x}'))).toContain('<mroot><mi>x</mi><mn>3</mn></mroot>')
    expect(toMathML(parse('\\sum_{i=1}^{n} i'))).toContain('<munderover><mo largeop="true">∑</mo>')
    expect(toMathML(parse('\\int_0^1 f'))).toContain('<msubsup><mo>∫</mo><mn>0</mn><mn>1</mn></msubsup>')
    expect(toMathML(parse('3.14'))).toContain('<mn>3.14</mn>')
  })
  it('handles environments', () => {
    const m = parse('\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}')
    expect(m.k).toBe('env')
    if (m.k === 'env') expect(m.rows.map((r) => r.length)).toEqual([2, 2])
    expect(toMathML(parse('\\begin{cases} 1 & x>0 \\\\ 0 & \\text{else} \\end{cases}'))).toContain('<mtext>else</mtext>')
    const g = parseDisplay('a=1 \\\\ b=2')
    expect(g.k === 'env' && g.rows.length).toBe(2)
  })
  it('reports errors with positions', () => {
    const e1 = err('x + \\fracc{1}{2}')
    expect(e1.message).toMatch(/Unknown command \\fracc.*\\frac/)
    expect(e1.pos).toBe(4)
    expect(err('{a + b').message).toMatch(/Missing closing brace/)
    expect(err('a}').pos).toBe(1)
    expect(err('x^2^3').message).toMatch(/Double superscript/)
    expect(err('\\left( x').message).toMatch(/no matching \\right/)
    expect(err('\\begin{matrix} a \\end{pmatrix}').message).toMatch(/does not match/)
    expect(lineCol('ab\ncd', 4)).toEqual([2, 2])
  })
  it('lays out SVG with sane dimensions', () => {
    const a = render(parse('x'), { size: 20 })
    const b = render(parse('\\frac{x}{y}'), { size: 20 })
    expect(b.h).toBeGreaterThan(a.h)
    expect(b.svg.startsWith('<svg')).toBe(true)
    expect(b.svg).toContain('<rect') // fraction bar
    const c = render(parse('\\left( \\frac{a}{b} \\right)'), { size: 20 })
    expect(c.w).toBeGreaterThan(b.w)
    expect(render(parse('a<b'), {}).svg).toContain('&lt;')
  })
})
