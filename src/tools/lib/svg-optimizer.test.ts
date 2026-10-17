import { describe, expect, it } from 'vitest'
import { fmtNum, joinNums, minifyPath, parsePath, roundList, shortColor, toAbsolute } from './svg-optimizer'

describe('svg-optimizer numbers', () => {
  it('formats numbers compactly', () => {
    expect(fmtNum(0.5, 3)).toBe('.5')
    expect(fmtNum(-0.25, 3)).toBe('-.25')
    expect(fmtNum(12.34567, 2)).toBe('12.35')
    expect(fmtNum(-0.0001, 3)).toBe('0')
    expect(fmtNum(1e-7, 3)).toBe('0')
    expect(fmtNum(100, 3)).toBe('100')
  })
  it('joins numbers with minimal separators', () => {
    expect(joinNums(['1', '-2', '.5', '.5', '3'])).toBe('1-2 .5.5 3')
    expect(joinNums(['1.5', '.5'])).toBe('1.5.5')
  })
  it('rounds list attributes', () => {
    expect(roundList('translate(10.00049, 20.5) scale( 2 )', 3)).toBe('translate(10 20.5)scale(2)')
    expect(roundList('0 0 100.0001 50', 2)).toBe('0 0 100 50')
    expect(roundList('12.3456px', 1)).toBe('12.3px')
  })
})

describe('svg-optimizer colors', () => {
  it('shortens colors', () => {
    expect(shortColor('#FFFFFF')).toBe('#fff')
    expect(shortColor('rgb(255, 0, 0)')).toBe('red')
    expect(shortColor('#ff0000')).toBe('red')
    expect(shortColor('white')).toBe('#fff')
    expect(shortColor('rgb(100%,50%,0%)')).toBe('#ff8000')
    expect(shortColor('#d2b48c')).toBe('tan')
    expect(shortColor('url(#g)')).toBe('url(#g)')
    expect(shortColor('#123456')).toBe('#123456')
  })
})

describe('svg-optimizer paths', () => {
  it('parses packed numbers and arc flags', () => {
    expect(parsePath('M1.5.5-2-3')).toEqual([{ c: 'M', a: [1.5, 0.5] }, { c: 'L', a: [-2, -3] }])
    expect(parsePath('a5 5 0 0110 10')[0].a).toEqual([5, 5, 0, 0, 1, 10, 10])
  })
  it('converts to absolute', () => {
    const abs = toAbsolute(parsePath('m10 10 l5 0 h5 v5 z l1 1'))
    expect(abs.map((s) => s.a)).toEqual([[10, 10], [15, 10], [20], [15], [], [11, 11]])
  })
  it('minifies with implicit commands, H/V and relative coords', () => {
    expect(minifyPath('M 10.0000 10.0000 L 20 10 L 20 20 L 10 20 Z', 3)).toBe('M10 10H20V20H10z')
    expect(minifyPath('M100 100 L 101 101 L 102 102', 3)).toBe('M100 100l1 1 1 1')
    expect(minifyPath('M0 0C0.5 0.5 1.5 0.5 2 0', 3)).toBe('M0 0C.5.5 1.5.5 2 0')
  })
  it('minified paths keep the same absolute geometry', () => {
    const d = 'M12.345 67.891 c 1.2 3.4 5.6 7.8 9.1 2.3 s 4 5 6 7 Q 50 50 60 40 t 10 10 A 20 30 15 1 0 80 90 L 80 90.0001 H 3 V 4 z m 5 5 l -1 -1'
    const min = minifyPath(d, 3)
    const a = toAbsolute(parsePath(d)).map((s) => s.a.map((v) => +v.toFixed(3)))
    const b = toAbsolute(parsePath(min)).map((s) => s.a.map((v) => +v.toFixed(3)))
    expect(b.length).toBe(a.length)
    // L to a point with the same x becomes V (1 arg) – compare end points instead
    const ends = (x: number[][]) => x.filter((v) => v.length >= 2).map((v) => v.slice(-2))
    expect(ends(b)).toEqual(ends(a))
    expect(min.length).toBeLessThan(d.length)
  })
})
