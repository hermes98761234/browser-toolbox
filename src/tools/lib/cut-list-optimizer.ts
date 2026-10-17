// Guillotine bin packing for cut lists (sheets) — also handles 1D boards as strips of height 1.

export interface Stock { id: string; name: string; w: number; h: number; qty: number }
export interface Part { id: string; name: string; w: number; h: number; qty: number; rotate: boolean }
export interface Placed { partId: string; name: string; x: number; y: number; w: number; h: number; rotated: boolean }
export interface Sheet { stockId: string; w: number; h: number; parts: Placed[]; cuts: number }
export interface Result { sheets: Sheet[]; unplaced: { partId: string; name: string; w: number; h: number }[]; used: number; waste: number; heuristic: string }

interface Free { x: number; y: number; w: number; h: number }
interface Bin { stock: Stock; free: Free[]; sheet: Sheet }

type Sort = (a: Part, b: Part) => number
const SORTS: [string, Sort][] = [
  ['area', (a, b) => b.w * b.h - a.w * a.h],
  ['long side', (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h)],
  ['width', (a, b) => b.w - a.w || b.h - a.h],
  ['height', (a, b) => b.h - a.h || b.w - a.w],
  ['perimeter', (a, b) => b.w + b.h - a.w - a.h],
]

function pack(stocks: Stock[], parts: Part[], kerf: number, trim: number, sort: Sort, splitShort: boolean): Result {
  const items = parts.flatMap((p) => Array.from({ length: Math.max(0, Math.floor(p.qty)) }, () => p)).sort(sort)
  const left = new Map(stocks.map((s) => [s.id, Math.max(0, Math.floor(s.qty))]))
  const bins: Bin[] = []
  const unplaced: Result['unplaced'] = []
  const fit = (f: Free, w: number, h: number) => w + kerf <= f.w + 1e-9 && h + kerf <= f.h + 1e-9
  const place = (bin: Bin, fi: number, p: Part, rot: boolean) => {
    const f = bin.free[fi]
    const w = rot ? p.h : p.w, h = rot ? p.w : p.h
    const pw = w + kerf, ph = h + kerf
    bin.sheet.parts.push({ partId: p.id, name: p.name, x: f.x - trim, y: f.y - trim, w, h, rotated: rot })
    bin.free.splice(fi, 1)
    const rw = f.w - pw, rh = f.h - ph
    const horiz = splitShort ? rw < rh : rw >= rh
    const a: Free = horiz ? { x: f.x + pw, y: f.y, w: rw, h: ph } : { x: f.x + pw, y: f.y, w: rw, h: f.h }
    const b: Free = horiz ? { x: f.x, y: f.y + ph, w: f.w, h: rh } : { x: f.x, y: f.y + ph, w: pw, h: rh }
    for (const r of [a, b]) if (r.w > kerf + 1e-9 && r.h > kerf + 1e-9) bin.free.push(r)
    bin.sheet.cuts += (rw > 1e-9 ? 1 : 0) + (rh > 1e-9 ? 1 : 0)
  }
  // Best-area-fit across all open bins.
  const tryPlace = (bs: Bin[], p: Part) => {
    let best: { bin: Bin; fi: number; rot: boolean; score: number } | null = null
    for (const bin of bs) {
      for (let fi = 0; fi < bin.free.length; fi++) {
        const f = bin.free[fi]
        for (const rot of p.rotate && p.w !== p.h ? [false, true] : [false]) {
          const w = rot ? p.h : p.w, h = rot ? p.w : p.h
          if (!fit(f, w, h)) continue
          const score = f.w * f.h - (w + kerf) * (h + kerf)
          if (!best || score < best.score) best = { bin, fi, rot, score }
        }
      }
      if (best) break // prefer earlier sheets
    }
    if (best) place(best.bin, best.fi, p, best.rot)
    return !!best
  }
  for (const p of items) {
    if (tryPlace(bins, p)) continue
    const st = stocks.find((s) => (left.get(s.id) ?? 0) > 0 && (fit({ x: 0, y: 0, w: s.w - 2 * trim + kerf, h: s.h - 2 * trim + kerf }, p.w, p.h) || (p.rotate && fit({ x: 0, y: 0, w: s.w - 2 * trim + kerf, h: s.h - 2 * trim + kerf }, p.h, p.w))))
    if (!st) { unplaced.push({ partId: p.id, name: p.name, w: p.w, h: p.h }); continue }
    left.set(st.id, left.get(st.id)! - 1)
    const bin: Bin = { stock: st, free: [{ x: trim, y: trim, w: st.w - 2 * trim + kerf, h: st.h - 2 * trim + kerf }], sheet: { stockId: st.id, w: st.w, h: st.h, parts: [], cuts: 0 } }
    bins.push(bin)
    tryPlace([bin], p)
  }
  for (const b of bins) b.sheet.parts.forEach((q) => { q.x += trim; q.y += trim })
  const used = bins.reduce((a, b) => a + b.sheet.w * b.sheet.h, 0)
  const partsArea = bins.reduce((a, b) => a + b.sheet.parts.reduce((c, q) => c + q.w * q.h, 0), 0)
  return { sheets: bins.map((b) => b.sheet), unplaced, used, waste: used ? 1 - partsArea / used : 0, heuristic: '' }
}

/** Runs several sort orders and split rules and keeps the best (fewest unplaced, least stock area, emptiest last sheet). */
export function optimize(stocks: Stock[], parts: Part[], kerf: number, trim = 0): Result {
  let best: Result | null = null
  const lastFill = (r: Result) => { const s = r.sheets[r.sheets.length - 1]; return s ? s.parts.reduce((a, q) => a + q.w * q.h, 0) / (s.w * s.h) : 0 }
  for (const [name, sort] of SORTS) {
    for (const split of [true, false]) {
      const r = pack(stocks, parts, kerf, trim, sort, split)
      r.heuristic = `${name}, ${split ? 'short' : 'long'}-axis split`
      if (!best || r.unplaced.length < best.unplaced.length || (r.unplaced.length === best.unplaced.length && (r.used < best.used - 1e-9 || (Math.abs(r.used - best.used) < 1e-9 && lastFill(r) < lastFill(best))))) best = r
    }
  }
  return best!
}
