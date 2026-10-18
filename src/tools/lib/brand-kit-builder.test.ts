import { describe, expect, it } from 'vitest'
import { cmyk, cssTokens, grade, jsonTokens, pairs, slug, textOn, type BrandColor } from './brand-kit-builder'

const C = (id: string, hex: string): BrandColor => ({ id, name: id, hex, role: 'primary' })

describe('brand-kit-builder', () => {
  it('converts to CMYK', () => {
    expect(cmyk([255, 0, 0])).toEqual([0, 100, 100, 0])
    expect(cmyk([0, 0, 0])).toEqual([0, 0, 0, 100])
    expect(cmyk([255, 255, 255])).toEqual([0, 0, 0, 0])
    expect(cmyk([0, 102, 204])).toEqual([100, 50, 0, 20])
  })
  it('grades contrast', () => {
    expect(grade(21)).toBe('AAA')
    expect(grade(4.5)).toBe('AA')
    expect(grade(3.2)).toBe('AA large')
    expect(grade(2)).toBe('Fail')
  })
  it('picks readable text', () => {
    expect(textOn('#111827').text).toBe('#ffffff')
    expect(textOn('#fde68a').text).toBe('#000000')
    expect(textOn('#000000').ratio).toBeCloseTo(21)
  })
  it('ranks pairs', () => {
    const p = pairs([C('black', '#000000'), C('white', '#ffffff'), C('grey', '#777777')])
    expect(p).toHaveLength(6)
    expect(p[0].ratio).toBeCloseTo(21)
    expect(p[p.length - 1].grade).not.toBe('AAA')
  })
  it('emits tokens', () => {
    expect(slug('Ocean Blue 2')).toBe('ocean-blue-2')
    const css = cssTokens('Northwind', [C('Ocean Blue', '#0066cc')], 'Georgia, serif', 'system-ui')
    expect(css).toContain('--northwind-ocean-blue: #0066cc;')
    expect(JSON.parse(jsonTokens([C('Ink', '#111111')], 'a', 'b')).color.ink.$value).toBe('#111111')
  })
})
