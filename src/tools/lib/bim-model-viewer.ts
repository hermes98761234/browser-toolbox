// IFC (ISO 10303-21 STEP physical file) reader: lazy entity table, spatial tree, property sets,
// and triangulated geometry for the common representation types. Written from the public
// IFC 2x3 / IFC4 schema documentation; no third-party parser code.
import { ShapeUtils, Vector2 } from 'three'

// ---------------------------------------------------------------- values

export interface Ref { ref: number }
export interface Enum { enum: string }
export interface Typed { t: string; v: Val }
export type Val = null | '*' | number | string | boolean | Ref | Enum | Typed | Val[]

export const isRef = (v: Val): v is Ref => typeof v === 'object' && v !== null && !Array.isArray(v) && 'ref' in v
export const isEnum = (v: Val): v is Enum => typeof v === 'object' && v !== null && !Array.isArray(v) && 'enum' in v
export const isTyped = (v: Val): v is Typed => typeof v === 'object' && v !== null && !Array.isArray(v) && 't' in v

/** Decodes STEP string escapes: '' → ', \X2\…\X0\ (UTF-16 hex), \X\hh (Latin-1), \S\c (c + 128). */
export function decodeStepString(s: string): string {
  return s
    .replace(/''/g, "'")
    .replace(/\\X2\\([0-9A-F]+)\\X0\\/gi, (_, hex: string) => {
      let out = ''
      for (let i = 0; i + 4 <= hex.length; i += 4) out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16))
      return out
    })
    .replace(/\\X\\([0-9A-F]{2})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\S\\(.)/g, (_, c: string) => String.fromCharCode(c.charCodeAt(0) + 128))
}

/** Parses one STEP argument list body, e.g. `'a',#12,(1.,2.),.T.,IFCLABEL('x'),$`. */
export function parseArgs(src: string): Val[] {
  let i = 0
  const ws = () => {
    while (i < src.length && /\s/.test(src[i])) i++
  }
  const value = (): Val => {
    ws()
    const c = src[i]
    if (c === '$') { i++; return null }
    if (c === '*') { i++; return '*' }
    if (c === '#') {
      const m = /^#(\d+)/.exec(src.slice(i, i + 24))!
      i += m[0].length
      return { ref: Number(m[1]) }
    }
    if (c === "'") {
      let j = i + 1, raw = ''
      for (;;) {
        if (j >= src.length) break
        if (src[j] === "'") {
          if (src[j + 1] === "'") { raw += "''"; j += 2; continue }
          break
        }
        raw += src[j++]
      }
      i = j + 1
      return decodeStepString(raw)
    }
    if (c === '.') {
      const e = src.indexOf('.', i + 1)
      const name = src.slice(i + 1, e)
      i = e + 1
      return name === 'T' ? true : name === 'F' ? false : name === 'U' ? null : { enum: name }
    }
    if (c === '(') {
      i++
      const list: Val[] = []
      ws()
      if (src[i] === ')') { i++; return list }
      for (;;) {
        list.push(value())
        ws()
        if (src[i] === ',') { i++; continue }
        if (src[i] === ')') { i++; break }
        throw new Error(`Bad list at ${i}`)
      }
      return list
    }
    if (c === '"') {
      const e = src.indexOf('"', i + 1)
      const hex = src.slice(i + 1, e)
      i = e + 1
      return hex
    }
    if (/[A-Za-z]/.test(c)) {
      const m = /^[A-Za-z0-9_]+/.exec(src.slice(i, i + 80))!
      i += m[0].length
      ws()
      if (src[i] === '(') {
        i++
        const inner = value()
        ws()
        if (src[i] === ')') i++
        return { t: m[0].toUpperCase(), v: inner }
      }
      return { enum: m[0] }
    }
    const m = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/.exec(src.slice(i, i + 40))
    if (m) {
      i += m[0].length
      return Number(m[0])
    }
    throw new Error(`Unexpected '${c}' at ${i}`)
  }
  const out: Val[] = []
  ws()
  if (i >= src.length) return out
  for (;;) {
    out.push(value())
    ws()
    if (src[i] === ',') { i++; continue }
    break
  }
  return out
}

// ---------------------------------------------------------------- model

export interface Entity { id: number; type: string; args: Val[] }
interface Raw { type: string; a: number; b: number }

export class IfcModel {
  readonly schema: string
  readonly header: { description: string; name: string; author: string; app: string }
  private raw = new Map<number, Raw>()
  private cache = new Map<number, Entity>()
  readonly types = new Map<string, number[]>()
  private text: string

  constructor(text: string) {
    this.text = text
    const schema = /FILE_SCHEMA\s*\(\s*\(\s*'([^']*)'/i.exec(text)
    this.schema = schema ? schema[1].toUpperCase() : 'unknown'
    const fn = /FILE_NAME\s*\(([\s\S]*?)\)\s*;/i.exec(text)
    let a: Val[] = []
    try {
      a = fn ? parseArgs(fn[1]) : []
    } catch {
      a = []
    }
    const desc = /FILE_DESCRIPTION\s*\(\s*\(\s*'([^']*)'/i.exec(text)
    const first = (v: Val | undefined) => (Array.isArray(v) ? fmtVal(v[0] ?? null) : typeof v === 'string' ? v : '')
    this.header = { description: desc?.[1] ?? '', name: first(a[0]), author: first(a[2]), app: first(a[5]) || first(a[4]) }
    const start = text.search(/\bDATA\s*;/i)
    if (start < 0) throw new Error('No DATA section — is this an IFC (STEP) file?')
    this.index(text, start + 5)
    if (!this.raw.size) throw new Error('The DATA section contains no entities.')
  }

