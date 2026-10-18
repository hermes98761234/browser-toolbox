import { describe, expect, it } from 'vitest'
import { code128Widths } from './barcode-label-maker'
import { ordersFromCsv, ordersToCsv, paginate, pickList, SAMPLE_CSV, winAnsi } from './packing-slip-generator'

describe('packing slip generator', () => {
  it('groups CSV rows into orders', () => {
    const { orders, errors } = ordersFromCsv(SAMPLE_CSV)
    expect(errors).toEqual([])
    expect(orders.map((o) => o.id)).toEqual(['10241', '10242', '10243'])
    expect(orders[0].items).toHaveLength(2)
    expect(orders[0].address).toBe('48 Alder Lane\nApt 3\nSpringfield OR 97477')
  })
  it('round-trips through CSV and accepts aliases', () => {
    const { orders } = ordersFromCsv(SAMPLE_CSV)
    const again = ordersFromCsv(ordersToCsv(orders).map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n'))
    expect(again.orders).toEqual(orders)
    const alt = ordersFromCsv('Order Number,Product,Quantity,Location\nA1,Widget,x,Z9')
    expect(alt.orders[0].items[0]).toEqual({ sku: '', name: 'Widget', qty: 1, bin: 'Z9' })
    expect(alt.errors[0]).toMatch(/bad quantity/)
    expect(ordersFromCsv('foo,bar\n1,2').errors[0]).toMatch(/Missing/)
  })
  it('aggregates the pick list by bin then SKU', () => {
    const pl = pickList(ordersFromCsv(SAMPLE_CSV).orders)
    expect(pl.map((r) => r.bin)).toEqual(['A-03', 'A-10', 'B-02', 'B-07', 'C-11'])
    expect(pl[0]).toMatchObject({ sku: 'MUG-12-BLU', qty: 3, orders: ['10241', '10242'] })
    expect(pl[4].qty).toBe(3)
  })
  it('sanitises text and paginates', () => {
    expect(winAnsi('Café — “ok” ✓ 日本')).toBe('Café — “ok” ? ??')
    expect(paginate([1, 2, 3, 4, 5, 6, 7], 3, 2)).toEqual([[1, 2, 3], [4, 5], [6, 7]])
    expect(paginate([], 3, 2)).toEqual([[]])
    expect(code128Widths('10241').reduce((a, b) => a + b, 0) % 11).toBe(2)
  })
})

describe('packing slip PDF', () => {
  it('builds one page per short order plus a pick list, and splits long orders', async () => {
    const { PDFDocument } = await import('pdf-lib')
    const { buildPdf } = await import('./packing-slip-generator')
    const orders = ordersFromCsv(SAMPLE_CSV).orders
    const opts = { company: 'Test Co', from: '1 Main St', footer: 'Thanks', page: 'letter' as const, bins: true, picklist: true }
    let doc = await PDFDocument.load(await buildPdf(opts, orders))
    expect(doc.getPageCount()).toBe(4)
    const long = { ...orders[0], items: Array.from({ length: 60 }, (_, i) => ({ sku: `S${i}`, name: `Item ${i} – ✓`, qty: 1, bin: `A-${i}` })) }
    doc = await PDFDocument.load(await buildPdf({ ...opts, page: '4x6', picklist: false }, [long]))
    expect(doc.getPageCount()).toBe(3)
    expect(doc.getPage(0).getSize()).toEqual({ width: 288, height: 432 })
  })
})
