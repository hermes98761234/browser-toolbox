import { describe, expect, it } from 'vitest'
import { assignRoles, balance, fromLch, harmonies, labToRgb, lch, lrv, lrvSteps, regions, rgbToLab, undertone, type RGB } from './room-palette-extractor'

describe('room-palette-extractor', () => {
  it('LRV follows CIE Y', () => {
    expect(lrv([255, 255, 255])).toBeCloseTo(100, 5)
    expect(lrv([0, 0, 0])).toBe(0)
    expect(lrv([119, 119, 119])).toBeCloseTo(18.4, 0)
  })
  it('Lab round trip', () => {
    for (const c of [[200, 120, 40], [12, 80, 200], [240, 235, 225]] as RGB[]) {
      const back = labToRgb(rgbToLab(c))
      back.forEach((v, i) => expect(Math.abs(v - c[i])).toBeLessThanOrEqual(1))
    }
    const [L, C, h] = lch([200, 120, 40])
    expect(fromLch(L, C, h)).toEqual([200, 120, 40])
  })
  it('undertones', () => {
    expect(undertone([128, 128, 128]).kind).toBe('neutral')
    expect(undertone([240, 230, 210]).kind).toBe('warm')
    expect(undertone([210, 225, 240]).kind).toBe('cool')
    expect(undertone([40, 90, 200]).label).toBe('Cool blue')
  })
  it('regions and roles', () => {
    // 10×10: top 6 rows beige wall, a red dot, bottom 4 rows brown floor
    const w = 10, h = 10, d = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = y >= 6 ? [110, 70, 40] : x === 5 && y === 2 ? [220, 30, 40] : [230, 220, 200]
      d.set([...c, 255], (y * w + x) * 4)
    }
    const r = regions(d, w, h, [[230, 220, 200], [110, 70, 40], [220, 30, 40]], 1)
    expect(r[0].share).toBeCloseTo(0.59, 5)
    expect(r[1].y).toBeGreaterThan(0.6)
    const roles = assignRoles(r)
    expect(roles.accent).toBe(2)
    expect(roles.floor).toBe(1)
    expect(roles.wall).toBe(0)
  })
  it('balance score is 1 for exact 60-30-10', () => {
    expect(balance({ wall: 0.5, trim: 0.1, furnishing: 0.2, floor: 0.1, accent: 0.1 }).score).toBeCloseTo(1, 10)
    expect(balance({ wall: 1, trim: 0, furnishing: 0, floor: 0, accent: 0 }).score).toBeLessThan(0.6)
  })
  it('harmonies and LRV steps', () => {
    const hs = harmonies([60, 110, 160])
    expect(hs.map((x) => x.name)).toContain('Triadic')
    const steps = lrvSteps([60, 110, 160], [70, 30])
    expect(lrv(steps[0])).toBeCloseTo(70, 0)
    expect(lrv(steps[1])).toBeCloseTo(30, 0)
  })
})
