// Rectangular (bounding-box) nesting with MaxRects placement + a genetic search over order and rotation.
// Parts may carry a true outline (from DXF) that is drawn inside its box and used for utilisation.

export type Pt = [number, number]
export interface Part { id: string; name: string; w: number; h: number; qty: number; rotate: boolean; outline?: Pt[][]; area?: number }
export interface Piece { part: number; w: number; h: number; rotate: boolean }
export interface Placed { part: number; x: number; y: number; w: number; h: number; rot: boolean }
export interface Layout { sheets: Placed[][]; unplaced: number[]; score: number }
export interface Cfg { W: number; H: number; gap: number }
interface Rect { x: number; y: number; w: number; h: number }

export function expand(parts: Part[]): Piece[] {
  const out: Piece[] = []
  parts.forEach((p, i) => { for (let k = 0; k < Math.min(p.qty, 2000); k++) out.push({ part: i, w: p.w, h: p.h, rotate: p.rotate }) })
  return out
}

/** One sheet's free-rectangle list (MaxRects). */
class Sheet {
  free: Rect[]
  placed: Placed[] = []
  constructor(W: number, H: number) { this.free = [{ x: 0, y: 0, w: W, h: H }] }
  /** Best-short-side-fit score for a w×h box; lower is better. */
  find(w: number, h: number): { r: Rect; s: number } | null {
    let best: { r: Rect; s: number } | null = null
    for (const f of this.free) {
      if (w <= f.w + 1e-9 && h <= f.h + 1e-9) {
        // bottom-left tie-break keeps parts packed towards the origin
        const s = Math.min(f.w - w, f.h - h) * 1e6 + f.y * 1e3 + f.x
        if (!best || s < best.s) best = { r: { x: f.x, y: f.y, w, h }, s }
      }
    }
    return best
  }
  place(r: Rect) {
    const next: Rect[] = []
    for (const f of this.free) {
      if (r.x >= f.x + f.w || r.x + r.w <= f.x || r.y >= f.y + f.h || r.y + r.h <= f.y) { next.push(f); continue }
      if (r.x > f.x) next.push({ x: f.x, y: f.y, w: r.x - f.x, h: f.h })
      if (r.x + r.w < f.x + f.w) next.push({ x: r.x + r.w, y: f.y, w: f.x + f.w - r.x - r.w, h: f.h })
      if (r.y > f.y) next.push({ x: f.x, y: f.y, w: f.w, h: r.y - f.y })
      if (r.y + r.h < f.y + f.h) next.push({ x: f.x, y: r.y + r.h, w: f.w, h: f.y + f.h - r.y - r.h })
    }
    // prune contained rectangles
    this.free = next.filter((a, i) => !next.some((b, j) => j !== i && a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h && (j < i || a.w !== b.w || a.h !== b.h || a.x !== b.x || a.y !== b.y)))
  }
}

/** Place pieces in the given order; rot[i] = prefer rotated orientation for piece i. */
export function pack(pieces: Piece[], order: number[], rot: boolean[], cfg: Cfg): Layout {
  const g = cfg.gap
  // each box is inflated by the gap; sheet is inflated by one gap so edges can touch
  const sheets: Sheet[] = []
  const unplaced: number[] = []
  for (const idx of order) {
    const pc = pieces[idx]
    const opts: [number, number, boolean][] = [[pc.w + g, pc.h + g, false]]
    if (pc.rotate) opts.push([pc.h + g, pc.w + g, true])
    if (rot[idx] && opts.length > 1) opts.reverse()
    let done = false
    for (const sh of sheets) {
      let best: { r: Rect; s: number; rot: boolean } | null = null
      for (const [w, h, r] of opts) { const f = sh.find(w, h); if (f && (!best || f.s < best.s)) best = { ...f, rot: r } }
      if (best) { sh.place(best.r); sh.placed.push({ part: pc.part, x: best.r.x, y: best.r.y, w: best.r.w - g, h: best.r.h - g, rot: best.rot }); done = true; break }
    }
    if (!done) {
      const sh = new Sheet(cfg.W + g, cfg.H + g)
      const o = opts.find(([w, h]) => w <= cfg.W + g && h <= cfg.H + g)
      if (!o) { unplaced.push(idx); continue }
      const f = sh.find(o[0], o[1])!
      sh.place(f.r)
      sh.placed.push({ part: pc.part, x: f.r.x, y: f.r.y, w: o[0] - g, h: o[1] - g, rot: o[2] })
      sheets.push(sh)
    }
  }
  const last = sheets[sheets.length - 1]
  const lastLen = last ? Math.max(...last.placed.map((p) => p.x + p.w)) / cfg.W : 0
  return { sheets: sheets.map((s) => s.placed), unplaced, score: unplaced.length * 1000 + Math.max(0, sheets.length - 1) + lastLen * 0.999 }
}