  private index(t: string, from: number) {
    let i = from
    const n = t.length
    while (i < n) {
      const c = t.charCodeAt(i)
      if (c === 35 /* # */) {
        let j = i + 1, id = 0
        while (j < n && t.charCodeAt(j) >= 48 && t.charCodeAt(j) <= 57) id = id * 10 + t.charCodeAt(j++) - 48
        while (j < n && t[j] !== '=') j++
        j++
        while (j < n && /\s/.test(t[j])) j++
        let k = j
        while (k < n && /[A-Za-z0-9_]/.test(t[k])) k++
        const type = t.slice(j, k).toUpperCase()
        while (k < n && t[k] !== '(') k++
        // find the matching ')' outside strings
        let depth = 0, m = k
        for (; m < n; m++) {
          const ch = t[m]
          if (ch === "'") {
            m++
            while (m < n && !(t[m] === "'" && t[m + 1] !== "'")) m += t[m] === "'" ? 2 : 1
          } else if (ch === '(') depth++
          else if (ch === ')') {
            depth--
            if (depth === 0) break
          }
        }
        if (type) {
          this.raw.set(id, { type, a: k + 1, b: m })
          const list = this.types.get(type)
          if (list) list.push(id)
          else this.types.set(type, [id])
        }
        i = t.indexOf(';', m) + 1 || n
      } else if (c === 69 /* E */ && t.startsWith('ENDSEC', i)) break
      else if (c === 47 /* / */ && t[i + 1] === '*') i = t.indexOf('*/', i + 2) + 2 || n
      else i++
    }
  }

  get size() { return this.raw.size }
  /** True when the first argument is a string (IfcRoot GlobalId) — checked without parsing. */
  rooted(id: number) {
    const r = this.raw.get(id)
    if (!r) return false
    let i = r.a
    while (i < r.b && /\s/.test(this.text[i])) i++
    return this.text[i] === "'"
  }
  has(id: number) { return this.raw.has(id) }
  typeOf(id: number) { return this.raw.get(id)?.type ?? '' }
  ids(type: string) { return this.types.get(type) ?? [] }

  /** Entity with its arguments parsed on first access. */
  get(id: number): Entity | undefined {
    const hit = this.cache.get(id)
    if (hit) return hit
    const r = this.raw.get(id)
    if (!r) return undefined
    const e = { id, type: r.type, args: parseArgs(this.text.slice(r.a, r.b)) }
    this.cache.set(id, e)
    return e
  }

  /** Follows a reference argument. */
  deref(v: Val): Entity | undefined {
    return isRef(v) ? this.get(v.ref) : undefined
  }
}

// ---------------------------------------------------------------- names & formatting

const NICE = 'Project Site Building BuildingStorey Space Wall WallStandardCase Slab Roof Window Door Column Beam Stair StairFlight Railing Covering Member Plate Footing Pile Ramp RampFlight CurtainWall BuildingElementProxy FurnishingElement FlowTerminal SanitaryTerminal LightFixture OpeningElement Furniture DistributionElement FlowSegment FlowFitting Chimney ShadingDevice SystemFurnitureElement Transport Grid Annotation Zone ElementAssembly Reinforcing ReinforcingBar Tendon DiscreteAccessory MechanicalFastener Fastener VirtualElement Proxy ExtrudedAreaSolid RevolvedAreaSolid SweptDiskSolid SweptDiskSolidPolygonal AdvancedBrep AdvancedBrepWithVoids FacetedBrep FacetedBrepWithVoids TriangulatedFaceSet PolygonalFaceSet MappedItem BooleanResult BooleanClippingResult BoundingBox CsgSolid SurfaceCurveSweptAreaSolid FixedReferenceSweptAreaSolid ExtrudedAreaSolidTapered RevolvedAreaSolidTapered SectionedSpine SectionedSolidHorizontal GeometricCurveSet ShellBasedSurfaceModel FaceBasedSurfaceModel TrimmedCurve BSplineCurveWithKnots RationalBSplineCurveWithKnots CompositeCurve IndexedPolyCurve Polyline Circle Ellipse ArbitraryClosedProfileDef ArbitraryProfileDefWithVoids ArbitraryOpenProfileDef RectangleProfileDef RoundedRectangleProfileDef RectangleHollowProfileDef CircleProfileDef CircleHollowProfileDef IShapeProfileDef LShapeProfileDef TShapeProfileDef UShapeProfileDef CShapeProfileDef ZShapeProfileDef EllipseProfileDef CompositeProfileDef DerivedProfileDef AsymmetricIShapeProfileDef CenterLineProfileDef PolyLoop EdgeLoop'.split(' ')
const NICE_MAP = new Map(NICE.map((n) => [`IFC${n.toUpperCase()}`, `Ifc${n}`]))
export function niceType(t: string): string {
  return NICE_MAP.get(t) ?? (t.startsWith('IFC') ? 'Ifc' + t.slice(3, 4) + t.slice(4).toLowerCase() : t)
}

export function fmtVal(v: Val): string {
  if (v === null) return '—'
  if (v === '*') return '*'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(6)))
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return v.map(fmtVal).join(', ')
  if (isRef(v)) return `#${v.ref}`
  if (isEnum(v)) return v.enum === 'T' ? 'true' : v.enum === 'F' ? 'false' : v.enum
  return fmtVal(v.v)
}

const str = (v: Val | undefined) => (typeof v === 'string' ? v : isTyped(v ?? null) ? fmtVal(v as Val) : '')
const numv = (v: Val | undefined, d = 0): number => (typeof v === 'number' ? v : isTyped(v ?? null) && typeof (v as Typed).v === 'number' ? ((v as Typed).v as number) : d)
const refs = (v: Val | undefined): number[] => (Array.isArray(v) ? v.filter(isRef).map((r) => r.ref) : isRef(v ?? null) ? [(v as Ref).ref] : [])

