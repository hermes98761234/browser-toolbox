// Parametric 3D-printer calibration models built directly as triangle soups (Z-up, millimetres).
// Primitives are closed, outward-facing shells; overlapping shells are merged by every slicer.

export type V3 = [number, number, number]

export class MeshBuilder {
  t: number[] = []
  tri(a: V3, b: V3, c: V3) {
    this.t.push(...a, ...b, ...c)
  }
  quad(a: V3, b: V3, c: V3, d: V3) {
    this.tri(a, b, c)
    this.tri(a, c, d)
  }
  /** Box with centre c, orthonormal right-handed axes U,V,W and half sizes. */
  obox(c: V3, U: V3, V: V3, W: V3, hu: number, hv: number, hw: number) {
    const ax = [U, V, W], h = [hu, hv, hw]
    const p = (s: [number, number, number]): V3 => [0, 1, 2].map((k) => c[k] + s[0] * h[0] * ax[0][k] + s[1] * h[1] * ax[1][k] + s[2] * h[2] * ax[2][k]) as V3
    for (let a = 0; a < 3; a++) {
      const b = (a + 1) % 3, cc = (a + 2) % 3
      for (const sg of [1, -1]) {
        const mk = (sb: number, sc: number) => {
          const s: [number, number, number] = [0, 0, 0]
          s[a] = sg
          s[b] = sb
          s[cc] = sc
          return p(s)
        }
        const q = [mk(-1, -1), mk(1, -1), mk(1, 1), mk(-1, 1)]
        if (sg > 0) this.quad(q[0], q[1], q[2], q[3])
        else this.quad(q[3], q[2], q[1], q[0])
      }
    }
  }
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
    this.obox([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], [1, 0, 0], [0, 1, 0], [0, 0, 1], Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2, Math.abs(z1 - z0) / 2)
  }
  /** Convex polygon in the XZ plane (counter-clockwise seen from −Y), extruded from y0 to y1. */
  prismY(poly: [number, number][], y0: number, y1: number) {
    const P = (q: [number, number], y: number): V3 => [q[0], y, q[1]]
    for (let i = 1; i < poly.length - 1; i++) {
      this.tri(P(poly[0], y0), P(poly[i], y0), P(poly[i + 1], y0))
      this.tri(P(poly[0], y1), P(poly[i + 1], y1), P(poly[i], y1))
    }
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length]
      this.tri(P(a, y0), P(b, y1), P(b, y0))
      this.tri(P(a, y0), P(a, y1), P(b, y1))
    }
  }
  /** Cylinder / cone frustum along +Z. */
  cyl(cx: number, cy: number, z0: number, h: number, r0: number, r1: number, seg = 32) {
    const pt = (i: number, r: number, z: number): V3 => [cx + r * Math.cos((2 * Math.PI * i) / seg), cy + r * Math.sin((2 * Math.PI * i) / seg), z]
    for (let i = 0; i < seg; i++) {
      const b0 = pt(i, r0, z0), b1 = pt(i + 1, r0, z0), t0 = pt(i, r1, z0 + h), t1 = pt(i + 1, r1, z0 + h)
      this.tri([cx, cy, z0], b1, b0)
      if (r1 > 0) {
        this.tri([cx, cy, z0 + h], t0, t1)
        this.quad(b0, b1, t1, t0)
      } else this.tri(b0, b1, t1)
    }
  }
  /** Stroke (thin box) lying on a face: origin O, in-face axes U,V, outward normal W; segment centre (u,v), length, angle, width, emboss depth. */
  stroke(O: V3, U: V3, V: V3, W: V3, u: number, v: number, len: number, ang: number, width: number, depth: number) {
    const ca = Math.cos(ang), sa = Math.sin(ang)
    const U2 = [0, 1, 2].map((k) => ca * U[k] + sa * V[k]) as V3
    const V2 = [0, 1, 2].map((k) => -sa * U[k] + ca * V[k]) as V3
    const c = [0, 1, 2].map((k) => O[k] + u * U[k] + v * V[k] + (depth / 2 - 0.01) * W[k]) as V3
    this.obox(c, U2, V2, W, len / 2, width / 2, depth / 2)
  }
  get positions() {
    return new Float32Array(this.t)
  }
}

export interface Face { O: V3; U: V3; V: V3; W: V3 }
export const FRONT = (x: number, z: number, y = 0): Face => ({ O: [x, y, z], U: [1, 0, 0], V: [0, 0, 1], W: [0, -1, 0] })
export const TOP = (x: number, y: number, z: number): Face => ({ O: [x, y, z], U: [1, 0, 0], V: [0, 1, 0], W: [0, 0, 1] })
export const RIGHT = (x: number, y: number, z: number): Face => ({ O: [x, y, z], U: [0, 1, 0], V: [0, 0, 1], W: [1, 0, 0] })

