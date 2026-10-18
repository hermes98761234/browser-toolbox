// Receipt maths and fixed-width text layout for thermal printers (ESC/POS style columns).

export interface Item { name: string; qty: number; price: number }
export interface Money { discountType: 'pct' | 'amount'; discount: number; taxRate: number; inclusive: boolean; rounding: number }
export interface Totals { subtotal: number; discount: number; net: number; tax: number; total: number; rounded: number; adjust: number }

const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100

/** Rounds to the nearest cash increment (e.g. 0.05); 0 = no rounding. */
export const cashRound = (x: number, step: number) => (step > 0 ? r2(Math.round(x / step) * step) : r2(x))

export function totals(items: Item[], m: Money): Totals {
  const subtotal = r2(items.reduce((a, it) => a + r2(it.qty * it.price), 0))
  const discount = r2(Math.min(subtotal, Math.max(0, m.discountType === 'pct' ? (subtotal * m.discount) / 100 : m.discount)))
  const net = r2(subtotal - discount)
  const rate = Math.max(0, m.taxRate) / 100
  // Inclusive: prices already contain tax, extract it. Exclusive: add it on top.
  const tax = r2(m.inclusive ? net - net / (1 + rate) : net * rate)
  const total = r2(m.inclusive ? net : net + tax)
  const rounded = cashRound(total, m.rounding)
  return { subtotal, discount, net, tax, total, rounded, adjust: r2(rounded - total) }
}

/** Characters per line for common printers: Font A (12×24) and Font B (9×17). */
export function columns(paper: 58 | 80, font: 'A' | 'B'): number {
  if (paper === 58) return font === 'A' ? 32 : 42
  return font === 'A' ? 48 : 64
}
/** Printable width in mm (heads are narrower than the paper). */
export const printable = (paper: 58 | 80) => (paper === 58 ? 48 : 72)

/** Left text and right text on one line; left is truncated so right always fits. */
export function lr(left: string, right: string, width: number): string {
  const room = width - right.length - 1
  if (room < 1) return right.slice(-width).padStart(width)
  const l = left.length > room ? left.slice(0, Math.max(0, room - 1)) + '…' : left
  return l + ' '.repeat(width - l.length - right.length) + right
}

export function center(text: string, width: number): string {
  const t = text.slice(0, width)
  const pad = Math.floor((width - t.length) / 2)
  return ' '.repeat(pad) + t
}

/** Word-wraps text to width; very long words are split. */
export function wrap(text: string, width: number): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (let w of para.split(/\s+/).filter(Boolean)) {
      while (w.length > width) {
        if (line) {
          out.push(line)
          line = ''
        }
        out.push(w.slice(0, width))
        w = w.slice(width)
      }
      if (!line) line = w
      else if (line.length + 1 + w.length <= width) line += ' ' + w
      else {
        out.push(line)
        line = w
      }
    }
    out.push(line)
  }
  return out
}

export const rule = (width: number, ch = '-') => ch.repeat(width)

export const fmtNum = (x: number, cur: string) => `${x < 0 ? '-' : ''}${cur}${Math.abs(x).toFixed(2)}`

/** Lines for one item: single line if it fits, otherwise name then "qty x price   amount". */
export function itemLines(it: Item, width: number, cur: string): string[] {
  const amount = fmtNum(r2(it.qty * it.price), cur)
  if (it.qty === 1) {
    const one = lr(it.name, amount, width)
    if (!one.includes('…')) return [one]
  }
  return [...wrap(it.name, width), lr(`  ${it.qty} x ${fmtNum(it.price, cur)}`, amount, width)]
}

export type Line = { text: string; style?: 'big' | 'bold'; plain?: string }
