import { describe, expect, it } from 'vitest'
import { findTiff, parseTiff, writeTiff } from './exif-viewer'
import { concat, crc32, detect, scan, stripLossless, uniqueNames, zip } from './metadata-stripper'

const seg = (m: number, body: number[]) => [0xff, m, (body.length + 2) >> 8, (body.length + 2) & 255, ...body]
const str = (s: string) => [...new TextEncoder().encode(s)]

function fakeJpeg() {
  const tiff = writeTiff([{ id: 0x010f, type: 2, value: 'Canon' }, { id: 0x0112, type: 3, value: [6] }], [], [{ id: 1, type: 2, value: 'N' }])
  return new Uint8Array([
    0xff, 0xd8,
    ...seg(0xe0, str('JFIF\0\x01\x01\0\0\x01\0\x01\0\0')),
    ...seg(0xe1, [...str('Exif\0\0'), ...tiff]),
    ...seg(0xe1, str('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta/>')),
    ...seg(0xe2, str('ICC_PROFILE\0\x01\x01abcd')),
    ...seg(0xfe, str('shot at home')),
    ...seg(0xdb, new Array(65).fill(1)),
    0xff, 0xda, 0, 2, 1, 2, 3, 0xff, 0xd9,
  ])
}

describe('metadata-stripper', () => {
  it('scans JPEG metadata blocks', () => {
    const b = fakeJpeg()
    expect(detect(b)).toBe('jpeg')
    expect(scan(b).map((x) => x.kind)).toEqual(['EXIF', 'XMP', 'ICC profile', 'Comment'])
    expect(scan(b)[3].detail).toBe('shot at home')
  })
  it('strips JPEG losslessly, optionally keeping ICC and orientation', () => {
    const b = fakeJpeg()
    const out = stripLossless(b)!
    expect(scan(out)).toEqual([])
    expect(findTiff(out)).toBeNull()
    expect(Array.from(out.slice(-9))).toEqual([0xff, 0xda, 0, 2, 1, 2, 3, 0xff, 0xd9])
    const keep = stripLossless(b, { keepIcc: true, orientation: 6 })!
    expect(scan(keep).map((x) => x.kind)).toEqual(['EXIF', 'ICC profile'])
    const tags = parseTiff(findTiff(keep)!)
    expect(tags.map((t) => [t.name, t.value])).toEqual([['Orientation', 6]])
    expect(keep[2]).toBe(0xff)
    expect(keep[3]).toBe(0xe0) // JFIF stays first
  })
  it('strips PNG text chunks', () => {
    const chunk = (type: string, body: number[]) => [0, 0, 0, body.length, ...str(type), ...body, 0, 0, 0, 0]
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, ...chunk('IHDR', new Array(13).fill(0)), ...chunk('tEXt', str('Author\0Me')), ...chunk('IDAT', [1, 2]), ...chunk('IEND', [])])
    expect(scan(png)).toEqual([{ kind: 'Text', bytes: 21, detail: 'Author', sensitive: true }])
    const out = stripLossless(png)!
    expect(out.length).toBe(png.length - 21)
    expect(scan(out)).toEqual([])
  })
  it('crc32 and zip', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
    const z = zip([{ name: 'a.txt', data: new Uint8Array([104, 105]) }])
    expect(new DataView(z.buffer).getUint32(0, true)).toBe(0x04034b50)
    expect(new DataView(z.buffer).getUint32(z.length - 22, true)).toBe(0x06054b50)
    expect(z.length).toBe(30 + 5 + 2 + 46 + 5 + 22)
    expect(concat([new Uint8Array([1]), new Uint8Array([2, 3])])).toEqual(new Uint8Array([1, 2, 3]))
  })
  it('unique names', () => {
    expect(uniqueNames(['a.jpg', 'A.jpg', 'b', 'b'])).toEqual(['a.jpg', 'A (2).jpg', 'b', 'b (2)'])
  })
})
