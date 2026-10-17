// Carbon:nitrogen and moisture balance of a compost mix (dry-basis method used by Cornell / Rynk).

export interface Material { name: string; kind: 'green' | 'brown'; n: number; cn: number; moist: number; density: number }
// n = % nitrogen (dry basis), cn = C:N ratio, moist = % water (wet basis), density = loose kg per m³. Typical values; real materials vary widely.
export const MATERIALS: Material[] = [
  { name: 'Grass clippings', kind: 'green', n: 3.4, cn: 17, moist: 82, density: 300 },
  { name: 'Vegetable scraps', kind: 'green', n: 2.7, cn: 19, moist: 87, density: 500 },
  { name: 'Fruit waste', kind: 'green', n: 1.5, cn: 40, moist: 80, density: 550 },
  { name: 'Coffee grounds', kind: 'green', n: 2.1, cn: 20, moist: 60, density: 400 },
  { name: 'Fresh garden weeds', kind: 'green', n: 2.0, cn: 20, moist: 80, density: 250 },
  { name: 'Cattle manure', kind: 'green', n: 2.4, cn: 19, moist: 81, density: 700 },
  { name: 'Horse manure (with bedding)', kind: 'green', n: 1.6, cn: 30, moist: 72, density: 500 },
  { name: 'Poultry manure', kind: 'green', n: 3.7, cn: 10, moist: 69, density: 550 },
  { name: 'Rabbit manure', kind: 'green', n: 2.4, cn: 12, moist: 60, density: 500 },
  { name: 'Seaweed', kind: 'green', n: 1.9, cn: 19, moist: 53, density: 400 },
  { name: 'Hay', kind: 'brown', n: 1.7, cn: 25, moist: 10, density: 70 },
  { name: 'Fallen leaves', kind: 'brown', n: 0.9, cn: 54, moist: 38, density: 100 },
  { name: 'Pine needles', kind: 'brown', n: 0.7, cn: 80, moist: 10, density: 80 },
  { name: 'Straw', kind: 'brown', n: 0.4, cn: 120, moist: 12, density: 50 },
  { name: 'Shredded cardboard', kind: 'brown', n: 0.1, cn: 350, moist: 8, density: 50 },
  { name: 'Shredded newspaper', kind: 'brown', n: 0.1, cn: 500, moist: 8, density: 80 },
  { name: 'Sawdust', kind: 'brown', n: 0.24, cn: 440, moist: 39, density: 250 },
  { name: 'Wood chips', kind: 'brown', n: 0.2, cn: 400, moist: 40, density: 300 },
]

export interface Part { name: string; n: number; cn: number; moist: number; kg: number }
export interface MixResult { carbon: number; nitrogen: number; water: number; dry: number; wet: number; ratio: number; moisture: number }

/** Carbon/nitrogen contributed by `kg` wet weight of a material (kg of element). */
export function elements(p: Part): { c: number; n: number; dry: number; water: number } {
  const dry = p.kg * (1 - p.moist / 100)
  const n = (dry * p.n) / 100
  return { c: n * p.cn, n, dry, water: p.kg - dry }
}

export function mix(parts: Part[]): MixResult {
  let c = 0, n = 0, dry = 0, water = 0
  for (const p of parts) {
    if (!(p.kg > 0)) continue
    const e = elements(p)
    c += e.c; n += e.n; dry += e.dry; water += e.water
  }
  return { carbon: c, nitrogen: n, water, dry, wet: dry + water, ratio: n > 0 ? c / n : NaN, moisture: dry + water > 0 ? (water / (dry + water)) * 100 : NaN }
}

/** Wet kg of `add` needed to move the mix to `target` C:N, or null if impossible with that material. */
export function amountForRatio(parts: Part[], add: Part, target: number): number | null {
  const m = mix(parts)
  const one = elements({ ...add, kg: 1 })
  const denom = one.c - target * one.n
  if (Math.abs(denom) < 1e-12) return null
  const x = (target * m.nitrogen - m.carbon) / denom
  return x >= 0 ? x : null
}

/** Litres of water to add to reach target moisture % (negative = too wet, add dry browns instead). */
export function waterForMoisture(parts: Part[], target: number): number {
  const m = mix(parts)
  return (target / 100 * m.wet - m.water) / (1 - target / 100)
}

export function ratioVerdict(r: number): { tone: 'ok' | 'warn' | 'err'; text: string } {
  if (!Number.isFinite(r)) return { tone: 'err', text: 'Add some materials.' }
  if (r < 20) return { tone: 'err', text: 'Too much nitrogen: the pile will smell of ammonia and lose nitrogen. Add browns.' }
  if (r < 25) return { tone: 'warn', text: 'A bit nitrogen-rich. Hot and fast, but watch for odours — a few more browns help.' }
  if (r <= 35) return { tone: 'ok', text: 'Ideal range (25–35:1). Microbes have balanced food: expect a hot, fast pile.' }
  if (r <= 50) return { tone: 'warn', text: 'Carbon-rich: it will compost, just slowly. Add greens to speed it up.' }
  return { tone: 'err', text: 'Far too much carbon: the pile will stay cold for months. Add greens or manure.' }
}
