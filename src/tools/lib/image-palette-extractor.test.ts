import { describe, expect, it } from 'vitest'
import { aseBytes, cssVars, gpl, hex, hsl, kmeans, rgbToLab, textOn } from './image-palette-extractor'

function img(cols: [number, number, number, number][]) {
  const d = new Uint8ClampedArray(cols.length * 4)
  cols.forEach((c, i) => d.set(c, i * 4))
  return d
}

describe('image-palette-extractor', () => {
  it('converts colours', () => {
    const lab = rgbToLab([255, 255, 255])
    expect(lab[0]).toBeCloseTo(100, 3)
    expect(Math.abs(lab[1])).toBeLessThan(0.01)
    expect(rgbToLab([255, 0, 0])[0]).toBeCloseTo(53.24, 1)
    expect(hex([255, 128, 0])).toBe('#ff8000')
    expect(hsl([255, 0, 0])).toEqual([0, 100, 50])
    expect(textOn([255, 255, 0])).toBe('#000000')
    expect(textOn([0, 0, 128])).toBe('#ffffff')
  })
  it('finds dominant clusters and skips transparent pixels', () => {
    const px: [number, number, number, number][] = []
    for (let i = 0; i < 300; i++) px.push([250 + (i % 3), 10, 10, 255])
    for (let i = 0; i < 100; i++) px.push([10, 10, 240 + (i % 5), 255])
    for (let i = 0; i < 500; i++) px.push([0, 255, 0, 0])
    const c = kmeans(img(px), 2)
    expect(c.length).toBe(2)
    expect(c[0].rgb[0]).toBeGreaterThan(240)
    expect(c[0].share).toBeCloseTo(0.75, 6)
    expect(c[1].rgb[2]).toBeGreaterThan(235)
    expect(kmeans(img([[1, 2, 3, 0]]), 3)).toEqual([])
  })
  it('writes ASE, GPL and CSS', () => {
    const b = aseBytes([[255, 0, 0]], ['Red'])
    expect(String.fromCharCode(...b.slice(0, 4))).toBe('ASEF')
    const blockLen = 2 + 4 * 2 + 4 + 12 + 2
    expect(b.length).toBe(12 + 6 + blockLen)
    const dv = new DataView(b.buffer)
    expect(dv.getUint32(8)).toBe(1)
    expect(dv.getUint32(14)).toBe(blockLen)
    expect(dv.getFloat32(12 + 6 + 2 + 8 + 4)).toBe(1)
    expect(gpl([[1, 2, 3]], ['x'])).toContain('  1   2   3\tx')
    expect(cssVars([[0, 0, 0]])).toBe(':root {\n  --color-1: #000000;\n}\n')
  })
})
