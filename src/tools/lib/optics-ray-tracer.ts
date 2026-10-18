// 2D geometric optics: ideal thin lenses, thick spherical lenses (Snell refraction), mirrors,
// prisms and screens. Units: centimetres on an optical bench, y up.

export type El =
  | { id: string; kind: 'thin'; x: number; y: number; a: number; f: number }
  | { id: string; kind: 'thick'; x: number; y: number; a: number; r1: number; r2: number; t: number; n: number }
  | { id: string; kind: 'mirror'; x: number; y: number; a: number; r: number }
  | { id: string; kind: 'screen'; x: number; y: number; a: number }
  | { id: string; kind: 'prism'; x: number; y: number; size: number; rot: number; n: number }

export interface Source { kind: 'parallel' | 'point'; x: number; y: number; angle: number; spread: number; width: number; count: number; white: boolean }

export type V = [number, number]
const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1]]
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1]]
const mulS = (a: V, k: number): V => [a[0] * k, a[1] * k]
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1]
const unit = (a: V): V => {
  const l = Math.hypot(a[0], a[1]) || 1
  return [a[0] / l, a[1] / l]
}
const EPS = 1e-7

/** Refractive index at wavelength λ (nm) via Cauchy, anchored so n(589 nm) = nD. */
export function cauchy(nD: number, lambda: number, B = 9000): number {
  return nD + B / (lambda * lambda) - B / (589 * 589)
}

/** Snell refraction of unit direction d at a surface with unit normal nrm (any orientation). Returns null on total internal reflection. */
export function refract(d: V, nrm: V, n1: number, n2: number): V | null {
  let n = nrm
  let cosi = -dot(d, n)
  if (cosi < 0) {
    n = mulS(n, -1)
    cosi = -cosi
  }
  const eta = n1 / n2
  const k = 1 - eta * eta * (1 - cosi * cosi)
  if (k < 0) return null
  return unit(add(mulS(d, eta), mulS(n, eta * cosi - Math.sqrt(k))))
}

export const reflect = (d: V, n: V): V => unit(sub(d, mulS(n, 2 * dot(d, n))))

// ---------------- surfaces
type Hit = { t: number; p: V; nrm: V; act: (d: V, lambda: number, inside: Set<string>) => { d: V | null; enter?: string; leave?: string } }

/** Intersection with the vertical segment x = x0, |y − yc| ≤ a. */
function vSeg(o: V, d: V, x0: number, yc: number, a: number): { t: number; p: V } | null {
  if (Math.abs(d[0]) < EPS) return null
  const t = (x0 - o[0]) / d[0]
  if (t <= EPS) return null
  const p = add(o, mulS(d, t))
  return Math.abs(p[1] - yc) <= a ? { t, p } : null
}

/** Intersection with the lens/mirror cap of a circle: centre c, radius |r|, vertex at vx, aperture a. */
function arc(o: V, d: V, c: V, r: number, vx: number, yc: number, a: number): { t: number; p: V; nrm: V } | null {
  const R = Math.abs(r)
  const oc = sub(o, c)
  const b = dot(oc, d)
  const disc = b * b - (dot(oc, oc) - R * R)
  if (disc < 0) return null
  const sq = Math.sqrt(disc)
  for (const t of [-b - sq, -b + sq]) {
    if (t <= EPS) continue
    const p = add(o, mulS(d, t))
    // keep the branch on the vertex side of the centre, inside the aperture
    if (Math.abs(p[1] - yc) > a || Math.sign(p[0] - c[0]) !== Math.sign(vx - c[0])) continue
    return { t, p, nrm: unit(sub(p, c)) }
  }
  return null
}

/** Surface of a thick lens or mirror: spherical when r is finite and non-zero, otherwise flat. */
function surface(o: V, d: V, vx: number, yc: number, r: number, a: number): { t: number; p: V; nrm: V } | null {
  if (!Number.isFinite(r) || Math.abs(r) > 1e6 || r === 0) {
    const h = vSeg(o, d, vx, yc, a)
    return h ? { ...h, nrm: [1, 0] } : null
  }
  return arc(o, d, [vx + r, yc], r, vx, yc, a)
}

export function prismVerts(e: Extract<El, { kind: 'prism' }>): V[] {
  const rr = e.size / Math.sqrt(3)
  return [90, 210, 330].map((deg) => {
    const t = ((deg + e.rot) * Math.PI) / 180
    return [e.x + rr * Math.cos(t), e.y + rr * Math.sin(t)] as V
  })
}

