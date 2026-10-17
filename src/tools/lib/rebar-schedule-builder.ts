// Bar bending schedule maths. Dimensions in mm, cut lengths in mm, weights in kg.
// Bend deductions (IS 2502 / common site practice): 45° = 1d, 90° = 2d, 135° = 3d; 180° hook adds 9d net;
// 135° stirrup hook adds 10d (minimum 75 mm) before deducting its bend.

export interface Shape { code: string; name: string; dims: string[]; hint: string; formula: string; len: (v: Record<string, number>, d: number) => number }

const hook135 = (d: number) => Math.max(10 * d, 75)

export const SHAPES: Shape[] = [
  { code: '00', name: 'Straight', dims: ['A'], hint: 'A = bar length', formula: 'A', len: (v) => v.A },
  { code: '01', name: 'Straight, 180° hooks', dims: ['A'], hint: 'A = length between hooks', formula: 'A + 2·9d', len: (v, d) => v.A + 18 * d },
  { code: '11', name: 'L-bar (one 90° bend)', dims: ['A', 'B'], hint: 'A, B = leg lengths out-to-out', formula: 'A + B − 2d', len: (v, d) => v.A + v.B - 2 * d },
  { code: '21', name: 'U-bar (two 90° bends)', dims: ['A', 'B', 'C'], hint: 'A, C = legs, B = base', formula: 'A + B + C − 4d', len: (v, d) => v.A + v.B + v.C - 4 * d },
  { code: '41', name: 'Z-bar / cranked leg', dims: ['A', 'B', 'C'], hint: 'three straight runs, two 90° bends', formula: 'A + B + C − 4d', len: (v, d) => v.A + v.B + v.C - 4 * d },
  { code: '25', name: 'Bent-up bar (two 45° cranks)', dims: ['A', 'H'], hint: 'A = overall length, H = crank height', formula: 'A + 2·0.414H − 4d', len: (v, d) => v.A + 2 * 0.414 * v.H - 4 * d },
  { code: '51', name: 'Rectangular stirrup / link', dims: ['A', 'B'], hint: 'A, B = out-to-out link size', formula: '2(A + B) + 2·hook − 3·2d − 2·3d', len: (v, d) => 2 * (v.A + v.B) + 2 * hook135(d) - 6 * d - 6 * d },
  { code: '67', name: 'Circular tie', dims: ['D'], hint: 'D = centre-line diameter', formula: 'πD + 2·hook − 2·3d', len: (v, d) => Math.PI * v.D + 2 * hook135(d) - 6 * d },
  { code: '77', name: 'Helix / spiral', dims: ['D', 'P', 'H'], hint: 'D = coil diameter, P = pitch, H = height', formula: '(H/P)·√((πD)² + P²) + πD', len: (v) => (v.P > 0 ? (v.H / v.P) * Math.hypot(Math.PI * v.D, v.P) + Math.PI * v.D : 0) },
]
export const shapeBy = (code: string) => SHAPES.find((s) => s.code === code) ?? SHAPES[0]

export const DIAMETERS = [6, 8, 10, 12, 16, 20, 25, 28, 32, 40]
/** Mass per metre of steel bar: π/4·d²·7850 kg/m³ ≈ d²/162. */
export const kgPerM = (d: number) => (Math.PI / 4) * (d / 1000) ** 2 * 7850

export interface Bar { id: string; mark: string; member: string; shape: string; dia: number; dims: Record<string, number>; members: number; perMember: number }

export function calc(b: Bar) {
  const sh = shapeBy(b.shape)
  const cut = Math.max(0, sh.len(b.dims, b.dia))
  const count = b.members * b.perMember
  const totalM = (cut * count) / 1000
  return { cut: Math.round(cut / 5) * 5, count, totalM, kg: totalM * kgPerM(b.dia) }
}

/** First-fit-decreasing: number of stock bars of length `stock` (mm) needed to cut `pieces` (mm). */
export function stockBars(pieces: number[], stock: number): { bars: number; waste: number; tooLong: number } {
  const bins: number[] = []
  let tooLong = 0
  for (const p of [...pieces].sort((a, b) => b - a)) {
    if (p > stock) { tooLong++; continue }
    const i = bins.findIndex((r) => r >= p)
    if (i >= 0) bins[i] -= p
    else bins.push(stock - p)
  }
  return { bars: bins.length, waste: bins.reduce((a, r) => a + r, 0), tooLong }
}

export function summary(bars: Bar[], stock: number) {
  const byDia = new Map<number, { count: number; m: number; kg: number; pieces: number[] }>()
  for (const b of bars) {
    const c = calc(b)
    const e = byDia.get(b.dia) ?? { count: 0, m: 0, kg: 0, pieces: [] }
    e.count += c.count; e.m += c.totalM; e.kg += c.kg
    if (c.count <= 5000) for (let i = 0; i < c.count; i++) e.pieces.push(c.cut)
    byDia.set(b.dia, e)
  }
  return [...byDia.entries()].sort((a, b) => a[0] - b[0]).map(([dia, e]) => ({ dia, ...e, stock: stockBars(e.pieces, stock) }))
}
