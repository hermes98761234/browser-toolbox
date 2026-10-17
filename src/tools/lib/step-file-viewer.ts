// STEP (ISO 10303-21) reader without a B-rep kernel: Part 21 parser, product/assembly tree, units,
// and geometry that can be evaluated directly — edge curves (line, circle, ellipse, B-spline, polyline),
// planar faces (triangulated by the caller), cylinder patches and tessellated faces (AP242).

export type V = null | number | string | { ref: number } | { enum: string } | { typed: string; args: V[] } | V[]
export interface Part { type: string; args: V[] }
export interface Entity { id: number; parts: Part[] }
export interface StepFile { header: Record<string, V[]>; ents: Map<number, Entity>; counts: Map<string, number>; errors: string[] }

// ---------------- Part 21 parsing ----------------

function decodeStr(s: string): string {
  return s
    .replace(/''/g, "'")
    .replace(/\\X2\\([0-9A-F]+)\\X0\\/gi, (_, h: string) => String.fromCharCode(...(h.match(/.{4}/g) ?? []).map((x) => parseInt(x, 16))))
    .replace(/\\X\\([0-9A-F]{2})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
}

/** Splits text into statements (ending with ';'), respecting strings and comments. */
function statements(text: string): string[] {
  const out: string[] = []
  let cur = ''
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === "'") {
      let j = i + 1
      while (j < text.length) {
        if (text[j] === "'") {
          if (text[j + 1] === "'") j += 2
          else break
        } else j++
      }
      cur += text.slice(i, j + 1)
      i = j
    } else if (c === '/' && text[i + 1] === '*') {
      const j = text.indexOf('*/', i + 2)
      i = j < 0 ? text.length : j + 1
    } else if (c === ';') {
      out.push(cur.trim())
      cur = ''
    } else cur += c === '\n' || c === '\r' ? ' ' : c
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

class P21 {
  i = 0
  s: string
  constructor(s: string) {
    this.s = s
  }
  ws() {
    while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++
  }
  list(): V[] {
    this.ws()
    if (this.s[this.i] !== '(') throw new Error(`expected ( at ${this.i}`)
    this.i++
    const out: V[] = []
    this.ws()
    if (this.s[this.i] === ')') {
      this.i++
      return out
    }
    for (;;) {
      out.push(this.value())
      this.ws()
      const c = this.s[this.i++]
      if (c === ')') return out
      if (c !== ',') throw new Error(`expected , or ) at ${this.i - 1}`)
    }
  }
  value(): V {
    this.ws()
    const c = this.s[this.i]
    if (c === "'") {
      let j = this.i + 1
      while (j < this.s.length) {
        if (this.s[j] === "'") {
          if (this.s[j + 1] === "'") j += 2
          else break
        } else j++
      }
      const v = decodeStr(this.s.slice(this.i + 1, j))
      this.i = j + 1
      return v
    }
    if (c === '#') {
      const m = /^#(\d+)/.exec(this.s.slice(this.i, this.i + 24))!
      this.i += m[0].length
      return { ref: Number(m[1]) }
    }
    if (c === '$' || c === '*') {
      this.i++
      return null
    }
    if (c === '.') {
      const j = this.s.indexOf('.', this.i + 1)
      const e = this.s.slice(this.i + 1, j)
      this.i = j + 1
      return { enum: e }
    }
    if (c === '(') return this.list()
    if (c === '"') {
      const j = this.s.indexOf('"', this.i + 1)
      const v = this.s.slice(this.i + 1, j)
      this.i = j + 1
      return v
    }
    const m = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/.exec(this.s.slice(this.i, this.i + 40))
    if (m) {
      this.i += m[0].length
      return Number(m[0])
    }
    const k = /^[A-Za-z_][A-Za-z0-9_]*/.exec(this.s.slice(this.i, this.i + 80))
    if (k) {
      this.i += k[0].length
      return { typed: k[0].toUpperCase(), args: this.list() }
    }
    throw new Error(`unexpected "${c}" at ${this.i}`)
  }
  /** NAME(args) or (NAME(args) NAME(args) …) */
  body(): Part[] {
    this.ws()
    if (this.s[this.i] === '(') {
      this.i++
      const parts: Part[] = []
      for (;;) {
        this.ws()
        if (this.s[this.i] === ')') {
          this.i++
          return parts
        }
        const k = /^[A-Za-z_][A-Za-z0-9_]*/.exec(this.s.slice(this.i, this.i + 80))
        if (!k) throw new Error(`bad complex entity at ${this.i}`)
        this.i += k[0].length
        parts.push({ type: k[0].toUpperCase(), args: this.list() })
      }
    }
    const k = /^[A-Za-z_][A-Za-z0-9_]*/.exec(this.s.slice(this.i, this.i + 80))
    if (!k) throw new Error(`bad entity at ${this.i}`)
    this.i += k[0].length
    return [{ type: k[0].toUpperCase(), args: this.list() }]
  }
}

export function parseStep(text: string): StepFile {
  if (!/ISO-10303-21/.test(text.slice(0, 2000))) throw new Error('Not a STEP file: missing ISO-10303-21 header.')
  const header: Record<string, V[]> = {}
  const ents = new Map<number, Entity>()
  const counts = new Map<string, number>()
  const errors: string[] = []
  let section = ''
  for (const st of statements(text)) {
    const up = st.toUpperCase()
    if (up === 'HEADER' || up === 'DATA' || up.startsWith('DATA(') || up.startsWith('DATA (')) {
      section = up.startsWith('DATA') ? 'DATA' : 'HEADER'
      continue
    }
    if (up === 'ENDSEC' || up === 'ISO-10303-21' || up === 'END-ISO-10303-21') continue
    try {
      if (section === 'HEADER') {
        const [p] = new P21(st).body()
        header[p.type] = p.args
      } else if (section === 'DATA') {
        const m = /^#(\d+)\s*=\s*/.exec(st)
        if (!m) continue
        const parts = new P21(st.slice(m[0].length)).body()
        ents.set(Number(m[1]), { id: Number(m[1]), parts })
        for (const p of parts) counts.set(p.type, (counts.get(p.type) ?? 0) + 1)
      }
    } catch (e) {
      if (errors.length < 20) errors.push(`${st.slice(0, 60)}… — ${(e as Error).message}`)
    }
  }
  return { header, ents, counts, errors }
}

// ---------------- helpers ----------------

export const isRef = (v: V): v is { ref: number } => typeof v === 'object' && v !== null && !Array.isArray(v) && 'ref' in v
export const refId = (v: V) => (isRef(v) ? v.ref : -1)
const enumOf = (v: V) => (typeof v === 'object' && v !== null && !Array.isArray(v) && 'enum' in v ? v.enum : '')
const str = (v: V) => (typeof v === 'string' ? v : '')
const nums = (v: V): number[] => (Array.isArray(v) ? v.map((x) => (typeof x === 'number' ? x : typeof x === 'object' && x && !Array.isArray(x) && 'typed' in x ? Number(x.args[0]) : 0)) : [])
const numv = (v: V): number => (typeof v === 'number' ? v : typeof v === 'object' && v && !Array.isArray(v) && 'typed' in v ? Number(v.args[0]) : NaN)

export function part(f: StepFile, id: number, type?: string): Part | null {
  const e = f.ents.get(id)
  if (!e) return null
  return type ? (e.parts.find((p) => p.type === type) ?? null) : e.parts[0]
}
const typeOf = (f: StepFile, id: number) => f.ents.get(id)?.parts.map((p) => p.type).join('+') ?? ''

// ---------------- units ----------------

const PREFIX: Record<string, number> = { EXA: 1e18, PETA: 1e15, TERA: 1e12, GIGA: 1e9, MEGA: 1e6, KILO: 1e3, HECTO: 100, DECA: 10, DECI: 0.1, CENTI: 0.01, MILLI: 1e-3, MICRO: 1e-6, NANO: 1e-9 }

/** Length unit: name and size in metres. */
export function lengthUnit(f: StepFile): { name: string; metres: number } {
  for (const e of f.ents.values()) {
    if (!e.parts.some((p) => p.type === 'LENGTH_UNIT')) continue
    const si = e.parts.find((p) => p.type === 'SI_UNIT')
    if (si) {
      const pre = enumOf(si.args[0])
      const m = pre ? PREFIX[pre] ?? 1 : 1
      const sym: Record<number, string> = { 1: 'm', 1e-3: 'mm', 1e-2: 'cm', 1e3: 'km', 1e-6: 'µm' }
      return { name: sym[m] ?? `${pre.toLowerCase()}metre`, metres: m }
    }
    const cb = e.parts.find((p) => p.type === 'CONVERSION_BASED_UNIT')
    if (cb) {
      const name = str(cb.args[0]).toLowerCase()
      const known: Record<string, number> = { inch: 0.0254, foot: 0.3048, mm: 1e-3, millimetre: 1e-3 }
      return { name: name === 'inch' ? 'in' : name === 'foot' ? 'ft' : name, metres: known[name] ?? 1e-3 }
    }
  }
  return { name: 'mm', metres: 1e-3 }
}

// ---------------- product structure ----------------

export interface TreeNode {
  key: string
  pd: number
  name: string
  instance: string
  /** 4×4 column-major transform relative to the parent */
  m: number[]
  children: TreeNode[]
}

type Vec = [number, number, number]
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const mul = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k, a[2] * k]
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a: Vec): Vec => {
  const l = Math.hypot(...a) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}
