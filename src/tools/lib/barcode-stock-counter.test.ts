import { describe, expect, it } from 'vitest'
import { checkDigit, decodeRow, encode, validGtin } from './barcode-stock-counter'

/** Renders modules to a luminance row with quiet zones, fractional module width and blur/noise. */
function render(mods: number[], px: number, flip = false, noise = 0): number[] {
  const all = [...Array(12).fill(0), ...mods, ...Array(12).fill(0)]
  const W = Math.round(all.length * px)
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * noise
  const row = Array.from({ length: W }, (_, x) => {
    const m = all[Math.min(all.length - 1, Math.floor(x / px))]
    return Math.max(0, Math.min(255, (m ? 30 : 225) + rnd()))
  })
  return flip ? row.reverse() : row
}

describe('barcodes', () => {
  it('computes GS1 check digits', () => {
    expect(checkDigit('400638133393')).toBe(1)
    expect(validGtin('4006381333931')).toBe(true)
    expect(validGtin('036000291452')).toBe(true) // UPC-A
    expect(validGtin('96385074')).toBe(true) // EAN-8
    expect(validGtin('4006381333932')).toBe(false)
  })
  it('encodes 95 modules for EAN-13 and 67 for EAN-8', () => {
    expect(encode('4006381333931').length).toBe(95)
    expect(encode('96385074').length).toBe(67)
  })
  it('decodes rendered EAN-13 / UPC-A / EAN-8 rows at odd scales, reversed and noisy', () => {
    for (const code of ['4006381333931', '5901234123457', '9780201379624', '0036000291452', '96385074']) {
      for (const px of [2, 2.6, 3.4, 5]) {
        expect(decodeRow(render(encode(code), px))).toBe(code)
        expect(decodeRow(render(encode(code), px, true, 60))).toBe(code)
      }
    }
  })
  it('returns null for blank rows', () => {
    expect(decodeRow(Array(400).fill(200))).toBeNull()
  })
})
