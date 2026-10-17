import { describe, expect, it } from 'vitest'
import { crc32, everyN, everyPage, intoN, parseRanges, zipStore } from './pdf-splitter'

describe('parseRanges', () => {
  it('parses ranges, open ends and joins', () => {
    const { parts, errors } = parseRanges('1-3, 5, 8-, -2, 4-2, 1-2+6', 10)
    expect(errors).toEqual([])
    expect(parts.map((p) => p.pages)).toEqual([[1, 2, 3], [5], [8, 9, 10], [1, 2], [4, 3, 2], [1, 2, 6]])
  })
  it('handles keywords', () => {
    expect(parseRanges('odd; even', 5).parts.map((p) => p.pages)).toEqual([[1, 3, 5], [2, 4]])
  })
  it('reports bad items', () => {
    const r = parseRanges('0, 12, abc, 2', 10)
    expect(r.errors.length).toBe(3)
    expect(r.parts.map((p) => p.pages)).toEqual([[2]])
  })
})

describe('split plans', () => {
  it('every page / every N / into N', () => {
    expect(everyPage(3).map((p) => p.pages)).toEqual([[1], [2], [3]])
    expect(everyN(7, 3).map((p) => p.name)).toEqual(['1-3', '4-6', '7'])
    expect(intoN(10, 3).map((p) => p.pages.length)).toEqual([4, 3, 3])
  })
})

describe('zip', () => {
  it('crc32 reference value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })
  it('writes a valid stored archive', () => {
    const z = zipStore([{ name: 'a.txt', data: new TextEncoder().encode('hello') }])
    const v = new DataView(z.buffer)
    expect(v.getUint32(0, true)).toBe(0x04034b50)
    expect(v.getUint32(z.length - 22, true)).toBe(0x06054b50)
    expect(v.getUint16(z.length - 22 + 10, true)).toBe(1)
    expect(z.length).toBe(30 + 5 + 5 + 46 + 5 + 22)
  })
})
