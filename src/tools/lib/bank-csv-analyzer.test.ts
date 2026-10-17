import { describe, expect, it } from 'vitest'
import { categorize, detectColumns, detectDateFormat, groupSum, normalizeMerchant, parseAmount, parseCsv, parseDate, toTxns } from './bank-csv-analyzer'

describe('bank-csv-analyzer', () => {
  it('parses amounts in many formats', () => {
    expect(parseAmount('1,234.56')).toBe(1234.56)
    expect(parseAmount('1.234,56')).toBe(1234.56)
    expect(parseAmount('-12,50')).toBe(-12.5)
    expect(parseAmount('(45.00)')).toBe(-45)
    expect(parseAmount('$-5')).toBe(-5)
    expect(parseAmount('12.00 DR')).toBe(-12)
    expect(parseAmount('')).toBe(0)
  })
  it('dates', () => {
    expect(detectDateFormat(['03/04/2026', '25/04/2026'])).toBe('dmy')
    expect(detectDateFormat(['04/25/2026'])).toBe('mdy')
    expect(detectDateFormat(['2026-04-03'])).toBe('ymd')
    expect(parseDate('3/4/26', 'dmy')).toBe('2026-04-03')
    expect(parseDate('3/4/26', 'mdy')).toBe('2026-03-04')
    expect(parseDate('2026.10.01', 'ymd')).toBe('2026-10-01')
  })
  it('detects columns and debit/credit', () => {
    const rows = parseCsv('Date;Details;Money out;Money in\n01/09/2026;TESCO STORES 3021;12,40;\n02/09/2026;SALARY ACME;;2.500,00')
    const c = detectColumns(rows[0], rows.slice(1))
    expect(c).toMatchObject({ date: 0, desc: 1, debit: 2, credit: 3, amount: -1 })
    const t = toTxns(rows.slice(1), c, 'dmy', [{ kw: 'tesco', cat: 'Groceries' }])
    expect(t.map((x) => [x.date, x.amount, x.category])).toEqual([['2026-09-01', -12.4, 'Groceries'], ['2026-09-02', 2500, 'Income']])
  })
  it('cleans merchants', () => {
    expect(normalizeMerchant('CARD 1234 TESCO STORES 3021 LONDON 12/09')).toBe('Tesco Stores')
    expect(normalizeMerchant('POS AMZN Mktp US*2K4LZ0 amzn.com')).toBe('Amzn Mktp')
    expect(normalizeMerchant('UBER *TRIP HELP.UBER.COM')).toBe('Uber')
    expect(normalizeMerchant('SQ *BLUE BOTTLE COFFEE 0412')).toBe('Blue Bottle Coffee')
  })
  it('categorizes by first matching rule', () => {
    const rules = [{ kw: 'uber eats', cat: 'Dining' }, { kw: 'uber', cat: 'Transport' }]
    expect(categorize('UBER EATS 123', -20, rules)).toBe('Dining')
    expect(categorize('Uber trip', -9, rules)).toBe('Transport')
    expect(categorize('Unknown', -9, rules)).toBe('Uncategorized')
  })
  it('groups', () => {
    const g = groupSum([{ date: '', desc: '', amount: -2, merchant: 'a', category: 'X' }, { date: '', desc: '', amount: -3, merchant: 'a', category: 'X' }], (t) => t.category)
    expect(g.get('X')).toEqual({ total: -5, count: 2 })
  })
})
