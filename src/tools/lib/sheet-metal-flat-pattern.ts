// Sheet metal bending: bend allowance, setback, bend deduction, K-factor table and flat-pattern layout.

const rad = (deg: number) => (deg * Math.PI) / 180

/** Bend allowance: arc length of the neutral axis, BA = θ·(R + K·T). θ = bend (deflection) angle. */
export const bendAllowance = (deg: number, R: number, T: number, K: number) => rad(deg) * (R + K * T)

/** Outside setback: OSSB = tan(θ/2)·(R + T). Inside setback uses R only. */
export const setback = (deg: number, R: number, T: number, outside = true) => Math.tan(rad(deg) / 2) * (R + (outside ? T : 0))

/** Bend deduction: BD = 2·setback − BA (subtract from the sum of flange dimensions). */
export const bendDeduction = (deg: number, R: number, T: number, K: number, outside = true) => 2 * setback(deg, R, T, outside) - bendAllowance(deg, R, T, K)

export interface MaterialK { id: string; name: string; k: [number, number, number] /* R<T, T≤R≤3T, R>3T */; minR: number /* × T */ }
export const MATERIALS: MaterialK[] = [
  { id: 'al', name: 'Aluminium (5052-H32)', k: [0.33, 0.4, 0.5], minR: 1 },
  { id: 'al6', name: 'Aluminium (6061-T6)', k: [0.38, 0.42, 0.5], minR: 2.5 },
  { id: 'ms', name: 'Mild steel (CRS / DC01)', k: [0.38, 0.43, 0.5], minR: 0.5 },
  { id: 'ss', name: 'Stainless (304)', k: [0.4, 0.45, 0.5], minR: 0.5 },
  { id: 'cu', name: 'Copper / brass', k: [0.35, 0.41, 0.5], minR: 0.5 },
]

/** Rule-of-thumb K-factor from material and inside-radius / thickness ratio. */
export function kFactor(m: MaterialK, R: number, T: number): number {
  const r = R / T
  return r < 1 ? m.k[0] : r <= 3 ? m.k[1] : m.k[2]
}

export interface Flange { length: number }
export interface Bend { angle: number; up: boolean }
export interface FlatPiece { kind: 'flat' | 'bend'; length: number; start: number; bend?: Bend }

/**
 * Lays out the flat pattern. `flanges[i]` are dimensions to the outside (or inside) mold lines,
 * `bends[i]` sits between flanges i and i+1.
 */
export function flatPattern(flanges: number[], bends: Bend[], R: number, T: number, K: number, outside = true) {
  const sb = bends.map((b) => setback(b.angle, R, T, outside))
  const pieces: FlatPiece[] = []
  let x = 0
  flanges.forEach((f, i) => {
    const len = f - (i > 0 ? sb[i - 1] : 0) - (i < bends.length ? sb[i] : 0)
    pieces.push({ kind: 'flat', length: len, start: x })
    x += len
    if (i < bends.length && i < flanges.length - 1) {
      const ba = bendAllowance(bends[i].angle, R, T, K)
      pieces.push({ kind: 'bend', length: ba, start: x, bend: bends[i] })
      x += ba
    }
  })
  const deductions = bends.slice(0, Math.max(0, flanges.length - 1)).reduce((a, b) => a + bendDeduction(b.angle, R, T, K, outside), 0)
  return { pieces, total: x, check: flanges.reduce((a, b) => a + b, 0) - deductions }
}
