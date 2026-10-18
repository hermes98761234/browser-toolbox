// Unit normalisation and unit-price comparison for shopping items.

export type Dim = 'mass' | 'volume' | 'count' | 'length' | 'area'

/** Unit → [dimension, factor to the base unit (g, ml, each, m, m²)]. */
export const UNITS: Record<string, [Dim, number, string]> = {
  mg: ['mass', 0.001, 'milligram'],
  g: ['mass', 1, 'gram'],
  kg: ['mass', 1000, 'kilogram'],
  oz: ['mass', 28.349523125, 'ounce'],
  lb: ['mass', 453.59237, 'pound'],
  ml: ['volume', 1, 'millilitre'],
  cl: ['volume', 10, 'centilitre'],
  l: ['volume', 1000, 'litre'],
  'fl oz': ['volume', 29.5735295625, 'US fluid ounce'],
  'uk fl oz': ['volume', 28.4130625, 'UK fluid ounce'],
  pt: ['volume', 473.176473, 'US pint'],
  qt: ['volume', 946.352946, 'US quart'],
  gal: ['volume', 3785.411784, 'US gallon'],
  each: ['count', 1, 'item'],
  dozen: ['count', 12, 'dozen'],
  m: ['length', 1, 'metre'],
  cm: ['length', 0.01, 'centimetre'],
  ft: ['length', 0.3048, 'foot'],
  yd: ['length', 0.9144, 'yard'],
  'm²': ['area', 1, 'square metre'],
  'ft²': ['area', 0.09290304, 'square foot'],
}

/** Display bases for "price per …". */
export const PER: Record<Dim, [string, number][]> = {
  mass: [['100 g', 100], ['kg', 1000], ['oz', 28.349523125], ['lb', 453.59237]],
  volume: [['100 ml', 100], ['l', 1000], ['fl oz', 29.5735295625], ['gal', 3785.411784]],
  count: [['each', 1], ['dozen', 12], ['100', 100]],
  length: [['m', 1], ['ft', 0.3048], ['100 ft', 30.48]],
  area: [['m²', 1], ['ft²', 0.09290304], ['100 ft²', 9.290304]],
}

export interface Item {
  id: string
  name: string
  price: number
  size: number
  unit: string
  packs: number
  discount: number // percent off the shelf price
}

/** Total quantity in the base unit (size × packs × unit factor). */
export function baseQty(it: Pick<Item, 'size' | 'unit' | 'packs'>): number {
  const u = UNITS[it.unit]
  if (!u || !(it.size > 0) || !(it.packs > 0)) return NaN
  return it.size * it.packs * u[1]
}

export const netPrice = (it: Pick<Item, 'price' | 'discount'>) => it.price * (1 - Math.min(100, Math.max(0, it.discount || 0)) / 100)

/** Price per one base unit; NaN if invalid. */
export function pricePerBase(it: Item): number {
  const q = baseQty(it)
  return Number.isFinite(q) && q > 0 && it.price >= 0 ? netPrice(it) / q : NaN
}

/** The dimension most items use (ties → first seen). */
export function mainDim(items: Item[]): Dim | null {
  const n = new Map<Dim, number>()
  for (const it of items) {
    const d = UNITS[it.unit]?.[0]
    if (d) n.set(d, (n.get(d) ?? 0) + 1)
  }
  let best: Dim | null = null
  for (const [d, c] of n) if (best === null || c > (n.get(best) ?? 0)) best = d
  return best
}

export interface Ranked { item: Item; per: number; rank: number; vsBest: number; comparable: boolean }

/** Ranks comparable items by unit price (cheapest first); incomparable/invalid items go last. */
export function rank(items: Item[]): Ranked[] {
  const dim = mainDim(items)
  const rows = items.map((item) => {
    const per = pricePerBase(item)
    return { item, per, comparable: UNITS[item.unit]?.[0] === dim && Number.isFinite(per), rank: 0, vsBest: NaN }
  })
  const ok = rows.filter((r) => r.comparable).sort((a, b) => a.per - b.per)
  const best = ok[0]?.per ?? NaN
  ok.forEach((r, i) => {
    r.rank = i > 0 && r.per === ok[i - 1].per ? ok[i - 1].rank : i + 1
    r.vsBest = best > 0 ? r.per / best - 1 : 0
  })
  return [...ok, ...rows.filter((r) => !r.comparable)]
}

/** Parses "2 x 500 g", "1.5kg", "12 each", "6 × 330 ml" into size/unit/packs. */
export function parseSize(s: string): { size: number; unit: string; packs: number } | null {
  const m = s.trim().toLowerCase().match(/^(?:(\d+)\s*[x×*]\s*)?(\d+(?:[.,]\d+)?)\s*([a-z² ]+?)\.?$/)
  if (!m) return null
  const unit = m[3].trim().replace(/^(ltr|litres?|liters?)$/, 'l').replace(/^(pcs|pc|ct|count|items?)$/, 'each').replace(/^lbs$/, 'lb')
  if (!UNITS[unit]) return null
  return { packs: m[1] ? +m[1] : 1, size: +m[2].replace(',', '.'), unit }
}
