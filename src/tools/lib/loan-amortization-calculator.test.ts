import { describe, expect, it } from 'vitest'
import { basePayment, byYear, payment, schedule, summary, toXlsx, type LoanIn } from './loan-amortization-calculator'
import { unzip } from './excel-to-csv'

const L: LoanIn = { principal: 200000, apr: 6, years: 30, freq: 'monthly', start: '2026-01-01', extra: 0, yearlyExtra: 0, yearlyMonth: 12, lumps: [] }

describe('loan-amortization-calculator', () => {
  it('matches the standard mortgage payment', () => {
    expect(payment(200000, 0.005, 360)).toBeCloseTo(1199.1, 1)
    expect(payment(1200, 0, 12)).toBe(100)
    expect(basePayment({ ...L, freq: 'accelerated' })).toBeCloseTo(599.55, 2)
  })
  it('amortizes to zero with known total interest', () => {
    const rows = schedule(L)
    expect(rows).toHaveLength(360)
    expect(rows[0].interest).toBe(1000)
    expect(rows[0].principal).toBeCloseTo(199.1, 2)
    expect(rows[359].balance).toBe(0)
    expect(summary(rows).interest).toBeCloseTo(231676, -2)
    expect(rows[1].date).toBe('2026-02-01')
  })
  it('extra payments shorten the loan and save interest', () => {
    const base = summary(schedule(L))
    const ex = summary(schedule({ ...L, extra: 200 }))
    expect(ex.periods).toBeLessThan(300)
    expect(ex.interest).toBeLessThan(base.interest - 60000)
    const lump = schedule({ ...L, lumps: [{ date: '2026-03-15', amount: 10000 }] })
    expect(lump[3].extra).toBe(10000) // paid with the 2026-04-01 instalment
    expect(lump.filter((r) => r.extra > 0)).toHaveLength(1)
    const yearly = schedule({ ...L, yearlyExtra: 1000, yearlyMonth: 6 })
    expect(yearly.filter((r) => r.extra > 0)[0].date).toBe('2026-06-01')
    expect(schedule({ ...L, extra: 200 }, false)).toHaveLength(360)
  })
  it('handles bi-weekly and yearly totals', () => {
    const bw = schedule({ ...L, freq: 'accelerated' })
    expect(bw.length).toBeLessThan(26 * 30)
    expect(bw[1].date).toBe('2026-01-15')
    const y = byYear(schedule(L))
    expect(y[0].year).toBe('2026')
    expect(y[0].interest + y[0].principal).toBeCloseTo(1199.1 * 12, 0)
  })
  it('writes a readable xlsx', async () => {
    const z = await unzip(await toXlsx('Schedule', [['n', 'Balance'], [1, 99.5]]))
    const ws = new TextDecoder().decode(z.get('xl/worksheets/sheet1.xml'))
    expect(ws).toContain('<v>99.5</v>')
    expect(ws).toContain('<t>Balance</t>')
  })
})
