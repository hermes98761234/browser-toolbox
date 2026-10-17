import { describe, expect, it } from 'vitest'
import { cleanName, countFields, kb, summarize } from './exif-data-remover'
import { findTiff, jpegWithExif, parseTiff, writeTiff } from './exif-viewer'
import { scan, stripLossless } from './metadata-stripper'

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0, 4, 1, 2, 0xff, 0xda, 0, 2, 9, 9, 0xff, 0xd9])

describe('exif-data-remover', () => {
  it('counts tags and non-EXIF blocks, ignoring ICC', () => {
    const tags = [{ ifd: 'IFD0', id: 1, name: 'Make', type: 2, value: 'X' }] as never
    expect(countFields(tags, [{ kind: 'EXIF', bytes: 10, sensitive: true }, { kind: 'XMP', bytes: 5, sensitive: true }, { kind: 'ICC profile', bytes: 9, sensitive: false }])).toBe(2)
  })
  it('strips a JPEG with GPS down to orientation only', () => {
    const tiff = writeTiff([{ id: 0x010f, type: 2, value: 'Apple' }, { id: 0x0112, type: 3, value: [6] }], [], [{ id: 1, type: 2, value: 'N' }])
    const jpg = jpegWithExif(JPEG, tiff)
    const before = parseTiff(findTiff(jpg)!).filter((t) => !/Pointer$/.test(t.name))
    expect(countFields(before, scan(jpg))).toBe(3)
    const out = stripLossless(jpg, { orientation: 6 })!
    const after = parseTiff(findTiff(out)!)
    expect(after.map((t) => t.name)).toEqual(['Orientation'])
    expect(stripLossless(jpg)!.length).toBe(JPEG.length)
  })
  it('summarizes a batch', () => {
    const s = summarize([
      { fieldsBefore: 20, fieldsAfter: 1, gps: true, bytesBefore: 1000, bytesAfter: 600 },
      { fieldsBefore: 3, fieldsAfter: 0, gps: false, bytesBefore: 500, bytesAfter: 480 },
    ])
    expect(s).toEqual({ photos: 2, removed: 22, gps: 1, before: 1500, after: 1080, clean: 2 })
  })
  it('names files', () => {
    expect(cleanName('IMG_1.JPG')).toBe('IMG_1-clean.JPG')
    expect(cleanName('a.heic', '.png')).toBe('a-clean.png')
    expect(cleanName('noext')).toBe('noext-clean')
    expect(kb(2048)).toBe('2.0 KB')
  })
})