const SEG: Record<string, string> = { '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', '-': 'g', '.': '' }

/** Seven-segment text embossed on a face; (u,v) = bottom-centre of the text. Returns text width. */
export function sevenSeg(m: MeshBuilder, f: Face, text: string, u: number, v: number, h: number, stroke = 0.8, depth = 0.6): number {
  const w = h * 0.55, gap = h * 0.22
  const total = text.length * w + (text.length - 1) * gap
  let x = u - total / 2
  for (const ch of text) {
    const s = SEG[ch] ?? ''
    const H = (cu: number, cv: number) => m.stroke(f.O, f.U, f.V, f.W, x + cu, v + cv, w, 0, stroke, depth)
    const Vt = (cu: number, cv: number) => m.stroke(f.O, f.U, f.V, f.W, x + cu, v + cv, h / 2 + stroke / 2, Math.PI / 2, stroke, depth)
    if (s.includes('a')) H(w / 2, h - stroke / 2)
    if (s.includes('g')) H(w / 2, h / 2)
    if (s.includes('d')) H(w / 2, stroke / 2)
    if (s.includes('b')) Vt(w - stroke / 2, (3 * h) / 4 - stroke / 4)
    if (s.includes('c')) Vt(w - stroke / 2, h / 4 + stroke / 4)
    if (s.includes('f')) Vt(stroke / 2, (3 * h) / 4 - stroke / 4)
    if (s.includes('e')) Vt(stroke / 2, h / 4 + stroke / 4)
    if (ch === '.') m.stroke(f.O, f.U, f.V, f.W, x + w / 2, v + stroke / 2, stroke, 0, stroke, depth)
    x += w + gap
  }
  return total
}

/** Letters X, Y, Z for the calibration cube; (u,v) = centre. */
export function letter(m: MeshBuilder, f: Face, ch: 'X' | 'Y' | 'Z', u: number, v: number, h: number, stroke = 1.2, depth = 0.6) {
  const w = h * 0.7
  const S = (cu: number, cv: number, len: number, ang: number) => m.stroke(f.O, f.U, f.V, f.W, u + cu, v + cv, len, ang, stroke, depth)
  const diag = Math.hypot(w, h), a = Math.atan2(h, w)
  if (ch === 'X') {
    S(0, 0, diag, a)
    S(0, 0, diag, -a)
  } else if (ch === 'Y') {
    const d2 = Math.hypot(w / 2, h / 2), a2 = Math.atan2(h / 2, w / 2)
    S(-w / 4, h / 4, d2, -a2)
    S(w / 4, h / 4, d2, a2)
    S(0, -h / 4, h / 2, Math.PI / 2)
  } else {
    S(0, h / 2 - stroke / 2, w, 0)
    S(0, -h / 2 + stroke / 2, w, 0)
    S(0, 0, Math.hypot(w, h - stroke), Math.atan2(h - stroke, w))
  }
}

export interface Note { z: number; text: string }
export interface Model { pos: Float32Array; notes: Note[]; name: string }

export interface TempOpts { start: number; end: number; step: number; segH: number }
export function temperatureTower(o: TempOpts): Model {
  const m = new MeshBuilder()
  const step = Math.max(1, Math.abs(o.step)) * (o.end < o.start ? -1 : 1)
  const n = Math.max(1, Math.min(20, Math.floor(Math.abs(o.end - o.start) / Math.abs(step)) + 1))
  const H = Math.max(6, o.segH), D = 10, W = 36
  m.box(-3, -3, 0, W + H + 2, D + 3, 1) // brim-like base plate
  const notes: Note[] = []
  for (let i = 0; i < n; i++) {
    const z = i * H, t = o.start + i * step
    m.box(0, 0, z, W, D, z + 1) // slab (also the bridge for the segment below)
    m.box(0, 0, z + 1, 14, D, z + H) // left pillar with label
    m.box(28, 0, z + 1, W, D, z + H) // right pillar
    m.prismY([[W, z + 1], [W + H - 1, z + H], [W, z + H]], 0, D) // 45° overhang
    m.cyl(21, D / 2, z + 1, H - 2, 2.5, 0, 24) // stringing / tip cone
    sevenSeg(m, FRONT(0, z + 1), String(Math.round(t)), 7, 1.2, Math.min(6, H - 3.5))
    notes.push({ z, text: i === 0 ? `Start: print the first ${H} mm at ${t} °C` : `Z = ${z.toFixed(2)} mm → M104 S${t}` })
  }
  m.box(0, 0, n * H, W, D, n * H + 1)
  return { pos: m.positions, notes, name: `temp-tower-${o.start}-${o.start + (n - 1) * step}` }
}

