import { describe, expect, it } from 'vitest'
import { parseDisplay } from './latex-equation-editor'
import { exact, makeQuestion, quadrant, radTex, radText, refAngle, rng, snap, type Fn } from './unit-circle-trainer'

const R = Math.PI / 180
const ref: Record<Fn, (x: number) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  csc: (x) => 1 / Math.sin(x), sec: (x) => 1 / Math.cos(x), cot: (x) => Math.cos(x) / Math.sin(x),
}

describe('unit circle trainer', () => {
  it('exact values match Math for every multiple of 15° and parse as LaTeX', () => {
    for (let d = -360; d <= 720; d += 15)
      for (const fn of Object.keys(ref) as Fn[]) {
        const e = exact(fn, d)!
        const v = ref[fn](d * R)
        if (Number.isNaN(e.value)) expect(Math.abs(v)).toBeGreaterThan(1e12)
        else expect(e.value).toBeCloseTo(v, 9)
        expect(() => parseDisplay(e.tex)).not.toThrow()
      }
    expect(exact('sin', 10)).toBeNull()
    expect(exact('cos', 150)!.tex).toBe('-\\frac{\\sqrt{3}}{2}')
  })
  it('quadrants, reference angles and snapping', () => {
    expect(quadrant(135)).toBe(2)
    expect(quadrant(-30)).toBe(4)
    expect(quadrant(270)).toBe(0)
    expect(refAngle(210)).toBe(30)
    expect(refAngle(300)).toBe(60)
    expect(snap(44, 15)).toBe(45)
    expect(snap(359, 30)).toBe(0)
  })
  it('radian formatting', () => {
    expect(radTex(150)).toBe('\\frac{5\\pi}{6}')
    expect(radTex(180)).toBe('\\pi')
    expect(radTex(30)).toBe('\\frac{\\pi}{6}')
    expect(radTex(-90)).toBe('-\\frac{\\pi}{2}')
    expect(radText(270)).toBe('3π/2')
    expect(radText(360)).toBe('2π')
  })
  it('questions have four distinct options including the answer', () => {
    const r = rng(42)
    for (let i = 0; i < 200; i++) {
      const q = makeQuestion(r, ['sin', 'cos', 'tan'], [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330], i % 2 === 0)
      expect(new Set(q.options).size).toBe(4)
      expect(q.options).toContain(q.answer)
    }
  })
})
