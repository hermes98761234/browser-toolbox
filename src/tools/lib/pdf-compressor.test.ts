import { describe, expect, it } from 'vitest'
import { fmtBytes, saving, targetSize, toRgba, unpredictPng } from './pdf-compressor'

describe('targetSize', () => {
  it('never upscales', () => expect(targetSize(800, 600, 1600)).toEqual([800, 600]))
  it('limits the long side', () => expect(targetSize(4000, 2000, 1000)).toEqual([1000, 500]))
  it('limits by effective dpi', () => {
    // drawn 288 pt wide = 4 in → 150 dpi → 600 px
    expect(targetSize(3000, 1500, 5000, 150, 288)).toEqual([600, 300])
  })
})

describe('unpredictPng', () => {
  it('undoes Sub, Up and Paeth rows', () => {
    // 2 rows, 3 bytes each (gray, bpp 1)
    const data = new Uint8Array([1, 10, 5, 5, 2, 1, 1, 1, 4, 0, 0, 0])
    // row0 Sub: 10, 15, 20 ; row1 Up: 11, 16, 21 ; row2 Paeth zero deltas → same as up
    expect([...unpredictPng(data, 3, 1)]).toEqual([10, 15, 20, 11, 16, 21, 11, 16, 21])
  })
  it('Average filter', () => {
    const data = new Uint8Array([0, 100, 50, 3, 10, 10])
    // row1: a=0,b=100 → 10+50=60 ; a=60,b=50 → 10+55=65
    expect([...unpredictPng(data, 2, 1)]).toEqual([100, 50, 60, 65])
  })
})

describe('toRgba & formatting', () => {
  it('expands gray and rgb', () => {
    expect([...toRgba(new Uint8Array([7]), 1, 1, 1)]).toEqual([7, 7, 7, 255])
    expect([...toRgba(new Uint8Array([1, 2, 3]), 1, 1, 3)]).toEqual([1, 2, 3, 255])
  })
  it('formats bytes and saving', () => {
    expect(fmtBytes(512)).toBe('512 B')
    expect(fmtBytes(2048)).toBe('2.0 KB')
    expect(fmtBytes(3 * 1048576)).toBe('3.00 MB')
    expect(saving(1000, 250)).toBe(0.75)
  })
})
