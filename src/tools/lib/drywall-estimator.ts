// Drywall layout: split walls/ceilings (minus openings) into sheet pieces, pack offcuts, measure seams.

export interface Opening { x: number; y: number; w: number; h: number }
export interface Surface { length: number; height: number; openings: Opening[] }
export interface Rect { x: number; y: number; w: number; h: number }
/** A piece in wall coordinates plus its size on the sheet (l along sheet length, t across sheet width). */
export interface Piece extends Rect { l: number; t: number; full: boolean; surface: number }
export type Orient = 'h' | 'v'

const EPS = 1e-6

/** Removes the parts of [0,len] covered by the given intervals. */
function subtract(len: number, cuts: [number, number][]): [number, number][] {
  let segs: [number, number][] = [[0, len]]
  for (const [a, b] of cuts) {
    const next: [number, number][] = []
    for (const [s, e] of segs) {
      if (b <= s + EPS || a >= e - EPS) next.push([s, e])
      else {
        if (a > s + EPS) next.push([s, a])
        if (b < e - EPS) next.push([b, e])
      }
    }
    segs = next
  }
  return segs
}

/**
 * Lays sheets (S long, W wide) on a surface. 'h' runs the sheet length along the surface length, bands stacked
 * from the top down (rip at the bottom); 'v' stands sheets up in columns from the left.
 * Openings that fully cover a band remove that stretch of board; smaller ones are cut out of the sheet.
 */
export function layout(sf: Surface, S: number, W: number, orient: Orient, surface = 0): Piece[] {
  const L = sf.length, H = sf.height
  const along = orient === 'h' ? L : H
  const across = orient === 'h' ? H : L
  const out: Piece[] = []
  for (let k = 0; k * W < across - EPS; k++) {
    // band in the "across" axis
    let c0: number, c1: number
    if (orient === 'h') { c1 = H - k * W; c0 = Math.max(0, c1 - W) } else { c0 = k * W; c1 = Math.min(L, c0 + W) }
    const cuts: [number, number][] = []
    for (const o of sf.openings) {
      const [oa0, oa1, oc0, oc1] = orient === 'h' ? [o.x, o.x + o.w, o.y, o.y + o.h] : [o.y, o.y + o.h, o.x, o.x + o.w]
      if (oc0 <= c0 + EPS && oc1 >= c1 - EPS) cuts.push([Math.max(0, oa0), Math.min(along, oa1)])
    }
    for (const [s, e] of subtract(along, cuts)) {
      for (let p = s; p < e - EPS; p += S) {
        const l = Math.min(S, e - p)
        const t = c1 - c0
        const r: Rect = orient === 'h' ? { x: p, y: c0, w: l, h: t } : { x: c0, y: p, w: t, h: l }
        out.push({ ...r, l, t, full: l >= S - EPS && t >= W - EPS, surface })
      }
    }
  }
  return out
}

export interface SheetUse { parts: { piece: number; x: number; y: number; l: number; t: number }[]; used: number }

/** Guillotine best-area-fit packing of pieces (l ≤ S, t ≤ W) into S×W sheets. Returns the sheets used. */
export function pack(pieces: { l: number; t: number }[], S: number, W: number): SheetUse[] {
  const order = pieces.map((_p, i) => i).sort((a, b) => pieces[b].l * pieces[b].t - pieces[a].l * pieces[a].t)
  const sheets: (SheetUse & { free: { x: number; y: number; l: number; t: number }[] })[] = []
  for (const i of order) {
    const p = pieces[i]
    let best: { s: number; f: number; waste: number } | null = null
    sheets.forEach((sh, s) => sh.free.forEach((f, fi) => {
      if (p.l <= f.l + EPS && p.t <= f.t + EPS) {
        const waste = f.l * f.t - p.l * p.t
        if (!best || waste < best.waste) best = { s, f: fi, waste }
      }
    }))
    if (!best) {
      sheets.push({ parts: [], used: 0, free: [{ x: 0, y: 0, l: S, t: W }] })
      best = { s: sheets.length - 1, f: 0, waste: 0 }
    }
    const { s, f } = best as { s: number; f: number }
    const sh = sheets[s]
    const fr = sh.free[f]
    sh.parts.push({ piece: i, x: fr.x, y: fr.y, l: p.l, t: p.t })
    sh.used += p.l * p.t
    sh.free.splice(f, 1)
    const rl = fr.l - p.l, rt = fr.t - p.t
    // split along the shorter leftover axis so the bigger remainder stays whole
    if (rl > EPS) sh.free.push({ x: fr.x + p.l, y: fr.y, l: rl, t: rl > rt ? fr.t : p.t })
    if (rt > EPS) sh.free.push({ x: fr.x, y: fr.y + p.t, l: rl > rt ? p.l : fr.l, t: rt })
  }
  return sheets.map(({ parts, used }) => ({ parts, used }))
}

/** Length of shared edges between pieces of the same surface (= joints to tape). */
export function seams(pieces: Rect[]): number {
  let total = 0
  for (let i = 0; i < pieces.length; i++)
    for (let j = i + 1; j < pieces.length; j++) {
      const a = pieces[i], b = pieces[j]
      if (Math.abs(a.x + a.w - b.x) < EPS || Math.abs(b.x + b.w - a.x) < EPS) total += Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
      if (Math.abs(a.y + a.h - b.y) < EPS || Math.abs(b.y + b.h - a.y) < EPS) total += Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
    }
  return total
}

export function netArea(sf: Surface): number {
  const op = sf.openings.reduce((a, o) => a + Math.max(0, Math.min(o.x + o.w, sf.length) - Math.max(o.x, 0)) * Math.max(0, Math.min(o.y + o.h, sf.height) - Math.max(o.y, 0)), 0)
  return Math.max(0, sf.length * sf.height - op)
}

/** Picks the orientation with fewer seams (ties → fewer pieces). */
export function bestOrient(sf: Surface, S: number, W: number): Orient {
  const h = layout(sf, S, W, 'h'), v = layout(sf, S, W, 'v')
  const sh = seams(h), sv = seams(v)
  return sh < sv - EPS || (Math.abs(sh - sv) < EPS && h.length <= v.length) ? 'h' : 'v'
}