export const dist = (a: Vec, b: Vec) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

export function point(f: StepFile, id: number): Vec {
  const p = part(f, id)
  if (!p) return [0, 0, 0]
  if (p.type === 'VERTEX_POINT') return point(f, refId(p.args[1]))
  const c = nums(p.args[1])
  return [c[0] ?? 0, c[1] ?? 0, c[2] ?? 0]
}
function direction(f: StepFile, id: number, def: Vec): Vec {
  const p = part(f, id)
  if (!p) return def
  if (p.type === 'VECTOR') return direction(f, refId(p.args[1]), def)
  const c = nums(p.args[1])
  return norm([c[0] ?? 0, c[1] ?? 0, c[2] ?? 0])
}

export interface Frame { o: Vec; x: Vec; y: Vec; z: Vec }
export function placement(f: StepFile, id: number): Frame {
  const p = part(f, id)
  const o = p ? point(f, refId(p.args[1])) : ([0, 0, 0] as Vec)
  if (!p || p.type !== 'AXIS2_PLACEMENT_3D') return { o, x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }
  const z = p.args[2] ? direction(f, refId(p.args[2]), [0, 0, 1]) : ([0, 0, 1] as Vec)
  let r = p.args[3] ? direction(f, refId(p.args[3]), [1, 0, 0]) : ([1, 0, 0] as Vec)
  if (Math.abs(dot(r, z)) > 0.999) r = Math.abs(z[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]
  const x = norm(sub(r, mul(z, dot(r, z))))
  return { o, x, y: cross(z, x), z }
}
const frameMatrix = (t: Frame) => [...t.x, 0, ...t.y, 0, ...t.z, 0, ...t.o, 1]
function invRigid(m: number[]) {
  // rotation transpose, translation −Rᵀt
  const r = [m[0], m[4], m[8], 0, m[1], m[5], m[9], 0, m[2], m[6], m[10], 0]
  const t = [m[12], m[13], m[14]]
  return [...r, -(r[0] * t[0] + r[4] * t[1] + r[8] * t[2]), -(r[1] * t[0] + r[5] * t[1] + r[9] * t[2]), -(r[2] * t[0] + r[6] * t[1] + r[10] * t[2]), 1]
}
export function matMul(a: number[], b: number[]) {
  const o = new Array(16).fill(0)
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]
  return o
}
export const IDENT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

