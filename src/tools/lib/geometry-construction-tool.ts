// Geometry Construction Tool engine: a dependency list of construction objects evaluated in order,
// with line/circle intersections, macros (perpendicular, parallel, bisectors), measurements and
// checks for classic compass-and-straightedge challenges.

export interface V { x: number; y: number }
export type Kind =
  | 'point' | 'on' | 'intersect' | 'midpoint'
  | 'line' | 'segment' | 'ray' | 'circle' | 'compass'
  | 'perp' | 'parallel' | 'bisector' | 'anglebis'
  | 'polygon' | 'distance' | 'angle'

export interface Obj {
  id: string
  kind: Kind
  name: string
  parents: string[]
  /** Free point position, or parameter for 'on' (t along a line, angle on a circle), or branch for 'intersect'. */
  x?: number
  y?: number
  t?: number
  branch?: number
  hidden?: boolean
}

export interface LineVal { type: 'line'; p: V; d: V; kind: 'line' | 'segment' | 'ray' }
export interface CircleVal { type: 'circle'; c: V; r: number }
export interface PointVal { type: 'point'; p: V }
export interface PolyVal { type: 'polygon'; pts: V[]; area: number; perimeter: number }
export interface MeasureVal { type: 'measure'; value: number; at: V; unit: 'len' | 'deg'; pts: V[] }
export type Val = LineVal | CircleVal | PointVal | PolyVal | MeasureVal

const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y })
const addv = (a: V, b: V): V => ({ x: a.x + b.x, y: a.y + b.y })
const mul = (a: V, k: number): V => ({ x: a.x * k, y: a.y * k })
const dot = (a: V, b: V) => a.x * b.x + a.y * b.y
const cross = (a: V, b: V) => a.x * b.y - a.y * b.x
export const dist = (a: V, b: V) => Math.hypot(a.x - b.x, a.y - b.y)
const norm = (a: V): V => {
  const l = Math.hypot(a.x, a.y) || 1
  return { x: a.x / l, y: a.y / l }
}

/** Parameter range allowed on a line value (segment [0,1], ray [0,∞)). */
const inRange = (l: LineVal, t: number) => (l.kind === 'line' ? true : l.kind === 'ray' ? t >= -1e-9 : t >= -1e-9 && t <= 1 + 1e-9)

/** All intersections of two curves, in a stable order (along the first line, or by side for circles). */
export function intersections(a: Val, b: Val): V[] {
  if (a.type === 'line' && b.type === 'line') {
    const den = cross(a.d, b.d)
    if (Math.abs(den) < 1e-12) return []
    const w = sub(b.p, a.p)
    const t = cross(w, b.d) / den, u = cross(w, a.d) / den
    return inRange(a, t) && inRange(b, u) ? [addv(a.p, mul(a.d, t))] : []
  }
  if (a.type === 'circle' && b.type === 'line') return intersections(b, a)
  if (a.type === 'line' && b.type === 'circle') {
    const f = sub(a.p, b.c)
    const A = dot(a.d, a.d), B = 2 * dot(f, a.d), C = dot(f, f) - b.r * b.r
    const disc = B * B - 4 * A * C
    if (disc < -1e-12) return []
    const s = Math.sqrt(Math.max(0, disc))
    const ts = [(-B - s) / (2 * A), (-B + s) / (2 * A)]
    return ts.map((t) => (inRange(a, t) ? addv(a.p, mul(a.d, t)) : null)).filter((p): p is V => p !== null).slice(0, disc < 1e-12 ? 1 : 2)
  }
  if (a.type === 'circle' && b.type === 'circle') {
    const d = dist(a.c, b.c)
    if (d < 1e-12 || d > a.r + b.r + 1e-9 || d < Math.abs(a.r - b.r) - 1e-9) return []
    const x = (d * d + a.r * a.r - b.r * b.r) / (2 * d)
    const h = Math.sqrt(Math.max(0, a.r * a.r - x * x))
    const u = norm(sub(b.c, a.c)), m = addv(a.c, mul(u, x)), perp = { x: -u.y, y: u.x }
    return h < 1e-12 ? [m] : [addv(m, mul(perp, h)), sub(m, mul(perp, h))]
  }
  return []
}

/** Nearest point on a curve and its parameter (t on lines, angle on circles). */
export function project(v: Val, q: V): { p: V; t: number } | null {
  if (v.type === 'line') {
    let t = dot(sub(q, v.p), v.d) / dot(v.d, v.d)
    if (v.kind !== 'line') t = Math.max(0, t)
    if (v.kind === 'segment') t = Math.min(1, t)
    return { p: addv(v.p, mul(v.d, t)), t }
  }
  if (v.type === 'circle') {
    const t = Math.atan2(q.y - v.c.y, q.x - v.c.x)
    return { p: { x: v.c.x + v.r * Math.cos(t), y: v.c.y + v.r * Math.sin(t) }, t }
  }
  return null
}

