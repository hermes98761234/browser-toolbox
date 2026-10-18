import { describe, expect, it } from 'vitest'
import { addMonthsClamped, dueToGenerate, invoiceNumber, invoicesPdf, makeInvoice, monthly, scheduleBetween, totals, type Template } from './recurring-invoice-manager'

const T: Template = { id: 't', client: 'Acme', email: 'ap@acme.test', address: '1 Road', items: [{ desc: 'Retainer', qty: 1, price: 1500 }, { desc: 'Hosting', qty: 3, price: 19.99 }], taxPct: 20, freq: 'monthly', start: '2026-01-31', terms: 14, active: true, limit: 0, note: '' }

describe('schedule', () => {
  it('clamps month ends and keeps the original day', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonthsClamped('2026-01-31', 2)).toBe('2026-03-31')
    expect(addMonthsClamped('2028-01-31', 1)).toBe('2028-02-29')
    expect(scheduleBetween(T, '2026-01-01', '2026-04-30')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'])
  })
  it('weekly, quarterly and limits', () => {
    expect(scheduleBetween({ ...T, freq: 'weekly', start: '2026-10-05' }, '2026-10-01', '2026-10-31')).toEqual(['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'])
    expect(scheduleBetween({ ...T, freq: 'quarterly', start: '2026-01-15' }, '2026-01-01', '2026-12-31')).toEqual(['2026-01-15', '2026-04-15', '2026-07-15', '2026-10-15'])
    expect(scheduleBetween({ ...T, limit: 2 }, '2026-01-01', '2026-12-31').length).toBe(2)
  })
  it('lists missing invoices up to today', () => {
    const due = dueToGenerate([T], [makeInvoice(T, '2026-01-31', 'X1', 'a')], '2026-03-31')
    expect(due.map((d) => d.issue)).toEqual(['2026-02-28', '2026-03-31'])
    expect(dueToGenerate([{ ...T, active: false }], [], '2026-03-31')).toEqual([])
  })
})

describe('money', () => {
  it('totals with tax rounding', () => {
    expect(totals(T.items, 20)).toEqual({ subtotal: 1559.97, tax: 311.99, total: 1871.96 })
  })
  it('MRR normalises frequency', () => {
    expect(monthly(T)).toBeCloseTo(1559.97)
    expect(monthly({ ...T, freq: 'yearly' })).toBeCloseTo(129.9975)
    expect(monthly({ ...T, freq: 'weekly' })).toBeCloseTo(1559.97 * 52 / 12)
  })
  it('numbers', () => {
    expect(invoiceNumber('INV-{YYYY}-', 7, '2026-03-31')).toBe('INV-2026-0007')
  })
  it('invoice due date from terms', () => {
    expect(makeInvoice(T, '2026-02-28', 'N', 'i').due).toBe('2026-03-14')
  })
})

describe('pdf', () => {
  it('renders one page per invoice and survives non-WinAnsi text', async () => {
    const { PDFDocument } = await import('pdf-lib')
    const a = makeInvoice({ ...T, client: 'ТОВ «Зірка»' }, '2026-01-31', 'INV-0001', 'a'), b = { ...makeInvoice(T, '2026-02-28', 'INV-0002', 'b'), paid: true }
    const bytes = await invoicesPdf([a, b], { name: 'Studio', address: 'Line 1\nLine 2', email: 'x@y.z', taxId: 'GB123', payment: 'IBAN GB00 0000', currency: '₴', prefix: 'INV-', next: 3 })
    const d = await PDFDocument.load(bytes)
    expect(d.getPageCount()).toBe(2)
    expect(d.getTitle()).toBe('2 invoices')
  })
})
