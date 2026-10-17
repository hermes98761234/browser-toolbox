// Sales quote math: line discounts, order discount (percent or fixed), tax on taxable lines, shipping.

export interface QuoteItem {
  desc: string
  qty: number
  price: number
  disc: number // line discount, %
  taxable: boolean
}

export interface QuoteOpts {
  discountType: 'pct' | 'fixed'
  discount: number
  taxRate: number // %
  shipping: number
}

export const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100

export function lineAmount(it: QuoteItem): number {
  const d = Math.min(100, Math.max(0, it.disc || 0))
  return r2(Math.max(0, it.qty) * Math.max(0, it.price) * (1 - d / 100))
}

export interface QuoteTotals {
  lines: number[]
  subtotal: number
  lineSavings: number
  discount: number
  taxable: number
  tax: number
  shipping: number
  total: number
}

export function calcQuote(items: QuoteItem[], o: QuoteOpts): QuoteTotals {
  const lines = items.map(lineAmount)
  const subtotal = r2(lines.reduce((a, b) => a + b, 0))
  const gross = r2(items.reduce((a, it) => a + Math.max(0, it.qty) * Math.max(0, it.price), 0))
  const raw = o.discountType === 'pct' ? (subtotal * Math.min(100, Math.max(0, o.discount))) / 100 : Math.max(0, o.discount)
  const discount = r2(Math.min(subtotal, raw))
  // The order discount is spread proportionally, so taxable lines carry their share of it.
  const taxableLines = items.reduce((a, it, i) => a + (it.taxable ? lines[i] : 0), 0)
  const taxable = r2(subtotal ? taxableLines * (1 - discount / subtotal) : 0)
  const tax = r2((taxable * Math.max(0, o.taxRate)) / 100)
  const shipping = r2(Math.max(0, o.shipping))
  return { lines, subtotal, lineSavings: r2(gross - subtotal), discount, taxable, tax, shipping, total: r2(subtotal - discount + tax + shipping) }
}

/** Adds `days` to an ISO date (YYYY-MM-DD). */
export function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  if (Number.isNaN(d.getTime())) return iso
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Greedy word wrap using a width-measuring function. */
export function wrapText(text: string, maxW: number, width: (s: string) => number): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? line + ' ' + word : word
      if (width(next) <= maxW || !line) line = next
      else {
        out.push(line)
        line = word
      }
    }
    out.push(line)
  }
  return out
}
