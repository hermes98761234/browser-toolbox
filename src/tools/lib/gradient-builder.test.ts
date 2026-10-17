import { describe, expect, it } from 'vitest'
import { css, hexToRgb, mix, oklabToRgb, positionAt, rgbToHex, rgbToOklab, sample, type Stop } from './gradient-builder'

describe('gradient colour maths', () => {
  it('converts to OKLab (reference values)', () => {
    const [L, a, b] = rgbToOklab(hexToRgb('#ff0000'))
    expect(L).toBeCloseTo(0.628, 3)
    expect(a).toBeCloseTo(0.2249, 3)
    expect(b).toBeCloseTo(0.1258, 3)
    expect(rgbToOklab([1, 1, 1])[0]).toBeCloseTo(1, 4)
  })
  it('round-trips', () => {
    for (const h of ['#123456', '#ff8800', '#00ffcc', '#808080']) expect(rgbToHex(oklabToRgb(rgbToOklab(hexToRgb(h))))).toBe(h)
  })
  it('interpolates', () => {
    const [mid] = mix('srgb', [0, 0, 0], 1, [1, 1, 1], 1, 0.5)
    expect(mid[0]).toBeCloseTo(0.5)
    // blue→yellow in OKLCH keeps chroma (no grey middle)
    const [c] = mix('oklch', hexToRgb('#0000ff'), 1, hexToRgb('#ffff00'), 1, 0.5)
    expect(Math.max(...c) - Math.min(...c)).toBeGreaterThan(0.3)
    const [g] = mix('srgb', hexToRgb('#0000ff'), 1, hexToRgb('#ffff00'), 1, 0.5)
    expect(Math.max(...g) - Math.min(...g)).toBeLessThan(0.01)
  })
  it('samples stops and geometry', () => {
    const st: Stop[] = [{ id: 'a', color: '#000000', pos: 0, alpha: 1 }, { id: 'b', color: '#ffffff', pos: 100, alpha: 1 }]
    expect(sample(st, 'srgb', 50)[0][0]).toBeCloseTo(0.5)
    const g = { kind: 'linear' as const, angle: 90, cx: 50, cy: 50 }
    expect(positionAt(g, 0, 5, 100, 10)).toBeCloseTo(0)
    expect(positionAt(g, 100, 5, 100, 10)).toBeCloseTo(100)
    expect(positionAt({ ...g, kind: 'conic', angle: 0 }, 60, 50, 100, 100)).toBeCloseTo(25)
    expect(css(st, 'oklch', g)).toBe('linear-gradient(in oklch 90deg, #000000 0%, #ffffff 100%)')
  })
})
