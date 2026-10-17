import { describe, expect, it } from 'vitest'
import { C39_PATTERNS, code39Check, code39Widths, ean8Bits, encode, gs1Check, itfWidths, toSvg } from './barcode-generator'

describe('barcode-generator', () => {
  it('computes GS1 check digits', () => {
    expect(gs1Check('03600029145')).toBe(2) // UPC-A 036000291452
    expect(gs1Check('9638507')).toBe(4) // EAN-8 96385074
    expect(gs1Check('1540014128876')).toBe(3) // ITF-14 15400141288763
    expect(gs1Check('400638133393')).toBe(1) // EAN-13 4006381333931
  })

  it('UPC-A is EAN-13 with a leading zero', () => {
    const u = encode('upca', '03600029145')
    const e = encode('ean13', '003600029145')
    expect(u.code).toBe('036000291452')
    expect(u.bars).toEqual(e.bars)
    expect(() => encode('upca', '036000291453')).toThrow(/check digit/)
  })

  it('EAN-8 has 67 modules with correct guards', () => {
    const { code, bits } = ean8Bits('9638507')
    expect(code).toBe('96385074')
    expect(bits.length).toBe(67)
    expect(bits.slice(0, 3)).toBe('101')
    expect(bits.slice(31, 36)).toBe('01010')
    expect(bits.slice(64)).toBe('101')
  })

  it('Code 39 table is well-formed', () => {
    expect(C39_PATTERNS.length).toBe(43)
    expect(new Set(C39_PATTERNS).size).toBe(43)
    C39_PATTERNS.forEach((p, i) => {
      expect(p.length).toBe(9)
      const wideBars = [0, 2, 4, 6, 8].filter((k) => p[k] === 'w').length
      const wideSpaces = [1, 3, 5, 7].filter((k) => p[k] === 'w').length
      if (i < 39) expect([wideBars, wideSpaces]).toEqual([2, 1])
      else expect([wideBars, wideSpaces]).toEqual([0, 3])
    })
  })

  it('Code 39 check and widths', () => {
    expect(code39Check('CODE39')).toBe('W')
    const { widths } = code39Widths('A', false, 3)
    // *A* = 3 chars × 9 elements + 2 gaps; width = 3 × (6 narrow + 3 wide) + 2
    expect(widths.length).toBe(29)
    expect(widths.reduce((a, b) => a + b, 0)).toBe(3 * (6 + 9) + 2)
  })

  it('ITF pairs digits and adds start/stop', () => {
    const w = itfWidths('12', 3)
    expect(w.slice(0, 4)).toEqual([1, 1, 1, 1])
    expect(w.slice(-3)).toEqual([3, 1, 1])
    expect(w.length).toBe(4 + 10 + 3)
    expect(() => itfWidths('123')).toThrow()
    expect(encode('itf14', '1540014128876').code).toBe('15400141288763')
  })

  it('renders an SVG', () => {
    const svg = toSvg(encode('ean13', '590123412345'), { module: 2, height: 60, text: true, fontSize: 14, fg: '#000', bg: '#fff' })
    expect(svg).toContain('<svg')
    expect((svg.match(/<rect/g) ?? []).length).toBe(1 + 30) // background + 30 bars in EAN-13
  })
})
