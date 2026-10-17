import { describe, expect, it } from 'vitest'
import { applyRegion, distinctColors, hexToRgb, normRect, scanMetadata, type Pixels, type Region } from './image-redaction-tool'

const img = (w: number, h: number): Pixels => {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) data.set([(i * 37) % 256, (i * 91) % 256, (i * 13) % 256, 255], i * 4)
  return { data, width: w, height: h }
}
const R = (p: Partial<Region>): Region => ({ id: 'r', x: 2, y: 2, w: 8, h: 6, mode: 'solid', color: '#000000', block: 4, ...p })

describe('image redaction', () => {
  it('normalises drags in any direction and clips', () => {
    expect(normRect(10, 8, 2, 1, 20, 20)).toEqual({ x: 2, y: 1, w: 8, h: 7 })
    expect(normRect(-5, -5, 30, 4.2, 20, 20)).toEqual({ x: 0, y: 0, w: 20, h: 5 })
    expect(normRect(5, 5, 6, 6, 20, 20, 3)).toEqual({ x: 2, y: 2, w: 7, h: 7 })
  })
  it('solid fill destroys every pixel and nothing outside', () => {
    const p = img(16, 12)
    const before = p.data.slice()
    applyRegion(p, R({ color: '#ff0000' }))
    expect(distinctColors(p, { x: 2, y: 2, w: 8, h: 6 })).toBe(1)
    expect([...p.data.subarray((3 * 16 + 3) * 4, (3 * 16 + 3) * 4 + 4)]).toEqual([255, 0, 0, 255])
    expect(p.data[0]).toBe(before[0])
    expect(p.data[(11 * 16 + 15) * 4 + 1]).toBe(before[(11 * 16 + 15) * 4 + 1])
  })
  it('pixelate leaves one colour per block', () => {
    const p = img(16, 16)
    applyRegion(p, R({ x: 0, y: 0, w: 16, h: 16, mode: 'pixelate', block: 8 }))
    expect(distinctColors(p, { x: 0, y: 0, w: 8, h: 8 })).toBe(1)
    expect(distinctColors(p, { x: 0, y: 0, w: 16, h: 16 })).toBeLessThanOrEqual(4)
  })
  it('destructive blur flattens detail and quantises', () => {
    const p = img(40, 40)
    const energy = () => {
      let e = 0
      for (let y = 5; y < 35; y++) for (let x = 5; x < 34; x++) e += Math.abs(p.data[(y * 40 + x) * 4] - p.data[(y * 40 + x + 1) * 4])
      return e
    }
    const before = energy()
    applyRegion(p, R({ x: 5, y: 5, w: 30, h: 30, mode: 'blur', block: 10 }))
    expect(energy()).toBeLessThan(before * 0.15)
    for (let i = 0; i < p.data.length; i += 4) expect(p.data[i + 3]).toBe(255)
  })
  it('parses hex colours', () => {
    expect(hexToRgb('#1a2B3c')).toEqual([26, 43, 60])
    expect(hexToRgb('nope')).toEqual([0, 0, 0])
  })
  it('detects EXIF/GPS in JPEG and text chunks in PNG', () => {
    const exif = [0xff, 0xd8, 0xff, 0xe1, 0x00, 0x10, ...'Exif'.split('').map((c) => c.charCodeAt(0)), 0, 0, 0x4d, 0x4d, 0x88, 0x25, 0, 0, 0, 0, 0xff, 0xda]
    const r = scanMetadata(new Uint8Array(exif))
    expect(r).toMatchObject({ format: 'JPEG', exif: true, gps: true })
    const chunk = (type: string, body: number[]) => [0, 0, 0, body.length, ...type.split('').map((c) => c.charCodeAt(0)), ...body, 0, 0, 0, 0]
    const png = [0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, ...chunk('tEXt', [65, 0, 66]), ...chunk('IEND', [])]
    expect(scanMetadata(new Uint8Array(png))).toMatchObject({ format: 'PNG', text: true, exif: false })
  })
})
