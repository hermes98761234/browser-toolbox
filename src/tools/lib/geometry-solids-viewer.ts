// Solids as convex polyhedra (curved solids approximated by many-sided ones for nets/sections),
// exact formulas, unfolding trees for nets and plane cross-sections.

export type V3 = [number, number, number]
export type SolidKind = 'cube' | 'cuboid' | 'prism' | 'pyramid' | 'tetrahedron' | 'cylinder' | 'cone' | 'sphere'
export interface Params { a: number; l: number; w: number; h: number; r: number; n: number }

export interface Poly {
  verts: V3[]
  faces: number[][] // CCW seen from outside
  parent: number[] // unfolding tree, -1 = root (bottom face, on y = 0)
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k]
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const len = (a: V3) => Math.hypot(a[0], a[1], a[2])
export const norm = (a: V3): V3 => mul(a, 1 / (len(a) || 1))

/** Regular n-gon (side a) prism or pyramid; `apex` = pyramid. Sides chain or hang off the base. */
function ngonSolid(n: number, a: number, h: number, apex: boolean, chain: boolean, radius?: number): Poly {
  const R = radius ?? a / (2 * Math.sin(Math.PI / n))
  const ring = (y: number) => Array.from({ length: n }, (_, i): V3 => {
    const t = (2 * Math.PI * i) / n + Math.PI / n + Math.PI / 2
    return [R * Math.cos(t), y, R * Math.sin(t)]
  })
  const bottom = ring(0)
  const verts: V3[] = [...bottom]
  const faces: number[][] = []
  const parent: number[] = []
  // bottom face seen from below (outward normal −y): order i ascending gives normal -y when angles go CCW in xz
  faces.push(Array.from({ length: n }, (_, i) => i))
  parent.push(-1)
  if (apex) {
    verts.push([0, h, 0])
    for (let i = 0; i < n; i++) {
      faces.push([i, n, (i + 1) % n])
      parent.push(chain && i > 0 ? i : 0)
    }
  } else {
    verts.push(...ring(h))
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      faces.push([i, n + i, n + j, j])
      parent.push(chain && i > 0 ? i : 0)
    }
    faces.push(Array.from({ length: n }, (_, i) => n + (n - 1 - i)))
    parent.push(1)
  }
  return fixOrientation({ verts, faces, parent })
}

function boxSolid(l: number, w: number, h: number): Poly {
  const x = l / 2, z = w / 2
  const verts: V3[] = [[-x, 0, -z], [x, 0, -z], [x, 0, z], [-x, 0, z], [-x, h, -z], [x, h, -z], [x, h, z], [-x, h, z]]
  const faces = [[0, 1, 2, 3], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0], [4, 7, 6, 5]]
  return fixOrientation({ verts, faces, parent: [-1, 0, 0, 0, 0, 1] })
}

/** Make every face's winding give an outward normal (convex solid → compare with centroid). */
function fixOrientation(p: Poly): Poly {
  const c = mul(p.verts.reduce(add, [0, 0, 0] as V3), 1 / p.verts.length)
  const faces = p.faces.map((f) => {
    const nrm = faceNormal(p.verts, f)
    const fc = faceCentroid(p.verts, f)
    return dot(nrm, sub(fc, c)) < 0 ? [...f].reverse() : f
  })
  return { ...p, faces }
}

export function faceNormal(v: V3[], f: number[]): V3 {
  let n: V3 = [0, 0, 0]
  for (let i = 0; i < f.length; i++) {
    const a = v[f[i]], b = v[f[(i + 1) % f.length]]
    n = add(n, [(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])])
  }
  return norm(n)
}
export const faceCentroid = (v: V3[], f: number[]): V3 => mul(f.map((i) => v[i]).reduce(add, [0, 0, 0] as V3), 1 / f.length)

export const SEGMENTS = 96

