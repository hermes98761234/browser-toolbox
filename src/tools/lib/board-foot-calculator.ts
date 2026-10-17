// Board-foot math: 1 BF = 144 in³ = 1 in × 12 in × 12 in = 0.002359737 m³.

export const BF_M3 = 0.002359737216
export const IN_MM = 25.4

/** Board feet from thickness (in), width (in), length (ft). */
export const boardFeet = (tIn: number, wIn: number, lFt: number, qty = 1) => (tIn * wIn * lFt * qty) / 12

export const bfToM3 = (bf: number) => bf * BF_M3
export const m3ToBf = (m3: number) => m3 / BF_M3

/** Hardwood "quarters" notation: 4/4 = 1 in, 8/4 = 2 in. */
export const quarters = (q: number) => q / 4

export interface Piece {
  id: string
  name: string
  species: string
  t: number // thickness, in or mm
  w: number // width, in or mm
  l: number // length, ft or m
  qty: number
  price: number // per BF (imperial) or per m³ (metric)
}

export interface Line {
  bf: number
  m3: number
  linear: number // total length in ft (imperial) or m (metric)
  cost: number
}

/** Line totals; `metric` means inputs are mm, mm, m and price is per m³. Waste % is added on top. */
export function line(p: Piece, metric: boolean, wastePct = 0): Line {
  const k = 1 + Math.max(0, wastePct) / 100
  const bf = metric ? m3ToBf((p.t / 1000) * (p.w / 1000) * p.l * p.qty) * k : boardFeet(p.t, p.w, p.l, p.qty) * k
  const m3 = bfToM3(bf)
  return { bf, m3, linear: p.l * p.qty * k, cost: metric ? m3 * p.price : bf * p.price }
}

export function totals(pieces: Piece[], metric: boolean, wastePct = 0) {
  const by = new Map<string, Line>()
  const all: Line = { bf: 0, m3: 0, linear: 0, cost: 0 }
  for (const p of pieces) {
    const x = line(p, metric, wastePct)
    const key = p.species || 'Other'
    const s = by.get(key) ?? { bf: 0, m3: 0, linear: 0, cost: 0 }
    for (const f of ['bf', 'm3', 'linear', 'cost'] as const) {
      s[f] += x[f]
      all[f] += x[f]
    }
    by.set(key, s)
  }
  return { all, bySpecies: [...by.entries()].sort((a, b) => b[1].cost - a[1].cost) }
}
