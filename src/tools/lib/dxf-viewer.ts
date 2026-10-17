// ASCII DXF reader for the viewer. Builds on the group-code approach of the nesting optimizer's importer and
// adds layers, colours, linetypes, blocks/INSERT (nested, scaled, rotated, mirrored), ARC/CIRCLE/ELLIPSE/SPLINE,
// bulged LWPOLYLINE/POLYLINE, TEXT/MTEXT, SOLID/POINT and DIMENSION blocks. Everything is flattened to polylines.

export type Pt = [number, number]

export interface Path {
  layer: string
  /** ACI colour; 256 = BYLAYER */
  color: number
  rgb?: string
  lt: string
  pts: Pt[]
  closed: boolean
  fill?: boolean
}
export interface Text {
  layer: string
  color: number
  rgb?: string
  x: number
  y: number
  h: number
  rot: number
  text: string
  /** 0 left, 1 centre, 2 right */
  align: number
}
export interface Layer {
  name: string
  color: number
  rgb?: string
  lt: string
  off: boolean
}
export interface Drawing {
  paths: Path[]
  texts: Text[]
  snaps: Pt[]
  layers: Layer[]
  counts: Record<string, number>
  skipped: Record<string, number>
  blocks: number
  units: string
  ext: { x0: number; y0: number; x1: number; y1: number }
}

type Pairs = [number, string][]
interface Ent { type: string; g: Pairs }

const UNITS = ['unitless', 'in', 'ft', 'mi', 'mm', 'cm', 'm', 'km', 'µin', 'mil', 'yd', 'Å', 'nm', 'µm', 'dm', 'dam', 'hm', 'Gm', 'AU', 'ly', 'pc']

export function pairs(text: string): Pairs {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  const out: Pairs = []
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const c = parseInt(lines[i].trim(), 10)
    if (Number.isNaN(c)) throw new Error(`Bad group code on line ${i + 1}: this is not an ASCII DXF (binary DXF is not supported)`)
    out.push([c, lines[i + 1].replace(/\s+$/, '')])
  }
  return out
}

const get = (g: Pairs, code: number, def = 0) => {
  const h = g.find(([c]) => c === code)
  return h ? Number(h[1]) : def
}
const str = (g: Pairs, code: number, def = '') => g.find(([c]) => c === code)?.[1].trim() ?? def

/** Expand a bulge segment from a to b into points (excluding a). */
export function bulgePts(a: Pt, b: Pt, bulge: number): Pt[] {
  if (!bulge) return [b]
  const th = 4 * Math.atan(bulge)
  const d = Math.hypot(b[0] - a[0], b[1] - a[1])
  if (d < 1e-12) return [b]
  const r = d / (2 * Math.sin(th / 2))
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2
  const h = Math.sqrt(Math.max(0, r * r - (d / 2) ** 2)) * Math.sign(bulge) * (Math.abs(th) > Math.PI ? -1 : 1)
  const ux = (b[0] - a[0]) / d, uy = (b[1] - a[1]) / d
  const cx = mx - uy * h, cy = my + ux * h
  const a0 = Math.atan2(a[1] - cy, a[0] - cx)
  const n = Math.max(4, Math.ceil(Math.abs(th) / (Math.PI / 36)))
  const R = Math.abs(r)
  const out: Pt[] = []
  for (let k = 1; k < n; k++) {
    const t = a0 + (th * k) / n
    out.push([cx + R * Math.cos(t), cy + R * Math.sin(t)])
  }
  out.push(b)
  return out
}

export function arcPts(cx: number, cy: number, r: number, a0: number, a1: number): Pt[] {
  if (a1 <= a0) a1 += Math.PI * 2
  const n = Math.max(8, Math.ceil((a1 - a0) / (Math.PI / 48)))
  return Array.from({ length: n + 1 }, (_, k) => {
    const t = a0 + ((a1 - a0) * k) / n
    return [cx + r * Math.cos(t), cy + r * Math.sin(t)] as Pt
  })
}

