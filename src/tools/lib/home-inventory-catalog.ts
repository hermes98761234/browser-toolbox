// Home inventory: item model, room/category totals, search and PDF-safe text.

export interface Item {
  id: string
  name: string
  room: string
  category: string
  brand: string
  serial: string
  purchased: string // YYYY-MM-DD or ''
  qty: number
  value: number // replacement value per unit
  paid: number // purchase price per unit (0 = unknown)
  notes: string
  photos: string[] // IndexedDB keys
}

export const itemTotal = (i: Item) => Math.max(0, i.qty) * Math.max(0, i.value)

export function groupBy(items: Item[], key: 'room' | 'category') {
  const m = new Map<string, { name: string; items: Item[]; value: number; count: number }>()
  for (const it of items) {
    const k = it[key].trim() || 'Unassigned'
    const g = m.get(k) ?? { name: k, items: [], value: 0, count: 0 }
    g.items.push(it)
    g.value += itemTotal(it)
    g.count += Math.max(0, it.qty)
    m.set(k, g)
  }
  return [...m.values()].sort((a, b) => b.value - a.value)
}

export function search(items: Item[], q: string, room: string): Item[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  return items.filter(
    (it) => (!room || it.room === room) && words.every((w) => `${it.name} ${it.brand} ${it.serial} ${it.category} ${it.notes} ${it.room}`.toLowerCase().includes(w)),
  )
}

/** Fraction of items that have a photo, a serial number and a value — insurers like all three. */
export function completeness(items: Item[]) {
  if (!items.length) return { photo: 0, serial: 0, value: 0, receipt: 0 }
  const f = (p: (i: Item) => boolean) => items.filter(p).length / items.length
  return { photo: f((i) => i.photos.length > 0), serial: f((i) => i.serial.trim() !== ''), value: f((i) => i.value > 0), receipt: f((i) => i.purchased !== '') }
}

const WIN_ANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'
/** Keeps text encodable with the PDF standard fonts (WinAnsi); swaps the rest for '?'. */
export function pdfSafe(t: string): string {
  return [...t.replace(/[\r\n\t]+/g, ' ')].map((c) => (c.charCodeAt(0) < 256 && c.charCodeAt(0) >= 32 ? c : WIN_ANSI_EXTRA.includes(c) ? c : '?')).join('')
}

/** Splits text into lines no wider than `max` by a width function (word wrap). */
export function wrap(text: string, max: number, width: (s: string) => number): string[] {
  const out: string[] = []
  let line = ''
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const t = line ? `${line} ${w}` : w
    if (width(t) <= max || !line) line = t
    else {
      out.push(line)
      line = w
    }
  }
  if (line) out.push(line)
  return out
}

export function csvRows(items: Item[]): (string | number)[][] {
  return [
    ['Room', 'Item', 'Category', 'Brand / model', 'Serial', 'Purchased', 'Qty', 'Paid each', 'Value each', 'Total value', 'Photos', 'Notes'],
    ...items.map((i) => [i.room, i.name, i.category, i.brand, i.serial, i.purchased, i.qty, i.paid, i.value, itemTotal(i), i.photos.length, i.notes]),
  ]
}
