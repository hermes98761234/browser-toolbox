import { describe, expect, it } from 'vitest'
import { classify, contain, DEFAULT_RULES, ELEMENTS, fitText, resolve, SIZES, wrap, type Rule } from './banner-ad-resizer'

const mono = (t: string, s: number) => t.length * s * 0.5
const rule = (p: Partial<Rule>): Rule => ({ show: true, h: 'left', v: 'top', x: 0, y: 0, w: 50, hh: 50, align: 'left', lines: 2, ...p })

describe('layout engine', () => {
  it('classifies sizes', () => {
    expect(classify(728, 90)).toBe('strip')
    expect(classify(160, 600)).toBe('tall')
    expect(classify(300, 250)).toBe('box')
    expect(classify(1200, 628)).toBe('box')
  })
  it('resolves anchors', () => {
    expect(resolve(rule({ h: 'right', v: 'bottom', x: 10, y: 10, w: 20, hh: 20 }), 300, 250)).toEqual({ x: 210, y: 175, w: 60, h: 50 })
    expect(resolve(rule({ h: 'center', v: 'middle', x: 0, y: 0, w: 50, hh: 50 }), 200, 100)).toEqual({ x: 50, y: 25, w: 100, h: 50 })
    expect(resolve(rule({ h: 'center', v: 'middle', x: 10, y: -10, w: 50, hh: 50 }), 200, 100)).toEqual({ x: 70, y: 15, w: 100, h: 50 })
  })
  it('contain-fits images keeping aspect and anchor', () => {
    expect(contain({ x: 0, y: 0, w: 200, h: 100 }, 100, 100, 'right', 'top')).toEqual({ x: 100, y: 0, w: 100, h: 100 })
    expect(contain({ x: 10, y: 10, w: 100, h: 300 }, 200, 100, 'center', 'middle')).toEqual({ x: 10, y: 135, w: 100, h: 50 })
  })
  it('default rules keep every element inside the artboard for every IAB size', () => {
    for (const s of SIZES) {
      const rules = DEFAULT_RULES[classify(s.w, s.h)]
      for (const e of ELEMENTS) {
        const r = resolve(rules[e.id], s.w, s.h)
        expect(r.x).toBeGreaterThanOrEqual(-0.01)
        expect(r.y).toBeGreaterThanOrEqual(-0.01)
        expect(r.x + r.w).toBeLessThanOrEqual(s.w + 0.01)
        expect(r.y + r.h).toBeLessThanOrEqual(s.h + 0.01)
      }
    }
  })
})

describe('text fitting', () => {
  it('wraps greedily', () => {
    expect(wrap('aa bb cc dd', 10, 30, mono)).toEqual(['aa bb', 'cc dd'])
  })
  it('finds the largest size that fits lines and height', () => {
    const r = fitText('Hello big world', { w: 100, h: 60 }, 2, mono)
    // 2 lines of ≤ 9 chars: size ≤ 100/(9*0.5)=22.2, height 2*1.15*s ≤ 60 → s ≤ 26
    expect(r.size).toBeGreaterThan(21)
    expect(r.size).toBeLessThanOrEqual(22.25)
    expect(r.lines.length).toBe(2)
    for (const l of r.lines) expect(mono(l, r.size)).toBeLessThanOrEqual(100.5)
  })
  it('respects max lines', () => {
    const r = fitText('one two three four five six', { w: 100, h: 1000 }, 1, mono)
    expect(r.lines.length).toBe(1)
    expect(mono(r.lines[0], r.size)).toBeLessThanOrEqual(100.5)
  })
})