/** B-spline evaluation (de Boor). Falls back to a uniform clamped knot vector. */
export function splinePts(ctrl: Pt[], degree: number, knots: number[], weights: number[] = []): Pt[] {
  const n = ctrl.length
  const p = Math.min(degree, n - 1)
  if (n < 2 || p < 1) return ctrl
  let U = knots
  if (U.length !== n + p + 1) U = [...Array(p + 1).fill(0), ...Array.from({ length: n - p - 1 }, (_, i) => (i + 1) / (n - p)), ...Array(p + 1).fill(1)]
  const w = weights.length === n ? weights : Array(n).fill(1)
  const lo = U[p], hi = U[n]
  const steps = Math.max(32, n * 12)
  const out: Pt[] = []
  for (let s = 0; s <= steps; s++) {
    const u = s === steps ? hi - 1e-10 * (hi - lo) : lo + ((hi - lo) * s) / steps
    let k = p
    while (k < n - 1 && u >= U[k + 1]) k++
    const d = Array.from({ length: p + 1 }, (_, j) => {
      const c = ctrl[j + k - p], ww = w[j + k - p]
      return [c[0] * ww, c[1] * ww, ww]
    })
    for (let r = 1; r <= p; r++) {
      for (let j = p; j >= r; j--) {
        const i = j + k - p
        const den = U[i + p - r + 1] - U[i]
        const al = den ? (u - U[i]) / den : 0
        for (let m = 0; m < 3; m++) d[j][m] = (1 - al) * d[j - 1][m] + al * d[j][m]
      }
    }
    out.push([d[p][0] / d[p][2], d[p][1] / d[p][2]])
  }
  return out
}

/** Strip MTEXT inline formatting (\P paragraphs, {\f…;} fonts, \H…;, %%c etc.). */
export function cleanText(s: string): string {
  return s
    .replace(/\\P/g, '\n')
    .replace(/\\[ACFHQTWfhqtw][^;\\{}]*;/g, '')
    .replace(/\\S([^;]*)\^([^;]*);/g, '$1/$2')
    .replace(/\\[LlOoKk]/g, '')
    .replace(/\\~/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/%%[cC]/g, 'Ø')
    .replace(/%%[dD]/g, '°')
    .replace(/%%[pP]/g, '±')
    .replace(/%%[uUoO]/g, '')
    .replace(/\\\\/g, '\\')
}

function readEntities(ps: Pairs, start: number, stop: (c: number, v: string) => boolean): { ents: Ent[]; next: number } {
  const ents: Ent[] = []
  let i = start
  while (i < ps.length && !(ps[i][0] === 0 && stop(ps[i][0], ps[i][1]))) {
    if (ps[i][0] !== 0) { i++; continue }
    const type = ps[i][1].trim()
    const g: Pairs = []
    i++
    while (i < ps.length && ps[i][0] !== 0) g.push(ps[i++])
    if (type === 'POLYLINE') {
      // collect VERTEX entities up to SEQEND, flattened into code 10/20/42 triples
      while (i < ps.length && ps[i][0] === 0 && ps[i][1].trim() === 'VERTEX') {
        i++
        const vg: Pairs = []
        while (i < ps.length && ps[i][0] !== 0) vg.push(ps[i++])
        const flags = get(vg, 70)
        if (flags & 16) continue // spline frame control point
        g.push([1010, String(get(vg, 10))], [1020, String(get(vg, 20))], [1042, String(get(vg, 42))])
      }
      if (i < ps.length && ps[i][1].trim() === 'SEQEND') { i++; while (i < ps.length && ps[i][0] !== 0) i++ }
    }
    ents.push({ type, g })
  }
  return { ents, next: i }
}

