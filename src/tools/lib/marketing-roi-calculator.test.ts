import { describe, expect, it } from 'vitest'
import { blended, breakEvenRoas, metrics, total, type Channel } from './marketing-roi-calculator'

const c: Channel = { id: 'a', name: 'Search', spend: 5000, impressions: 250000, clicks: 5000, leads: 400, customers: 50, revenue: 20000 }
const e = { margin: 0.6, arpu: 100, lifetime: 24, fixed: 2000 }

describe('marketing-roi-calculator', () => {
  it('computes funnel and return metrics', () => {
    const m = metrics(c, e)
    expect(m.roas).toBe(4)
    expect(m.roi).toBe(3)
    expect(m.profitRoi).toBeCloseTo((12000 - 5000) / 5000)
    expect(m.cac).toBe(100)
    expect(m.cpl).toBe(12.5)
    expect(m.cpc).toBe(1)
    expect(m.cpm).toBe(20)
    expect(m.ctr).toBe(0.02)
    expect(m.leadRate).toBe(0.08)
    expect(m.closeRate).toBe(0.125)
    expect(m.ltv).toBe(1440)
    expect(m.ltvCac).toBeCloseTo(14.4)
    expect(m.payback).toBeCloseTo(100 / 60)
  })
  it('handles zero denominators and totals', () => {
    const z = metrics({ ...c, customers: 0, spend: 0 }, e)
    expect(Number.isNaN(z.cac)).toBe(true)
    expect(Number.isNaN(z.roas)).toBe(true)
    const t = total([c, c])
    expect(t.spend).toBe(10000)
    expect(breakEvenRoas(0.5)).toBe(2)
    const b = blended([c], e)
    expect(b.net).toBe(12000 - 7000)
    expect(b.roi).toBeCloseTo(5000 / 7000)
  })
})
