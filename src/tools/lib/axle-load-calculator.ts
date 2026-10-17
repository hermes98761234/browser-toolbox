// Static axle-load distribution by lever arms (moments about axle groups).
// Positions in metres, loads in kg. Axle groups (tandem/tridem) are treated as one load point at their centre.

export interface Vehicle {
  kind: 'rigid' | 'semi'
  /** rigid: steer → rear group centre; semi: steer → drive group centre */
  wb: number
  /** semi: fifth-wheel (kingpin) position measured from the steer axle */
  fifth: number
  /** semi: kingpin → trailer axle group centre */
  kp: number
  /** cargo-deck front edge: rigid = from steer axle; semi = from kingpin (negative = ahead of kingpin) */
  deck: number
  deckLen: number
  /** empty loads per axle group: rigid [steer, rear]; semi [steer, drive, trailer] */
  tare: number[]
  limits: number[]
  gvw: number
}

export interface Item { name: string; kg: number; at: number; len: number } // at = distance of item front from deck front

/** Splits load W at distance x behind support A onto supports A and B that are `span` apart. */
export function lever(W: number, x: number, span: number): [number, number] {
  const b = (W * x) / span
  return [W - b, b]
}

/** Axle-group loads (tare + cargo) for a list of point/uniform loads. */
export function axleLoads(v: Vehicle, items: Item[]): number[] {
  const out = [...v.tare]
  for (const it of items) {
    if (!(it.kg > 0)) continue
    const x = v.deck + it.at + it.len / 2 // centre of gravity of a uniformly loaded item
    if (v.kind === 'rigid') {
      const [f, r] = lever(it.kg, x, v.wb)
      out[0] += f; out[1] += r
    } else {
      const [kingpin, trailer] = lever(it.kg, x, v.kp)
      const [steer, drive] = lever(kingpin, v.fifth, v.wb)
      out[0] += steer; out[1] += drive; out[2] += trailer
    }
  }
  return out
}

/** Combined cargo centre of gravity measured from the deck front. */
export function cargoCg(items: Item[]): number {
  const w = items.reduce((a, i) => a + Math.max(0, i.kg), 0)
  return w > 0 ? items.reduce((a, i) => a + Math.max(0, i.kg) * (i.at + i.len / 2), 0) / w : NaN
}

/** Highest load/limit ratio over all groups and the gross weight. */
export function worstRatio(v: Vehicle, loads: number[]): number {
  const g = loads.reduce((a, b) => a + b, 0)
  return Math.max(g / v.gvw, ...loads.map((l, i) => l / (v.limits[i] || Infinity)))
}

/** Best rigid shift (m) of the whole cargo along the deck, within bounds, minimising the worst axle ratio. */
export function bestShift(v: Vehicle, items: Item[], step = 0.05): number {
  const minAt = Math.min(...items.map((i) => i.at)), maxEnd = Math.max(...items.map((i) => i.at + i.len))
  if (!Number.isFinite(minAt)) return 0
  let best = 0, bestR = Infinity
  for (let d = -minAt; d <= v.deckLen - maxEnd + 1e-9; d += step) {
    const r = worstRatio(v, axleLoads(v, items.map((i) => ({ ...i, at: i.at + d }))))
    if (r < bestR - 1e-9 || (Math.abs(r - bestR) < 1e-9 && Math.abs(d) < Math.abs(best))) { bestR = r; best = d }
  }
  return Math.round(best * 100) / 100
}