export function buildSolid(k: SolidKind, p: Params): Poly {
  switch (k) {
    case 'cube': return boxSolid(p.a, p.a, p.a)
    case 'cuboid': return boxSolid(p.l, p.w, p.h)
    case 'prism': return ngonSolid(p.n, p.a, p.h, false, false)
    case 'pyramid': return ngonSolid(p.n, p.a, p.h, true, false)
    case 'tetrahedron': return ngonSolid(3, p.a, p.a * Math.sqrt(2 / 3), true, false)
    case 'cylinder': return ngonSolid(SEGMENTS, 0, p.h, false, true, p.r)
    case 'cone': return ngonSolid(SEGMENTS, 0, p.h, true, true, p.r)
    case 'sphere': {
      // UV sphere used only for sections; no net
      const verts: V3[] = []
      const faces: number[][] = []
      const st = 48, sl = 64
      for (let i = 0; i <= st; i++) for (let j = 0; j < sl; j++) {
        const th = (Math.PI * i) / st, ph = (2 * Math.PI * j) / sl
        verts.push([p.r * Math.sin(th) * Math.cos(ph), p.r + p.r * Math.cos(th), p.r * Math.sin(th) * Math.sin(ph)])
      }
      for (let i = 0; i < st; i++) for (let j = 0; j < sl; j++) {
        const a = i * sl + j, b = i * sl + ((j + 1) % sl)
        faces.push([a, b, b + sl, a + sl])
      }
      return { verts, faces, parent: faces.map(() => -1) }
    }
  }
}

// ---------- formulas ----------
export interface Formula { label: string; expr: string; value: number; unit: 1 | 2 | 3 }
export const ngonArea = (n: number, a: number) => (n * a * a) / (4 * Math.tan(Math.PI / n))

