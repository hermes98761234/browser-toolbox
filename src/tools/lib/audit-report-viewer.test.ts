import { describe, expect, it } from 'vitest'
import { bucket, compare, fmtKiB, fmtMs, parseReport, plain, SAMPLE_REPORT } from './audit-report-viewer'

describe('parseReport', () => {
  const r = parseReport(SAMPLE_REPORT)
  it('reads header and categories', () => {
    expect(r.url).toBe('https://shop.example.test/')
    expect(r.version).toBe('12.2.0')
    expect(r.formFactor).toBe('mobile')
    expect(r.categories.map((c) => [c.id, c.score])).toEqual([['performance', 0.58], ['accessibility', 0.86], ['best-practices', 0.92], ['seo', 0.9]])
    const a11y = r.categories[1]
    expect(a11y.failing.map((f) => f.id).sort()).toEqual(['color-contrast', 'image-alt'])
    expect(a11y.passed).toBe(3)
  })
  it('extracts metrics with weights', () => {
    expect(r.metrics.map((m) => m.short)).toEqual(['FCP', 'LCP', 'TBT', 'CLS', 'SI'])
    expect(r.metrics.find((m) => m.short === 'TBT')!.weight).toBe(30)
  })
  it('sorts opportunities by savings and drops passing ones', () => {
    expect(r.opportunities.map((o) => o.id)).toEqual(['unused-javascript', 'render-blocking-resources', 'uses-responsive-images', 'modern-image-formats', 'offscreen-images'])
    expect(r.opportunities[0].savingsBytes).toBe(288000)
    expect(r.opportunities[0].headings.map((h) => h.key)).toEqual(['url', 'totalBytes', 'wastedBytes'])
  })
  it('collects diagnostics', () => {
    const ids = r.diagnostics.map((d) => d.id)
    expect(ids[0]).toBe('mainthread-work-breakdown')
    expect(ids).toContain('third-party-summary')
    expect(ids).not.toContain('color-contrast')
  })
  it('unwraps PageSpeed Insights responses and rejects junk', () => {
    expect(parseReport({ lighthouseResult: SAMPLE_REPORT }).url).toBe(r.url)
    expect(() => parseReport({ foo: 1 })).toThrow(/not a Lighthouse/)
  })
})

describe('helpers', () => {
  it('format and bucket', () => {
    expect(plain('Use [this](https://x) `code`')).toBe('Use this code')
    expect(bucket(0.9)).toBe('pass')
    expect(bucket(0.5)).toBe('average')
    expect(bucket(0.49)).toBe('fail')
    expect(bucket(null)).toBe('na')
    expect(fmtMs(860)).toBe('860 ms')
    expect(fmtMs(5120)).toBe('5.1 s')
    expect(fmtKiB(288000)).toBe('281 KiB')
  })
  it('compares reports', () => {
    const a = parseReport(SAMPLE_REPORT)
    const b = parseReport({ ...SAMPLE_REPORT, categories: { ...SAMPLE_REPORT.categories, performance: { ...SAMPLE_REPORT.categories.performance, score: 0.71 } } })
    const c = compare(a, b)
    expect(c.cats[0]).toEqual({ id: 'performance', title: 'Performance', a: 58, b: 71, delta: 13 })
    expect(c.metrics).toHaveLength(5)
  })
})
