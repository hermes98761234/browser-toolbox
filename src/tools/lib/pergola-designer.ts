// Parametric pergola: member layout (posts, beams, rafters, slats, braces), cut list, stock and cost.

export interface Lumber {
  id: string
  name: string
  t: number // thickness mm
  w: number // width mm
}

export const LUMBER: Lumber[] = [
  { id: '2x2', name: '2×2 (38×38)', t: 38, w: 38 },
  { id: '2x4', name: '2×4 (38×89)', t: 38, w: 89 },
  { id: '2x6', name: '2×6 (38×140)', t: 38, w: 140 },
  { id: '2x8', name: '2×8 (38×184)', t: 38, w: 184 },
  { id: '2x10', name: '2×10 (38×235)', t: 38, w: 235 },
  { id: '2x12', name: '2×12 (38×286)', t: 38, w: 286 },
  { id: '4x4', name: '4×4 (89×89)', t: 89, w: 89 },
  { id: '6x6', name: '6×6 (140×140)', t: 140, w: 140 },
  { id: '8x8', name: '8×8 (184×184)', t: 184, w: 184 },
]
export const lumber = (id: string) => LUMBER.find((l) => l.id === id) ?? LUMBER[0]

/** Standard stock lengths, mm (8–20 ft). */
export const STOCK = [2438, 3048, 3658, 4267, 4877, 6096]

export interface Params {
  length: number // along the beams, post centre to post centre outer, mm
  width: number // across, between beam lines (post centres), mm
  height: number // post height above ground, mm
  maxPostSpacing: number
  post: string
  beam: string
  doubleBeam: boolean
  beamOverhang: number
  rafter: string
  rafterSpacing: number
  rafterOverhang: number
  slats: boolean
  slat: string
  slatSpacing: number
  braces: boolean
  footingDepth: number
}

export interface Member {
  kind: 'Post' | 'Beam' | 'Rafter' | 'Slat' | 'Brace'
  size: string
  len: number
  // centre and box size (x along length, y up, z across); brace has rotation about z or x
  c: [number, number, number]
  s: [number, number, number]
  rot?: [number, number, number]
}

export function layout(p: Params): Member[] {
  const post = lumber(p.post), beam = lumber(p.beam), raf = lumber(p.rafter), sl = lumber(p.slat)
  const out: Member[] = []
  const spans = Math.max(1, Math.ceil(p.length / Math.max(500, p.maxPostSpacing)))
  const xs = Array.from({ length: spans + 1 }, (_, i) => -p.length / 2 + (i * p.length) / spans)
  const zs = [-p.width / 2, p.width / 2]
  for (const z of zs) for (const x of xs) out.push({ kind: 'Post', size: p.post, len: p.height + p.footingDepth, c: [x, p.height / 2, z], s: [post.w, p.height, post.w] })
  // beams sit on the posts; doubled beams straddle the post centreline
  const bl = p.length + post.w + 2 * p.beamOverhang
  const by = p.height + beam.w / 2
  for (const z of zs) {
    const plies = p.doubleBeam ? [-beam.t / 2, beam.t / 2] : [0]
    for (const o of plies) out.push({ kind: 'Beam', size: p.beam, len: bl, c: [0, by, z + o], s: [bl, beam.w, beam.t] })
  }
  // rafters across the beams
  const rl = p.width + post.w + 2 * p.rafterOverhang
  const ry = p.height + beam.w + raf.w / 2
  const usable = bl - raf.t
  const nR = Math.max(2, Math.floor(usable / Math.max(100, p.rafterSpacing)) + 1)
  for (let i = 0; i < nR; i++) {
    const x = -usable / 2 + (i * usable) / (nR - 1)
    out.push({ kind: 'Rafter', size: p.rafter, len: rl, c: [x, ry, 0], s: [raf.t, raf.w, rl] })
  }
  if (p.slats) {
    const sy = ry + raf.w / 2 + sl.t / 2
    const su = rl - sl.w
    const nS = Math.max(2, Math.floor(su / Math.max(50, p.slatSpacing)) + 1)
    for (let i = 0; i < nS; i++) {
      const z = -su / 2 + (i * su) / (nS - 1)
      out.push({ kind: 'Slat', size: p.slat, len: bl, c: [0, sy, z], s: [bl, sl.t, sl.w] })
    }
  }
  if (p.braces) {
    // 45° knee braces from each post to the beam, in the plane of the beam
    const leg = Math.min(700, p.height * 0.3)
    const bLen = Math.round(leg * Math.SQRT2)
    const bs = lumber('4x4')
    for (const z of zs)
      xs.forEach((x, i) => {
        for (const dir of [-1, 1]) {
          if ((i === 0 && dir < 0 && p.beamOverhang < leg) || (i === xs.length - 1 && dir > 0 && p.beamOverhang < leg)) continue
          out.push({ kind: 'Brace', size: '4x4', len: bLen, c: [x + (dir * (post.w / 2 + leg / 2)), p.height - leg / 2, z], s: [bLen, bs.w, bs.w], rot: [0, 0, dir * Math.PI / 4] })
        }
      })
  }
  return out
}

export interface CutRow {
  kind: string
  size: string
  len: number
  qty: number
  stock: number // stock length chosen, mm
  pieces: number // stock boards to buy
  linear: number // metres of stock purchased
}

/** Groups members and picks stock boards: shortest stock that fits, combining several cuts per board where possible. */
export function cutList(ms: Member[]): CutRow[] {
  const map = new Map<string, CutRow>()
  for (const m of ms) {
    const len = Math.round(m.len)
    const key = `${m.kind}|${m.size}|${len}`
    const r = map.get(key)
    if (r) r.qty++
    else map.set(key, { kind: m.kind, size: m.size, len, qty: 1, stock: 0, pieces: 0, linear: 0 })
  }
  const kerf = 5
  for (const r of map.values()) {
    const max = STOCK[STOCK.length - 1]
    if (r.len > max) {
      // splice: each member needs ceil(len / max) boards
      const per = Math.ceil(r.len / max)
      r.stock = max
      r.pieces = per * r.qty
    } else {
      // choose the stock length that minimises bought length
      let best = { stock: 0, pieces: Infinity, total: Infinity }
      for (const st of STOCK) {
        if (st < r.len) continue
        const fit = Math.max(1, Math.floor((st + kerf) / (r.len + kerf)))
        const pieces = Math.ceil(r.qty / fit)
        if (pieces * st < best.total) best = { stock: st, pieces, total: pieces * st }
      }
      r.stock = best.stock
      r.pieces = best.pieces
    }
    r.linear = (r.stock * r.pieces) / 1000
  }
  const order = ['Post', 'Beam', 'Rafter', 'Slat', 'Brace']
  return [...map.values()].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))
}

/** Fraction of the roof shaded by overhead rafters and slats at noon (sun overhead). */
export function shade(p: Params): number {
  const raf = lumber(p.rafter), sl = lumber(p.slat)
  const a = Math.min(1, raf.t / Math.max(1, p.rafterSpacing))
  const b = p.slats ? Math.min(1, sl.w / Math.max(1, p.slatSpacing)) : 0
  return 1 - (1 - a) * (1 - b)
}

/** Concrete for cylindrical footings (300 mm Ø holes) in m³. */
export function concrete(posts: number, depth: number, dia = 300): number {
  return posts * Math.PI * (dia / 2000) ** 2 * (depth / 1000)
}