function byType(f: StepFile, type: string): Entity[] {
  const out: Entity[] = []
  for (const e of f.ents.values()) if (e.parts.some((p) => p.type === type)) out.push(e)
  return out
}

export interface Structure { roots: TreeNode[]; shapeOf: Map<number, number[]>; productName: Map<number, string> }

/** Builds the assembly tree and maps every product definition to its shape representation(s). */
export function structure(f: StepFile): Structure {
  const productName = new Map<number, string>()
  for (const e of byType(f, 'PRODUCT_DEFINITION')) {
    const pd = part(f, e.id, 'PRODUCT_DEFINITION')!
    const pdf = part(f, refId(pd.args[2]))
    const prod = pdf ? part(f, refId(pdf.args[2])) : null
    productName.set(e.id, (prod && (str(prod.args[1]) || str(prod.args[0]))) || str(pd.args[0]) || `#${e.id}`)
  }
  // PDS → definition
  const pdsOf = new Map<number, number>()
  for (const e of byType(f, 'PRODUCT_DEFINITION_SHAPE')) pdsOf.set(e.id, refId(part(f, e.id, 'PRODUCT_DEFINITION_SHAPE')!.args[2]))
  const shapeOf = new Map<number, number[]>()
  for (const e of byType(f, 'SHAPE_DEFINITION_REPRESENTATION')) {
    const p = part(f, e.id, 'SHAPE_DEFINITION_REPRESENTATION')!
    const def = pdsOf.get(refId(p.args[0]))
    if (def !== undefined) shapeOf.set(def, [...(shapeOf.get(def) ?? []), refId(p.args[1])])
  }
  // NAUO edges with transforms
  const kids = new Map<number, { child: number; name: string; m: number[] }[]>()
  const isChild = new Set<number>()
  const nauoM = new Map<number, number[]>()
  for (const e of byType(f, 'CONTEXT_DEPENDENT_SHAPE_REPRESENTATION')) {
    const p = part(f, e.id, 'CONTEXT_DEPENDENT_SHAPE_REPRESENTATION')!
    const rel = f.ents.get(refId(p.args[0]))
    const nauo = pdsOf.get(refId(p.args[1]))
    if (!rel || nauo === undefined) continue
    const rr = rel.parts.find((x) => x.type === 'REPRESENTATION_RELATIONSHIP')
    const rt = rel.parts.find((x) => x.type === 'REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION')
    if (!rr || !rt) continue
    const idt = part(f, refId(rt.args[0]))
    if (!idt || idt.type !== 'ITEM_DEFINED_TRANSFORMATION') continue
    // item1 lives in rep_1 (child), item2 in rep_2 (parent) for the usual export convention
    const rep1 = part(f, refId(rr.args[2]))
    const item1InRep1 = rep1 && Array.isArray(rep1.args[1]) && rep1.args[1].some((x) => refId(x) === refId(idt.args[2]))
    const nauoP = part(f, nauo, 'NEXT_ASSEMBLY_USAGE_OCCURRENCE')
    const parentShapes = nauoP ? shapeOf.get(refId(nauoP.args[3])) ?? [] : []
    const rep1IsParent = parentShapes.includes(refId(rr.args[2]))
    const [childItem, parentItem] = rep1IsParent || item1InRep1 === false ? [idt.args[3], idt.args[2]] : [idt.args[2], idt.args[3]]
    nauoM.set(nauo, matMul(frameMatrix(placement(f, refId(parentItem))), invRigid(frameMatrix(placement(f, refId(childItem))))))
  }
  for (const e of byType(f, 'NEXT_ASSEMBLY_USAGE_OCCURRENCE')) {
    const p = part(f, e.id, 'NEXT_ASSEMBLY_USAGE_OCCURRENCE')!
    const parent = refId(p.args[3]), child = refId(p.args[4])
    isChild.add(child)
    kids.set(parent, [...(kids.get(parent) ?? []), { child, name: str(p.args[1]) || str(p.args[0]) || str(p.args[5] ?? ''), m: nauoM.get(e.id) ?? IDENT }])
  }
  const build = (pd: number, key: string, inst: string, m: number[], depth: number): TreeNode => ({
    key, pd, name: productName.get(pd) ?? `#${pd}`, instance: inst, m,
    children: depth > 30 ? [] : (kids.get(pd) ?? []).map((k, i) => build(k.child, `${key}/${i}`, k.name, k.m, depth + 1)),
  })
  const roots = [...productName.keys()].filter((pd) => !isChild.has(pd)).map((pd, i) => build(pd, `r${i}`, '', IDENT, 0))
  return { roots, shapeOf, productName }
}

// ---------------- geometry ----------------

export interface Geometry {
  /** polylines as flat xyz arrays */
  lines: number[][]
  /** triangle soup xyz */
  tris: number[]
  vertices: Vec[]
  faces: { planar: number; cylinder: number; tessellated: number; other: number }
}

function deBoor(k: number, x: number, t: number[], c: number[][], p: number): number[] {
  const d = Array.from({ length: p + 1 }, (_, j) => [...c[j + k - p]])
  for (let r = 1; r <= p; r++)
    for (let j = p; j >= r; j--) {
      const den = t[j + 1 + k - r] - t[j + k - p]
      const a = den ? (x - t[j + k - p]) / den : 0
      d[j] = d[j].map((v, i) => (1 - a) * d[j - 1][i] + a * v)
    }
  return d[p]
}

