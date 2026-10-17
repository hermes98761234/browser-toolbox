import { describe, expect, it } from 'vitest'
import { check, checkVatNumber, lineNet, summary, totals, type Invoice, type Line } from './vat-invoice-checker'

const L = (qty: number, price: number, rate: number, p: Partial<Line> = {}): Line => ({ desc: 'Item', qty, price, disc: 0, rate, statedNet: null, statedVat: null, ...p })
const INV: Invoice = {
  country: 'DE', number: 'RE-2026-0042', issueDate: '2026-10-01', supplyDate: '2026-09-30', currency: 'EUR',
  supplier: 'Muster GmbH', supplierAddress: 'Hauptstr. 1, Berlin', supplierVat: 'DE123456789', customer: 'Kunde AG', customerAddress: 'Köln', customerVat: '', notes: '',
  lines: [L(3, 19.99, 19), L(2, 4.5, 7)], statedNet: 68.97, statedVat: 12.03, statedGross: 81.0,
}

describe('vat-invoice-checker', () => {
  it('validates VAT number formats', () => {
    expect(checkVatNumber('DE 123 456 789').ok).toBe(true)
    expect(checkVatNumber('NL123456789B01').ok).toBe(true)
    expect(checkVatNumber('ATU12345678').ok).toBe(true)
    expect(checkVatNumber('EL123456789').ok).toBe(true)
    expect(checkVatNumber('GB123456789').ok).toBe(true)
    expect(checkVatNumber('FR1234').ok).toBe(false)
    expect(checkVatNumber('ZZ1').msg).toMatch(/unknown/)
  })
  it('computes lines, per-rate summary and totals', () => {
    expect(lineNet(L(3, 19.99, 19, { disc: 10 }))).toBe(53.97)
    const s = summary(INV.lines)
    expect(s).toEqual([{ rate: 19, net: 59.97, vat: 11.39, vatByLine: 11.39 }, { rate: 7, net: 9, vat: 0.63, vatByLine: 0.63 }])
    expect(totals(INV.lines)).toEqual({ net: 68.97, vat: 12.02, vatByLine: 12.02, gross: 80.99 })
  })
  it('flags wrong totals, rates and missing fields', () => {
    const r = check(INV, '2026-10-17')
    expect(r.filter((i) => i.level === 'error')).toEqual([])
    expect(r.some((i) => i.level === 'warn' && i.area === 'Totals')).toBe(true) // 1-cent rounding difference
    const msgs = check({ ...INV, statedVat: 12.5, statedGross: 81 }, '2026-10-17').filter((i) => i.level === 'error').map((i) => i.msg)
    expect(msgs).toEqual(['VAT total should be 12.02, invoice says 12.50', 'Gross should be net + VAT = 81.47, invoice says 81.00'])
    const bad = check({ ...INV, supplier: '', lines: [L(1, 10, 16)], statedNet: null, statedVat: null, statedGross: null }, '2026-10-17')
    expect(bad.map((i) => i.msg)).toEqual(expect.arrayContaining(['Supplier name is missing', '16% is not a DE VAT rate (valid: 19, 7%, or 0%)']))
  })
  it('handles intra-EU reverse charge', () => {
    const rc = { ...INV, customerVat: 'FR12345678901', lines: [L(1, 100, 0)], statedNet: 100, statedVat: 0, statedGross: 100 }
    expect(check(rc, '2026-10-17').some((i) => i.area === 'Reverse charge' && i.level === 'error')).toBe(true)
    expect(check({ ...rc, notes: 'Reverse charge' }, '2026-10-17').filter((i) => i.level === 'error')).toEqual([])
  })
  it('accepts a clean invoice', () => {
    expect(check({ ...INV, statedVat: 12.02, statedGross: 80.99 }, '2026-10-17')).toEqual([{ level: 'ok', area: 'All', msg: 'No problems found' }])
  })
})
