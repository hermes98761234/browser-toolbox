// Conduit fill per NEC Chapter 9 (Table 1 limits, Table 4 conduit areas, Table 5 conductor areas).

/** Internal diameters (in) per trade size, NEC Chapter 9 Table 4. Area = π d² / 4. */
export const CONDUITS: Record<string, [string, number][]> = {
  EMT: [['1/2', 0.622], ['3/4', 0.824], ['1', 1.049], ['1-1/4', 1.38], ['1-1/2', 1.61], ['2', 2.067], ['2-1/2', 2.731], ['3', 3.356], ['3-1/2', 3.834], ['4', 4.334]],
  RMC: [['1/2', 0.632], ['3/4', 0.836], ['1', 1.063], ['1-1/4', 1.394], ['1-1/2', 1.624], ['2', 2.083], ['2-1/2', 2.489], ['3', 3.09], ['3-1/2', 3.57], ['4', 4.05], ['5', 5.073], ['6', 6.093]],
  IMC: [['1/2', 0.66], ['3/4', 0.864], ['1', 1.105], ['1-1/4', 1.448], ['1-1/2', 1.683], ['2', 2.15], ['2-1/2', 2.557], ['3', 3.176], ['3-1/2', 3.671], ['4', 4.166]],
  'PVC Sch 40': [['1/2', 0.602], ['3/4', 0.804], ['1', 1.029], ['1-1/4', 1.36], ['1-1/2', 1.59], ['2', 2.047], ['2-1/2', 2.445], ['3', 3.042], ['3-1/2', 3.521], ['4', 3.998], ['5', 5.016], ['6', 6.031]],
  'PVC Sch 80': [['1/2', 0.526], ['3/4', 0.722], ['1', 0.936], ['1-1/4', 1.255], ['1-1/2', 1.476], ['2', 1.913], ['2-1/2', 2.29], ['3', 2.864], ['3-1/2', 3.326], ['4', 3.786], ['5', 4.768], ['6', 5.709]],
  FMC: [['3/8', 0.384], ['1/2', 0.635], ['3/4', 0.824], ['1', 1.02], ['1-1/4', 1.275], ['1-1/2', 1.538], ['2', 2.04], ['2-1/2', 2.5], ['3', 3], ['3-1/2', 3.5], ['4', 4]],
}
export type ConduitType = keyof typeof CONDUITS

export const SIZES = ['14', '12', '10', '8', '6', '4', '3', '2', '1', '1/0', '2/0', '3/0', '4/0', '250', '300', '350', '400', '500', '600', '700', '750'] as const

/** Approximate areas (in²), NEC Chapter 9 Table 5, same order as SIZES. */
export const WIRES: Record<string, number[]> = {
  'THHN / THWN-2': [0.0097, 0.0133, 0.0211, 0.0366, 0.0507, 0.0824, 0.0973, 0.1158, 0.1562, 0.1855, 0.2223, 0.2679, 0.3237, 0.397, 0.4608, 0.5242, 0.5863, 0.7073, 0.8676, 0.9887, 1.0496],
  'XHHW / XHHW-2': [0.0139, 0.0181, 0.0243, 0.0437, 0.059, 0.0814, 0.0962, 0.1146, 0.1534, 0.1825, 0.219, 0.2642, 0.3197, 0.3904, 0.4536, 0.5166, 0.5782, 0.6984, 0.8709, 0.9923, 1.0532],
  'RHH / RHW-2 (no cover)': [0.0209, 0.026, 0.0333, 0.0556, 0.0726, 0.0973, 0.1134, 0.1333, 0.1901, 0.2223, 0.2624, 0.3117, 0.3718, 0.4596, 0.5281, 0.5958, 0.6619, 0.7901, 0.9729, 1.101, 1.1652],
  'THW / TW': [0.0139, 0.0181, 0.0243, 0.0437, 0.0726, 0.0973, 0.1134, 0.1333, 0.1901, 0.2223, 0.2624, 0.3117, 0.3718, 0.4596, 0.5281, 0.5958, 0.6619, 0.7901, 0.9729, 1.101, 1.1652],
}
export const WIRE_TYPES = Object.keys(WIRES)

export const areaOfDia = (d: number) => (Math.PI * d * d) / 4