/** Samples a B-spline (optionally rational) curve. */
export function bspline(degree: number, ctrl: Vec[], mults: number[], knots: number[], weights: number[] | null, samples = 64): Vec[] {
  const t: number[] = []
  knots.forEach((kv, i) => {
    for (let m = 0; m < (mults[i] ?? 1); m++) t.push(kv)
  })
  // clamp malformed vectors
  const n = ctrl.length
  if (t.length !== n + degree + 1 || n <= degree) return ctrl
  const c = ctrl.map((p, i) => (weights ? [p[0] * weights[i], p[1] * weights[i], p[2] * weights[i], weights[i]] : [...p, 1]))
  const u0 = t[degree], u1 = t[n]
  const out: Vec[] = []
  for (let s = 0; s <= samples; s++) {
    const u = u0 + ((u1 - u0) * s) / samples
    let k = degree
    while (k < n - 1 && u >= t[k + 1]) k++
    const r = deBoor(k, u, t, c, degree)
    out.push([r[0] / r[3], r[1] / r[3], r[2] / r[3]])
  }
  return out
}

function curvePoints(f: StepFile, cid: number, a: Vec, b: Vec, sense: boolean, depth = 0): Vec[] {
  const e = f.ents.get(cid)
  if (!e || depth > 5) return [a, b]
  const p = e.parts[0]
  const closed = dist(a, b) < 1e-9
  const arc = (fr: Frame, ra: number, rb: number) => {
    const ang = (q: Vec) => Math.atan2(dot(sub(q, fr.o), fr.y) / rb, dot(sub(q, fr.o), fr.x) / ra)
    const t1 = ang(a)
    let t2 = ang(b)
    if (sense) {
      while (t2 <= t1 + 1e-9) t2 += 2 * Math.PI
    } else while (t2 >= t1 - 1e-9) t2 -= 2 * Math.PI
    if (closed) t2 = t1 + (sense ? 2 : -2) * Math.PI
    const nseg = Math.max(4, Math.ceil((Math.abs(t2 - t1) / (2 * Math.PI)) * 48))
    return Array.from({ length: nseg + 1 }, (_, i) => {
      const t = t1 + ((t2 - t1) * i) / nseg
      return add(fr.o, add(mul(fr.x, ra * Math.cos(t)), mul(fr.y, rb * Math.sin(t))))
    })
  }
  if (p.type === 'CIRCLE') return arc(placement(f, refId(p.args[1])), numv(p.args[2]), numv(p.args[2]))
  if (p.type === 'ELLIPSE') return arc(placement(f, refId(p.args[1])), numv(p.args[2]), numv(p.args[3]))
  if (p.type === 'SURFACE_CURVE' || p.type === 'SEAM_CURVE' || p.type === 'INTERSECTION_CURVE' || p.type === 'TRIMMED_CURVE') return curvePoints(f, refId(p.args[1]), a, b, sense, depth + 1)
  if (p.type === 'POLYLINE') {
    const pts = (Array.isArray(p.args[1]) ? p.args[1] : []).map((r) => point(f, refId(r)))
    return pts.length >= 2 ? pts : [a, b]
  }
  const bs = e.parts.find((x) => x.type === 'B_SPLINE_CURVE_WITH_KNOTS')
  const base = e.parts.find((x) => x.type === 'B_SPLINE_CURVE')
  if (bs) {
    // simple entity: (name, degree, ctrl, form, closed, self, mults, knots, spec); complex: base + knots parts
    const deg = base ? numv(base.args[0]) : numv(bs.args[1])
    const ctrlV = base ? base.args[1] : bs.args[2]
    const mults = nums(base ? bs.args[0] : bs.args[6])
    const knots = nums(base ? bs.args[1] : bs.args[7])
    const rat = e.parts.find((x) => x.type === 'RATIONAL_B_SPLINE_CURVE')
    const ctrl = (Array.isArray(ctrlV) ? ctrlV : []).map((r) => point(f, refId(r)))
    let pts = bspline(deg, ctrl, mults, knots, rat ? nums(rat.args[0]) : null, 64)
    // trim to the edge's vertices
    const near = (q: Vec) => pts.reduce((bi, pt, i) => (dist(pt, q) < dist(pts[bi], q) ? i : bi), 0)
    if (!closed) {
      const i1 = near(a), i2 = near(b)
      pts = i1 <= i2 ? pts.slice(i1, i2 + 1) : pts.slice(i2, i1 + 1).reverse()
      pts[0] = a
      pts[pts.length - 1] = b
    }
    return pts.length >= 2 ? pts : [a, b]
  }
  return [a, b]
}

/** Points of an edge (EDGE_CURVE or ORIENTED_EDGE) from its start to end vertex. */
export function edgePoints(f: StepFile, id: number): Vec[] {
  const p = part(f, id)
  if (!p) return []
  if (p.type === 'ORIENTED_EDGE') {
    const pts = edgePoints(f, refId(p.args[3]))
    return enumOf(p.args[4]) === 'F' ? [...pts].reverse() : pts
  }
  if (p.type !== 'EDGE_CURVE') return []
  const a = point(f, refId(p.args[1])), b = point(f, refId(p.args[2]))
  return curvePoints(f, refId(p.args[3]), a, b, enumOf(p.args[4]) !== 'F')
}

/** A shape representation plus the representations tied to it by plain (untransformed) relationships. */
export function partReps(f: StepFile, sr: number): number[] {
  const out = new Set([sr])
  const rels = byType(f, 'SHAPE_REPRESENTATION_RELATIONSHIP').filter((e) => e.parts.length === 1)
  let grew = true
  while (grew) {
    grew = false
    for (const e of rels) {
      const a = refId(e.parts[0].args[2]), b = refId(e.parts[0].args[3])
      if (out.has(a) !== out.has(b)) {
        out.add(a)
        out.add(b)
        grew = true
      }
    }
  }
  return [...out]
}