export function formulas(k: SolidKind, p: Params): { rows: Formula[]; fev?: [number, number, number] } {
  const { a, l, w, h, r, n } = p
  switch (k) {
    case 'cube': return { rows: [
      { label: 'Volume', expr: 'V = a³', value: a ** 3, unit: 3 },
      { label: 'Surface area', expr: 'S = 6a²', value: 6 * a * a, unit: 2 },
      { label: 'Face diagonal', expr: 'd = a√2', value: a * Math.SQRT2, unit: 1 },
      { label: 'Space diagonal', expr: 'D = a√3', value: a * Math.sqrt(3), unit: 1 },
    ], fev: [6, 12, 8] }
    case 'cuboid': return { rows: [
      { label: 'Volume', expr: 'V = l·w·h', value: l * w * h, unit: 3 },
      { label: 'Surface area', expr: 'S = 2(lw + lh + wh)', value: 2 * (l * w + l * h + w * h), unit: 2 },
      { label: 'Space diagonal', expr: 'D = √(l² + w² + h²)', value: Math.hypot(l, w, h), unit: 1 },
    ], fev: [6, 12, 8] }
    case 'prism': {
      const A = ngonArea(n, a)
      return { rows: [
        { label: 'Base area', expr: 'B = n·a² / (4·tan(π/n))', value: A, unit: 2 },
        { label: 'Volume', expr: 'V = B·h', value: A * h, unit: 3 },
        { label: 'Lateral area', expr: 'L = n·a·h', value: n * a * h, unit: 2 },
        { label: 'Surface area', expr: 'S = 2B + n·a·h', value: 2 * A + n * a * h, unit: 2 },
      ], fev: [n + 2, 3 * n, 2 * n] }
    }
    case 'pyramid': {
      const A = ngonArea(n, a)
      const ap = a / (2 * Math.tan(Math.PI / n))
      const R = a / (2 * Math.sin(Math.PI / n))
      const s = Math.hypot(h, ap)
      return { rows: [
        { label: 'Base area', expr: 'B = n·a² / (4·tan(π/n))', value: A, unit: 2 },
        { label: 'Volume', expr: 'V = B·h / 3', value: (A * h) / 3, unit: 3 },
        { label: 'Slant height', expr: 's = √(h² + apothem²)', value: s, unit: 1 },
        { label: 'Lateral edge', expr: 'e = √(h² + R²)', value: Math.hypot(h, R), unit: 1 },
        { label: 'Lateral area', expr: 'L = n·a·s / 2', value: (n * a * s) / 2, unit: 2 },
        { label: 'Surface area', expr: 'S = B + L', value: A + (n * a * s) / 2, unit: 2 },
      ], fev: [n + 1, 2 * n, n + 1] }
    }
    case 'tetrahedron': return { rows: [
      { label: 'Volume', expr: 'V = a³ / (6√2)', value: a ** 3 / (6 * Math.SQRT2), unit: 3 },
      { label: 'Surface area', expr: 'S = √3·a²', value: Math.sqrt(3) * a * a, unit: 2 },
      { label: 'Height', expr: 'H = a·√(2/3)', value: a * Math.sqrt(2 / 3), unit: 1 },
    ], fev: [4, 6, 4] }
    case 'cylinder': return { rows: [
      { label: 'Volume', expr: 'V = π·r²·h', value: Math.PI * r * r * h, unit: 3 },
      { label: 'Lateral area', expr: 'L = 2π·r·h', value: 2 * Math.PI * r * h, unit: 2 },
      { label: 'Surface area', expr: 'S = 2π·r·(r + h)', value: 2 * Math.PI * r * (r + h), unit: 2 },
      { label: 'Net rectangle', expr: 'width = 2π·r', value: 2 * Math.PI * r, unit: 1 },
    ] }
    case 'cone': {
      const s = Math.hypot(r, h)
      return { rows: [
        { label: 'Volume', expr: 'V = π·r²·h / 3', value: (Math.PI * r * r * h) / 3, unit: 3 },
        { label: 'Slant height', expr: 'ℓ = √(r² + h²)', value: s, unit: 1 },
        { label: 'Lateral area', expr: 'L = π·r·ℓ', value: Math.PI * r * s, unit: 2 },
        { label: 'Surface area', expr: 'S = π·r·(r + ℓ)', value: Math.PI * r * (r + s), unit: 2 },
        { label: 'Net sector angle', expr: 'θ = 360°·r / ℓ', value: (360 * r) / s, unit: 1 },
      ] }
    }
    case 'sphere': return { rows: [
      { label: 'Volume', expr: 'V = 4/3·π·r³', value: (4 / 3) * Math.PI * r ** 3, unit: 3 },
      { label: 'Surface area', expr: 'S = 4π·r²', value: 4 * Math.PI * r * r, unit: 2 },
      { label: 'Great circle', expr: 'C = 2π·r', value: 2 * Math.PI * r, unit: 1 },
    ] }
  }
}

/** Volume via the divergence theorem (fan triangulation of each face). */
export function polyVolume(p: Poly): number {
  let v = 0
  for (const f of p.faces) for (let i = 1; i + 1 < f.length; i++) v += dot(p.verts[f[0]], cross(p.verts[f[i]], p.verts[f[i + 1]])) / 6
  return v
}
export function polyArea(p: Poly): number {
  let s = 0
  for (const f of p.faces) for (let i = 1; i + 1 < f.length; i++) s += len(cross(sub(p.verts[f[i]], p.verts[f[0]]), sub(p.verts[f[i + 1]], p.verts[f[0]]))) / 2
  return s
}

// ---------- nets ----------
/** Shared edge (two vertex indices) between faces f and g. */
export function sharedEdge(f: number[], g: number[]): [number, number] | null {
  const common = f.filter((v) => g.includes(v))
  return common.length >= 2 ? [common[0], common[1]] : null
}

/** Rotate point x about the line through a with unit direction u by angle t (Rodrigues). */
export function rotateAbout(x: V3, a: V3, u: V3, t: number): V3 {
  const v = sub(x, a)
  const c = Math.cos(t), s = Math.sin(t)
  const r = add(add(mul(v, c), mul(cross(u, v), s)), mul(u, dot(u, v) * (1 - c)))
  return add(r, a)
}