export function conduitArea(type: string, size: string): number {
  const hit = CONDUITS[type]?.find(([s]) => s === size)
  return hit ? Math.round(areaOfDia(hit[1]) * 1000) / 1000 : NaN
}

export interface Conductor {
  id: string
  /** wire type, or 'Custom OD' */
  type: string
  size: string
  qty: number
  /** outside diameter (in) for custom cables */
  od: number
  ccc: boolean
}

export function conductorArea(c: Conductor): number {
  if (c.type === 'Custom OD') return areaOfDia(c.od)
  const i = SIZES.indexOf(c.size as (typeof SIZES)[number])
  return WIRES[c.type]?.[i] ?? NaN
}

/** Table 1: one conductor 53 %, two 31 %, more 40 %; nipples ≤ 24 in may fill 60 %. */
export function fillLimit(count: number, nipple = false): number {
  if (nipple) return 0.6
  return count === 1 ? 0.53 : count === 2 ? 0.31 : 0.4
}

export interface FillResult {
  count: number
  wireArea: number
  conduitArea: number
  fill: number
  limit: number
  ok: boolean
  /** area still available within the limit */
  spare: number
}

export function fill(conds: Conductor[], type: string, size: string, nipple = false): FillResult {
  const count = conds.reduce((a, c) => a + Math.max(0, c.qty), 0)
  const wireArea = conds.reduce((a, c) => a + Math.max(0, c.qty) * conductorArea(c), 0)
  const A = conduitArea(type, size)
  const limit = fillLimit(count, nipple)
  return { count, wireArea, conduitArea: A, fill: wireArea / A, limit, ok: wireArea <= A * limit + 1e-12, spare: A * limit - wireArea }
}

/** Smallest trade size of `type` that passes. */
export function smallestSize(conds: Conductor[], type: string, nipple = false): string | null {
  for (const [s] of CONDUITS[type]) if (fill(conds, type, s, nipple).ok) return s
  return null
}

/** Annex C style maximum count of one conductor size (round up when the fraction ≥ 0.8). */
export function maxSameSize(type: string, size: string, wireArea: number): number {
  const A = conduitArea(type, size)
  for (const n of [1, 2]) if (n === 2 ? wireArea * 2 > A * 0.31 : wireArea > A * 0.53) return n - 1
  const x = (A * 0.4) / wireArea
  const n = Math.floor(x)
  return Math.max(2, x - n >= 0.8 ? n + 1 : n)
}

/** Jam ratio D/d for three equal conductors (Annex C informative): 2.8–3.2 risks jamming on pulls. */
export function jamRatio(conduitDia: number, wireDia: number): number {
  return (1.05 * conduitDia) / wireDia
}

/** NEC 310.15(C)(1) adjustment for more than three current-carrying conductors. */
export function adjustment(ccc: number): number {
  if (ccc <= 3) return 1
  if (ccc <= 6) return 0.8
  if (ccc <= 9) return 0.7
  if (ccc <= 20) return 0.5
  if (ccc <= 30) return 0.45
  if (ccc <= 40) return 0.4
  return 0.35
}

/** Gravity packing of circles (radii) into a circle of radius R; returns centres and overlap flags. */
export function pack(R: number, radii: number[]): { x: number; y: number; r: number; bad: boolean }[] {
  const order = radii.map((r, i) => [r, i] as const).sort((a, b) => b[0] - a[0])
  const placed: { x: number; y: number; r: number; bad: boolean; i: number }[] = []
  const steps = 72
  for (const [r, i] of order) {
    let best: { x: number; y: number } | null = null
    const lim = R - r
    if (lim >= 0) {
      for (let a = 0; a <= steps; a++) {
        for (let b = 0; b <= steps; b++) {
          const x = -lim + (2 * lim * a) / steps
          const y = -lim + (2 * lim * b) / steps
          if (x * x + y * y > lim * lim + 1e-12) continue
          if (best && y <= best.y) continue // prefer the lowest spot (y grows downward)
          if (placed.every((p) => (p.x - x) ** 2 + (p.y - y) ** 2 >= (p.r + r) ** 2 - 1e-9)) best = { x, y }
        }
      }
    }
    placed.push(best ? { ...best, r, bad: false, i } : { x: 0, y: 0, r, bad: true, i })
  }
  return placed.sort((a, b) => a.i - b.i).map(({ x, y, r, bad }) => ({ x, y, r, bad }))
}