/** Reachable entity ids from the given roots (depth-first over references). */
export function reachable(f: StepFile, roots: number[], stopAt = new Set<string>()): Set<number> {
  const seen = new Set<number>()
  const stack = [...roots]
  const walk = (v: V) => {
    if (isRef(v)) {
      if (!seen.has(v.ref)) stack.push(v.ref)
    } else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object' && 'typed' in v) v.args.forEach(walk)
  }
  while (stack.length) {
    const id = stack.pop()!
    if (seen.has(id)) continue
    seen.add(id)
    const e = f.ents.get(id)
    if (!e || e.parts.some((p) => stopAt.has(p.type))) continue
    for (const p of e.parts) p.args.forEach(walk)
  }
  return seen
}

export interface FaceLoop { pts: Vec[]; outer: boolean }

/** Polygon loops of a face (EDGE_LOOP or POLY_LOOP bounds). */
export function faceLoops(f: StepFile, faceId: number): FaceLoop[] {
  const fp = part(f, faceId)
  if (!fp) return []
  const bounds = Array.isArray(fp.args[1]) ? fp.args[1] : []
  const out: FaceLoop[] = []
  for (const b of bounds) {
    const bp = part(f, refId(b))
    if (!bp) continue
    const lp = part(f, refId(bp.args[1]))
    if (!lp) continue
    let pts: Vec[] = []
    if (lp.type === 'POLY_LOOP') pts = (Array.isArray(lp.args[1]) ? lp.args[1] : []).map((r) => point(f, refId(r)))
    else if (lp.type === 'EDGE_LOOP') {
      for (const oe of Array.isArray(lp.args[1]) ? lp.args[1] : []) {
        const ep = edgePoints(f, refId(oe))
        for (const q of ep) if (!pts.length || dist(pts[pts.length - 1], q) > 1e-9) pts.push(q)
      }
    }
    if (pts.length > 1 && dist(pts[0], pts[pts.length - 1]) < 1e-9) pts.pop()
    if (enumOf(bp.args[2]) === 'F') pts.reverse()
    if (pts.length >= 2) out.push({ pts, outer: bp.type === 'FACE_OUTER_BOUND' })
  }
  return out
}

/**
 * Collects drawable geometry reachable from representation ids.
 * `triangulate(contour2d, holes2d)` must return index triples into contour+holes (e.g. THREE.ShapeUtils).
 */
export function geometry(f: StepFile, reps: number[], triangulate: (c: [number, number][], h: [number, number][][]) => number[][]): Geometry {
  const ids = reachable(f, reps, new Set(['SHAPE_REPRESENTATION_RELATIONSHIP', 'PRODUCT_DEFINITION_SHAPE']))
  const g: Geometry = { lines: [], tris: [], vertices: [], faces: { planar: 0, cylinder: 0, tessellated: 0, other: 0 } }
  const doneEdge = new Set<number>()
  for (const id of ids) {
    const e = f.ents.get(id)!
    if (!e) continue
    const t = e.parts[0].type
    if (t === 'EDGE_CURVE' && !doneEdge.has(id)) {
      doneEdge.add(id)
      const pts = edgePoints(f, id)
      if (pts.length >= 2) g.lines.push(pts.flat())
    } else if (t === 'VERTEX_POINT') g.vertices.push(point(f, id))
    else if (t === 'ADVANCED_FACE' || t === 'FACE_SURFACE' || t === 'FACE') {
      const surf = t === 'FACE' ? null : part(f, refId(e.parts[0].args[2]))
      const loops = faceLoops(f, id)
      if (!surf || surf.type === 'PLANE') {
        if (loops.length && planar(loops, surf ? placement(f, refId(surf.args[1])) : null, g, triangulate)) g.faces.planar++
        else g.faces.other++
        if (!surf) for (const l of loops) g.lines.push([...l.pts, l.pts[0]].flat())
      } else if (surf.type === 'CYLINDRICAL_SURFACE' && loops.length) {
        cylinder(placement(f, refId(surf.args[1])), numv(surf.args[2]), loops, g)
        g.faces.cylinder++
      } else g.faces.other++
    } else if (t === 'TRIANGULATED_FACE' || t === 'COMPLEX_TRIANGULATED_FACE' || t === 'TRIANGULATED_SURFACE_SET') {
      tessellated(f, e.parts[0], g)
      g.faces.tessellated++
    }
  }
  if (!doneEdge.size) {
    // wireframe-only files (GEOMETRIC_CURVE_SET of polylines)
    for (const id of ids) {
      const p = f.ents.get(id)?.parts[0]
      if (p?.type !== 'POLYLINE') continue
      const pts = (Array.isArray(p.args[1]) ? p.args[1] : []).map((r) => point(f, refId(r)))
      if (pts.length >= 2) g.lines.push(pts.flat())
    }
  }
  if (!g.lines.length && !g.tris.length) {
    // nothing evaluable: fall back to the point cloud
    // (points that only locate coordinate systems are not part of the shape)
    const placed = new Set<number>()
    for (const id of ids) {
      const p = f.ents.get(id)?.parts[0]
      if (p && /^AXIS[12]_PLACEMENT/.test(p.type)) placed.add(refId(p.args[1]))
    }
    for (const id of ids) if (!placed.has(id) && f.ents.get(id)?.parts[0].type === 'CARTESIAN_POINT') g.vertices.push(point(f, id))
  }
  return g
}

