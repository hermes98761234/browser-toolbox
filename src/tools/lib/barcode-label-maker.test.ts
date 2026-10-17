import { describe, expect, it } from 'vitest'
import { C128_PATTERNS, code128Values, code128Widths, ean13, eanCheck, fill, formatBits, labelPos, parseCsv, qr, rsDivisor, rsRemainder, SHEETS, versionBits } from './barcode-label-maker'

describe('barcode-label-maker', () => {
  it('Code 128 patterns are 11 modules wide (stop 13)', () => {
    expect(C128_PATTERNS.length).toBe(107)
    C128_PATTERNS.forEach((p, i) => expect([...p].reduce((a, c) => a + Number(c), 0)).toBe(i === 106 ? 13 : 11))
  })
  it('Code 128 "Wikipedia" checksum is 88', () => {
    const v = code128Values('Wikipedia')
    expect(v[0]).toBe(104)
    expect(v[v.length - 2]).toBe(88)
    expect(code128Widths('Wikipedia').reduce((a, b) => a + b, 0)).toBe(11 * 11 + 13)
  })
  it('Code 128 uses set C for digit runs', () => {
    expect(code128Values('123456').slice(0, 4)).toEqual([105, 12, 34, 56])
    expect(code128Values('AB1234567890').slice(0, 4)).toEqual([104, 33, 34, 99])
    expect(() => code128Values('é')).toThrow()
  })
  it('EAN-13', () => {
    expect(eanCheck('400638133393')).toBe(1)
    const e = ean13('400638133393')
    expect(e.code).toBe('4006381333931')
    expect(e.bits.length).toBe(95)
    expect(() => ean13('4006381333932')).toThrow()
  })
  it('QR format/version info match the spec tables', () => {
    expect(formatBits('L', 0)).toBe(0x77c4)
    expect(formatBits('M', 0)).toBe(0x5412)
    expect(formatBits('H', 7)).toBe(0x083b)
    expect(versionBits(7)).toBe(0x07c94)
    expect(versionBits(40)).toBe(0x28c69)
  })
  it('Reed–Solomon codewords divide evenly', () => {
    const div = rsDivisor(10)
    const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17]
    const ecc = rsRemainder(data, div)
    expect(ecc).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23])
  })
  it('QR picks version by length', () => {
    const a = qr('HELLO WORLD', 'M')
    expect(a.size).toBe(21)
    expect(a.modules[0].slice(0, 7)).toEqual([true, true, true, true, true, true, true])
    expect(qr('https://example.com/products/sku-000123?ref=label', 'M').version).toBe(4)
    expect(qr('x'.repeat(300), 'L').version).toBe(11)
  })
  it('sheets and CSV', () => {
    const s = SHEETS.find((x) => x.id === 'L7160')!
    expect(labelPos(s, 22)).toEqual({ page: 1, x: 7.2 + 63.5 + 2.5, y: 15.15 })
    expect(parseCsv('code,title\n"1,2","say ""hi"""\n\nWIFI:S:a;P:b;;,x')).toEqual([['code', 'title'], ['1,2', 'say "hi"'], ['WIFI:S:a;P:b;;', 'x']])
    expect(parseCsv('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']])
    expect(fill('{Title} – {price}', { title: 'Mug', price: '9' })).toBe('Mug – 9')
  })
})