interface Xf { a: number; b: number; c: number; d: number; e: number; f: number }
const ID: Xf = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
const apply = (t: Xf, [x, y]: Pt): Pt => [t.a * x + t.c * y + t.e, t.b * x + t.d * y + t.f]
const mul = (p: Xf, q: Xf): Xf => ({ a: p.a * q.a + p.c * q.b, b: p.b * q.a + p.d * q.b, c: p.a * q.c + p.c * q.d, d: p.b * q.c + p.d * q.d, e: p.a * q.e + p.c * q.f + p.e, f: p.b * q.e + p.d * q.f + p.f })

export function parseDxf(text: string): Drawing {
  const ps = pairs(text)
  const layers = new Map<string, Layer>()
  const blocks = new Map<string, { base: Pt; ents: Ent[] }>()
  let entities: Ent[] = []
  let units = 'unitless'
  let i = 0
  while (i < ps.length) {
    if (!(ps[i][0] === 0 && ps[i][1].trim() === 'SECTION')) { i++; continue }
    const name = ps[i + 1]?.[1].trim()
    i += 2
    if (name === 'HEADER') {
      while (i < ps.length && !(ps[i][0] === 0 && ps[i][1].trim() === 'ENDSEC')) {
        if (ps[i][0] === 9 && ps[i][1].trim() === '$INSUNITS' && ps[i + 1]) units = UNITS[Number(ps[i + 1][1])] ?? 'unitless'
        i++
      }
    } else if (name === 'TABLES') {
      while (i < ps.length && !(ps[i][0] === 0 && ps[i][1].trim() === 'ENDSEC')) {
        if (ps[i][0] === 0 && ps[i][1].trim() === 'LAYER') {
          i++
          const g: Pairs = []
          while (i < ps.length && ps[i][0] !== 0) g.push(ps[i++])
          const nm = str(g, 2)
          if (!nm) continue
          const col = get(g, 62, 7)
          const tc = g.find(([c]) => c === 420)
          layers.set(nm, { name: nm, color: Math.abs(col) || 7, rgb: tc ? '#' + Number(tc[1]).toString(16).padStart(6, '0') : undefined, lt: str(g, 6, 'CONTINUOUS').toUpperCase(), off: col < 0 || (get(g, 70) & 1) === 1 })
        } else i++
      }
    } else if (name === 'BLOCKS') {
      while (i < ps.length && !(ps[i][0] === 0 && ps[i][1].trim() === 'ENDSEC')) {
        if (ps[i][0] === 0 && ps[i][1].trim() === 'BLOCK') {
          i++
          const g: Pairs = []
          while (i < ps.length && ps[i][0] !== 0) g.push(ps[i++])
          const r = readEntities(ps, i, (_c, v) => v.trim() === 'ENDBLK')
          blocks.set(str(g, 2), { base: [get(g, 10), get(g, 20)], ents: r.ents })
          i = r.next + 1
        } else i++
      }
    } else if (name === 'ENTITIES') {
      const r = readEntities(ps, i, (_c, v) => v.trim() === 'ENDSEC')
      entities = r.ents
      i = r.next
    }
  }

  const paths: Path[] = []
  const texts: Text[] = []
  const snaps: Pt[] = []
  const counts: Record<string, number> = {}
  const skipped: Record<string, number> = {}

  const emit = (ents: Ent[], t: Xf, parentLayer: string, parentColor: number, depth: number) => {
    const det = t.a * t.d - t.b * t.c
    const scale = Math.sqrt(Math.abs(det)) || 1
    for (const { type, g } of ents) {
      let layer = str(g, 8, '0')
      if (layer === '0' && depth > 0) layer = parentLayer
      if (!layers.has(layer)) layers.set(layer, { name: layer, color: 7, lt: 'CONTINUOUS', off: false })
      let color = get(g, 62, 256)
      if (color === 0) color = parentColor
      const tc = g.find(([c]) => c === 420)
      const rgb = tc ? '#' + Number(tc[1]).toString(16).padStart(6, '0') : undefined
      const lt = str(g, 6, 'BYLAYER').toUpperCase()
      // Object coordinate system: extrusion (0,0,-1) mirrors X for planar entities
      const ocs = get(g, 230, 1) < 0
      const o = (p: Pt): Pt => apply(t, ocs ? [-p[0], p[1]] : p)
      const add = (pts: Pt[], closed: boolean, fill = false) => {
        if (pts.length < 2 && !fill) return
        paths.push({ layer, color, rgb, lt, pts: pts.map(o), closed, fill })
      }
      if (depth === 0) counts[type] = (counts[type] ?? 0) + 1
      switch (type) {
        case 'LINE': {
          const a: Pt = [get(g, 10), get(g, 20)], b: Pt = [get(g, 11), get(g, 21)]
          add([a, b], false)
          snaps.push(apply(t, a), apply(t, b), apply(t, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]))
          break
        }
        case 'LWPOLYLINE':
        case 'POLYLINE': {
          const pts: Pt[] = []
          const bul: number[] = []
          const xc = type === 'LWPOLYLINE' ? 10 : 1010, yc = xc + 10, bc = type === 'LWPOLYLINE' ? 42 : 1042
          let cur: Pt | null = null
          for (const [c, v] of g) {
            if (c === xc) { cur = [Number(v), 0]; pts.push(cur); bul.push(0) }
            else if (c === yc && cur) cur[1] = Number(v)
            else if (c === bc && pts.length) bul[pts.length - 1] = Number(v)
          }
          const flags = get(g, 70)
          if (type === 'POLYLINE' && flags & (16 | 64)) { skipped['3D mesh'] = (skipped['3D mesh'] ?? 0) + 1; break }
          const closed = (flags & 1) === 1
          if (!pts.length) break
          const out: Pt[] = [pts[0]]
          const segs = closed ? pts.length : pts.length - 1
          for (let k = 0; k < segs; k++) out.push(...bulgePts(pts[k], pts[(k + 1) % pts.length], bul[k]))
          if (closed) out.pop()
          add(out, closed)
          for (const p of pts) snaps.push(o(p))
          break
        }
        case 'CIRCLE': {
          const cx = get(g, 10), cy = get(g, 20), r = get(g, 40)
          const pts = arcPts(cx, cy, r, 0, Math.PI * 2)
          pts.pop()
          add(pts, true)
          snaps.push(o([cx, cy]), o([cx + r, cy]), o([cx - r, cy]), o([cx, cy + r]), o([cx, cy - r]))
          break
        }
        case 'ARC': {
          const cx = get(g, 10), cy = get(g, 20), r = get(g, 40)
          const pts = arcPts(cx, cy, r, (get(g, 50) * Math.PI) / 180, (get(g, 51) * Math.PI) / 180)
          add(pts, false)
          snaps.push(o([cx, cy]), o(pts[0]), o(pts[pts.length - 1]))
          break
        }
        case 'ELLIPSE': {
          const cx = get(g, 10), cy = get(g, 20), mx = get(g, 11), my = get(g, 21), ratio = get(g, 40, 1)
          let s0 = get(g, 41, 0), s1 = get(g, 42, Math.PI * 2)
          if (s1 <= s0) s1 += Math.PI * 2
          const n = 96
          const pts = Array.from({ length: n + 1 }, (_, k) => {
            const u = s0 + ((s1 - s0) * k) / n
            return [cx + mx * Math.cos(u) - ratio * my * Math.sin(u), cy + my * Math.cos(u) + ratio * mx * Math.sin(u)] as Pt
          })
          const full = Math.abs(s1 - s0 - Math.PI * 2) < 1e-6
          if (full) pts.pop()
          add(pts, full)
          snaps.push(o([cx, cy]))
          break
        }
        case 'SPLINE': {
          const ctrl: Pt[] = [], fit: Pt[] = [], knots: number[] = [], w: number[] = []
          let cc: Pt | null = null, fc: Pt | null = null
          for (const [c, v] of g) {
            if (c === 10) { cc = [Number(v), 0]; ctrl.push(cc) }
            else if (c === 20 && cc) cc[1] = Number(v)
            else if (c === 11) { fc = [Number(v), 0]; fit.push(fc) }
            else if (c === 21 && fc) fc[1] = Number(v)
            else if (c === 40) knots.push(Number(v))
            else if (c === 41) w.push(Number(v))
          }
          const pts = ctrl.length >= 2 ? splinePts(ctrl, get(g, 71, 3), knots, w) : fit
          add(pts, (get(g, 70) & 1) === 1)
          if (pts.length) snaps.push(o(pts[0]), o(pts[pts.length - 1]))
          break
        }
        case 'SOLID':
        case 'TRACE':
        case '3DFACE': {
          const q: Pt[] = [[get(g, 10), get(g, 20)], [get(g, 11), get(g, 21)], [get(g, 13, get(g, 12)), get(g, 23, get(g, 22))], [get(g, 12), get(g, 22)]]
          add(type === '3DFACE' ? [q[0], q[1], q[3], q[2]] : q, true, type !== '3DFACE')
          break
        }
        case 'POINT': {
          const p: Pt = [get(g, 10), get(g, 20)]
          snaps.push(o(p))
          const e = 0.0001
          add([[p[0] - e, p[1]], [p[0] + e, p[1]]], false)
          break
        }
        case 'TEXT':
        case 'MTEXT':
        case 'ATTRIB': {
          let s = type === 'MTEXT' ? g.filter(([c]) => c === 3).map(([, v]) => v).join('') + str(g, 1) : str(g, 1)
          s = cleanText(s)
          if (!s.trim()) break
          const h = get(g, 40, 2.5)
          let rot = get(g, 50, 0)
          let p: Pt = [get(g, 10), get(g, 20)]
          let align = 0
          if (type === 'MTEXT') {
            const ap = get(g, 71, 1)
            align = (ap - 1) % 3
            const dx = get(g, 11, NaN), dy = get(g, 21, NaN)
            if (Number.isFinite(dx) && Number.isFinite(dy) && (dx || dy)) rot = (Math.atan2(dy, dx) * 180) / Math.PI
            // shift so p is the top line's baseline
            const lines = s.split('\n').length
            if (ap >= 4 && ap <= 6) p = [p[0], p[1] + ((lines - 1) * h * 1.6) / 2 - h / 2]
            else if (ap <= 3) p = [p[0], p[1] - h]
            else p = [p[0], p[1] + (lines - 1) * h * 1.6]
          } else {
            const ha = get(g, 72), va = get(g, 73)
            if (ha || va) { p = [get(g, 11, p[0]), get(g, 21, p[1])]; align = ha === 1 || ha === 4 ? 1 : ha === 2 ? 2 : 0 }
          }
          const q = o(p)
          const angle = Math.atan2(t.b, t.a) * (180 / Math.PI)
          texts.push({ layer, color, rgb, x: q[0], y: q[1], h: h * scale, rot: rot + angle, text: s, align })
          break
        }
        case 'INSERT':
        case 'DIMENSION': {
          const blk = blocks.get(str(g, 2))
          if (!blk || depth > 12) { skipped[type] = (skipped[type] ?? 0) + 1; break }
          if (type === 'DIMENSION') { emit(blk.ents, t, layer, color === 256 ? 256 : color, depth + 1); break }
          const sx = get(g, 41, 1) * (ocs ? -1 : 1), sy = get(g, 42, 1), rot = (get(g, 50, 0) * Math.PI) / 180
          const cols = Math.max(1, get(g, 70, 1)), rows = Math.max(1, get(g, 71, 1)), cs = get(g, 44), rs = get(g, 45)
          const ix = get(g, 10) * (ocs ? -1 : 1), iy = get(g, 20)
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              const cosr = Math.cos(rot), sinr = Math.sin(rot)
              const ox = c * cs, oy = r * rs
              const local: Xf = { a: cosr * sx, b: sinr * sx, c: -sinr * sy, d: cosr * sy, e: ix + cosr * ox - sinr * oy, f: iy + sinr * ox + cosr * oy }
              const withBase = mul(local, { ...ID, e: -blk.base[0], f: -blk.base[1] })
              emit(blk.ents, mul(t, withBase), layer, color, depth + 1)
            }
          }
          snaps.push(apply(t, [ix, iy]))
          break
        }
        case 'ATTDEF':
        case 'VIEWPORT':
        case 'SEQEND':
          break
        default:
          skipped[type] = (skipped[type] ?? 0) + 1
      }
    }
  }
  emit(entities, ID, '0', 7, 0)

  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const p of paths) for (const [x, y] of p.pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  for (const tx of texts) {
    const ls = tx.text.split('\n')
    x0 = Math.min(x0, tx.x)
    x1 = Math.max(x1, tx.x + tx.h * Math.max(...ls.map((l) => l.length)) * 0.6)
    y0 = Math.min(y0, tx.y - (ls.length - 1) * tx.h * 1.6 - tx.h * 0.3)
    y1 = Math.max(y1, tx.y + tx.h)
  }
  if (!Number.isFinite(x0)) { x0 = y0 = 0; x1 = y1 = 1 }
  const used = new Set([...paths.map((p) => p.layer), ...texts.map((t) => t.layer)])
  return {
    paths, texts, snaps, counts, skipped, units,
    blocks: [...blocks.keys()].filter((k) => !k.startsWith('*')).length,
    layers: [...layers.values()].filter((l) => used.has(l.name)).sort((a, b) => a.name.localeCompare(b.name)),
    ext: { x0, y0, x1, y1 },
  }
}