export function partArea(p: Part) { return p.area ?? p.w * p.h }

export function utilisation(l: Layout, parts: Part[], cfg: Cfg) {
  const used = l.sheets.reduce((a, s) => a + s.reduce((b, p) => b + partArea(parts[p.part]), 0), 0)
  const total = l.sheets.length * cfg.W * cfg.H
  // last sheet counted only up to the used strip length (remnant can be reused)
  const last = l.sheets[l.sheets.length - 1]
  const strip = last ? Math.max(...last.map((p) => p.x + p.w)) : 0
  const effective = Math.max(0, l.sheets.length - 1) * cfg.W * cfg.H + strip * cfg.H
  return { used, total, util: total ? used / total : 0, utilStrip: effective ? used / effective : 0, remnant: last ? cfg.W - strip : 0 }
}

// ---------- Genetic algorithm ----------
export function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296)
}
interface Ind { order: number[]; rot: boolean[]; score: number; layout: Layout }

function orderCrossover(a: number[], b: number[], r: () => number): number[] {
  const n = a.length
  const i = Math.floor(r() * n), j = i + Math.floor(r() * (n - i))
  const child = new Array<number>(n).fill(-1)
  const used = new Set<number>()
  for (let k = i; k <= j; k++) { child[k] = a[k]; used.add(a[k]) }
  let p = 0
  for (let k = 0; k < n; k++) {
    if (child[k] !== -1) continue
    while (used.has(b[p])) p++
    child[k] = b[p++]
  }
  return child
}

export function* evolve(pieces: Piece[], cfg: Cfg, opts: { pop?: number; gens?: number; seed?: number } = {}): Generator<{ gen: number; best: Layout }, Layout> {
  const r = rng(opts.seed ?? 12345)
  const n = pieces.length
  const P = opts.pop ?? 36
  const area = (i: number) => pieces[i].w * pieces[i].h
  const base = [...Array(n).keys()]
  const seeds: number[][] = [
    [...base].sort((a, b) => area(b) - area(a)),
    [...base].sort((a, b) => Math.max(pieces[b].w, pieces[b].h) - Math.max(pieces[a].w, pieces[a].h)),
    [...base].sort((a, b) => pieces[b].h - pieces[a].h),
    [...base].sort((a, b) => pieces[b].w - pieces[a].w),
  ]
  const make = (order: number[], rot: boolean[]): Ind => { const layout = pack(pieces, order, rot, cfg); return { order, rot, score: layout.score, layout } }
  let pop: Ind[] = []
  for (let k = 0; k < P; k++) {
    const order = k < seeds.length ? seeds[k] : k < seeds.length * 2 ? seeds[k % seeds.length].map((x) => x) : [...base].sort(() => r() - 0.5)
    if (k >= seeds.length && k < seeds.length * 2) for (let m = 0; m < Math.max(1, n / 8); m++) { const i = Math.floor(r() * n), j = Math.floor(r() * n); [order[i], order[j]] = [order[j], order[i]] }
    pop.push(make(order, base.map(() => k >= seeds.length && r() < 0.5)))
  }
  const gens = opts.gens ?? 80
  for (let g = 0; g < gens; g++) {
    pop.sort((a, b) => a.score - b.score)
    yield { gen: g, best: pop[0].layout }
    const next = pop.slice(0, 2)
    const pick = () => { const a = pop[Math.floor(r() * P)], b = pop[Math.floor(r() * P)]; return a.score < b.score ? a : b }
    while (next.length < P) {
      const a = pick(), b = pick()
      let order = r() < 0.85 ? orderCrossover(a.order, b.order, r) : [...a.order]
      const rot = a.rot.map((x, i) => (r() < 0.5 ? x : b.rot[i]))
      if (r() < 0.6) { const i = Math.floor(r() * n), j = Math.floor(r() * n); order = [...order]; [order[i], order[j]] = [order[j], order[i]] }
      if (r() < 0.4) { const i = Math.floor(r() * n); rot[i] = !rot[i] }
      next.push(make(order, rot))
    }
    pop = next
  }
  pop.sort((a, b) => a.score - b.score)
  return pop[0].layout
}

