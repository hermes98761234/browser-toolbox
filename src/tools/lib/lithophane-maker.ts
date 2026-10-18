// Lithophane relief: image brightness → plate thickness (dark = thick), flat or cylindrical, as a
// closed triangle mesh (front relief, flat back, side walls) in millimetres.

export interface LithoOpts {
  width: number // plate width (mm), arc length when curved
  minT: number // thickness of the brightest pixel (mm)
  maxT: number // thickness of the darkest pixel (mm)
  border: number // solid frame width (mm), at maxT
  mode: 'flat' | 'curved'
  angle: number // arc angle (°) for curved mode
}

/** Rec. 709 luma of an RGBA buffer → 0..1 with contrast/brightness/gamma adjustments. */
export function toGray(rgba: Uint8ClampedArray, n: number, adj: { contrast: number; brightness: number; gamma: number; invert: boolean }): Float32Array {
  const g = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const a = rgba[i * 4 + 3] / 255
    // transparent pixels become white (thin)
    let v = ((0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2]) / 255) * a + (1 - a)
    v = (v - 0.5) * adj.contrast + 0.5 + adj.brightness
    v = Math.min(1, Math.max(0, v))
    v = Math.pow(v, 1 / adj.gamma)
    g[i] = adj.invert ? 1 - v : v
  }
  return g
}

/** Thickness grid (cols × rows) including the frame. */
export function thickness(gray: Float32Array, cols: number, rows: number, o: LithoOpts): { t: Float32Array; cols: number; rows: number; cell: number } {
  const cell = o.width / (cols - 1 + 0)
  const bc = Math.max(0, Math.round(o.border / cell))
  const C = cols + 2 * bc, R = rows + 2 * bc
  const t = new Float32Array(C * R).fill(o.maxT)
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) t[(j + bc) * C + i + bc] = o.minT + (1 - gray[j * cols + i]) * (o.maxT - o.minT)
  return { t, cols: C, rows: R, cell: o.width / (C - 1) }
}

/** Closed mesh; returns flat triangle positions (x, y, z in mm, z up/out of the plate). */
export function buildMesh(t: Float32Array, C: number, R: number, o: LithoOpts): Float32Array {
  const W = o.width, H = (W * (R - 1)) / (C - 1)
  const theta = (Math.min(359, Math.max(1, o.angle)) * Math.PI) / 180
  const rad = W / theta
  const P = (i: number, j: number, d: number): [number, number, number] => {
    const u = (i / (C - 1)) * W, v = H - (j / (R - 1)) * H
    if (o.mode === 'flat') return [u, v, d]
    const a = (u / W - 0.5) * theta
    const r = rad + d
    return [r * Math.sin(a), v, r * Math.cos(a) - rad]
  }
  const tris = (C - 1) * (R - 1) * 4 + ((C - 1) * 2 + (R - 1) * 2) * 2
  const out = new Float32Array(tris * 9)
  let k = 0
  const tri = (a: number[], b: number[], c: number[]) => {
    out.set(a, k)
    out.set(b, k + 3)
    out.set(c, k + 6)
    k += 9
  }
  const F = (i: number, j: number) => P(i, j, t[j * C + i])
  const B = (i: number, j: number) => P(i, j, 0)
  for (let j = 0; j < R - 1; j++)
    for (let i = 0; i < C - 1; i++) {
      // front (normal +z): counter-clockwise seen from +z, with v increasing upwards (j down)
      tri(F(i, j), F(i, j + 1), F(i + 1, j + 1))
      tri(F(i, j), F(i + 1, j + 1), F(i + 1, j))
      tri(B(i, j), B(i + 1, j + 1), B(i, j + 1))
      tri(B(i, j), B(i + 1, j), B(i + 1, j + 1))
    }
  const wall = (a: [number, number], b: [number, number]) => {
    tri(F(...a), B(...b), F(...b))
    tri(F(...a), B(...a), B(...b))
  }
  for (let i = 0; i < C - 1; i++) {
    wall([i + 1, 0], [i, 0]) // top edge
    wall([i, R - 1], [i + 1, R - 1]) // bottom edge
  }
  for (let j = 0; j < R - 1; j++) {
    wall([0, j], [0, j + 1]) // left
    wall([C - 1, j + 1], [C - 1, j]) // right
  }
  return out
}

/** Signed volume of a closed mesh (mm³). */
export function meshVolume(p: Float32Array): number {
  let v = 0
  for (let i = 0; i < p.length; i += 9)
    v += p[i] * (p[i + 4] * p[i + 8] - p[i + 5] * p[i + 7]) - p[i + 1] * (p[i + 3] * p[i + 8] - p[i + 5] * p[i + 6]) + p[i + 2] * (p[i + 3] * p[i + 7] - p[i + 4] * p[i + 6])
  return v / 6
}

/** Simulated backlit appearance: transmitted light ∝ exp(−k·t). Returns 0..1 per cell. */
export const transmit = (t: number, minT: number, k = 0.9) => Math.exp(-k * (t - minT))
