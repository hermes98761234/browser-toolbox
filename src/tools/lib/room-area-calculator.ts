// Polygon geometry for room areas: shoelace area, perimeter, centroid, self-intersection, walk parser.

export type P = [number, number]

/** Signed shoelace area (positive = counter-clockwise in y-up coordinates). */
export function signedArea(p: P[]): number {
  let s = 0
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i]
    const [x2, y2] = p[(i + 1) % p.length]
    s += x1 * y2 - x2 * y1
  }
  return s / 2
}

export const area = (p: P[]) => (p.length < 3 ? 0 : Math.abs(signedArea(p)))

export function edges(p: P[]): number[] {
  return p.map((a, i) => Math.hypot(p[(i + 1) % p.length][0] - a[0], p[(i + 1) % p.length][1] - a[1]))
}

export const perimeter = (p: P[]) => (p.length < 2 ? 0 : edges(p).reduce((a, b) => a + b, 0))

export function centroid(p: P[]): P {
  const A = signedArea(p)
  if (Math.abs(A) < 1e-12) {
    const n = p.length || 1
    return [p.reduce((a, q) => a + q[0], 0) / n, p.reduce((a, q) => a + q[1], 0) / n]
  }
  let cx = 0, cy = 0
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i]
    const [x2, y2] = p[(i + 1) % p.length]
    const f = x1 * y2 - x2 * y1
    cx += (x1 + x2) * f
    cy += (y1 + y2) * f
  }
  return [cx / (6 * A), cy / (6 * A)]
}

function segX(a: P, b: P, c: P, d: P) {
  const o = (p: P, q: P, r: P) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]))
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0
}

/** True when any two non-adjacent edges cross (area would be wrong). */
export function selfIntersects(p: P[]): boolean {
  const n = p.length
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue
      if (segX(p[i], p[(i + 1) % n], p[j], p[(j + 1) % n])) return true
    }
  return false
}

/** Interior angle at each vertex in degrees. */
export function angles(p: P[]): number[] {
  const ccw = signedArea(p) > 0
  return p.map((b, i) => {
    const a = p[(i - 1 + p.length) % p.length]
    const c = p[(i + 1) % p.length]
    const a1 = Math.atan2(a[1] - b[1], a[0] - b[0])
    const a2 = Math.atan2(c[1] - b[1], c[0] - b[0])
    let d = ((a1 - a2) * 180) / Math.PI
    if (!ccw) d = -d
    return ((d % 360) + 360) % 360
  })
}

/**
 * Walk the walls: "E 4, S 3, W 1.5, N 1, W 2.5" (or R/L/U/D, or "45@3" = 3 units at 45°).
 * Returns the vertices starting at (0,0); the closing wall back to start is implied.
 */
export function parseWalk(text: string): { pts: P[]; error?: string; gap: number } {
  const dir: Record<string, number> = { E: 0, R: 0, N: 90, U: 90, W: 180, L: 180, S: 270, D: 270, NE: 45, NW: 135, SW: 225, SE: 315 }
  const pts: P[] = [[0, 0]]
  let [x, y] = [0, 0]
  for (const tok of text.split(/[,;\n]+/).map((t) => t.trim()).filter(Boolean)) {
    let m = /^(NE|NW|SE|SW|[NESWRLUD])\s*([\d.]+)$/i.exec(tok)
    let ang: number, len: number
    if (m) {
      ang = dir[m[1].toUpperCase()]
      len = Number(m[2])
    } else if ((m = /^(-?[\d.]+)\s*@\s*([\d.]+)$/.exec(tok))) {
      ang = Number(m[1])
      len = Number(m[2])
    } else return { pts, error: `Can’t read “${tok}”. Use E 4, N 2.5 or 30@2.`, gap: 0 }
    if (!Number.isFinite(len)) return { pts, error: `Bad length in “${tok}”`, gap: 0 }
    x += len * Math.cos((ang * Math.PI) / 180)
    y += len * Math.sin((ang * Math.PI) / 180)
    pts.push([+x.toFixed(6), +y.toFixed(6)])
  }
  const gap = Math.hypot(x, y)
  if (gap < 1e-6) pts.pop()
  return { pts, gap }
}

export const UNITS = {
  m: { label: 'meters', short: 'm', toM: 1 },
  ft: { label: 'feet', short: 'ft', toM: 0.3048 },
  cm: { label: 'centimeters', short: 'cm', toM: 0.01 },
  in: { label: 'inches', short: 'in', toM: 0.0254 },
} as const
export type Unit = keyof typeof UNITS

/** Area in square meters from area in unit². */
export const toM2 = (a: number, u: Unit) => a * UNITS[u].toM ** 2