export function calibrationCube(size: number): Model {
  const m = new MeshBuilder()
  const s = Math.max(5, size)
  m.box(0, 0, 0, s, s, s)
  const h = s * 0.55
  letter(m, FRONT(0, 0), 'X', s / 2, s / 2, h)
  letter(m, RIGHT(s, 0, 0), 'Y', s / 2, s / 2, h)
  letter(m, TOP(0, 0, s), 'Z', s / 2, s / 2, h)
  return { pos: m.positions, notes: [{ z: 0, text: `Measure X, Y and Z: each should read ${s.toFixed(2)} mm (letters add 0.6 mm on their faces). New steps/mm = old × ${s} / measured.` }], name: `xyz-cube-${s}mm` }
}

export interface RetractOpts { segments: number; start: number; step: number; segH: number; spacing: number }
export function retractionTower(o: RetractOpts): Model {
  const m = new MeshBuilder()
  const n = Math.max(1, Math.min(20, Math.round(o.segments))), H = Math.max(3, o.segH), sp = Math.max(15, o.spacing)
  m.box(-6, -6, 0, sp + 6, 6, 1)
  const notes: Note[] = []
  for (const x of [0, sp]) {
    m.cyl(x, 0, 1, n * H, 3, 3, 32)
    for (let i = 1; i < n; i++) m.cyl(x, 0, 1 + i * H - 0.3, 0.6, 3.6, 3.6, 32) // marker ring at each step
  }
  for (let i = 0; i < n; i++) {
    const r = o.start + i * o.step
    notes.push({ z: 1 + i * H, text: `${i === 0 ? 'Start' : `Z = ${(1 + i * H).toFixed(2)} mm`} → retraction ${r.toFixed(2)} mm` })
  }
  sevenSeg(m, TOP(0, -5.5, 1), String(o.start), sp / 2, 0, 3.5, 0.7, 0.4)
  return { pos: m.positions, notes, name: `retraction-tower-${n}x${H}mm` }
}

export interface OverhangOpts { from: number; to: number; step: number; len: number }
export function overhangTest(o: OverhangOpts): Model {
  const m = new MeshBuilder()
  const angles: number[] = []
  for (let a = o.from; a <= o.to + 1e-9 && angles.length < 12; a += Math.max(1, o.step)) angles.push(Math.min(85, a))
  const L = Math.max(5, o.len), pitch = 8, wallH = L + 4
  const Y = angles.length * pitch
  m.box(-12, -2, 0, L + 4, Y + 2, 1.2)
  m.box(0, 0, 1.2, 3, Y, 1.2 + wallH)
  angles.forEach((a, k) => {
    const r = (a * Math.PI) / 180
    const zb = 1.2 + 1, dx = L * Math.sin(r), dz = L * Math.cos(r)
    // fin: underside leaves the wall at `a` degrees from vertical, flat top
    const top = Math.min(1.2 + wallH, zb + dz + 1)
    m.prismY([[3, zb], [3 + dx, zb + dz], [3 + dx, top], [3, top]].map(([x, z]) => [x, z] as [number, number]), k * pitch + 1, k * pitch + pitch - 1)
    sevenSeg(m, TOP(0, 0, 1.2), String(a), -6, k * pitch + 2.3, 3.4, 0.6, 0.4)
  })
  return { pos: m.positions, notes: angles.map((a) => ({ z: 0, text: `Fin at ${a}° from vertical` })), name: `overhang-test-${o.from}-${o.to}` }
}

export function bridgeTest(lengths: number[], h: number): Model {
  const m = new MeshBuilder()
  const L = lengths.filter((x) => x > 0).slice(0, 8)
  const maxL = Math.max(10, ...L), pitch = 9, P = 5
  m.box(-11, -2, 0, maxL + 2 * P + 2, L.length * pitch + 1, 1)
  L.forEach((len, k) => {
    const y0 = k * pitch, x1 = P + len
    m.box(0, y0, 1, P, y0 + 5, 1 + h)
    m.box(x1, y0, 1, x1 + P, y0 + 5, 1 + h)
    m.box(0, y0, 1 + h, x1 + P, y0 + 5, 2 + h)
    sevenSeg(m, TOP(0, 0, 1), String(len), -5.5, y0 + 1, 3, 0.6, 0.4)
  })
  return { pos: m.positions, notes: L.map((l) => ({ z: 1 + h, text: `Bridge ${l} mm` })), name: `bridge-test` }
}

export function bounds(pos: Float32Array): { min: V3; max: V3 } {
  const min: V3 = [Infinity, Infinity, Infinity], max: V3 = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < pos.length; i += 3)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], pos[i + k])
      max[k] = Math.max(max[k], pos[i + k])
    }
  return { min, max }
}

/** Signed volume of a triangle soup (sum over shells; overlapping shells are counted twice). */
export function signedVolume(pos: Float32Array): number {
  let v = 0
  for (let i = 0; i < pos.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = pos.subarray(i, i + 9)
    v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6
  }
  return v
}
