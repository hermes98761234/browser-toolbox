import { describe, expect, it } from 'vitest'
import { css, DEFAULT_BPS, layout, overlayCss, pick, spanWidth } from './grid-layout-designer'

describe('grid layout', () => {
  it('computes column width and positions', () => {
    // 1440 viewport, max 1280, margin 40, 12 cols, 24 gutter → content 1200, col = (1200 − 264)/12 = 78
    const l = layout(DEFAULT_BPS[2], 1440)
    expect(l.container).toBe(1280)
    expect(l.offset).toBe(80)
    expect(l.colW).toBeCloseTo(78, 9)
    expect(l.cols[0].x0).toBe(120)
    expect(l.cols[11].x1).toBeCloseTo(1440 - 120, 9)
    expect(spanWidth(l, 3, 24)).toBeCloseTo(3 * 78 + 48, 9)
  })
  it('is fluid without a max width', () => {
    const l = layout(DEFAULT_BPS[0], 375)
    expect(l.container).toBe(375)
    expect(l.colW).toBeCloseTo((375 - 32 - 48) / 4, 9)
    expect(l.valid).toBe(true)
    expect(layout({ ...DEFAULT_BPS[0], margin: 200 }, 375).valid).toBe(false)
  })
  it('picks breakpoints by min width', () => {
    expect(pick(DEFAULT_BPS, 320).id).toBe('xs')
    expect(pick(DEFAULT_BPS, 600).id).toBe('md')
    expect(pick(DEFAULT_BPS, 1600).id).toBe('lg')
  })
  it('exports mobile-first CSS', () => {
    const c = css(DEFAULT_BPS)
    expect(c).toContain('grid-template-columns: repeat(var(--grid-columns), minmax(0, 1fr));')
    expect(c).toContain('@media (min-width: 600px)')
    expect(c).toContain('--grid-max: 1280px;')
    expect(c.indexOf('600px')).toBeLessThan(c.indexOf('1024px'))
    expect(overlayCss(DEFAULT_BPS[2])).toContain('--cols: 12')
  })
})