// ---------------------------------------------------------------- units

const PREFIX: Record<string, number> = { EXA: 1e18, PETA: 1e15, TERA: 1e12, GIGA: 1e9, MEGA: 1e6, KILO: 1e3, HECTO: 100, DECA: 10, DECI: 0.1, CENTI: 0.01, MILLI: 1e-3, MICRO: 1e-6, NANO: 1e-9 }
const SYMBOL: Record<string, string> = { METRE: 'm', SQUARE_METRE: 'm²', CUBIC_METRE: 'm³', GRAM: 'g', SECOND: 's', RADIAN: 'rad', WATT: 'W', KELVIN: 'K', DEGREE_CELSIUS: '°C' }
const PFX_SYM: Record<string, string> = { MILLI: 'm', CENTI: 'c', KILO: 'k', DECI: 'd' }

export interface Units { lengthScale: number; symbols: Record<string, string> }

/** Reads IfcUnitAssignment: metres per file length unit, plus display symbols per unit type. */
export function readUnits(m: IfcModel): Units {
  const u: Units = { lengthScale: 1, symbols: { LENGTHUNIT: 'm', AREAUNIT: 'm²', VOLUMEUNIT: 'm³' } }
  const ua = m.ids('IFCUNITASSIGNMENT')[0]
  if (ua === undefined) return u
  for (const id of refs(m.get(ua)!.args[0])) {
    const e = m.get(id)
    if (!e) continue
    const kind = isEnum(e.args[1]) ? (e.args[1] as Enum).enum : ''
    if (e.type === 'IFCSIUNIT') {
      const pre = isEnum(e.args[2]) ? (e.args[2] as Enum).enum : ''
      const name = isEnum(e.args[3]) ? (e.args[3] as Enum).enum : ''
      u.symbols[kind] = (PFX_SYM[pre] ?? '') + (SYMBOL[name] ?? name.toLowerCase())
      if (kind === 'LENGTHUNIT') u.lengthScale = PREFIX[pre] ?? 1
    } else if (e.type === 'IFCCONVERSIONBASEDUNIT') {
      u.symbols[kind] = str(e.args[2]).toLowerCase()
      if (kind === 'LENGTHUNIT') {
        const mwu = m.deref(e.args[3])
        const base = mwu ? m.deref(mwu.args[1]) : undefined
        const bpre = base && isEnum(base.args[2]) ? PREFIX[(base.args[2] as Enum).enum] ?? 1 : 1
        if (mwu) u.lengthScale = numv(mwu.args[0], 1) * bpre
      }
    }
  }
  return u
}

// ---------------------------------------------------------------- spatial tree & properties

export interface TreeNode { id: number; type: string; name: string; children: TreeNode[]; spatial: boolean }

const SPATIAL = new Set(['IFCPROJECT', 'IFCSITE', 'IFCBUILDING', 'IFCBUILDINGSTOREY', 'IFCSPACE', 'IFCFACILITY', 'IFCFACILITYPART', 'IFCBRIDGE', 'IFCROAD', 'IFCRAILWAY'])

export interface Relations {
  children: Map<number, number[]>
  parent: Map<number, number>
  psets: Map<number, number[]>
  typeOf: Map<number, number>
  voids: Map<number, number[]>
}

export function relations(m: IfcModel): Relations {
  const r: Relations = { children: new Map(), parent: new Map(), psets: new Map(), typeOf: new Map(), voids: new Map() }
  const link = (p: number, cs: number[]) => {
    r.children.set(p, [...(r.children.get(p) ?? []), ...cs])
    for (const c of cs) r.parent.set(c, p)
  }
  for (const t of ['IFCRELAGGREGATES', 'IFCRELNESTS']) for (const id of m.ids(t)) {
    const e = m.get(id)!
    if (isRef(e.args[4])) link((e.args[4] as Ref).ref, refs(e.args[5]))
  }
  for (const id of m.ids('IFCRELCONTAINEDINSPATIALSTRUCTURE')) {
    const e = m.get(id)!
    if (isRef(e.args[5])) link((e.args[5] as Ref).ref, refs(e.args[4]))
  }
  for (const id of m.ids('IFCRELDEFINESBYPROPERTIES')) {
    const e = m.get(id)!
    for (const o of refs(e.args[4])) r.psets.set(o, [...(r.psets.get(o) ?? []), ...refs(e.args[5])])
  }
  for (const id of m.ids('IFCRELDEFINESBYTYPE')) {
    const e = m.get(id)!
    if (isRef(e.args[5])) for (const o of refs(e.args[4])) r.typeOf.set(o, (e.args[5] as Ref).ref)
  }
  for (const id of m.ids('IFCRELVOIDSELEMENT')) {
    const e = m.get(id)!
    if (isRef(e.args[4])) r.voids.set((e.args[4] as Ref).ref, [...(r.voids.get((e.args[4] as Ref).ref) ?? []), ...refs(e.args[5])])
  }
  return r
}

export function buildTree(m: IfcModel, rel: Relations): TreeNode[] {
  const seen = new Set<number>()
  const node = (id: number): TreeNode => {
    seen.add(id)
    const e = m.get(id)!
    const kids = (rel.children.get(id) ?? []).filter((c) => !seen.has(c) && m.has(c))
    return { id, type: e.type, name: str(e.args[2]) || niceType(e.type), spatial: SPATIAL.has(e.type), children: kids.map(node) }
  }
  return m.ids('IFCPROJECT').map(node)
}

export interface PropGroup { name: string; source: 'instance' | 'type' | 'quantities'; rows: [string, string][] }