export function distanceTo(v: Val, q: V): number {
  if (v.type === 'point') return dist(v.p, q)
  const pr = project(v, q)
  return pr ? dist(pr.p, q) : Infinity
}

export function polygonArea(pts: V[]): number {
  let s = 0
  for (let i = 0; i < pts.length; i++) s += cross(pts[i], pts[(i + 1) % pts.length])
  return Math.abs(s) / 2
}

/** Evaluates every object in order; objects whose inputs are missing (e.g. no intersection) evaluate to null. */
export function evaluate(objs: Obj[]): Map<string, Val | null> {
  const out = new Map<string, Val | null>()
  const P = (id: string) => {
    const v = out.get(id)
    return v && v.type === 'point' ? v.p : null
  }
  const L = (id: string) => {
    const v = out.get(id)
    return v && v.type === 'line' ? v : null
  }
  for (const o of objs) {
    let val: Val | null = null
    const ps = o.parents
    switch (o.kind) {
      case 'point': val = { type: 'point', p: { x: o.x ?? 0, y: o.y ?? 0 } }; break
      case 'on': {
        const c = out.get(ps[0])
        if (c?.type === 'line') {
          let t = o.t ?? 0
          if (c.kind !== 'line') t = Math.max(0, t)
          if (c.kind === 'segment') t = Math.min(1, t)
          val = { type: 'point', p: addv(c.p, mul(c.d, t)) }
        } else if (c?.type === 'circle') val = { type: 'point', p: { x: c.c.x + c.r * Math.cos(o.t ?? 0), y: c.c.y + c.r * Math.sin(o.t ?? 0) } }
        break
      }
      case 'intersect': {
        const a = out.get(ps[0]), b = out.get(ps[1])
        if (a && b) {
          const xs = intersections(a, b)
          const p = xs[Math.min(o.branch ?? 0, xs.length - 1)]
          if (p && (o.branch ?? 0) < xs.length) val = { type: 'point', p }
        }
        break
      }
      case 'midpoint': {
        const a = P(ps[0]), b = P(ps[1])
        if (a && b) val = { type: 'point', p: mul(addv(a, b), 0.5) }
        break
      }
      case 'line': case 'segment': case 'ray': {
        const a = P(ps[0]), b = P(ps[1])
        if (a && b && dist(a, b) > 1e-12) val = { type: 'line', p: a, d: sub(b, a), kind: o.kind }
        break
      }
      case 'circle': {
        const c = P(ps[0]), b = P(ps[1])
        if (c && b) val = { type: 'circle', c, r: dist(c, b) }
        break
      }
      case 'compass': {
        const a = P(ps[0]), b = P(ps[1]), c = P(ps[2])
        if (a && b && c) val = { type: 'circle', c, r: dist(a, b) }
        break
      }
      case 'perp': case 'parallel': {
        const l = L(ps[0]), q = P(ps[1])
        if (l && q) val = { type: 'line', p: q, d: o.kind === 'perp' ? { x: -l.d.y, y: l.d.x } : l.d, kind: 'line' }
        break
      }
      case 'bisector': {
        const a = P(ps[0]), b = P(ps[1])
        if (a && b && dist(a, b) > 1e-12) {
          const d = sub(b, a)
          val = { type: 'line', p: mul(addv(a, b), 0.5), d: { x: -d.y, y: d.x }, kind: 'line' }
        }
        break
      }
      case 'anglebis': {
        const a = P(ps[0]), o2 = P(ps[1]), c = P(ps[2])
        if (a && o2 && c && dist(a, o2) > 1e-12 && dist(c, o2) > 1e-12) {
          const d = addv(norm(sub(a, o2)), norm(sub(c, o2)))
          val = { type: 'line', p: o2, d: Math.hypot(d.x, d.y) < 1e-12 ? { x: -(a.y - o2.y), y: a.x - o2.x } : d, kind: 'ray' }
        }
        break
      }
      case 'polygon': {
        const pts = ps.map(P)
        if (pts.every(Boolean) && pts.length >= 3) {
          const v = pts as V[]
          val = { type: 'polygon', pts: v, area: polygonArea(v), perimeter: v.reduce((s, p, i) => s + dist(p, v[(i + 1) % v.length]), 0) }
        }
        break
      }
      case 'distance': {
        const a = P(ps[0]), b = P(ps[1])
        if (a && b) val = { type: 'measure', value: dist(a, b), at: mul(addv(a, b), 0.5), unit: 'len', pts: [a, b] }
        break
      }
      case 'angle': {
        const a = P(ps[0]), o2 = P(ps[1]), c = P(ps[2])
        if (a && o2 && c) {
          const u = sub(a, o2), w = sub(c, o2)
          const ang = Math.abs(Math.atan2(cross(u, w), dot(u, w))) * (180 / Math.PI)
          val = { type: 'measure', value: ang, at: o2, unit: 'deg', pts: [a, o2, c] }
        }
        break
      }
    }
    out.set(o.id, val)
  }
  return out
}

