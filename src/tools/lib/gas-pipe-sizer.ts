// Fuel-gas pipe capacities from the IFGC / NFPA 54 sizing equations (not copied tables),
// with the longest-length and branch-length sizing methods.

export type Gas = 'ng' | 'lp'
export type Material = 'steel' | 'copperL' | 'pe'

/** Gas constants (IFGC Table 402.4 notes): Cr and Y. */
export const GAS: Record<Gas, { name: string; Cr: number; Y: number; sg: number; btuPerCf: number }> = {
  ng: { name: 'Natural gas', Cr: 0.6094, Y: 0.9992, sg: 0.6, btuPerCf: 1000 },
  lp: { name: 'Propane (undiluted)', Cr: 1.2462, Y: 0.991, sg: 1.52, btuPerCf: 2516 },
}

/** Nominal sizes and actual inside diameters (inches). */
export const PIPES: Record<Material, { name: string; sizes: [string, number][] }> = {
  steel: { name: 'Schedule 40 steel', sizes: [['1/2', 0.622], ['3/4', 0.824], ['1', 1.049], ['1-1/4', 1.38], ['1-1/2', 1.61], ['2', 2.067], ['2-1/2', 2.469], ['3', 3.068], ['4', 4.026]] },
  copperL: { name: 'Copper tube type L', sizes: [['3/8', 0.43], ['1/2', 0.545], ['5/8', 0.666], ['3/4', 0.785], ['1', 1.025], ['1-1/4', 1.265], ['1-1/2', 1.505], ['2', 1.985]] },
  pe: { name: 'PE SDR 11 (underground)', sizes: [['1/2', 0.66], ['3/4', 0.86], ['1', 1.077], ['1-1/4', 1.358], ['1-1/2', 1.554], ['2', 1.943], ['3', 2.864], ['4', 3.682]] },
}

/** Low-pressure equation (< 1.5 psi): Q = 2313·D^2.623·(ΔH/(Cr·L))^0.541. Q cfh, D in, ΔH in w.c., L ft. */
export function qLow(D: number, L: number, dH: number, Cr: number): number {
  return 2313 * D ** 2.623 * (dH / (Cr * L)) ** 0.541
}

/** High-pressure equation (≥ 1.5 psi): Q = 2237·D^2.623·((P1² − P2²)·Y/(Cr·L))^0.541. P absolute psia. */
export function qHigh(D: number, L: number, P1: number, P2: number, Cr: number, Y: number): number {
  return 2237 * D ** 2.623 * (((P1 * P1 - P2 * P2) * Y) / (Cr * L)) ** 0.541
}

export interface Pressure { mode: 'low' | 'high'; dropInWc: number; inletPsig: number; dropPsi: number }

export function capacity(D: number, L: number, gas: Gas, p: Pressure): number {
  const g = GAS[gas]
  if (p.mode === 'low') return qLow(D, L, p.dropInWc, g.Cr)
  const P1 = p.inletPsig + 14.7
  return qHigh(D, L, P1, Math.max(0, P1 - p.dropPsi), g.Cr, g.Y)
}

export interface Section { id: string; name: string; parent: string; length: number; appliance: string; btu: number }

export interface Sized {
  id: string
  /** cumulative distance from the meter to the end of this section */
  dist: number
  /** load carried (Btu/h and cfh) */
  btu: number
  cfh: number
  /** length used for sizing */
  Lsize: number
  size: string | null
  D: number
  cap: number
  /** true if this section lies on the path to the most remote outlet */
  critical: boolean
}

/** Sizes every section of a tree rooted at parent === 'meter'. */
export function sizeSystem(secs: Section[], gas: Gas, mat: Material, p: Pressure, method: 'longest' | 'branch', btuPerCf = GAS[gas].btuPerCf): { rows: Sized[]; longest: number; errors: string[] } {
  const byId = new Map(secs.map((s) => [s.id, s]))
  const kids = new Map<string, Section[]>()
  const errors: string[] = []
  for (const s of secs) {
    if (s.parent !== 'meter' && !byId.has(s.parent)) errors.push(`${s.name}: unknown upstream section`)
    if (!kids.has(s.parent)) kids.set(s.parent, [])
    kids.get(s.parent)!.push(s)
  }
  const dist = new Map<string, number>()
  const visiting = new Set<string>()
  const distOf = (s: Section): number => {
    if (dist.has(s.id)) return dist.get(s.id)!
    if (visiting.has(s.id)) {
      errors.push(`${s.name}: loop in the piping tree`)
      return NaN
    }
    visiting.add(s.id)
    const par = byId.get(s.parent)
    const d = (par ? distOf(par) : 0) + Math.max(0, s.length)
    dist.set(s.id, d)
    return d
  }
  secs.forEach(distOf)
  const down = (id: string, f: (s: Section) => void, seen = new Set<string>()) => {
    for (const k of kids.get(id) ?? []) {
      if (seen.has(k.id)) continue
      seen.add(k.id)
      f(k)
      down(k.id, f, seen)
    }
  }
  const longest = Math.max(0, ...secs.map((s) => dist.get(s.id) ?? 0).filter(Number.isFinite))
  // critical path: ancestors of the most remote section
  const far = secs.find((s) => dist.get(s.id) === longest)
  const crit = new Set<string>()
  for (let c = far; c && !crit.has(c.id); c = byId.get(c.parent)) crit.add(c.id)
  const sizes = PIPES[mat].sizes
  const rows = secs.map((s) => {
    let btu = Math.max(0, s.btu), maxD = dist.get(s.id) ?? 0
    down(s.id, (k) => {
      btu += Math.max(0, k.btu)
      maxD = Math.max(maxD, dist.get(k.id) ?? 0)
    })
    const cfh = btu / btuPerCf
    const Lsize = Math.max(1, method === 'longest' ? longest : maxD)
    const hit = sizes.find(([, D]) => capacity(D, Lsize, gas, p) >= cfh - 1e-9)
    return { id: s.id, dist: dist.get(s.id) ?? NaN, btu, cfh, Lsize, size: hit ? hit[0] : null, D: hit ? hit[1] : NaN, cap: hit ? capacity(hit[1], Lsize, gas, p) : NaN, critical: crit.has(s.id) }
  })
  return { rows, longest, errors: [...new Set(errors)] }
}

/** Code-style capacity table (cfh) for standard lengths. */
export const LENGTHS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 125, 150, 175, 200, 250, 300]
export function table(mat: Material, gas: Gas, p: Pressure): { size: string; caps: number[] }[] {
  return PIPES[mat].sizes.map(([size, D]) => ({ size, caps: LENGTHS.map((L) => capacity(D, L, gas, p)) }))
}