function propRows(m: IfcModel, pid: number, units: Units): PropGroup | null {
  const p = m.get(pid)
  if (!p) return null
  if (p.type === 'IFCPROPERTYSET') {
    const rows: [string, string][] = []
    for (const id of refs(p.args[4])) {
      const q = m.get(id)
      if (!q) continue
      if (q.type === 'IFCPROPERTYSINGLEVALUE') rows.push([str(q.args[0]), fmtVal(q.args[2] ?? null)])
      else if (q.type === 'IFCPROPERTYENUMERATEDVALUE' || q.type === 'IFCPROPERTYLISTVALUE') rows.push([str(q.args[0]), fmtVal(q.args[2] ?? null)])
      else if (q.type === 'IFCPROPERTYBOUNDEDVALUE') rows.push([str(q.args[0]), `${fmtVal(q.args[3] ?? null)} … ${fmtVal(q.args[2] ?? null)}`])
      else rows.push([str(q.args[0]) || niceType(q.type), `(${niceType(q.type)})`])
    }
    return { name: str(p.args[2]) || 'Property set', source: 'instance', rows }
  }
  if (p.type === 'IFCELEMENTQUANTITY') {
    const rows: [string, string][] = []
    for (const id of refs(p.args[5])) {
      const q = m.get(id)
      if (!q) continue
      const unit = q.type === 'IFCQUANTITYLENGTH' ? units.symbols.LENGTHUNIT : q.type === 'IFCQUANTITYAREA' ? units.symbols.AREAUNIT : q.type === 'IFCQUANTITYVOLUME' ? units.symbols.VOLUMEUNIT : q.type === 'IFCQUANTITYWEIGHT' ? 'kg' : ''
      rows.push([str(q.args[0]), `${fmtVal(q.args[3] ?? null)}${unit ? ' ' + unit : ''}`])
    }
    return { name: str(p.args[2]) || 'Quantities', source: 'quantities', rows }
  }
  return null
}

/** Attributes, instance property sets, quantities and type property sets of one object. */
export function properties(m: IfcModel, rel: Relations, units: Units, id: number): PropGroup[] {
  const e = m.get(id)
  if (!e) return []
  const attrs: [string, string][] = [['Entity', `${niceType(e.type)} #${id}`], ['GlobalId', str(e.args[0])], ['Name', str(e.args[2]) || '—']]
  if (str(e.args[3])) attrs.push(['Description', str(e.args[3])])
  if (str(e.args[4])) attrs.push(['ObjectType', str(e.args[4])])
  if (e.type === 'IFCBUILDINGSTOREY') attrs.push(['Elevation', `${fmtVal(e.args[9] ?? null)} ${units.symbols.LENGTHUNIT}`])
  else if (!SPATIAL.has(e.type) && str(e.args[7])) attrs.push(['Tag', str(e.args[7])])
  const tid = rel.typeOf.get(id)
  const tEnt = tid !== undefined ? m.get(tid) : undefined
  if (tEnt) attrs.push(['Type', `${str(tEnt.args[2]) || '—'} (${niceType(tEnt.type)})`])
  const out: PropGroup[] = [{ name: 'Attributes', source: 'instance', rows: attrs }]
  for (const pid of rel.psets.get(id) ?? []) {
    const g = propRows(m, pid, units)
    if (g) out.push(g)
  }
  if (tEnt) for (const pid of refs(tEnt.args[5])) {
    const g = propRows(m, pid, units)
    if (g) out.push({ ...g, source: 'type', name: `${g.name} (type)` })
  }
  return out
}

// ---------------------------------------------------------------- matrices (column-major 4×4)

export type Mat4 = number[]
export const IDENT: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
export function mul(a: Mat4, b: Mat4): Mat4 {
  const o = new Array<number>(16)
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]
  return o
}
export const apply = (m: Mat4, x: number, y: number, z: number): [number, number, number] => [
  m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14],
]
type V3 = [number, number, number]
const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
/** Matrix from axes (x, y, z) and origin o. */
export const basis = (x: V3, y: V3, z: V3, o: V3): Mat4 => [...x, 0, ...y, 0, ...z, 0, ...o, 1]

/** Right-handed frame from Z axis and approximate X (IFC Axis2Placement3D rules). */
export function frame(z: V3, xRef: V3, o: V3): Mat4 {
  const Z = norm(z)
  let X: V3 = [xRef[0] - dot(xRef, Z) * Z[0], xRef[1] - dot(xRef, Z) * Z[1], xRef[2] - dot(xRef, Z) * Z[2]]
  if (Math.hypot(...X) < 1e-9) X = Math.abs(Z[0]) < 0.9 ? cross([0, 1, 0], Z) : cross(Z, [0, 0, 1])
  X = norm(X)
  return basis(X, cross(Z, X), Z, o)
}

// ---------------------------------------------------------------- geometry

export interface MeshPart { pos: Float32Array; color?: [number, number, number, number] }
export type GeomStatus = 'ok' | 'partial' | 'unsupported' | 'none'
export interface ElementGeom { id: number; parts: MeshPart[]; status: GeomStatus; issues: string[]; tris: number }

class Unsupported extends Error {}

export class GeometryBuilder {
  private placements = new Map<number, Mat4>()
  private styles = new Map<number, [number, number, number, number]>()
  readonly scale: number
  private m: IfcModel
  constructor(m: IfcModel, units: Units) {
    this.m = m
    this.scale = units.lengthScale
    this.readStyles()
  }