/** Approximate AutoCAD Color Index palette (1–9 exact, 10–249 by hue/value pattern, 250–255 greys). */
export function aci(i: number, dark = true): string {
  const fixed: Record<number, string> = { 1: '#ff0000', 2: '#ffff00', 3: '#00ff00', 4: '#00ffff', 5: '#0000ff', 6: '#ff00ff', 8: '#808080', 9: '#c0c0c0' }
  if (i === 7 || i <= 0 || i > 255) return dark ? '#ffffff' : '#000000'
  if (fixed[i]) return fixed[i]
  if (i >= 250) return ['#333333', '#505050', '#696969', '#828282', '#bebebe', '#ffffff'][i - 250]
  const h = (Math.floor(i / 10) - 1) * 15
  const sub = i % 10
  const v = [1, 1, 0.8, 0.8, 0.6, 0.6, 0.5, 0.5, 0.3, 0.3][sub]
  const s = sub % 2 ? 0.5 : 1
  const f = (n: number) => {
    const k = (n + h / 60) % 6
    return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))))
  }
  return '#' + [f(5), f(3), f(1)].map((x) => x.toString(16).padStart(2, '0')).join('')
}

/** A small demo drawing: a mounting plate with layers, bulged corners, holes, a bolt block and annotations. */
export function sampleDxf(): string {
  const L: string[] = []
  const e = (...kv: (string | number)[]) => { for (let k = 0; k < kv.length; k += 2) L.push(String(kv[k]), String(kv[k + 1])) }
  e(0, 'SECTION', 2, 'HEADER', 9, '$INSUNITS', 70, 4, 0, 'ENDSEC')
  e(0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LAYER')
  for (const [n, c, lt] of [['OUTLINE', 7, 'CONTINUOUS'], ['HOLES', 4, 'CONTINUOUS'], ['CENTER', 1, 'CENTER'], ['HIDDEN', 8, 'HIDDEN'], ['FASTENERS', 3, 'CONTINUOUS'], ['ANNOTATION', 2, 'CONTINUOUS'], ['TITLE', 9, 'CONTINUOUS']] as const) e(0, 'LAYER', 2, n, 70, 0, 62, c, 6, lt)
  e(0, 'ENDTAB', 0, 'ENDSEC')
  e(0, 'SECTION', 2, 'BLOCKS', 0, 'BLOCK', 2, 'BOLT_M8', 70, 0, 10, 0, 20, 0)
  e(0, 'CIRCLE', 8, '0', 10, 0, 20, 0, 40, 6.5)
  e(0, 'LWPOLYLINE', 8, '0', 90, 6, 70, 1, 10, 6.5, 20, 0, 10, 3.25, 20, 5.63, 10, -3.25, 20, 5.63, 10, -6.5, 20, 0, 10, -3.25, 20, -5.63, 10, 3.25, 20, -5.63)
  e(0, 'CIRCLE', 8, '0', 10, 0, 20, 0, 40, 4)
  e(0, 'ENDBLK', 0, 'ENDSEC')
  e(0, 'SECTION', 2, 'ENTITIES')
  // plate 200 × 120 with R10 rounded corners (bulge 0.414 = tan(22.5°)) and a notch
  const b = Math.tan(Math.PI / 8)
  e(0, 'LWPOLYLINE', 8, 'OUTLINE', 90, 10, 70, 1,
    10, 10, 20, 0, 10, 80, 20, 0, 42, -1, 10, 120, 20, 0, 10, 190, 20, 0, 42, b, 10, 200, 20, 10, 10, 200, 20, 110, 42, b, 10, 190, 20, 120, 10, 10, 20, 120, 42, b, 10, 0, 20, 110, 10, 0, 20, 10, 42, b)
  e(0, 'CIRCLE', 8, 'HOLES', 10, 100, 20, 70, 40, 30)
  e(0, 'CIRCLE', 8, 'HIDDEN', 10, 100, 20, 70, 40, 38)
  for (const [x, y] of [[20, 20], [180, 20], [180, 100], [20, 100]]) {
    e(0, 'CIRCLE', 8, 'HOLES', 10, x, 20, y, 40, 4.5)
    e(0, 'INSERT', 8, 'FASTENERS', 2, 'BOLT_M8', 10, x, 20, y, 50, x * 0.25)
  }
  e(0, 'ELLIPSE', 8, 'HOLES', 10, 160, 20, 60, 11, 12, 21, 0, 40, 0.5, 41, 0, 42, 6.283185307)
  e(0, 'ARC', 8, 'HIDDEN', 10, 100, 20, 70, 40, 46, 50, 20, 51, 160)
  e(0, 'SPLINE', 8, 'OUTLINE', 70, 8, 71, 3, 72, 8, 73, 4, 40, 0, 40, 0, 40, 0, 40, 0, 40, 1, 40, 1, 40, 1, 40, 1, 10, 20, 20, 45, 10, 35, 20, 75, 10, 50, 20, 30, 10, 65, 20, 60)
  e(0, 'LINE', 8, 'CENTER', 10, 60, 20, 70, 11, 140, 21, 70)
  e(0, 'LINE', 8, 'CENTER', 10, 100, 20, 30, 11, 100, 21, 110)
  e(0, 'LINE', 8, 'ANNOTATION', 10, 0, 20, -14, 11, 200, 21, -14)
  e(0, 'LINE', 8, 'ANNOTATION', 10, 0, 20, -18, 11, 0, 21, -2)
  e(0, 'LINE', 8, 'ANNOTATION', 10, 200, 20, -18, 11, 200, 21, -2)
  e(0, 'TEXT', 8, 'ANNOTATION', 10, 100, 20, -11, 11, 100, 21, -11, 40, 5, 1, '200', 72, 1)
  e(0, 'TEXT', 8, 'ANNOTATION', 10, 112, 20, 104, 40, 4, 1, '%%c60 THRU')
  e(0, 'MTEXT', 8, 'TITLE', 10, 0, 20, -26, 40, 4, 71, 1, 1, 'MOUNTING PLATE MP-200\\PMaterial: S235, t = 6 mm\\PScale 1:1  ·  units mm')
  e(0, 'ENDSEC', 0, 'EOF')
  return L.join('\n')
}
