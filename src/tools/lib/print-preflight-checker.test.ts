import { describe, expect, it } from 'vitest'
import { effectivePpi, gamutExcess, inspect, maxChroma, parseIcc, ppiForDistance, ppiRating, tac } from './print-preflight-checker'

describe('resolution', () => {
  it('effective PPI', () => {
    // 3000 × 2000 px on 10 × 8 in: 300 × 250 ppi
    expect(effectivePpi(3000, 2000, 10, 8, 'cover').ppi).toBe(250)
    expect(effectivePpi(3000, 2000, 10, 8, 'fit').ppi).toBe(300)
    expect(ppiRating(300).tone).toBe('ok')
    expect(ppiRating(100).tone).toBe('err')
    expect(ppiForDistance(11.46)).toBeCloseTo(300, 0)
  })
})

describe('approximate gamut and ink', () => {
  it('flags saturated RGB primaries but not neutrals or skin tones', () => {
    expect(gamutExcess(0, 0, 255)).toBeGreaterThan(10)
    expect(gamutExcess(0, 255, 0)).toBeGreaterThan(10)
    expect(gamutExcess(128, 128, 128)).toBe(0)
    expect(gamutExcess(224, 172, 140)).toBe(0)
    expect(gamutExcess(40, 90, 140)).toBe(0)
    expect(maxChroma(10, 0)).toBe(0)
  })
  it('ink coverage', () => {
    expect(tac(255, 255, 255)).toBe(0)
    expect(tac(0, 0, 0, 0.5)).toBeCloseTo(350, 9)
    expect(tac(0, 0, 0, 1)).toBe(100)
    expect(tac(0, 255, 255, 0.5)).toBeCloseTo(100, 9)
  })
})

describe('metadata', () => {
  it('JPEG JFIF density and SOF size', () => {
    const jpg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 1, 0, 150, 0, 150, 0, 0,
      0xff, 0xc0, 0, 17, 8, 0x02, 0x58, 0x03, 0x20, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9])
    const m = inspect(jpg)
    expect(m).toMatchObject({ format: 'JPEG', dpi: [150, 150], width: 800, height: 600, components: 3, bitDepth: 8 })
  })
  it('ICC header with v2 desc tag', () => {
    const p = new Uint8Array(200)
    p.set([0, 0, 0, 200], 0)
    p[8] = 2; p[9] = 0x10
    p.set([...'mntrRGB XYZ '].map((c) => c.charCodeAt(0)), 12)
    p.set([0, 0, 0, 1], 128)
    p.set([...'desc'].map((c) => c.charCodeAt(0)), 132)
    p.set([0, 0, 0, 144], 136)
    p.set([0, 0, 0, 40], 140)
    p.set([...'desc'].map((c) => c.charCodeAt(0)), 144)
    p.set([0, 0, 0, 5], 152)
    p.set([...'sRGB'].map((c) => c.charCodeAt(0)), 156)
    expect(parseIcc(p)).toEqual({ space: 'RGB', cls: 'Display', version: '2.1', desc: 'sRGB', size: 200 })
  })
  it('PNG pHYs', () => {
    const chunk = (type: string, data: number[]) => [0, 0, 0, data.length, ...[...type].map((c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0]
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, ...chunk('IHDR', [0, 0, 1, 0, 0, 0, 0, 200, 8, 6, 0, 0, 0]), ...chunk('pHYs', [0, 0, 0x2e, 0x23, 0, 0, 0x2e, 0x23, 1]), ...chunk('IEND', [])])
    const m = inspect(png)
    expect(m.width).toBe(256)
    expect(m.height).toBe(200)
    expect(m.dpi![0]).toBeCloseTo(300, 0) // 11811 px/m
  })
})