  private readStyles() {
    const m = this.m
    const colourOf = (sid: number): [number, number, number, number] | undefined => {
      const s = m.get(sid)
      if (!s) return undefined
      if (s.type === 'IFCPRESENTATIONSTYLEASSIGNMENT') {
        for (const x of refs(s.args[0])) {
          const c = colourOf(x)
          if (c) return c
        }
      }
      if (s.type === 'IFCSURFACESTYLE') {
        for (const x of refs(s.args[2])) {
          const sh = m.get(x)
          if (!sh || !/IFCSURFACESTYLE(SHADING|RENDERING)/.test(sh.type)) continue
          const rgb = m.deref(sh.args[0])
          if (rgb) return [numv(rgb.args[1]), numv(rgb.args[2]), numv(rgb.args[3]), 1 - numv(sh.args[1] ?? null, 0)]
        }
      }
      return undefined
    }
    for (const id of m.ids('IFCSTYLEDITEM')) {
      const e = m.get(id)!
      if (!isRef(e.args[0])) continue
      for (const s of refs(e.args[1])) {
        const c = colourOf(s)
        if (c) { this.styles.set((e.args[0] as Ref).ref, c); break }
      }
    }
  }

  point(id: Val): V3 {
    const p = this.m.deref(id)
    const c = p && Array.isArray(p.args[0]) ? (p.args[0] as number[]) : [0, 0, 0]
    return [c[0] ?? 0, c[1] ?? 0, c[2] ?? 0]
  }
  dir(id: Val, d: V3): V3 {
    const p = this.m.deref(id)
    if (!p || !Array.isArray(p.args[0])) return d
    const c = p.args[0] as number[]
    return [c[0] ?? 0, c[1] ?? 0, c[2] ?? 0]
  }

  /** IfcAxis2Placement3D / 2D → matrix. */
  axis(v: Val): Mat4 {
    const e = this.m.deref(v)
    if (!e) return IDENT
    if (e.type === 'IFCAXIS2PLACEMENT2D') {
      const o = this.point(e.args[0])
      const x = this.dir(e.args[1], [1, 0, 0])
      return frame([0, 0, 1], [x[0], x[1], 0], [o[0], o[1], 0])
    }
    if (e.type === 'IFCAXIS2PLACEMENT3D') return frame(this.dir(e.args[1], [0, 0, 1]), this.dir(e.args[2], [1, 0, 0]), this.point(e.args[0]))
    if (e.type === 'IFCAXIS1PLACEMENT') return frame(this.dir(e.args[1], [0, 0, 1]), [1, 0, 0], this.point(e.args[0]))
    return IDENT
  }

  /** Object placement chain: IfcLocalPlacement(PlacementRelTo, RelativePlacement). */
  placement(v: Val): Mat4 {
    if (!isRef(v)) return IDENT
    const hit = this.placements.get(v.ref)
    if (hit) return hit
    const e = this.m.get(v.ref)
    let out = IDENT
    if (e?.type === 'IFCLOCALPLACEMENT') out = mul(isRef(e.args[0]) ? this.placement(e.args[0]) : IDENT, this.axis(e.args[1]))
    this.placements.set(v.ref, out)
    return out
  }

  /** IfcCartesianTransformationOperator3D (+NonUniform) → matrix. */
  operator(v: Val): Mat4 {
    const e = this.m.deref(v)
    if (!e) return IDENT
    const z = this.dir(e.args[4] ?? null, [0, 0, 1])
    const f = frame(z, this.dir(e.args[0], [1, 0, 0]), this.point(e.args[2]))
    const s = numv(e.args[3], 1)
    const s2 = e.type.includes('NONUNIFORM') ? numv(e.args[5], s) : s
    const s3 = e.type.includes('NONUNIFORM') ? numv(e.args[6], s) : s
    return mul(f, [s, 0, 0, 0, 0, s2, 0, 0, 0, 0, s3, 0, 0, 0, 0, 1])
  }

  // ---- 2D curves & profiles
  curve(v: Val): [number, number][] {
    const e = this.m.deref(v)
    if (!e) throw new Unsupported('missing curve')
    const m = this.m
    if (e.type === 'IFCPOLYLINE') {
      const pts = refs(e.args[0]).map((p) => this.point({ ref: p })).map(([x, y]) => [x, y] as [number, number])
      return dedupeClosed(pts)
    }
    if (e.type === 'IFCINDEXEDPOLYCURVE') {
      const list = m.deref(e.args[0])
      const coords = (list && Array.isArray(list.args[0]) ? list.args[0] : []) as number[][]
      const P = (i: number) => [coords[i - 1][0], coords[i - 1][1]] as [number, number]
      if (!Array.isArray(e.args[1])) return dedupeClosed(coords.map((c) => [c[0], c[1]]))
      const out: [number, number][] = []
      for (const seg of e.args[1] as Val[]) {
        if (!isTyped(seg)) continue
        const idx = seg.v as number[]
        if (seg.t === 'IFCARCINDEX') out.push(...arc3(P(idx[0]), P(idx[1]), P(idx[2])))
        else out.push(...idx.map(P))
      }
      return dedupeClosed(out)
    }
    if (e.type === 'IFCCIRCLE') {
      const M = this.axis(e.args[0])
      const r = numv(e.args[1])
      return circle(r, 32).map(([x, y]) => { const p = apply(M, x, y, 0); return [p[0], p[1]] })
    }
    if (e.type === 'IFCCOMPOSITECURVE') {
      const out: [number, number][] = []
      for (const sid of refs(e.args[0])) {
        const s = m.get(sid)!
        let pts = this.curve(s.args[2])
        if (s.args[1] === false) pts = pts.slice().reverse()
        out.push(...pts)
      }
      return dedupeClosed(out)
    }
    throw new Unsupported(niceType(e.type))
  }