// ---------- DXF import ----------
function polyArea(p: Pt[]) { let a = 0; for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; a += x1 * y2 - x2 * y1 } return Math.abs(a) / 2 }

/** Expand a bulge segment into points (excluding the start point). */
function bulgePts(a: Pt, b: Pt, bulge: number): Pt[] {
  if (!bulge) return [b]
  const th = 4 * Math.atan(bulge)
  const d = Math.hypot(b[0] - a[0], b[1] - a[1])
  const r = d / (2 * Math.sin(th / 2))
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2
  const h = Math.sqrt(Math.max(0, r * r - (d / 2) ** 2)) * Math.sign(bulge) * (Math.abs(th) > Math.PI ? -1 : 1)
  const ux = (b[0] - a[0]) / d, uy = (b[1] - a[1]) / d
  const cx = mx - uy * h, cy = my + ux * h
  const a0 = Math.atan2(a[1] - cy, a[0] - cx)
  const n = Math.max(4, Math.ceil(Math.abs(th) / (Math.PI / 18)))
  const R = Math.abs(r)
  const out: Pt[] = []
  for (let k = 1; k <= n; k++) { const t = a0 + (th * k) / n; out.push([cx + R * Math.cos(t), cy + R * Math.sin(t)]) }
  return out
}

/** Parse closed outlines from ASCII DXF (LWPOLYLINE, POLYLINE/VERTEX, CIRCLE, chained LINE/ARC). */
export function parseDxf(text: string): Pt[][] {
  const lines = text.split(/\r?\n/)
  const pairs: [number, string][] = []
  for (let i = 0; i + 1 < lines.length; i += 2) pairs.push([parseInt(lines[i].trim(), 10), lines[i + 1].trim()])
  const loops: Pt[][] = []
  const segs: [Pt, Pt][] = []
  let i = pairs.findIndex(([c, v]) => c === 2 && v === 'ENTITIES')
  if (i < 0) i = 0
  while (i < pairs.length) {
    const [c, v] = pairs[i]
    if (c !== 0) { i++; continue }
    if (v === 'ENDSEC' || v === 'EOF') break
    const ent = v
    const body: [number, string][] = []
    i++
    while (i < pairs.length && pairs[i][0] !== 0) body.push(pairs[i++])
    const num = (code: number) => Number(body.find(([k]) => k === code)?.[1] ?? 0)
    if (ent === 'LWPOLYLINE') {
      const pts: Pt[] = []
      const bulges: number[] = []
      let cur: Pt | null = null
      for (const [k, val] of body) {
        if (k === 10) { cur = [Number(val), 0]; pts.push(cur); bulges.push(0) }
        else if (k === 20 && cur) cur[1] = Number(val)
        else if (k === 42 && pts.length) bulges[pts.length - 1] = Number(val)
      }
      const closed = (num(70) & 1) === 1 || (pts.length > 2 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-6)
      if (pts.length > 2 && closed) {
        const out: Pt[] = [pts[0]]
        for (let k = 0; k < pts.length; k++) out.push(...bulgePts(pts[k], pts[(k + 1) % pts.length], bulges[k]))
        out.pop()
        loops.push(out)
      } else for (let k = 0; k + 1 < pts.length; k++) segs.push([pts[k], pts[k + 1]])
    } else if (ent === 'POLYLINE') {
      const pts: Pt[] = []
      const closed = (num(70) & 1) === 1
      while (i < pairs.length && pairs[i][1] === 'VERTEX' && pairs[i][0] === 0) {
        i++
        const vb: [number, string][] = []
        while (i < pairs.length && pairs[i][0] !== 0) vb.push(pairs[i++])
        pts.push([Number(vb.find(([k]) => k === 10)?.[1] ?? 0), Number(vb.find(([k]) => k === 20)?.[1] ?? 0)])
      }
      if (pts.length > 2 && closed) loops.push(pts)
      else for (let k = 0; k + 1 < pts.length; k++) segs.push([pts[k], pts[k + 1]])
    } else if (ent === 'CIRCLE') {
      const cx = num(10), cy = num(20), r = num(40)
      if (r > 0) loops.push(Array.from({ length: 48 }, (_, k) => [cx + r * Math.cos((k / 48) * Math.PI * 2), cy + r * Math.sin((k / 48) * Math.PI * 2)] as Pt))
    } else if (ent === 'LINE') segs.push([[num(10), num(20)], [num(11), num(21)]])
    else if (ent === 'ARC') {
      const cx = num(10), cy = num(20), r = num(40)
      const a0 = (num(50) * Math.PI) / 180
      let a1 = (num(51) * Math.PI) / 180
      if (a1 <= a0) a1 += Math.PI * 2
      const n = Math.max(3, Math.ceil((a1 - a0) / (Math.PI / 18)))
      for (let k = 0; k < n; k++) {
        const t0 = a0 + ((a1 - a0) * k) / n, t1 = a0 + ((a1 - a0) * (k + 1)) / n
        segs.push([[cx + r * Math.cos(t0), cy + r * Math.sin(t0)], [cx + r * Math.cos(t1), cy + r * Math.sin(t1)]])
      }
    }
  }
  // chain loose segments into closed loops
  const eq = (a: Pt, b: Pt) => Math.abs(a[0] - b[0]) < 1e-4 && Math.abs(a[1] - b[1]) < 1e-4
  const left = [...segs]
  while (left.length) {
    const [a, b] = left.shift()!
    const chain: Pt[] = [a, b]
    let grew = true
    while (grew && !eq(chain[0], chain[chain.length - 1])) {
      grew = false
      const end = chain[chain.length - 1]
      const k = left.findIndex(([p, q]) => eq(p, end) || eq(q, end))
      if (k >= 0) { const [p, q] = left.splice(k, 1)[0]; chain.push(eq(p, end) ? q : p); grew = true }
    }
    if (chain.length > 3 && eq(chain[0], chain[chain.length - 1])) { chain.pop(); loops.push(chain) }
  }
  return loops
}

