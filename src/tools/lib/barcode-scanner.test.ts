import { describe, expect, it } from 'vitest'
import { decodeLine, encodeCode128, encodeEan, gtinCheck, validGtin } from './barcode-scanner'

/** Renders modules at `px` pixels each with quiet zones into a luminance line. */
const line = (mods: string, px = 3, quiet = 12) => {
  const bits = '0'.repeat(quiet) + mods + '0'.repeat(quiet)
  return [...bits].flatMap((b) => Array(px).fill(b === '1' ? 20 : 235))
}

describe('barcode codec', () => {
  it('check digits', () => {
    expect(gtinCheck('400638133393')).toBe(1)
    expect(validGtin('4006381333931')).toBe(true)
    expect(validGtin('036000291452')).toBe(true)
    expect(validGtin('4006381333932')).toBe(false)
    expect(validGtin('96385074')).toBe(true)
  })
  it('EAN-13 round trip', () => {
    const m = encodeEan('4006381333931')
    expect(m.length).toBe(95)
    expect(decodeLine(line(m))).toEqual({ format: 'ean_13', text: '4006381333931' })
    expect(decodeLine(line(m).reverse())).toEqual({ format: 'ean_13', text: '4006381333931' })
    expect(decodeLine(line(encodeEan('5901234123457'), 2))?.text).toBe('5901234123457')
  })
  it('UPC-A and EAN-8', () => {
    expect(decodeLine(line(encodeEan('036000291452')))).toEqual({ format: 'upc_a', text: '036000291452' })
    const m8 = encodeEan('96385074')
    expect(m8.length).toBe(67)
    expect(decodeLine(line(m8))).toEqual({ format: 'ean_8', text: '96385074' })
  })
  it('Code 128 round trip (sets B and C)', () => {
    const b = encodeCode128('TB-2026-0042')
    expect(decodeLine(line(b, 2))).toEqual({ format: 'code_128', text: 'TB-2026-0042' })
    expect(decodeLine(line(encodeCode128('12345678'), 3))).toEqual({ format: 'code_128', text: '12345678' })
    // Wikipedia example "Wikipedia" in set B: checksum symbol value
    expect(encodeCode128('Wikipedia').length).toBe(11 * 11 + 13)
  })
  it('tolerates uneven widths', () => {
    const lum = line(encodeEan('4006381333931'), 3).map((v, i) => (i % 7 === 0 ? 128 + (v - 128) * 0.6 : v))
    expect(decodeLine(lum)?.text).toBe('4006381333931')
  })
})
