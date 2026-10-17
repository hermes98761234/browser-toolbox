// Inventory math: stock status, usage rate from the movement log, days of cover, reorder suggestions.

export interface Item {
  id: string
  sku: string
  name: string
  category: string
  location: string
  barcode: string
  qty: number
  unit: string
  reorderPoint: number
  reorderQty: number
  leadDays: number
  cost: number
  price: number
  supplier: string
}
export type Reason = 'received' | 'sold' | 'used' | 'damaged' | 'adjust'
export interface Move { id: string; itemId: string; date: string; delta: number; reason: Reason; note: string }

export type Status = 'out' | 'low' | 'ok' | 'over'
export function status(it: Item): Status {
  if (it.qty <= 0) return 'out'
  if (it.qty <= it.reorderPoint) return 'low'
  if (it.reorderQty > 0 && it.qty > (it.reorderPoint + it.reorderQty) * 2) return 'over'
  return 'ok'
}

const DAY = 86400000
const dayNum = (iso: string) => Math.floor(Date.parse(iso.slice(0, 10) + 'T00:00:00Z') / DAY)

/** Average daily outflow (sold/used/damaged) over the last `days` days up to `today`. */
export function dailyUsage(moves: Move[], itemId: string, today: string, days = 30): number {
  const t = dayNum(today)
  let out = 0
  for (const m of moves) {
    if (m.itemId !== itemId || m.delta >= 0 || m.reason === 'adjust') continue
    const d = t - dayNum(m.date)
    if (d >= 0 && d < days) out -= m.delta
  }
  return out / days
}

/** Days until stock runs out at the current usage rate (Infinity when no usage). */
export const daysOfCover = (qty: number, usage: number) => (usage > 0 ? Math.max(0, qty) / usage : Infinity)

/** Reorder point recommended from usage: demand during lead time + safety stock (50 % of it). */
export const recommendedRop = (usage: number, leadDays: number) => Math.ceil(usage * leadDays * 1.5)

/** Quantity to order now: bring stock up to reorderPoint + reorderQty when at/below the reorder point. */
export function suggestOrder(it: Item): number {
  if (it.qty > it.reorderPoint) return 0
  return Math.max(it.reorderQty, it.reorderPoint + it.reorderQty - it.qty)
}

export function valuation(items: Item[]) {
  return items.reduce((a, it) => ({ cost: a.cost + Math.max(0, it.qty) * it.cost, retail: a.retail + Math.max(0, it.qty) * it.price, units: a.units + Math.max(0, it.qty) }), { cost: 0, retail: 0, units: 0 })
}

/** Date (ISO) when stock is expected to hit the reorder point, or '' if no usage. */
export function reorderDate(it: Item, usage: number, today: string): string {
  if (usage <= 0) return ''
  const d = Math.max(0, (it.qty - it.reorderPoint) / usage)
  return new Date((dayNum(today) + Math.floor(d)) * DAY).toISOString().slice(0, 10)
}

/** Finds an item by barcode or SKU (case-insensitive, trimmed). */
export const findCode = (items: Item[], code: string) => {
  const c = code.trim().toLowerCase()
  return c ? items.find((i) => i.barcode.toLowerCase() === c || i.sku.toLowerCase() === c) : undefined
}
