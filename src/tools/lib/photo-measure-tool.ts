// Photo measurement maths: scale calibration, planar homography (4-point perspective correction), areas.

export type P = [number, number]
export type H = number[] // 3×3 row-major, h[8] = 1

export const dist = (a: P, b: P) => Math.hypot(a[0] - b[0], a[1] - b[1])

/** Solves A·x = b in place with partial pivoting; returns null when singular. */
export function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length
  const M = A.map((r, i) => [...r, b[i]])
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r
    if (Math.abs(M[p][c]) < 1e-12) return null
    ;[M[c], M[p]] = [M[p], M[c]]
    for (let r = 0; r < n; r++) {
      if (r === c) continue
      const f = M[r][c] / M[c][c]
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]
    }
  }
  return M.map((r, i) => r[n] / r[i])
}

/** Homography mapping src[i] → dst[i] for four point pairs (direct linear transform). */
export function homography(src: P[], dst: P[]): H | null {
  if (src.length !== 4 || dst.length !== 4) return null
  const A: number[][] = []
  const b: number[] = []
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i]
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u)
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v)
  }
  const h = solve(A, b)
  return h ? [...h, 1] : null
}

export function apply(h: H, p: P): P {
  const w = h[6] * p[0] + h[7] * p[1] + h[8]
  return [(h[0] * p[0] + h[1] * p[1] + h[2]) / w, (h[3] * p[0] + h[4] * p[1] + h[5]) / w]
}

/** Shoelace area of a polygon (absolute). */
export function area(pts: P[]): number {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length]
    a += x1 * y2 - x2 * y1
  }
  return Math.abs(a) / 2
}

/** True when the quad is convex and non-degenerate (needed for a sensible homography). */
export function convexQuad(q: P[]): boolean {
  if (q.length !== 4) return false
  let sign = 0
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4]
    const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
    if (Math.abs(cr) < 1e-9) return false
    const s = Math.sign(cr)
    if (sign && s !== sign) return false
    sign = s
  }
  return true
}

/** Orders four points as top-left, top-right, bottom-right, bottom-left (image coordinates). */
export function orderQuad(q: P[]): P[] {
  const cx = q.reduce((a, p) => a + p[0], 0) / 4, cy = q.reduce((a, p) => a + p[1], 0) / 4
  const s = [...q].sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx))
  // atan2 order starting near -π is top-left-ish; rotate so the point with smallest x+y is first
  let k = 0
  s.forEach((p, i) => { if (p[0] + p[1] < s[k][0] + s[k][1]) k = i })
  return [...s.slice(k), ...s.slice(0, k)]
}

export const UNITS = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 } as const
export type Unit = keyof typeof UNITS

export const REFERENCES: { name: string; w: number; h: number }[] = [
  { name: 'Credit / ID card (ISO 7810 ID-1)', w: 85.6, h: 53.98 },
  { name: 'A4 paper', w: 210, h: 297 },
  { name: 'US Letter paper', w: 215.9, h: 279.4 },
  { name: 'A5 paper', w: 148, h: 210 },
  { name: 'Standard brick (UK)', w: 215, h: 65 },
  { name: 'US dollar bill', w: 156.1, h: 66.3 },
  { name: 'Euro €20 note', w: 133, h: 72 },
]