/** Objects that (transitively) depend on `id`, including itself. */
export function dependents(objs: Obj[], id: string): Set<string> {
  const s = new Set([id])
  for (const o of objs) if (o.parents.some((p) => s.has(p))) s.add(o.id)
  return s
}

const KIND_TEXT: Record<Kind, (n: string[]) => string> = {
  point: () => 'free point',
  on: (n) => `point on ${n[0]}`,
  intersect: (n) => `intersection of ${n[0]} and ${n[1]}`,
  midpoint: (n) => `midpoint of ${n[0]}${n[1]}`,
  line: (n) => `line through ${n[0]} and ${n[1]}`,
  segment: (n) => `segment ${n[0]}${n[1]}`,
  ray: (n) => `ray from ${n[0]} through ${n[1]}`,
  circle: (n) => `circle with centre ${n[0]} through ${n[1]}`,
  compass: (n) => `compass: radius ${n[0]}${n[1]}, centre ${n[2]}`,
  perp: (n) => `perpendicular to ${n[0]} through ${n[1]}`,
  parallel: (n) => `parallel to ${n[0]} through ${n[1]}`,
  bisector: (n) => `perpendicular bisector of ${n[0]}${n[1]}`,
  anglebis: (n) => `bisector of angle ${n[0]}${n[1]}${n[2]}`,
  polygon: (n) => `polygon ${n.join('')}`,
  distance: (n) => `distance ${n[0]}${n[1]}`,
  angle: (n) => `angle ${n[0]}${n[1]}${n[2]}`,
}
export function describe(o: Obj, objs: Obj[]): string {
  const names = o.parents.map((p) => objs.find((x) => x.id === p)?.name ?? '?')
  return KIND_TEXT[o.kind](names)
}

export const isPointKind = (k: Kind) => k === 'point' || k === 'on' || k === 'intersect' || k === 'midpoint'
export const isCurveKind = (k: Kind) => ['line', 'segment', 'ray', 'circle', 'compass', 'perp', 'parallel', 'bisector', 'anglebis'].includes(k)

