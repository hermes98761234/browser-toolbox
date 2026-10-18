import { describe, expect, it } from 'vitest'
import { parseCsv } from './chart-builder'
import { analyze, money, parseBands, parseEmps, quantile, SAMPLE_BANDS, SAMPLE_EMPS } from './salary-band-visualizer'

describe('salary bands', () => {
  it('parses money strings', () => {
    expect(money('$85,000')).toBe(85000)
    expect(money('85k')).toBe(85000)
    expect(money('€72.5K')).toBe(72500)
    expect(money('abc')).toBeNaN()
  })
  it('parses tables with flexible headers', () => {
    const b = parseBands([['Grade', 'Minimum', 'Maximum'], ['A', '10', '20'], ['B', '30', '20']])
    expect(b.bands).toEqual([{ level: 'A', min: 10, mid: 15, max: 20 }])
    expect(b.errors[0]).toMatch(/min is above max/)
    const e = parseEmps([['Employee', 'Grade', 'Base pay'], ['X', 'A', '12'], ['Y', 'A', 'n/a']])
    expect(e.emps).toEqual([{ name: 'X', level: 'A', salary: 12, dept: '' }])
    expect(e.errors).toHaveLength(1)
  })
  it('computes compa-ratio, penetration, outliers and costs', () => {
    const bands = parseBands(parseCsv(SAMPLE_BANDS)).bands
    const emps = parseEmps(parseCsv(SAMPLE_EMPS)).emps
    const a = analyze(bands, emps)
    const blake = a.rows.find((r) => r.name === 'Blake Rivera')!
    expect(blake.status).toBe('below')
    expect(blake.cr).toBeCloseTo(47000 / 56000)
    expect(blake.outlier).toBe(true)
    const kai = a.rows.find((r) => r.name === 'Kai Bennett')!
    expect(kai.pen).toBeCloseTo((90500 - 72000) / 26000)
    expect(kai.status).toBe('high')
    expect(a.costToMin).toBe(1000 + 2000) // Blake 48k, Sage 90k
    expect(a.overMax).toBe(2500 + 1500 + 4500) // Indy, Noel, Xen
    expect(a.stats.find((s) => s.level === 'L3 Senior')!.n).toBe(6)
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5)
    expect(a.noBand).toBe(0)
  })
})
