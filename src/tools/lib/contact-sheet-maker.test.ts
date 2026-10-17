import { describe, expect, it } from 'vitest'
import { exifDate, fitRect, grid, pagesNeeded } from './contact-sheet-maker'

function jpegWithExif(date: string, le: boolean): ArrayBuffer {
  const tiff = new DataView(new ArrayBuffer(64))
  tiff.setUint16(0, le ? 0x4949 : 0x4d4d)
  tiff.setUint16(2, 42, le)
  tiff.setUint32(4, 8, le)
  tiff.setUint16(8, 1, le) // IFD0: 1 entry
  tiff.setUint16(10, 0x8769, le)
  tiff.setUint16(12, 4, le)
  tiff.setUint32(14, 1, le)
  tiff.setUint32(18, 26, le)
  tiff.setUint32(22, 0, le)
  tiff.setUint16(26, 1, le) // Exif IFD
  tiff.setUint16(28, 0x9003, le)
  tiff.setUint16(30, 2, le)
  tiff.setUint32(32, 20, le)
  tiff.setUint32(36, 44, le)
  tiff.setUint32(40, 0, le)
  for (let i = 0; i < 19; i++) tiff.setUint8(44 + i, date.charCodeAt(i))
  const out = new Uint8Array(4 + 2 + 6 + 64 + 2)
  out.set([0xff, 0xd8, 0xff, 0xe1, 0, 2 + 6 + 64])
  out.set([0x45, 0x78, 0x69, 0x66, 0, 0], 6)
  out.set(new Uint8Array(tiff.buffer), 12)
  out.set([0xff, 0xd9], 76)
  return out.buffer
}

describe('contact-sheet-maker', () => {
  it('reads EXIF DateTimeOriginal in both byte orders', () => {
    expect(exifDate(jpegWithExif('2024:07:14 18:42:09', true))).toBe('2024-07-14 18:42')
    expect(exifDate(jpegWithExif('2019:01:02 03:04:05', false))).toBe('2019-01-02 03:04')
    expect(exifDate(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)).toBeNull()
  })
  it('lays out a grid that fills the page', () => {
    const cells = grid({ pageW: 210, pageH: 297, margin: 10, gap: 4, cols: 4, rows: 5, header: 12, caption: 6 })
    expect(cells).toHaveLength(20)
    const last = cells[19]
    expect(last.x + last.w).toBeCloseTo(200)
    expect(last.y + last.h + 6).toBeCloseTo(287)
  })
  it('fits and fills images', () => {
    const box = { x: 0, y: 0, w: 40, h: 30 }
    expect(fitRect(2, box, 'fit')).toEqual({ dx: 0, dy: 5, dw: 40, dh: 20 })
    expect(fitRect(2, box, 'fill')).toEqual({ dx: -10, dy: 0, dw: 60, dh: 30 })
    expect(pagesNeeded(21, 4, 5)).toBe(2)
    expect(pagesNeeded(0, 4, 5)).toBe(1)
  })
})