  profile(v: Val): { outer: [number, number][]; holes: [number, number][][] } {
    const e = this.m.deref(v)
    if (!e) throw new Unsupported('missing profile')
    const a = e.args
    const place = (pts: [number, number][], pos: Val) => {
      if (!isRef(pos)) return pts
      const M = this.axis(pos)
      return pts.map(([x, y]) => { const p = apply(M, x, y, 0); return [p[0], p[1]] as [number, number] })
    }
    const rect = (w: number, h: number): [number, number][] => [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]
    switch (e.type) {
      case 'IFCRECTANGLEPROFILEDEF': return { outer: place(rect(numv(a[3]), numv(a[4])), a[2]), holes: [] }
      case 'IFCRECTANGLEHOLLOWPROFILEDEF': {
        const t = numv(a[5])
        return { outer: place(rect(numv(a[3]), numv(a[4])), a[2]), holes: [place(rect(numv(a[3]) - 2 * t, numv(a[4]) - 2 * t), a[2]).reverse()] }
      }
      case 'IFCCIRCLEPROFILEDEF': return { outer: place(circle(numv(a[3]), 32), a[2]), holes: [] }
      case 'IFCCIRCLEHOLLOWPROFILEDEF': return { outer: place(circle(numv(a[3]), 32), a[2]), holes: [place(circle(numv(a[3]) - numv(a[4]), 32), a[2]).reverse()] }
      case 'IFCISHAPEPROFILEDEF': {
        const w = numv(a[3]), d = numv(a[4]), tw = numv(a[5]), tf = numv(a[6])
        const pts: [number, number][] = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, -d / 2 + tf], [tw / 2, -d / 2 + tf], [tw / 2, d / 2 - tf], [w / 2, d / 2 - tf], [w / 2, d / 2],
          [-w / 2, d / 2], [-w / 2, d / 2 - tf], [-tw / 2, d / 2 - tf], [-tw / 2, -d / 2 + tf], [-w / 2, -d / 2 + tf]]
        return { outer: place(pts, a[2]), holes: [] }
      }
      case 'IFCARBITRARYCLOSEDPROFILEDEF': return { outer: this.curve(a[2]), holes: [] }
      case 'IFCARBITRARYPROFILEDEFWITHVOIDS': return { outer: this.curve(a[2]), holes: refs(a[3]).map((r) => this.curve({ ref: r })) }
    }
    throw new Unsupported(niceType(e.type))
  }

  // ---- solids & surfaces
  extrude(e: Entity, M: Mat4, out: number[]) {
    const { outer, holes } = this.profile(e.args[0])
    const P = mul(M, isRef(e.args[1]) ? this.axis(e.args[1]) : IDENT)
    const d = norm(this.dir(e.args[2], [0, 0, 1]))
    const depth = numv(e.args[3])
    const off: V3 = [d[0] * depth, d[1] * depth, d[2] * depth]
    const rings = [outer, ...holes]
    const tris = ShapeUtils.triangulateShape(outer.map(([x, y]) => new Vector2(x, y)), holes.map((h) => h.map(([x, y]) => new Vector2(x, y))))
    const flat = rings.flat()
    const push = (x: number, y: number, z: number) => out.push(...apply(P, x, y, z))
    for (const [i, j, k] of tris) {
      const [a, b, c] = [flat[i], flat[j], flat[k]]
      push(a[0], a[1], 0); push(c[0], c[1], 0); push(b[0], b[1], 0)
      push(a[0] + off[0], a[1] + off[1], off[2]); push(b[0] + off[0], b[1] + off[1], off[2]); push(c[0] + off[0], c[1] + off[1], off[2])
    }
    for (const ring of rings) for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length]
      push(p[0], p[1], 0); push(q[0], q[1], 0); push(q[0] + off[0], q[1] + off[1], off[2])
      push(p[0], p[1], 0); push(q[0] + off[0], q[1] + off[1], off[2]); push(p[0] + off[0], p[1] + off[1], off[2])
    }
  }

  /** Triangulates one planar face given as an outer loop plus inner loops of 3D points. */
  face(loops: V3[][], M: Mat4, out: number[]) {
    const [outer, ...inner] = loops.filter((l) => l.length >= 3)
    if (!outer) return
    const push = (p: V3) => out.push(...apply(M, p[0], p[1], p[2]))
    if (!inner.length && outer.length <= 4) {
      for (let i = 1; i + 1 < outer.length; i++) { push(outer[0]); push(outer[i]); push(outer[i + 1]) }
      return
    }
    // Newell normal → drop the dominant axis and triangulate in 2D.
    const n: V3 = [0, 0, 0]
    for (let i = 0; i < outer.length; i++) {
      const a = outer[i], b = outer[(i + 1) % outer.length]
      n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1])
    }
    const ax = Math.abs(n[0]) > Math.abs(n[1]) ? (Math.abs(n[0]) > Math.abs(n[2]) ? 0 : 2) : Math.abs(n[1]) > Math.abs(n[2]) ? 1 : 2
    const [u, w] = ax === 0 ? [1, 2] : ax === 1 ? [2, 0] : [0, 1]
    const to2 = (l: V3[]) => l.map((p) => new Vector2(p[u], p[w]))
    const tris = ShapeUtils.triangulateShape(to2(outer), inner.map(to2))
    const flat = [outer, ...inner].flat()
    for (const [i, j, k] of tris) { push(flat[i]); push(flat[j]); push(flat[k]) }
  }

  shell(v: Val, M: Mat4, out: number[]) {
    const sh = this.m.deref(v)
    if (!sh) return
    for (const fid of refs(sh.args[0])) {
      const f = this.m.get(fid)
      if (!f) continue
      const bounds = refs(f.args[0]).map((b) => this.m.get(b)!).filter(Boolean)
      bounds.sort((a, b) => (a.type === 'IFCFACEOUTERBOUND' ? -1 : 0) - (b.type === 'IFCFACEOUTERBOUND' ? -1 : 0))
      const loops = bounds.map((b) => {
        const loop = this.m.deref(b.args[0])
        if (!loop || loop.type !== 'IFCPOLYLOOP') throw new Unsupported(loop ? niceType(loop.type) : 'missing loop')
        const pts = refs(loop.args[0]).map((p) => this.point({ ref: p }))
        return b.args[1] === false ? pts.reverse() : pts
      })
      this.face(loops, M, out)
    }
  }

  faceSet(e: Entity, M: Mat4, out: number[]) {
    const list = this.m.deref(e.args[0])
    const coords = (list && Array.isArray(list.args[0]) ? list.args[0] : []) as number[][]
    const tri = e.type === 'IFCTRIANGULATEDFACESET'
    const pn = (tri ? e.args[4] : e.args[3]) as number[] | null
    const P = (i: number): V3 => {
      const c = coords[(Array.isArray(pn) && pn.length ? pn[i - 1] : i) - 1] ?? [0, 0, 0]
      return [c[0], c[1], c[2] ?? 0]
    }
    if (tri) {
      for (const t of (e.args[3] ?? []) as number[][]) for (const i of t) out.push(...apply(M, ...P(i)))
      return
    }
    for (const fid of refs(e.args[2])) {
      const f = this.m.get(fid)
      if (!f) continue
      const loops = [((f.args[0] ?? []) as number[]).map(P), ...(f.type === 'IFCINDEXEDPOLYGONALFACEWITHVOIDS' ? ((f.args[1] ?? []) as number[][]).map((l) => l.map(P)) : [])]
      this.face(loops, M, out)
    }
  }

  /** Adds one representation item; returns issues found. */
  item(id: number, M: Mat4, parts: MeshPart[], issues: string[], inherited?: [number, number, number, number]) {
    const e = this.m.get(id)
    if (!e) return
    const color = this.styles.get(id) ?? inherited
    if (e.type === 'IFCMAPPEDITEM') {
      const src = this.m.deref(e.args[0])
      if (!src) return
      const T = mul(M, mul(this.operator(e.args[1]), this.axis(src.args[0])))
      const rep = this.m.deref(src.args[1])
      for (const it of refs(rep?.args[3])) this.item(it, T, parts, issues, color)
      return
    }
    const out: number[] = []
    try {
      switch (e.type) {
        case 'IFCEXTRUDEDAREASOLID': this.extrude(e, M, out); break
        case 'IFCFACETEDBREP': this.shell(e.args[0], M, out); break
        case 'IFCFACETEDBREPWITHVOIDS': this.shell(e.args[0], M, out); issues.push('Brep inner voids ignored'); break
        case 'IFCSHELLBASEDSURFACEMODEL': case 'IFCFACEBASEDSURFACEMODEL': for (const s of refs(e.args[0])) this.shell({ ref: s }, M, out); break
        case 'IFCTRIANGULATEDFACESET': case 'IFCPOLYGONALFACESET': this.faceSet(e, M, out); break
        case 'IFCBOOLEANCLIPPINGRESULT': case 'IFCBOOLEANRESULT': {
          const op = isEnum(e.args[0]) ? (e.args[0] as Enum).enum : ''
          for (const [k, r] of [[1, e.args[1]], [2, e.args[2]]] as [number, Val][]) {
            if (k === 2 && op !== 'UNION') continue
            if (isRef(r)) this.item(r.ref, M, parts, issues, color)
          }
          if (op !== 'UNION') issues.push(`Boolean ${op.toLowerCase()} not applied (first operand shown)`)
          return
        }
        case 'IFCBOUNDINGBOX': {
          const c = this.point(e.args[0])
          const [x, y, z] = [numv(e.args[1]), numv(e.args[2]), numv(e.args[3])]
          box(c, x, y, z, M, out)
          issues.push('Only a bounding box is available')
          break
        }
        default:
          throw new Unsupported(niceType(e.type))
      }
    } catch (err) {
      issues.push(err instanceof Unsupported ? `Unsupported: ${err.message}` : `Error in ${niceType(e.type)} #${id}: ${(err as Error).message}`)
      return
    }
    if (out.length) {
      const s = this.scale
      const pos = new Float32Array(out.length)
      for (let i = 0; i < out.length; i++) pos[i] = out[i] * s
      parts.push({ pos, color })
    }
  }

  /** Geometry for one product (world coordinates in metres, Z up). */
  element(id: number): ElementGeom {
    const e = this.m.get(id)!
    const shape = this.m.deref(e.args[6] ?? null)
    if (!shape || shape.type !== 'IFCPRODUCTDEFINITIONSHAPE') return { id, parts: [], status: 'none', issues: [], tris: 0 }
    const M = this.placement(e.args[5] ?? null)
    const reps = refs(shape.args[2]).map((r) => this.m.get(r)!).filter(Boolean)
    const ident = (r: Entity) => str(r.args[1])
    const SKIP = new Set(['Axis', 'FootPrint', 'Box', 'Annotation', 'Profile', 'Plan', 'Reference', 'Clearance', 'CoG', 'Lighting'])
    let use = reps.filter((r) => ident(r) === 'Body')
    if (!use.length) use = reps.filter((r) => !SKIP.has(ident(r)))
    if (!use.length) use = reps.filter((r) => ident(r) === 'Box')
    const parts: MeshPart[] = []
    const issues: string[] = []
    for (const r of use) for (const it of refs(r.args[3])) this.item(it, M, parts, issues)
    if (!use.length) issues.push('No body representation (only ' + reps.map(ident).join(', ') + ')')
    const tris = parts.reduce((a, p) => a + p.pos.length / 9, 0)
    const status: GeomStatus = !use.length ? 'none' : !parts.length ? 'unsupported' : issues.length ? 'partial' : 'ok'
    return { id, parts, status, issues: [...new Set(issues)], tris }
  }
}

