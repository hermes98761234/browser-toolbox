import { describe, expect, it } from 'vitest'
import { crc32, fitSize, fmtBytes, makeZip, uniqueNames } from './image-compressor'

describe('image compressor helpers', () => {
  it('fitSize keeps aspect and never upscales', () => {
    expect(fitSize(4000, 3000, 1920, 0)).toEqual([1920, 1440])
    expect(fitSize(4000, 3000, 1920, 1080)).toEqual([1440, 1080])
    expect(fitSize(800, 600, 1920, 1080)).toEqual([800, 600])
    expect(fitSize(800, 600, 0, 0)).toEqual([800, 600])
  })
  it('crc32 reference value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })
  it('makeZip writes valid headers', () => {
    const z = makeZip([{ name: 'a.txt', data: new TextEncoder().encode('hello') }], new Date(2024, 0, 2, 3, 4, 6))
    const v = new DataView(z.buffer)
    expect(v.getUint32(0, true)).toBe(0x04034b50)
    expect(z.length).toBe(30 + 5 + 5 + 46 + 5 + 22)
    expect(v.getUint32(z.length - 22, true)).toBe(0x06054b50)
    expect(v.getUint16(z.length - 22 + 10, true)).toBe(1)
    expect(v.getUint32(14, true)).toBe(crc32(new TextEncoder().encode('hello')))
  })
  it('fmtBytes and uniqueNames', () => {
    expect(fmtBytes(512)).toBe('512 B')
    expect(fmtBytes(2048)).toBe('2.0 KB')
    expect(uniqueNames(['a.jpg', 'b.jpg', 'A.jpg'])).toEqual(['a.jpg', 'b.jpg', 'A (2).jpg'])
  })
})
