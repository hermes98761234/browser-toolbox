import { describe, expect, it } from 'vitest'
import { fit, hole, IT, parseZone, shaft, stepOf, unitI, type Letter } from './fit-tolerance-calculator'

const F = { published: false }
const P = { published: true }
const sh = (l: Letter, g: number, d: number, o = F) => { const r = shaft(l, g, d, o)!; return [r.upper, r.lower] }
const ho = (l: Letter, g: number, d: number, o = F) => { const r = hole(l, g, d, o)!; return [r.upper, r.lower] }

describe('ISO 286 from formulas', () => {
  it('size steps and tolerance unit', () => {
    expect(stepOf(25)).toEqual([18, 30])
    expect(stepOf(30)).toEqual([18, 30]) // "over 18 up to and including 30"
    expect(stepOf(50)).toEqual([30, 50])
    expect(unitI(Math.sqrt(18 * 30))).toBeCloseTo(1.3076, 3)
  })
  it('IT grades by formula and the ×10 rule', () => {
    expect(IT(7, 25, F)).toBe(21)
    expect(IT(6, 25, F)).toBe(13)
    expect(IT(8, 25, F)).toBe(33)
    expect(IT(9, 25, F)).toBe(52)
    expect(IT(11, 25, F)).toBe(130)
    expect(IT(12, 25, F)).toBe(210)
    expect(IT(16, 25, F)).toBe(1300)
    expect(IT(7, 50, F)).toBe(25)
    expect(IT(8, 100, F)).toBe(54)
    // published table snapping for small sizes
    expect(IT(7, 10, P)).toBe(15)
  })
  it('the brief’s reference values', () => {
    expect(ho('h', 7, 25)).toEqual([21, 0]) // H7
    expect(sh('g', 6, 25)).toEqual([-7, -20]) // g6
    expect(sh('p', 6, 50)).toEqual([42, 26]) // p6
  })
  it('more textbook shaft zones at 25 mm', () => {
    expect(sh('f', 7, 25)).toEqual([-20, -41])
    expect(sh('e', 8, 25)).toEqual([-40, -73])
    expect(sh('h', 6, 25)).toEqual([0, -13])
    expect(sh('js', 6, 25)).toEqual([6.5, -6.5])
    expect(sh('k', 6, 25)).toEqual([15, 2])
    expect(sh('m', 6, 25)).toEqual([21, 8])
    expect(sh('n', 6, 25)).toEqual([28, 15])
    expect(sh('p', 6, 25)).toEqual([35, 22])
    expect(sh('r', 6, 25)).toEqual([41, 28])
    expect(sh('s', 6, 25)).toEqual([48, 35])
    expect(sh('u', 6, 28)).toEqual([61, 48])
    expect(sh('k', 6, 50)).toEqual([18, 2])
    expect(sh('n', 6, 50)).toEqual([33, 17])
    expect(sh('s', 6, 50)).toEqual([59, 43])
  })
  it('holes: A–H mirror, Δ rule for K–ZC', () => {
    expect(ho('f', 8, 25)).toEqual([53, 20]) // F8
    expect(ho('g', 7, 25)).toEqual([28, 7]) // G7
    expect(ho('k', 7, 25)).toEqual([6, -15]) // K7: −2 + Δ(8)
    expect(ho('m', 7, 25)).toEqual([0, -21]) // M7
    expect(ho('n', 7, 25)).toEqual([-7, -28]) // N7
    expect(ho('p', 7, 25)).toEqual([-14, -35]) // P7
    expect(ho('s', 7, 25)).toEqual([-27, -48]) // S7
    expect(ho('p', 7, 10, P)).toEqual([-9, -24]) // P7 at 10 mm with published IT
    expect(ho('p', 8, 25)).toEqual([-22, -55]) // above IT7: no Δ
  })
  it('fit classification', () => {
    const H7 = hole('h', 7, 25, F)!
    expect(fit(H7, shaft('g', 6, 25, F)!)).toMatchObject({ maxClear: 41, minClear: 7, kind: 'clearance' })
    expect(fit(H7, shaft('k', 6, 25, F)!)).toMatchObject({ maxClear: 19, minClear: -15, kind: 'transition' })
    expect(fit(hole('h', 7, 50, F)!, shaft('p', 6, 50, F)!)).toMatchObject({ maxClear: -1, minClear: -42, kind: 'interference' })
  })
  it('zone parser', () => {
    expect(parseZone('H7')).toEqual({ letter: 'h', grade: 7, isHole: true })
    expect(parseZone('js6')).toEqual({ letter: 'js', grade: 6, isHole: false })
    expect(parseZone('ZC10')).toEqual({ letter: 'zc', grade: 10, isHole: true })
    expect(parseZone('Q7')).toBeNull()
  })
})
