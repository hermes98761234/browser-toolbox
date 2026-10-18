// Receipt scanner: turns receipt text (from TextDetector or typed/pasted) into an expense record.
// Parsing reuses the receipt parser of receipt-ocr-scanner; this adds fallbacks, a category guess,
// a confidence summary, image cleanup on raw pixels and expense summaries.
import { otsu } from './note-ocr'
import { parseAmount, parseReceipt } from './receipt-ocr-scanner'

export const CATEGORIES = ['Groceries', 'Dining', 'Fuel & transport', 'Household', 'Health', 'Clothing', 'Electronics', 'Entertainment', 'Travel', 'Office', 'Other'] as const
export type Category = (typeof CATEGORIES)[number]

const KEYWORDS: [Category, RegExp][] = [
  ['Fuel & transport', /\b(fuel|petrol|gas station|diesel|unleaded|shell|bp|esso|chevron|parking|taxi|uber|metro|transit|toll)\b/i],
  ['Dining', /\b(cafe|café|coffee|restaurant|bistro|pizza|burger|grill|bar|pub|bakery|tip|gratuity|table|server|espresso|latte)\b/i],
  ['Groceries', /\b(market|grocery|groceries|supermarket|foods?|milk|bread|eggs|produce|banana|apples?|cheese|organic)\b/i],
  ['Health', /\b(pharmacy|chemist|drug ?store|clinic|dental|optical|vitamin|rx)\b/i],
  ['Household', /\b(hardware|home|garden|diy|cleaning|detergent|paint|tools?)\b/i],
  ['Clothing', /\b(apparel|fashion|shoes?|clothing|jeans|shirt|boutique)\b/i],
  ['Electronics', /\b(electronics?|computer|phone|cable|charger|usb|battery|batteries)\b/i],
  ['Entertainment', /\b(cinema|theatre|theater|tickets?|museum|concert|games?|books?)\b/i],
  ['Travel', /\b(hotel|airline|flight|airport|booking|hostel|rail)\b/i],
  ['Office', /\b(office|stationery|printer|paper|toner|post office|postage)\b/i],
]

export function guessCategory(text: string): Category {
  for (const [c, re] of KEYWORDS) if (re.test(text)) return c
  return 'Other'
}

export interface Extracted {
  merchant: string
  date: string
  total: number | null
  tax: number | null
  currency: string
  payment: string
  category: Category
  items: number
  /** which fields were found by a labelled line ('label') or guessed ('guess') */
  how: { total: 'label' | 'guess' | 'none'; date: boolean; merchant: boolean }
}

const AMT = /(-?\d{1,3}(?:[ ,.]\d{3})*[.,]\d{2}|-?\d+[.,]\d{2})(?!\d)/g

/** Extracts the main expense fields; if no TOTAL line exists, falls back to the largest amount. */
export function extract(text: string, dmy = true): Extracted {
  const p = parseReceipt(text, dmy)
  let total = p.total
  let how: Extracted['how']['total'] = total !== null ? 'label' : 'none'
  if (total === null) {
    const all = [...text.matchAll(AMT)].map((m) => parseAmount(m[1])).filter((x): x is number => x !== null && x > 0)
    if (all.length) {
      total = Math.max(...all)
      how = 'guess'
    }
  }
  return {
    merchant: p.merchant, date: p.date, total, tax: p.tax, currency: p.currency, payment: p.payment, category: guessCategory(text), items: p.items.length,
    how: { total: how, date: !!p.date, merchant: !!p.merchant },
  }
}

/**
 * Document cleanup on RGBA pixels: optional shadow flattening by dividing by a blurred background,
 * contrast stretch, then colour / gray / black-and-white (Otsu threshold) output. Modifies `d`.
 */
export function cleanPixels(d: Uint8ClampedArray, bg: Uint8ClampedArray | null, mode: 'color' | 'gray' | 'bw', contrast: number): void {
  const n = d.length / 4
  const gray = new Uint8ClampedArray(n)
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) {
      let v = d[i * 4 + k]
      if (bg) v = (v / Math.max(24, bg[i * 4 + k])) * 240
      d[i * 4 + k] = (v - 128) * contrast + 128
    }
    gray[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]
  }
  if (mode === 'color') return
  const th = otsu(gray)
  for (let i = 0; i < n; i++) {
    const v = mode === 'bw' ? (gray[i] > th ? 255 : 0) : gray[i]
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v
  }
}

export interface Expense {
  id: string
  date: string
  merchant: string
  category: Category
  total: number
  tax: number
  currency: string
  payment: string
  note: string
  text: string
  thumb: string // small JPEG data URL ('' if none)
  created: number
}

export function summarize(list: Expense[]) {
  const byMonth = new Map<string, number>()
  const byCat = new Map<string, number>()
  let total = 0
  let tax = 0
  for (const e of list) {
    total += e.total
    tax += e.tax
    byMonth.set(e.date.slice(0, 7), (byMonth.get(e.date.slice(0, 7)) ?? 0) + e.total)
    byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.total)
  }
  return {
    total: Math.round(total * 100) / 100,
    tax: Math.round(tax * 100) / 100,
    months: [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])),
    cats: [...byCat.entries()].sort((a, b) => b[1] - a[1]),
  }
}
