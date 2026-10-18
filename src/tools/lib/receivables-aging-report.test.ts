import { describe, expect, it } from 'vitest'
import { age, avgDaysLate, bucketOf, byClient, guessMapping, parseAmount, parseDate } from './receivables-aging-report'

describe('receivables-aging-report', () => {
  it('parses amounts', () => {
    expect(parseAmount('$1,234.50')).toBe(1234.5)
    expect(parseAmount('1.234,50 €')).toBe(1234.5)
    expect(parseAmount('(300.00)')).toBe(-300)
    expect(parseAmount('-12')).toBe(-12)
    expect(parseAmount('12,5')).toBe(12.5)
    expect(parseAmount('12,500')).toBe(12500)
    expect(parseAmount('1.000.000')).toBe(1000000)
    expect(parseAmount('')).toBeNaN()
    expect(parseAmount('n/a')).toBeNaN()
  })
  it('parses dates', () => {
    expect(parseDate('2026-03-07')).toBe('2026-03-07')
    expect(parseDate('03/07/2026')).toBe('2026-03-07')
    expect(parseDate('03/07/2026', 'dmy')).toBe('2026-07-03')
    expect(parseDate('25/12/2026')).toBe('2026-12-25')
    expect(parseDate('07.03.2026')).toBe('2026-03-07')
    expect(parseDate('12 Mar 2026')).toBe('2026-03-12')
    expect(parseDate('Mar 12, 2026')).toBe('2026-03-12')
    expect(parseDate('2026-02-30')).toBeNull()
  })
  it('buckets by days past due', () => {
    expect([-5, 0, 1, 30, 31, 60, 61, 90, 91].map(bucketOf)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4])
  })
  it('guesses columns', () => {
    expect(guessMapping(['Customer', 'Invoice #', 'Invoice Date', 'Due Date', 'Amount', 'Paid'])).toEqual({ client: 0, invoice: 1, date: 2, due: 3, amount: 4, paid: 5, balance: -1 })
  })
  it('ages invoices and totals per client', () => {
    const map = { client: 0, invoice: 1, date: 2, due: 3, amount: 4, paid: 5, balance: -1 }
    const rows = [
      ['A', '1', '2026-08-01', '2026-08-31', '1000', '0'], // 48 days → 31–60
      ['A', '2', '2026-10-01', '2026-10-31', '500', '100'], // not due → current, 400
      ['B', '3', '2026-06-01', '', '200', ''], // due from terms (30) = 2026-07-01 → 109 days → 90+
      ['B', '4', '2026-09-01', '2026-09-15', '300', '300'], // paid → skipped
      ['C', '5', 'bad', 'bad', 'x', ''], // unreadable
    ]
    const { invs, bad } = age(rows, map, '2026-10-18', { fmt: 'auto', basis: 'due', terms: 30 })
    expect(invs.map((v) => [v.invoice, v.days, v.bucket, v.balance])).toEqual([['1', 48, 2, 1000], ['2', -13, 0, 400], ['3', 109, 4, 200]])
    expect(bad).toEqual([{ line: 6, reason: 'no readable amount' }])
    const c = byClient(invs)
    expect(c[0]).toMatchObject({ client: 'A', total: 1400, b: [400, 0, 1000, 0, 0], count: 2, oldest: 48 })
    expect(avgDaysLate(invs)).toBeCloseTo((48 * 1000 + 109 * 200) / 1200)
  })
})
