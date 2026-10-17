// Pantry inventory logic: expiry status, sorting, scan handling and the shopping list.

export type Place = 'Pantry' | 'Fridge' | 'Freezer'
export interface Item {
  id: string
  name: string
  cat: string
  place: Place
  qty: number
  unit: string
  /** Restock when qty falls to or below this. */
  min: number
  /** YYYY-MM-DD or '' when it does not expire. */
  exp: string
  code: string
  opened?: boolean
}

export type Status = 'expired' | 'today' | 'soon' | 'week' | 'ok' | 'none'

const DAY = 86400000
const dayNum = (iso: string) => Math.round(Date.parse(iso + 'T00:00:00Z') / DAY)

/** Whole days from `today` until expiry (negative = expired), or null. */
export function daysLeft(exp: string, today: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(exp) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return null
  return dayNum(exp) - dayNum(today)
}

export function status(exp: string, today: string): Status {
  const d = daysLeft(exp, today)
  if (d === null) return 'none'
  if (d < 0) return 'expired'
  if (d === 0) return 'today'
  if (d <= 3) return 'soon'
  if (d <= 7) return 'week'
  return 'ok'
}

export const addDays = (iso: string, n: number) => new Date((dayNum(iso) + n) * DAY).toISOString().slice(0, 10)

export type SortKey = 'expiry' | 'name' | 'cat' | 'place'
export function sortItems(items: Item[], key: SortKey): Item[] {
  const exp = (i: Item) => (i.exp ? dayNum(i.exp) : Infinity)
  return [...items].sort((a, b) => {
    if (key === 'expiry') return exp(a) - exp(b) || a.name.localeCompare(b.name)
    if (key === 'name') return a.name.localeCompare(b.name)
    if (key === 'cat') return a.cat.localeCompare(b.cat) || exp(a) - exp(b)
    return a.place.localeCompare(b.place) || exp(a) - exp(b)
  })
}

export interface ShopLine {
  name: string
  qty: number
  unit: string
  why: string
  cat: string
}

/** Items to buy: low stock (top up to twice the minimum, at least 1) and expired items (replace). */
export function shoppingList(items: Item[], today: string): ShopLine[] {
  const out: ShopLine[] = []
  for (const i of items) {
    const expired = status(i.exp, today) === 'expired'
    if (i.qty <= i.min || expired) {
      const have = expired ? 0 : i.qty
      const want = Math.max(1, i.min * 2 - have, expired ? Math.max(1, i.qty) : 0)
      out.push({ name: i.name, qty: Math.ceil(want), unit: i.unit, cat: i.cat, why: expired ? 'expired' : i.qty <= 0 ? 'out of stock' : 'running low' })
    }
  }
  return out.sort((a, b) => a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name))
}

/** A scan increments an existing item with that barcode, or returns null so the caller can create one. */
export function applyScan(items: Item[], code: string, delta = 1): Item[] | null {
  const hit = items.find((i) => i.code && i.code === code)
  if (!hit) return null
  return items.map((i) => (i.id === hit.id ? { ...i, qty: Math.max(0, i.qty + delta) } : i))
}

/** Typical shelf life (days) once bought, used to suggest an expiry date. */
export const SHELF: Record<string, number> = {
  Dairy: 10, Produce: 7, Meat: 3, Bakery: 5, Frozen: 120, Canned: 730, 'Dry goods': 365, Condiments: 180, Snacks: 120, Drinks: 270, Other: 90,
}
export const CATS = Object.keys(SHELF)

export function shoppingText(lines: ShopLine[]): string {
  let cat = ''
  const out: string[] = []
  for (const l of lines) {
    if (l.cat !== cat) {
      cat = l.cat
      out.push(`${out.length ? '\n' : ''}${cat}`)
    }
    out.push(`[ ] ${l.name} — ${l.qty} ${l.unit} (${l.why})`)
  }
  return out.join('\n')
}
