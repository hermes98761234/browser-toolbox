import { describe, expect, it } from 'vitest'
import { EASE, frameCount, progress, stagger, total } from './lower-third-designer'

const c = { tIn: 1, hold: 3, tOut: 0.5 }

describe('lower third timeline', () => {
  it('runs in → hold → out → done', () => {
    expect(total(c)).toBe(4.5)
    expect(progress(0, c)).toEqual({ p: 0, phase: 'in' })
    expect(progress(0.5, c)).toEqual({ p: 0.5, phase: 'in' })
    expect(progress(2, c)).toEqual({ p: 1, phase: 'hold' })
    expect(progress(4.25, c).p).toBeCloseTo(0.5)
    expect(progress(4.25, c).phase).toBe('out')
    expect(progress(5, c)).toEqual({ p: 0, phase: 'done' })
  })
  it('handles zero-length phases', () => {
    expect(progress(0, { tIn: 0, hold: 1, tOut: 0 }).p).toBe(1)
  })
  it('eases start at 0 and end at 1', () => {
    for (const f of Object.values(EASE)) {
      expect(f(0)).toBeCloseTo(0, 6)
      expect(f(1)).toBeCloseTo(1, 6)
    }
    expect(EASE.back(0.7)).toBeGreaterThan(1) // overshoot
  })
  it('staggers and counts frames', () => {
    expect(stagger(0.2, 0.2)).toBe(0)
    expect(stagger(1, 0.4)).toBe(1)
    expect(stagger(0.5, 0, 0.5)).toBe(1)
    expect(frameCount(c, 30)).toBe(135)
  })
})
