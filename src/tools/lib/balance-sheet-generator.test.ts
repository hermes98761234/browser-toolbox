import { describe, expect, it } from 'vitest'
import { balancePdf, fmtAmt, guessSection, parseTrialBalance, ratios, totals, type Account } from './balance-sheet-generator'

const A = (name: string, section: Account['section'], cur: number, quick = false): Account => ({ id: name, name, section, cur, prior: cur / 2, quick })
const acc = [A('Cash', 'ca', 50, true), A('Inventory', 'ca', 30), A('Equipment', 'nca', 100), A('Acc. depreciation', 'nca', -20), A('Payables', 'cl', 40), A('Loan', 'ncl', 60), A('Capital', 'eq', 50), A('Retained earnings', 'eq', 10)]

describe('balance-sheet-generator', () => {
  it('totals and checks the equation', () => {
    const t = totals(acc, 'cur')
    expect(t.assets).toBe(160)
    expect(t.le).toBe(160)
    expect(t.diff).toBe(0)
    const r = ratios(t)
    expect(r.current).toBe(2)
    expect(r.quick).toBe(1.25)
    expect(r.workingCapital).toBe(40)
    expect(r.debtToEquity).toBeCloseTo(100 / 60)
    expect(r.debtRatio).toBeCloseTo(0.625)
  })
  it('parses trial balances', () => {
    const rows = parseTrialBalance('Account,Amount\nCash at bank,"12,500"\nAccounts payable;current liabilities;(3,000)\nOffice equipment\t8000\t7000\nRetained earnings, 2500')
    expect(rows.length).toBe(4)
    expect(rows[0]).toMatchObject({ section: 'ca', cur: 12500, quick: true })
    expect(rows[1]).toMatchObject({ section: 'cl', cur: -3000 })
    expect(rows[2]).toMatchObject({ section: 'nca', cur: 8000, prior: 7000 })
    expect(rows[3].section).toBe('eq')
    expect(guessSection('Mortgage payable (long-term)')).toBe('ncl')
  })
  it('formats negatives in parentheses and writes a PDF', async () => {
    expect(fmtAmt(-1234.4)).toBe('(1,234)')
    const pdf = await balancePdf({ company: 'Test Co', date: 'Dec 31, 2026', prior: 'Dec 31, 2025', currency: '$', accounts: acc, showPrior: true })
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-')
  })
})
