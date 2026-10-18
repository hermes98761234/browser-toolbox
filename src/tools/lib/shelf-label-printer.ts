// Shelf label printer helpers: unit pricing, product CSV import, barcode symbology choice, sheet fitting.
import { parseCsv } from './barcode-label-maker'
import type { Sym } from './barcode-generator'

export type SizeUnit = 'g' | 'kg' | 'ml' | 'l' | 'oz' | 'lb' | 'floz' | 'ct'
export type Basis = 'metric100' | 'metric1' | 'us'

export interface Product {
  id: string
  name: string
  brand: string
  price: number
  was: number // regular price when on sale (0 = no sale)
  size: number
  unit: SizeUnit
  barcode: string
  sku: string
}

const KIND: Record<SizeUnit, 'mass' | 'vol' | 'count'> = { g: 'mass', kg: 'mass', oz: 'mass', lb: 'mass', ml: 'vol', l: 'vol', floz: 'vol', ct: 'count' }
// grams or millilitres per unit
const BASE: Record<SizeUnit, number> = { g: 1, kg: 1000, oz: 28.349523125, lb: 453.59237, ml: 1, l: 1000, floz: 29.5735295625, ct: 1 }

export const UNIT_NAMES: [SizeUnit, string][] = [['g', 'g'], ['kg', 'kg'], ['ml', 'ml'], ['l', 'L'], ['oz', 'oz'], ['lb', 'lb'], ['floz', 'fl oz'], ['ct', 'count']]

/** Unit price for a package: returns the value and its label (e.g. "per kg"). */
export function unitPrice(price: number, size: number, unit: SizeUnit, basis: Basis): { value: number; per: string } {
  if (!(price >= 0) || !(size > 0)) return { value: NaN, per: '' }
  const k = KIND[unit]
  if (k === 'count') return size === 1 ? { value: NaN, per: '' } : { value: price / size, per: 'each' }
  const amount = size * BASE[unit] // g or ml
  if (basis === 'us') {
    const ref = k === 'mass' ? BASE.oz : BASE.floz
    return { value: (price / amount) * ref, per: k === 'mass' ? 'per oz' : 'per fl oz' }
  }
  const ref = basis === 'metric100' ? 100 : 1000
  const per = basis === 'metric100' ? (k === 'mass' ? 'per 100 g' : 'per 100 ml') : k === 'mass' ? 'per kg' : 'per L'
  return { value: (price / amount) * ref, per }
}

/** Picks a symbology for a barcode value: 13 digits → EAN-13, 12 → UPC-A, 8 → EAN-8, otherwise Code 128. */
export function autoSym(v: string): Sym | null {
  const d = v.replace(/[\s-]/g, '')
  if (!d) return null
  if (/^\d{13}$/.test(d)) return 'ean13'
  if (/^\d{12}$/.test(d)) return 'upca'
  if (/^\d{8}$/.test(d)) return 'ean8'
  return 'code128'
}

const num = (s: string | undefined) => {
  const t = (s ?? '').replace(/[^\d.,-]/g, '')
  const v = Number(t.includes(',') && !t.includes('.') ? t.replace(',', '.') : t.replace(/,/g, ''))
  return Number.isFinite(v) ? v : 0
}

/** Parses product rows from CSV with a header row (name, brand, price, was, size, unit, barcode, sku). */
export function parseProducts(text: string, mkId: () => string): Product[] {
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim()))
  if (rows.length < 2) return []
  const head = rows[0].map((h) => h.trim().toLowerCase())
  const col = (...names: string[]) => head.findIndex((h) => names.some((n) => h === n || h.includes(n)))
  const ix = {
    name: col('name', 'product', 'description', 'item'), brand: col('brand'), price: col('price', 'sale'), was: col('was', 'regular', 'old'),
    size: col('size', 'qty', 'quantity', 'net'), unit: col('unit', 'uom'), barcode: col('barcode', 'ean', 'upc', 'gtin'), sku: col('sku', 'code', 'id'),
  }
  return rows.slice(1).map((r) => {
    let size = num(r[ix.size])
    let unitRaw = (r[ix.unit] ?? '').trim().toLowerCase().replace(/\s|\./g, '')
    if (!unitRaw && ix.size >= 0) {
      const m = /([\d.,]+)\s*([a-z ]+)/i.exec(r[ix.size] ?? '')
      if (m) {
        size = num(m[1])
        unitRaw = m[2].trim().toLowerCase().replace(/\s/g, '')
      }
    }
    const unit = (({ litre: 'l', liter: 'l', ltr: 'l', ml: 'ml', g: 'g', gr: 'g', kg: 'kg', oz: 'oz', lb: 'lb', lbs: 'lb', floz: 'floz', ct: 'ct', pcs: 'ct', pc: 'ct', each: 'ct', l: 'l' }) as Record<string, SizeUnit>)[unitRaw] ?? 'ct'
    return {
      id: mkId(), name: (r[ix.name] ?? '').trim(), brand: ix.brand >= 0 ? (r[ix.brand] ?? '').trim() : '', price: num(r[ix.price]), was: ix.was >= 0 ? num(r[ix.was]) : 0,
      size: size || 1, unit, barcode: ix.barcode >= 0 ? (r[ix.barcode] ?? '').trim() : '', sku: ix.sku >= 0 && ix.sku !== ix.barcode ? (r[ix.sku] ?? '').trim() : '',
    }
  }).filter((p) => p.name)
}

export interface Fit { cols: number; rows: number; perPage: number; pages: number }

/** How many labels of w×h mm fit on a page with margins and gaps. */
export function fitSheet(pageW: number, pageH: number, margin: number, gap: number, w: number, h: number, count: number): Fit {
  const cols = Math.max(0, Math.floor((pageW - 2 * margin + gap) / (w + gap)))
  const rows = Math.max(0, Math.floor((pageH - 2 * margin + gap) / (h + gap)))
  const perPage = cols * rows
  return { cols, rows, perPage, pages: perPage ? Math.ceil(count / perPage) : 0 }
}
