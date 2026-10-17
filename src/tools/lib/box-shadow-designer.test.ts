import { describe, expect, it } from 'vitest'
import { hexToRgb, layerCss, parseShadow, shadowCss, smooth } from './box-shadow-designer'

let n = 0
const id = () => String(++n)

describe('box shadow designer', () => {
  it('generates CSS', () => {
    expect(layerCss({ id: 'a', x: 0, y: 4, blur: 6, spread: -1, color: '#000000', alpha: 0.1, inset: false, on: true })).toBe('0 4px 6px -1px rgb(0 0 0 / 0.1)')
    expect(shadowCss([{ id: 'a', x: 1, y: 1, blur: 0, spread: 0, color: '#ff0000', alpha: 1, inset: true, on: true }], ', ')).toBe('inset 1px 1px 0 0 rgb(255 0 0)')
    expect(shadowCss([])).toBe('none')
    expect(hexToRgb('#abc')).toEqual([170, 187, 204])
  })
  it('parses existing box-shadow values', () => {
    const l = parseShadow('box-shadow: 0 1px 3px rgba(0,0,0,0.12), inset 0 0 0 2px #3b82f6, 2px 2px hsl(0 100% 50% / 50%);', id)
    expect(l).toHaveLength(3)
    expect(l[0]).toMatchObject({ x: 0, y: 1, blur: 3, spread: 0, color: '#000000', alpha: 0.12, inset: false })
    expect(l[1]).toMatchObject({ inset: true, spread: 2, color: '#3b82f6' })
    expect(l[2]).toMatchObject({ x: 2, y: 2, blur: 0, color: '#ff0000', alpha: 0.5 })
    expect(parseShadow('none', id)).toEqual([])
  })
  it('smooth layers sum to the target alpha and end at the target offset', () => {
    const s = smooth(5, 0, 40, 60, 0.3, '#000000', id)
    expect(s).toHaveLength(5)
    expect(s.at(-1)).toMatchObject({ y: 40, blur: 60 })
    expect(s.reduce((a, l) => a + l.alpha, 0)).toBeCloseTo(0.3)
  })
})