/**
 * Hinge data for each face: axis point/direction and the fold angle (π − dihedral) with the sign
 * that makes the face coplanar with its parent when fully unfolded.
 */
export interface Hinge { a: V3; u: V3; angle: number }
export function hinges(p: Poly): (Hinge | null)[] {
  return p.faces.map((f, i) => {
    const par = p.parent[i]
    if (par < 0) return null
    const e = sharedEdge(f, p.faces[par])
    if (!e) return null
    const a = p.verts[e[0]], u = norm(sub(p.verts[e[1]], a))
    const nf = faceNormal(p.verts, f), np = faceNormal(p.verts, p.faces[par])
    const angle = Math.acos(Math.max(-1, Math.min(1, dot(nf, np))))
    const plus = dot(rotateAbout(nf, [0, 0, 0], u, angle), np)
    return { a, u, angle: plus > 0.999 ? angle : -angle }
  })
}

/** Vertex positions of every face at unfold amount t ∈ [0,1] (0 = solid, 1 = flat net). */
export function unfold(p: Poly, t: number, hs = hinges(p)): V3[][] {
  const chainOf = (i: number): number[] => { const c: number[] = []; for (let k = i; k >= 0 && p.parent[k] >= 0; k = p.parent[k]) c.push(k); return c }
  return p.faces.map((f, i) => {
    let pts = f.map((v) => p.verts[v])
    // apply own hinge first, then ancestors' hinges outward (each in original coordinates)
    for (const k of chainOf(i)) {
      const h = hs[k]
      if (h) pts = pts.map((x) => rotateAbout(x, h.a, h.u, h.angle * t))
    }
    return pts
  })
}

// ---------- sections ----------
/** Intersection polygon of the plane n·x = d with the convex polyhedron (ordered), plus its area. */
export function section(p: Poly, n: V3, d: number): { pts: V3[]; area: number; perimeter: number } {
  const nn = norm(n)
  const pts: V3[] = []
  const seen = new Set<string>()
  const push = (x: V3) => {
    const k = x.map((v) => v.toFixed(6)).join(',')
    if (!seen.has(k)) { seen.add(k); pts.push(x) }
  }
  const edges = new Set<string>()
  for (const f of p.faces) for (let i = 0; i < f.length; i++) {
    const a = f[i], b = f[(i + 1) % f.length]
    const key = a < b ? `${a}-${b}` : `${b}-${a}`
    if (edges.has(key)) continue
    edges.add(key)
    const A = p.verts[a], B = p.verts[b]
    const da = dot(nn, A) - d, db = dot(nn, B) - d
    if (Math.abs(da) < 1e-12) push(A)
    if (Math.abs(db) < 1e-12) push(B)
    if (da * db < 0) push(add(A, mul(sub(B, A), da / (da - db))))
  }
  if (pts.length < 3) return { pts: [], area: 0, perimeter: 0 }
  const c = mul(pts.reduce(add, [0, 0, 0] as V3), 1 / pts.length)
  const e1 = norm(Math.abs(nn[0]) < 0.9 ? cross(nn, [1, 0, 0]) : cross(nn, [0, 1, 0]))
  const e2 = cross(nn, e1)
  pts.sort((x, y) => Math.atan2(dot(sub(x, c), e2), dot(sub(x, c), e1)) - Math.atan2(dot(sub(y, c), e2), dot(sub(y, c), e1)))
  let area = 0, perimeter = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length]
    area += dot(nn, cross(sub(a, c), sub(b, c))) / 2
    perimeter += len(sub(b, a))
  }
  return { pts, area: Math.abs(area), perimeter }
}

export function shapeName(k: number, curved: boolean): string {
  if (curved) return 'curved section (circle / ellipse / parabola-like)'
  return ({ 3: 'triangle', 4: 'quadrilateral', 5: 'pentagon', 6: 'hexagon', 7: 'heptagon', 8: 'octagon' } as Record<number, string>)[k] ?? `${k}-gon`
}