/** Next free label: points A, B, …, Z, A1…; lines a, b, …; circles c1, c2, … */
export function nextName(objs: Obj[], kind: Kind): string {
  const used = new Set(objs.map((o) => o.name))
  const seq = (base: string[]) => {
    for (let k = 0; ; k++) for (const b of base) {
      const n = k ? `${b}${k}` : b
      if (!used.has(n)) return n
    }
  }
  if (isPointKind(kind)) return seq('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''))
  if (kind === 'circle' || kind === 'compass') {
    for (let i = 1; ; i++) if (!used.has(`c${i}`)) return `c${i}`
  }
  if (kind === 'polygon') {
    for (let i = 1; ; i++) if (!used.has(`poly${i}`)) return `poly${i}`
  }
  if (kind === 'distance' || kind === 'angle') {
    for (let i = 1; ; i++) if (!used.has(`m${i}`)) return `m${i}`
  }
  return seq('abdefghijklmnopqrstuvwxyz'.split(''))
}

// ---------- challenges ----------

export interface Challenge { id: string; title: string; goal: string; given: Obj[]; check: (objs: Obj[], vals: Map<string, Val | null>) => boolean }

const pts = (objs: Obj[], vals: Map<string, Val | null>) => objs.map((o) => vals.get(o.id)).filter((v): v is PointVal => v?.type === 'point').map((v) => v.p)
const lines = (vals: Map<string, Val | null>) => [...vals.values()].filter((v): v is LineVal => v?.type === 'line')
const near = (a: V, b: V, tol = 1e-6) => dist(a, b) < tol
const lineThrough = (l: LineVal, q: V) => Math.abs(cross(sub(q, l.p), norm(l.d))) < 1e-6
const getP = (vals: Map<string, Val | null>, id: string) => (vals.get(id) as PointVal).p
const P = (id: string, name: string, x: number, y: number): Obj => ({ id, kind: 'point', name, parents: [], x, y })

export const CHALLENGES: Challenge[] = [
  {
    id: 'equi', title: 'Equilateral triangle (Euclid I.1)', goal: 'Construct a point C so that ABC is equilateral.',
    given: [P('gA', 'A', -2, 0), P('gB', 'B', 2, 0), { id: 'gs', kind: 'segment', name: 'a', parents: ['gA', 'gB'] }],
    check: (o, v) => {
      const A = getP(v, 'gA'), B = getP(v, 'gB'), s = dist(A, B)
      return pts(o, v).some((c) => Math.abs(dist(c, A) - s) < 1e-6 && Math.abs(dist(c, B) - s) < 1e-6)
    },
  },
  {
    id: 'mid', title: 'Midpoint of a segment', goal: 'Construct the midpoint M of AB (no midpoint tool).',
    given: [P('gA', 'A', -3, -1), P('gB', 'B', 2.5, 1.5), { id: 'gs', kind: 'segment', name: 'a', parents: ['gA', 'gB'] }],
    check: (o, v) => {
      const m = mul(addv(getP(v, 'gA'), getP(v, 'gB')), 0.5)
      return pts(o, v).some((p) => near(p, m))
    },
  },
  {
    id: 'perpbis', title: 'Perpendicular bisector', goal: 'Draw the line perpendicular to AB through its midpoint.',
    given: [P('gA', 'A', -2.5, -1), P('gB', 'B', 2, 1)],
    check: (_o, v) => {
      const A = getP(v, 'gA'), B = getP(v, 'gB'), m = mul(addv(A, B), 0.5)
      return lines(v).some((l) => lineThrough(l, m) && Math.abs(dot(norm(l.d), norm(sub(B, A)))) < 1e-6)
    },
  },
  {
    id: 'angbis', title: 'Bisect an angle', goal: 'Draw a line or ray through O that halves angle AOB.',
    given: [P('gO', 'O', -3, -2), P('gA', 'A', 3, -1.5), P('gB', 'B', 0, 3), { id: 'r1', kind: 'ray', name: 'a', parents: ['gO', 'gA'] }, { id: 'r2', kind: 'ray', name: 'b', parents: ['gO', 'gB'] }],
    check: (_o, v) => {
      const O = getP(v, 'gO'), d = norm(addv(norm(sub(getP(v, 'gA'), O)), norm(sub(getP(v, 'gB'), O))))
      return lines(v).some((l) => lineThrough(l, O) && Math.abs(cross(norm(l.d), d)) < 1e-6)
    },
  },
  {
    id: 'drop', title: 'Drop a perpendicular', goal: 'Draw the line through P perpendicular to line l.',
    given: [P('gA', 'A', -4, -1), P('gB', 'B', 4, 0), { id: 'gl', kind: 'line', name: 'l', parents: ['gA', 'gB'] }, P('gP', 'P', 0.5, 2.5)],
    check: (_o, v) => {
      const l0 = v.get('gl') as LineVal, Pp = getP(v, 'gP')
      return lines(v).some((l) => l !== l0 && lineThrough(l, Pp) && Math.abs(dot(norm(l.d), norm(l0.d))) < 1e-6)
    },
  },
  {
    id: 'square', title: 'Square on a segment', goal: 'Construct points C and D so that ABCD is a square.',
    given: [P('gA', 'A', -1.5, -1.5), P('gB', 'B', 1.5, -1.5), { id: 'gs', kind: 'segment', name: 'a', parents: ['gA', 'gB'] }],
    check: (o, v) => {
      const A = getP(v, 'gA'), B = getP(v, 'gB'), d = sub(B, A), n = { x: -d.y, y: d.x }
      const all = pts(o, v)
      return [1, -1].some((s) => all.some((p) => near(p, addv(B, mul(n, s)))) && all.some((p) => near(p, addv(A, mul(n, s)))))
    },
  },
  {
    id: 'hex', title: 'Regular hexagon in a circle', goal: 'Mark six vertices of a regular hexagon on the circle (A is one).',
    given: [P('gO', 'O', 0, 0), P('gA', 'A', 3, 0), { id: 'gc', kind: 'circle', name: 'c1', parents: ['gO', 'gA'] }],
    check: (o, v) => {
      const O = getP(v, 'gO'), A = getP(v, 'gA'), r = dist(O, A), a0 = Math.atan2(A.y - O.y, A.x - O.x)
      const all = pts(o, v)
      return [1, 2, 3, 4, 5].every((k) => all.some((p) => near(p, { x: O.x + r * Math.cos(a0 + (k * Math.PI) / 3), y: O.y + r * Math.sin(a0 + (k * Math.PI) / 3) })))
    },
  },
  {
    id: 'tangent', title: 'Tangent from an external point', goal: 'Draw a line through P tangent to the circle.',
    given: [P('gO', 'O', -1.5, 0), P('gA', 'A', 0.5, 0), { id: 'gc', kind: 'circle', name: 'c1', parents: ['gO', 'gA'] }, P('gP', 'P', 4, 1)],
    check: (_o, v) => {
      const c = v.get('gc') as CircleVal, Pp = getP(v, 'gP')
      return lines(v).some((l) => lineThrough(l, Pp) && Math.abs(Math.abs(cross(sub(c.c, l.p), norm(l.d))) - c.r) < 1e-6)
    },
  },
]