function circle(r: number, n: number): [number, number][] {
  return Array.from({ length: n }, (_, i) => [r * Math.cos((2 * Math.PI * i) / n), r * Math.sin((2 * Math.PI * i) / n)] as [number, number])
}

/** Arc through three points, sampled. */
export function arc3(a: [number, number], b: [number, number], c: [number, number], n = 12): [number, number][] {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]))
  if (Math.abs(d) < 1e-12) return [a, b, c]
  const sq = (p: [number, number]) => p[0] * p[0] + p[1] * p[1]
  const ux = (sq(a) * (b[1] - c[1]) + sq(b) * (c[1] - a[1]) + sq(c) * (a[1] - b[1])) / d
  const uy = (sq(a) * (c[0] - b[0]) + sq(b) * (a[0] - c[0]) + sq(c) * (b[0] - a[0])) / d
  const r = Math.hypot(a[0] - ux, a[1] - uy)
  const ang = (p: [number, number]) => Math.atan2(p[1] - uy, p[0] - ux)
  const a0 = ang(a)
  let a1 = ang(b), a2 = ang(c)
  const ccw = d > 0
  const wrap = (x: number) => (ccw ? (x < a0 ? x + 2 * Math.PI : x) : x > a0 ? x - 2 * Math.PI : x)
  a1 = wrap(a1)
  a2 = wrap(a2)
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = a0 + ((a2 - a0) * i) / n
    return [ux + r * Math.cos(t), uy + r * Math.sin(t)] as [number, number]
  })
}

