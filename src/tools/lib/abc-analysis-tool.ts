// ABC (Pareto) classification of inventory items by their share of total value.

export interface Item { name: string; value: number; [k: string]: unknown }
export type Cls = 'A' | 'B' | 'C'
export interface Ranked<T extends Item> { item: T; rank: number; share: number; cum: number; cls: Cls }

/**
 * Sorts by value (desc) and classifies by cumulative share: A up to `a` (e.g. 0.8), B up to `b` (e.g. 0.95), rest C.
 * An item belongs to the class in which its cumulative share *starts* (so the item that crosses 80 % is still A
 * when the class was not yet full), which guarantees the top item is always A.
 */
export function classify<T extends Item>(items: T[], a = 0.8, b = 0.95): Ranked<T>[] {
  const valid = items.filter((i) => Number.isFinite(i.value) && i.value >= 0)
  const total = valid.reduce((s, i) => s + i.value, 0)
  const sorted = [...valid].sort((x, y) => y.value - x.value)
  let cum = 0
  return sorted.map((item, k) => {
    const start = cum
    const share = total ? item.value / total : 0
    cum += share
    const cls: Cls = start < a - 1e-12 ? 'A' : start < b - 1e-12 ? 'B' : 'C'
    return { item, rank: k + 1, share, cum, cls }
  })
}

export interface Summary { cls: Cls; count: number; itemShare: number; valueShare: number; value: number }

export function summarize<T extends Item>(r: Ranked<T>[]): Summary[] {
  const total = r.reduce((s, x) => s + x.item.value, 0)
  return (['A', 'B', 'C'] as Cls[]).map((cls) => {
    const g = r.filter((x) => x.cls === cls)
    const value = g.reduce((s, x) => s + x.item.value, 0)
    return { cls, count: g.length, itemShare: r.length ? g.length / r.length : 0, valueShare: total ? value / total : 0, value }
  })
}

/** Parses "1,234.50", "$1 234", "1.234,50 €" style numbers. */
export function parseNum(s: string): number {
  let t = String(s ?? '').replace(/[^\d.,-]/g, '')
  if (!t) return NaN
  const lc = t.lastIndexOf(','), ld = t.lastIndexOf('.')
  if (lc > ld) t = t.replace(/\./g, '').replace(',', '.') // decimal comma
  else t = t.replace(/,/g, '')
  return Number(t)
}
