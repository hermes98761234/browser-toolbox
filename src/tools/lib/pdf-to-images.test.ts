import { describe, expect, it } from 'vitest'
import { outName, parsePages, pixelSize, safeDpi } from './pdf-to-images'

describe('pdf-to-images', () => {
  it('parses page specs', () => {
    expect(parsePages('all', 4).pages).toEqual([1, 2, 3, 4])
    expect(parsePages('', 3).pages).toEqual([1, 2, 3])
    expect(parsePages('1-2, 4', 5).pages).toEqual([1, 2, 4])
    expect(parsePages('3-', 5).pages).toEqual([3, 4, 5])
    expect(parsePages('-2', 5).pages).toEqual([1, 2])
    expect(parsePages('odd', 5).pages).toEqual([1, 3, 5])
    expect(parsePages('even 1', 5).pages).toEqual([1, 2, 4])
    expect(parsePages('5-3', 9).pages).toEqual([3, 4, 5])
  })
  it('reports errors', () => {
    expect(parsePages('9', 5).errors.length).toBe(1)
    expect(parsePages('x', 5).errors.length).toBe(1)
    expect(parsePages('4-9', 5).pages).toEqual([4, 5])
  })
  it('computes pixels', () => {
    expect(pixelSize(612, 792, 72)).toEqual([612, 792])
    expect(pixelSize(612, 792, 150)).toEqual([1275, 1650])
    expect(pixelSize(595.28, 841.89, 300)).toEqual([2480, 3508])
    expect(safeDpi(612, 792, 150)).toBe(150)
    expect(safeDpi(612, 792, 1200, 10_000_000)).toBeLessThan(1200)
  })
  it('names files', () => {
    expect(outName('My report.pdf', 3, 12, 'png')).toBe('My_report-p03.png')
  })
})