function dedupeClosed(pts: [number, number][]): [number, number][] {
  const out: [number, number][] = []
  for (const p of pts) {
    const q = out[out.length - 1]
    if (!q || Math.abs(q[0] - p[0]) > 1e-9 || Math.abs(q[1] - p[1]) > 1e-9) out.push(p)
  }
  if (out.length > 2) {
    const [f, l] = [out[0], out[out.length - 1]]
    if (Math.abs(f[0] - l[0]) < 1e-9 && Math.abs(f[1] - l[1]) < 1e-9) out.pop()
  }
  return out
}

function box(c: V3, x: number, y: number, z: number, M: Mat4, out: number[]) {
  const v = (i: number): V3 => [c[0] + (i & 1 ? x : 0), c[1] + (i & 2 ? y : 0), c[2] + (i & 4 ? z : 0)]
  const quads = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]]
  for (const [a, b, cc, d] of quads) for (const i of [a, b, cc, a, cc, d]) out.push(...apply(M, ...v(i)))
}

// ---------------------------------------------------------------- whole-model summary

export interface ElementInfo { id: number; type: string; name: string; storey: number | null; geom: ElementGeom }

export interface LoadedModel {
  model: IfcModel
  rel: Relations
  units: Units
  tree: TreeNode[]
  elements: ElementInfo[]
  storeys: { id: number; name: string; elevation: number }[]
  openings: number
  ms: number
}

export function loadIfc(text: string): LoadedModel {
  const t0 = Date.now()
  const model = new IfcModel(text)
  const units = readUnits(model)
  const rel = relations(model)
  const tree = buildTree(model, rel)
  const gb = new GeometryBuilder(model, units)
  const storeyOf = (id: number): number | null => {
    let p = rel.parent.get(id)
    const seen = new Set<number>()
    while (p !== undefined && !seen.has(p)) {
      seen.add(p)
      if (model.typeOf(p) === 'IFCBUILDINGSTOREY') return p
      p = rel.parent.get(p)
    }
    return null
  }
  // Products: everything in the spatial tree that is not a container, plus any entity with a product shape.
  const ids = new Set<number>()
  const walk = (n: TreeNode) => {
    if (!['IFCPROJECT', 'IFCSITE', 'IFCBUILDING', 'IFCBUILDINGSTOREY'].includes(n.type)) ids.add(n.id)
    n.children.forEach(walk)
  }
  tree.forEach(walk)
  const shapeOwners = new Set<number>()
  const CONTAINERS = ['IFCPROJECT', 'IFCSITE', 'IFCBUILDING', 'IFCBUILDINGSTOREY']
  for (const [type, list] of model.types) {
    if (type.startsWith('IFCREL') || CONTAINERS.includes(type)) continue
    for (const id of list) {
      // Only IfcRoot subtypes (first argument is a GlobalId string) can be products: parse just those.
      if (ids.has(id) || !model.rooted(id)) continue
      const e = model.get(id)
      if (e && e.args.length > 6 && isRef(e.args[6]) && model.typeOf((e.args[6] as Ref).ref) === 'IFCPRODUCTDEFINITIONSHAPE') shapeOwners.add(id)
    }
  }
  const elements: ElementInfo[] = [...ids, ...shapeOwners].map((id) => {
    const e = model.get(id)!
    return { id, type: e.type, name: str(e.args[2]) || niceType(e.type), storey: storeyOf(id), geom: gb.element(id) }
  })
  const storeys = model.ids('IFCBUILDINGSTOREY').map((id) => {
    const e = model.get(id)!
    return { id, name: str(e.args[2]) || `Storey #${id}`, elevation: numv(e.args[9], 0) * units.lengthScale }
  }).sort((a, b) => a.elevation - b.elevation)
  const openings = model.ids('IFCOPENINGELEMENT').length + model.ids('IFCOPENINGSTANDARDCASE').length
  return { model, rel, units, tree, elements, storeys, openings, ms: Date.now() - t0 }
}
