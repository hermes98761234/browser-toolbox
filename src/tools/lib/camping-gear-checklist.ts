// Pack weight math in grams: base weight (carried, excluding consumables), worn and consumables.

export type Kind = 'carried' | 'worn' | 'consumable'
export interface Gear { id: string; name: string; cat: string; grams: number; qty: number; kind: Kind; packed: boolean; on: boolean }

export interface Totals { base: number; worn: number; consumable: number; packWeight: number; skinOut: number; byCat: Record<string, number>; items: number; packed: number }

export function totals(gear: Gear[]): Totals {
  const t: Totals = { base: 0, worn: 0, consumable: 0, packWeight: 0, skinOut: 0, byCat: {}, items: 0, packed: 0 }
  for (const g of gear) {
    if (!g.on) continue
    const w = Math.max(0, g.grams) * Math.max(0, g.qty)
    t.items++
    if (g.packed) t.packed++
    if (g.kind === 'worn') t.worn += w
    else if (g.kind === 'consumable') t.consumable += w
    else t.base += w
    if (g.kind !== 'worn') t.byCat[g.cat] = (t.byCat[g.cat] ?? 0) + w
  }
  t.packWeight = t.base + t.consumable
  t.skinOut = t.packWeight + t.worn
  return t
}

/** Common backpacking base-weight classes (grams). */
export function weightClass(baseG: number): string {
  const lb = baseG / 453.59237
  if (lb < 5) return 'Super-ultralight'
  if (lb < 10) return 'Ultralight'
  if (lb < 20) return 'Lightweight'
  return 'Traditional'
}

/** Food and water: ~0.7 kg food/person/day; 1 L water = 1 kg. */
export const consumablesFor = (days: number, people: number, waterL: number) => ({ food: Math.round(700 * days * people), water: Math.round(waterL * 1000) })

export const fmtW = (g: number, unit: 'metric' | 'imperial') =>
  unit === 'metric' ? (g >= 1000 ? `${(g / 1000).toFixed(2)} kg` : `${Math.round(g)} g`) : g >= 453.59237 ? `${(g / 453.59237).toFixed(2)} lb` : `${(g / 28.349523).toFixed(1)} oz`
