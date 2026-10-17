import { describe, expect, it } from 'vitest'
import { centers, hexToRgb, originFor, parsePages, rotatedBox, sanitize } from './pdf-watermarker'

describe('pdf-watermarker', () => {
  it('sanitizes text for WinAnsi fonts', () => {
    expect(sanitize('CONFIDENTIAL – “draft” €5').text).toBe('CONFIDENTIAL – “draft” €5')
    expect(sanitize('Чернетка').text).toBe('Chernetka')
    const r = sanitize('Draft 草稿')
    expect(r.text).toBe('Draft ??')
    expect(r.changed).toEqual(['草', '稿'])
  })
  it('parses page selections', () => {
    expect(parsePages('all', 3).pages).toEqual([1, 2, 3])
    expect(parsePages('odd', 5).pages).toEqual([1, 3, 5])
    expect(parsePages('1-2, 5-, 4', 6).pages).toEqual([1, 2, 4, 5, 6])
    expect(parsePages('-2', 6).pages).toEqual([1, 2])
    expect(parsePages('9', 6).error).toBeTruthy()
  })
  it('rotates boxes and finds origins', () => {
    const [bw, bh] = rotatedBox(100, 0, 90)
    expect(bw).toBeCloseTo(0)
    expect(bh).toBeCloseTo(100)
    expect(originFor(50, 50, 100, 20, 0)).toEqual([0, 40])
    const [x, y] = originFor(0, 0, 100, 0, 90)
    expect(x).toBeCloseTo(0)
    expect(y).toBeCloseTo(-50)
  })
  it('places copies', () => {
    expect(centers(600, 800, 100, 20, 0, 'center', 30, 0)).toEqual([[300, 400]])
    expect(centers(600, 800, 100, 20, 0, 'top-left', 30, 0)).toEqual([[80, 760]])
    expect(centers(600, 800, 100, 20, 0, 'tile', 30, 50).length).toBeGreaterThan(20)
    expect(hexToRgb('#ff0080')).toEqual([1, 0, 128 / 255])
  })
})