/** Nearest interaction of a ray with every element. */
function hits(o: V, d: V, els: El[], inside: Set<string>, lambda: number): Hit | null {
  let best: Hit | null = null
  const consider = (h: Hit | null) => {
    if (h && (!best || h.t < best.t)) best = h
  }
  for (const e of els) {
    if (e.kind === 'thin') {
      const h = vSeg(o, d, e.x, e.y, e.a)
      if (h) consider({
        ...h, nrm: [1, 0], act: (dd) => {
          // ideal thin lens: slope' = slope − h / f (in the direction of travel)
          const sx = Math.sign(dd[0]) || 1
          const s = dd[1] / Math.abs(dd[0]) - (h.p[1] - e.y) / e.f
          return { d: unit([sx, s]) }
        },
      })
    } else if (e.kind === 'screen') {
      const h = vSeg(o, d, e.x, e.y, e.a)
      if (h) consider({ ...h, nrm: [1, 0], act: () => ({ d: null }) })
    } else if (e.kind === 'mirror') {
      const h = surface(o, d, e.x, e.y, e.r, e.a)
      if (h) consider({ ...h, act: (dd) => ({ d: reflect(dd, h.nrm) }) })
    } else if (e.kind === 'thick') {
      const n = cauchy(e.n, lambda)
      const isIn = inside.has(e.id)
      for (const [vx, r] of [[e.x - e.t / 2, e.r1], [e.x + e.t / 2, e.r2]] as [number, number][]) {
        const h = surface(o, d, vx, e.y, r, e.a)
        if (!h) continue
        consider({
          ...h, act: (dd) => {
            const out = refract(dd, h.nrm, isIn ? n : 1, isIn ? 1 : n)
            if (!out) return { d: reflect(dd, h.nrm) } // total internal reflection
            return isIn ? { d: out, leave: e.id } : { d: out, enter: e.id }
          },
        })
      }
    } else if (e.kind === 'prism') {
      const n = cauchy(e.n, lambda)
      const vs = prismVerts(e)
      const isIn = inside.has(e.id)
      for (let i = 0; i < 3; i++) {
        const A = vs[i], B = vs[(i + 1) % 3]
        const ab = sub(B, A)
        const den = d[0] * ab[1] - d[1] * ab[0]
        if (Math.abs(den) < EPS) continue
        const ao = sub(A, o)
        const t = (ao[0] * ab[1] - ao[1] * ab[0]) / den
        const u = (ao[0] * d[1] - ao[1] * d[0]) / den
        if (t <= EPS || u < 0 || u > 1) continue
        const nrm = unit([ab[1], -ab[0]])
        consider({
          t, p: add(o, mulS(d, t)), nrm, act: (dd) => {
            const out = refract(dd, nrm, isIn ? n : 1, isIn ? 1 : n)
            if (!out) return { d: reflect(dd, nrm) }
            return isIn ? { d: out, leave: e.id } : { d: out, enter: e.id }
          },
        })
      }
    }
  }
  return best
}

export interface Bounds { x0: number; x1: number; y0: number; y1: number }

/** Traces one ray; returns its polyline (ends at an absorber or the bench boundary). */
export function trace(o: V, dir: V, els: El[], b: Bounds, lambda = 589, maxSeg = 60): V[] {
  const pts: V[] = [o]
  let p = o, d = unit(dir)
  const inside = new Set<string>()
  for (let k = 0; k < maxSeg; k++) {
    const h = hits(p, d, els, inside, lambda)
    if (!h) break
    pts.push(h.p)
    const r = h.act(d, lambda, inside)
    if (r.enter) inside.add(r.enter)
    if (r.leave) inside.delete(r.leave)
    if (!r.d) return pts
    p = h.p
    d = r.d
  }
  // extend to the bench boundary
  const ts = [d[0] > 0 ? (b.x1 - p[0]) / d[0] : d[0] < 0 ? (b.x0 - p[0]) / d[0] : Infinity, d[1] > 0 ? (b.y1 - p[1]) / d[1] : d[1] < 0 ? (b.y0 - p[1]) / d[1] : Infinity]
  const t = Math.max(0, Math.min(...ts))
  pts.push(add(p, mulS(d, Number.isFinite(t) ? t : 0)))
  return pts
}

export const SPECTRUM: [number, string][] = [[650, '#ff4b4b'], [600, '#ffa53a'], [570, '#ffe94a'], [530, '#5bf06a'], [490, '#3ad8ff'], [450, '#5b6bff'], [410, '#b05bff']]

/** Rays emitted by a source: origin, direction, wavelength, colour. */
export function emit(s: Source): { o: V; d: V; lambda: number; color: string }[] {
  const out: { o: V; d: V; lambda: number; color: string }[] = []
  const n = Math.max(1, Math.round(s.count))
  const ang = (s.angle * Math.PI) / 180
  const waves = s.white ? SPECTRUM : [[589, '#facc15'] as [number, string]]
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 0 : i / (n - 1) - 0.5
    for (const [lambda, color] of waves) {
      if (s.kind === 'parallel') {
        const perp: V = [-Math.sin(ang), Math.cos(ang)]
        out.push({ o: add([s.x, s.y], mulS(perp, f * s.width)), d: [Math.cos(ang), Math.sin(ang)], lambda, color })
      } else {
        const a = ang + (f * s.spread * Math.PI) / 180
        out.push({ o: [s.x, s.y], d: [Math.cos(a), Math.sin(a)], lambda, color })
      }
    }
  }
  return out
}

/** Thin-lens equation 1/f = 1/u + 1/v (u > 0 for a real object to the left). Returns v and m = −v/u. */
export function thinLensImage(f: number, u: number): { v: number; m: number } {
  const inv = 1 / f - 1 / u
  const v = Math.abs(inv) < 1e-12 ? Infinity : 1 / inv
  return { v, m: -v / u }
}

/** Lensmaker's equation (thick lens) → effective focal length. */
export function lensmaker(n: number, r1: number, r2: number, t: number): number {
  const i1 = Number.isFinite(r1) && r1 !== 0 ? 1 / r1 : 0
  const i2 = Number.isFinite(r2) && r2 !== 0 ? 1 / r2 : 0
  const P = (n - 1) * (i1 - i2 + ((n - 1) * t * i1 * i2) / n)
  return 1 / P
}

/** Where two rays (point + direction) cross. */
export function crossing(p: V, d: V, q: V, e: V): V | null {
  const den = d[0] * e[1] - d[1] * e[0]
  if (Math.abs(den) < 1e-12) return null
  const w = sub(q, p)
  const t = (w[0] * e[1] - w[1] * e[0]) / den
  return add(p, mulS(d, t))
}