function planar(loops: FaceLoop[], fr: Frame | null, g: Geometry, tri: (c: [number, number][], h: [number, number][][]) => number[][]) {
  let frame = fr
  if (!frame) {
    // Newell normal for POLY_LOOP faces
    const p = loops[0].pts
    let n: Vec = [0, 0, 0]
    for (let i = 0; i < p.length; i++) n = add(n, cross(p[i], p[(i + 1) % p.length]))
    const z = norm(n)
    const x = norm(Math.abs(z[0]) < 0.9 ? cross([1, 0, 0], z) : cross([0, 1, 0], z))
    frame = { o: p[0], x, y: cross(z, x), z }
  }
  const to2 = (q: Vec): [number, number] => [dot(sub(q, frame!.o), frame!.x), dot(sub(q, frame!.o), frame!.y)]
  const area2 = (pts: [number, number][]) => pts.reduce((s, p, i) => s + p[0] * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * p[1], 0) / 2
  const l2 = loops.map((l) => ({ l, p: l.pts.map(to2) }))
  let oi = l2.findIndex((x) => x.l.outer)
  if (oi < 0) oi = l2.reduce((bi, x, i) => (Math.abs(area2(x.p)) > Math.abs(area2(l2[bi].p)) ? i : bi), 0)
  const outer = l2[oi]
  const holes = l2.filter((_, i) => i !== oi)
  if (outer.p.length < 3) return false
  const all = [outer.l.pts, ...holes.map((h) => h.l.pts)].flat()
  const idx = tri(outer.p, holes.map((h) => h.p))
  for (const t of idx) for (const k of t) g.tris.push(...all[k])
  return idx.length > 0
}

function cylinder(fr: Frame, r: number, loops: FaceLoop[], g: Geometry) {
  const pts = loops.flatMap((l) => l.pts)
  const hs = pts.map((q) => dot(sub(q, fr.o), fr.z))
  const h0 = Math.min(...hs), h1 = Math.max(...hs)
  // angular coverage: histogram of point angles over 72 bins, keep the occupied arc
  const bins = new Array(72).fill(false)
  for (const q of pts) {
    const a = Math.atan2(dot(sub(q, fr.o), fr.y), dot(sub(q, fr.o), fr.x))
    bins[Math.floor(((a + Math.PI) / (2 * Math.PI)) * 72) % 72] = true
  }
  let a0 = -Math.PI, a1 = Math.PI
  const empty = bins.map((b, i) => (b ? -1 : i)).filter((i) => i >= 0)
  if (empty.length > 2) {
    // largest gap of empty bins (circular) is outside the face
    let best = 0, bs = 0, run = 0, rs = 0
    for (let i = 0; i < 144; i++) {
      if (!bins[i % 72]) {
        if (!run) rs = i
        run++
        if (run > best) {
          best = Math.min(run, 72)
          bs = rs
        }
      } else run = 0
    }
    a0 = ((bs + best) / 72) * 2 * Math.PI - Math.PI
    a1 = (bs / 72) * 2 * Math.PI - Math.PI + 2 * Math.PI
  }
  const N = Math.max(3, Math.ceil(((a1 - a0) / (2 * Math.PI)) * 48))
  const P = (a: number, h: number) => add(fr.o, add(mul(fr.z, h), add(mul(fr.x, r * Math.cos(a)), mul(fr.y, r * Math.sin(a)))))
  for (let i = 0; i < N; i++) {
    const t0 = a0 + ((a1 - a0) * i) / N, t1 = a0 + ((a1 - a0) * (i + 1)) / N
    g.tris.push(...P(t0, h0), ...P(t1, h0), ...P(t1, h1), ...P(t0, h0), ...P(t1, h1), ...P(t0, h1))
  }
}

function tessellated(f: StepFile, p: Part, g: Geometry) {
  const cl = part(f, refId(p.args[1]))
  if (!cl || cl.type !== 'COORDINATES_LIST') return
  const coords = (Array.isArray(cl.args[2]) ? cl.args[2] : []).map((c) => nums(c) as Vec)
  const pn = nums(p.args[p.type === 'TRIANGULATED_SURFACE_SET' ? 4 : 5])
  const at = (k: number) => coords[(pn.length ? pn[k - 1] : k) - 1]
  const push = (a: number, b: number, c: number) => {
    const A = at(a), B = at(b), C = at(c)
    if (A && B && C) g.tris.push(...A, ...B, ...C)
  }
  if (p.type === 'COMPLEX_TRIANGULATED_FACE') {
    for (const s of Array.isArray(p.args[6]) ? p.args[6] : []) {
      const v = nums(s)
      for (let i = 2; i < v.length; i++) {
        if (i % 2) push(v[i - 1], v[i - 2], v[i])
        else push(v[i - 2], v[i - 1], v[i])
      }
    }
    for (const s of Array.isArray(p.args[7]) ? p.args[7] : []) {
      const v = nums(s)
      for (let i = 2; i < v.length; i++) push(v[0], v[i - 1], v[i])
    }
  } else for (const t of Array.isArray(p.args[p.type === 'TRIANGULATED_SURFACE_SET' ? 5 : 6]) ? (p.args[p.type === 'TRIANGULATED_SURFACE_SET' ? 5 : 6] as V[]) : []) {
    const v = nums(t)
    push(v[0], v[1], v[2])
  }
}

export function headerInfo(f: StepFile) {
  const fn = f.header.FILE_NAME ?? []
  const fs = f.header.FILE_SCHEMA ?? []
  const fd = f.header.FILE_DESCRIPTION ?? []
  const flat = (v: V): string => (Array.isArray(v) ? v.map(flat).filter(Boolean).join(', ') : typeof v === 'string' ? v : '')
  return {
    name: flat(fn[0] ?? ''), date: flat(fn[1] ?? ''), author: flat(fn[2] ?? ''), org: flat(fn[3] ?? ''),
    preprocessor: flat(fn[4] ?? ''), system: flat(fn[5] ?? ''), schema: flat(fs[0] ?? ''), description: flat(fd[0] ?? ''),
  }
}

export { typeOf }

// ---------------- sample generator ----------------

