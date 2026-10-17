// Breaker panel slot model: odd slots left, even right; multi-pole breakers span same-side slots (n, n+2, n+4).

export type Kind = 'std' | 'gfci' | 'afci' | 'dual' | 'spare'

export interface Circuit {
  label: string
  amps: number
  poles: 1 | 2 | 3
  kind: Kind
}

export type Circuits = Record<string, Circuit> // key = starting slot number

/** Leg (phase) of a slot. Rows alternate legs: slots 1–2 on A, 3–4 on B, … (3-phase: A, B, C). */
export function leg(slot: number, phases: 1 | 3 = 1): string {
  const row = Math.floor((slot - 1) / 2)
  return phases === 3 ? 'ABC'[row % 3] : 'AB'[row % 2]
}

/** slot → starting slot of the breaker occupying it (itself for the first pole). */
export function occupancy(slots: number, c: Circuits): Map<number, number> {
  const occ = new Map<number, number>()
  const starts = Object.keys(c).map(Number).filter((n) => n >= 1 && n <= slots).sort((a, b) => a - b)
  for (const s of starts) {
    if (occ.has(s)) continue
    for (let k = 0; k < c[s].poles; k++) {
      const t = s + 2 * k
      if (t > slots || occ.has(t)) break
      occ.set(t, s)
    }
  }
  return occ
}

/** Can a breaker starting at `slot` take `poles` positions without clashing with other breakers? */
export function fits(slots: number, c: Circuits, slot: number, poles: number): boolean {
  const occ = occupancy(slots, Object.fromEntries(Object.entries(c).filter(([k]) => Number(k) !== slot)))
  for (let k = 0; k < poles; k++) {
    const t = slot + 2 * k
    if (t > slots || occ.has(t)) return false
  }
  return true
}

/** Human slot range of a breaker, e.g. "5/7" for a 2-pole at 5. */
export const slotRange = (slot: number, poles: number) => Array.from({ length: poles }, (_, k) => slot + 2 * k).join('/')

export interface Summary {
  used: number
  free: number
  breakers: number
  multi: number
  perLeg: Record<string, number> // connected breaker amps per leg (each pole counted on its own leg)
}

export function summarize(slots: number, c: Circuits, phases: 1 | 3 = 1): Summary {
  const occ = occupancy(slots, c)
  const perLeg: Record<string, number> = phases === 3 ? { A: 0, B: 0, C: 0 } : { A: 0, B: 0 }
  let breakers = 0, multi = 0
  for (const [slot, start] of occ) {
    if (slot === start) {
      breakers++
      if (c[start].poles > 1) multi++
    }
    if (c[start].kind !== 'spare') perLeg[leg(slot, phases)] += c[start].amps
  }
  return { used: occ.size, free: slots - occ.size, breakers, multi, perLeg }
}