const bbox = (p: Pt[]) => {
  const xs = p.map((q) => q[0]), ys = p.map((q) => q[1])
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
}

/** Turn loops into parts: loops inside another loop's box become its holes; identical parts are merged by size. */
export function loopsToParts(loops: Pt[][], name = 'DXF'): Part[] {
  const items = loops.map((l) => ({ l, b: bbox(l), a: polyArea(l) })).sort((p, q) => q.a - p.a)
  const outers: { l: Pt[]; b: ReturnType<typeof bbox>; a: number; holes: Pt[][] }[] = []
  for (const it of items) {
    const host = outers.find((o) => it.b.x0 >= o.b.x0 && it.b.y0 >= o.b.y0 && it.b.x1 <= o.b.x1 && it.b.y1 <= o.b.y1)
    if (host) host.holes.push(it.l)
    else outers.push({ ...it, holes: [] })
  }
  const parts: Part[] = []
  for (const o of outers) {
    const w = +(o.b.x1 - o.b.x0).toFixed(3), h = +(o.b.y1 - o.b.y0).toFixed(3)
    const area = o.a - o.holes.reduce((s, hl) => s + polyArea(hl), 0)
    const norm = (l: Pt[]) => l.map(([x, y]) => [+(x - o.b.x0).toFixed(3), +(y - o.b.y0).toFixed(3)] as Pt)
    const same = parts.find((p) => Math.abs(p.w - w) < 1e-3 && Math.abs(p.h - h) < 1e-3 && Math.abs((p.area ?? 0) - area) < 1e-2)
    if (same) same.qty++
    else parts.push({ id: `dxf${parts.length}`, name: `${name} ${parts.length + 1}`, w, h, qty: 1, rotate: true, outline: [norm(o.l), ...o.holes.map(norm)], area })
  }
  return parts
}

/** Small demo DXF: an L-bracket with two holes and a round flange. */
export const SAMPLE_DXF = [
  '0', 'SECTION', '2', 'ENTITIES',
  '0', 'LWPOLYLINE', '8', '0', '90', '6', '70', '1', '10', '0', '20', '0', '10', '220', '20', '0', '10', '220', '20', '60', '10', '60', '20', '60', '10', '60', '20', '180', '10', '0', '20', '180',
  '0', 'CIRCLE', '8', '0', '10', '30', '20', '30', '40', '8',
  '0', 'CIRCLE', '8', '0', '10', '190', '20', '30', '40', '8',
  '0', 'CIRCLE', '8', '0', '10', '400', '20', '90', '40', '90',
  '0', 'CIRCLE', '8', '0', '10', '400', '20', '90', '40', '30',
  '0', 'ENDSEC', '0', 'EOF',
].join('\n')