/** A small AP214 assembly: base plate with two holes and two pins, millimetres. */
export function sampleStep(): string {
  const L: string[] = []
  const add = (s: string) => {
    L.push(`#${L.length + 1}=${s};`)
    return `#${L.length}`
  }
  const f = (x: number) => (Number.isInteger(x) ? `${x}.` : String(+x.toFixed(6)))
  const P = (x: number, y: number, z: number) => add(`CARTESIAN_POINT('',(${f(x)},${f(y)},${f(z)}))`)
  const D = (x: number, y: number, z: number) => add(`DIRECTION('',(${f(x)},${f(y)},${f(z)}))`)
  const AX = (o: Vec, z: Vec = [0, 0, 1], x: Vec = [1, 0, 0]) => add(`AXIS2_PLACEMENT_3D('',${P(...o)},${D(...z)},${D(...x)})`)
  const vcache = new Map<string, string>()
  const VX = (p: Vec) => {
    const k = p.join(',')
    if (!vcache.has(k)) vcache.set(k, add(`VERTEX_POINT('',${P(...p)})`))
    return vcache.get(k)!
  }
  const ecache = new Map<string, { e: string; from: string }>()
  const lineEdge = (a: Vec, b: Vec) => {
    const k = [a, b].map((p) => p.join(',')).sort().join('|')
    if (!ecache.has(k)) {
      const d = sub(b, a), len = Math.hypot(...d), u = norm(d)
      const ln = add(`LINE('',${P(...a)},${add(`VECTOR('',${D(...u)},${f(len)})`)})`)
      ecache.set(k, { e: add(`EDGE_CURVE('',${VX(a)},${VX(b)},${ln},.T.)`), from: a.join(',') })
    }
    const { e, from } = ecache.get(k)!
    return add(`ORIENTED_EDGE('',*,*,${e},${from === a.join(',') ? '.T.' : '.F.'})`)
  }
  const circleEdge = (c: Vec, r: number) => {
    const circ = add(`CIRCLE('',${AX(c)},${f(r)})`)
    const v = VX([c[0] + r, c[1], c[2]])
    return add(`EDGE_CURVE('',${v},${v},${circ},.T.)`)
  }
  const loop = (edges: string[]) => add(`EDGE_LOOP('',(${edges.join(',')}))`)
  const face = (bounds: [string, boolean][], surf: string, outerFirst = true) =>
    add(`ADVANCED_FACE('',(${bounds.map(([l, o], i) => add(`${i === 0 && outerFirst ? 'FACE_OUTER_BOUND' : 'FACE_BOUND'}('',${l},${o ? '.T.' : '.F.'})`)).join(',')}),${surf},.T.)`)
  const plane = (o: Vec, z: Vec, x: Vec = [1, 0, 0]) => add(`PLANE('',${AX(o, z, x)})`)
  const oe = (e: string, fwd: boolean) => add(`ORIENTED_EDGE('',*,*,${e},${fwd ? '.T.' : '.F.'})`)

  // header context & units
  const app = add(`APPLICATION_CONTEXT('core data for automotive mechanical design processes')`)
  add(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,${app})`)
  const pctx = add(`PRODUCT_CONTEXT('',${app},'mechanical')`)
  const dctx = add(`PRODUCT_DEFINITION_CONTEXT('part definition',${app},'design')`)
  const mm = add(`( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) )`)
  const rad = add(`( NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.) )`)
  const sr = add(`( NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT() )`)
  const unc = add(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-07),${mm},'distance_accuracy_value','confusion accuracy')`)
  const ctx = add(`( GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((${unc})) GLOBAL_UNIT_ASSIGNED_CONTEXT((${mm},${rad},${sr})) REPRESENTATION_CONTEXT('Context #1','3D Context with UNIT and UNCERTAINTY') )`)

  const product = (id: string, name: string) => {
    const pr = add(`PRODUCT('${id}','${name}','',(${pctx}))`)
    add(`PRODUCT_RELATED_PRODUCT_CATEGORY('part',$,(${pr}))`)
    const pdf = add(`PRODUCT_DEFINITION_FORMATION('','',${pr})`)
    const pd = add(`PRODUCT_DEFINITION('design','',${pdf},${dctx})`)
    const pds = add(`PRODUCT_DEFINITION_SHAPE('','',${pd})`)
    const origin = AX([0, 0, 0])
    return { pd, pds, origin }
  }
  const shapeRep = (name: string, items: string[]) => add(`SHAPE_REPRESENTATION('${name}',(${items.join(',')}),${ctx})`)
  const brepRep = (name: string, solid: string, origin: string) => add(`ADVANCED_BREP_SHAPE_REPRESENTATION('${name}',(${solid},${origin}),${ctx})`)

  // --- plate 80 × 50 × 8 with two Ø13 holes
  const W = 80, Dp = 50, T = 8, holes: Vec[] = [[20, 25, 0], [60, 25, 0]], hr = 6.5
  const c = (x: number, y: number, z: number): Vec => [x, y, z]
  const b0 = [c(0, 0, 0), c(W, 0, 0), c(W, Dp, 0), c(0, Dp, 0)]
  const t0 = b0.map((p) => c(p[0], p[1], T))
  const plateFaces: string[] = []
  const topHoles = holes.map((h) => circleEdge([h[0], h[1], T], hr))
  const botHoles = holes.map((h) => circleEdge([h[0], h[1], 0], hr))
  plateFaces.push(face([[loop([lineEdge(t0[0], t0[1]), lineEdge(t0[1], t0[2]), lineEdge(t0[2], t0[3]), lineEdge(t0[3], t0[0])]), true], ...topHoles.map((e) => [loop([oe(e, false)]), true] as [string, boolean])], plane([0, 0, T], [0, 0, 1])))
  plateFaces.push(face([[loop([lineEdge(b0[0], b0[3]), lineEdge(b0[3], b0[2]), lineEdge(b0[2], b0[1]), lineEdge(b0[1], b0[0])]), true], ...botHoles.map((e) => [loop([oe(e, true)]), true] as [string, boolean])], plane([0, 0, 0], [0, 0, -1])))
  for (let i = 0; i < 4; i++) {
    const a = b0[i], b = b0[(i + 1) % 4], ta = t0[i], tb = t0[(i + 1) % 4]
    const n = norm(cross(sub(b, a), [0, 0, 1]))
    plateFaces.push(face([[loop([lineEdge(a, b), lineEdge(b, tb), lineEdge(tb, ta), lineEdge(ta, a)]), true]], plane(a, n, norm(sub(b, a)))))
  }
  holes.forEach((h, i) => {
    const seam = lineEdge([h[0] + hr, h[1], 0], [h[0] + hr, h[1], T])
    const cyl = add(`CYLINDRICAL_SURFACE('',${AX([h[0], h[1], 0])},${f(hr)})`)
    plateFaces.push(face([[loop([oe(botHoles[i], false), seam, oe(topHoles[i], true), lineEdge([h[0] + hr, h[1], T], [h[0] + hr, h[1], 0])]), true]], cyl))
  })
  const plateSolid = add(`MANIFOLD_SOLID_BREP('Plate',${add(`CLOSED_SHELL('',(${plateFaces.join(',')}))`)})`)

  // --- pin Ø12 × 30 with a 2 mm chamfer-free head Ø18 × 4
  const pinFaces: string[] = []
  const pr = 6, ph = 30, hdR = 9, hdH = 4
  const e0 = circleEdge([0, 0, 0], pr), e1 = circleEdge([0, 0, ph - hdH], pr), e2 = circleEdge([0, 0, ph - hdH], hdR), e3 = circleEdge([0, 0, ph], hdR)
  pinFaces.push(face([[loop([oe(e0, false)]), true]], plane([0, 0, 0], [0, 0, -1])))
  pinFaces.push(face([[loop([oe(e0, true), lineEdge([pr, 0, 0], [pr, 0, ph - hdH]), oe(e1, false), lineEdge([pr, 0, ph - hdH], [pr, 0, 0])]), true]], add(`CYLINDRICAL_SURFACE('',${AX([0, 0, 0])},${f(pr)})`)))
  pinFaces.push(face([[loop([oe(e2, false)]), true], [loop([oe(e1, true)]), true]], plane([0, 0, ph - hdH], [0, 0, -1])))
  pinFaces.push(face([[loop([oe(e2, true), lineEdge([hdR, 0, ph - hdH], [hdR, 0, ph]), oe(e3, false), lineEdge([hdR, 0, ph], [hdR, 0, ph - hdH])]), true]], add(`CYLINDRICAL_SURFACE('',${AX([0, 0, ph - hdH])},${f(hdR)})`)))
  pinFaces.push(face([[loop([oe(e3, true)]), true]], plane([0, 0, ph], [0, 0, 1])))
  const pinSolid = add(`MANIFOLD_SOLID_BREP('Pin',${add(`CLOSED_SHELL('',(${pinFaces.join(',')}))`)})`)

  // --- products and representations
  const asm = product('BRACKET-ASM', 'Bracket assembly')
  const plate = product('PLATE-01', 'Base plate 80x50x8')
  const pin = product('PIN-12', 'Locating pin D12')
  const asmIdx = L.length
  const asmSR = add('')
  const asmItems = [asm.origin]
  add(`SHAPE_DEFINITION_REPRESENTATION(${asm.pds},${asmSR})`)
  const partSR = (p: { pds: string; origin: string }, solid: string, nm: string) => {
    const srp = shapeRep(nm, [p.origin])
    add(`SHAPE_DEFINITION_REPRESENTATION(${p.pds},${srp})`)
    const br = brepRep(nm, solid, AX([0, 0, 0]))
    add(`SHAPE_REPRESENTATION_RELATIONSHIP('','',${srp},${br})`)
    return srp
  }
  const plateSR = partSR(plate, plateSolid, 'Plate')
  const pinSR = partSR(pin, pinSolid, 'Pin')
  const place = (child: { pd: string; origin: string }, childSR: string, name: string, at: Vec, z: Vec = [0, 0, 1]) => {
    const nauo = add(`NEXT_ASSEMBLY_USAGE_OCCURRENCE('${name}','${name}','',${asm.pd},${child.pd},$)`)
    const pds = add(`PRODUCT_DEFINITION_SHAPE('Placement','Placement of ${name}',${nauo})`)
    const target = AX(at, z)
    add(`ITEM_DEFINED_TRANSFORMATION('','',${child.origin},${target})`)
    const idt = `#${L.length}`
    const rel = add(`( REPRESENTATION_RELATIONSHIP('','',${childSR},${asmSR}) REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION(${idt}) SHAPE_REPRESENTATION_RELATIONSHIP() )`)
    add(`CONTEXT_DEPENDENT_SHAPE_REPRESENTATION(${rel},${pds})`)
    asmItems.push(target)
  }
  place(plate, plateSR, 'PLATE-01:1', [0, 0, 0])
  place(pin, pinSR, 'PIN-12:1', [20, 25, -6])
  place(pin, pinSR, 'PIN-12:2', [60, 25, -6])
  L[asmIdx] = `${asmSR}=SHAPE_REPRESENTATION('Bracket assembly',(${asmItems.join(',')}),${ctx});`

  return [
    'ISO-10303-21;',
    'HEADER;',
    "FILE_DESCRIPTION(('Browser Toolbox sample: bracket assembly'),'2;1');",
    `FILE_NAME('bracket-assembly.step','2026-01-01T00:00:00',('Browser Toolbox'),(''),'Browser Toolbox STEP writer','Browser Toolbox','');`,
    "FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));",
    'ENDSEC;',
    'DATA;',
    ...L,
    'ENDSEC;',
    'END-ISO-10303-21;',
    '',
  ].join('\n')
}
