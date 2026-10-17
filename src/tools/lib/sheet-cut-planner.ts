// 2-D guillotine sheet packing (Jylänki's GUILLOTINE family) with kerf, edge trim, grain lock and multi-start search.

export interface Part { label: string; w: number; h: number; qty: number; rotate: boolean }
export interface Opts { sheetW: number; sheetH: number; kerf: number; trim: number; rotate: boolean }
export interface Rect { x: number; y: number; w: number; h: number }
export interface Placed extends Rect { label: string; rotated: boolean; part: number }
export interface Sheet { placed: Placed[]; free: Rect[]; used: number }
export interface Plan { sheets: Sheet[]; unplaced: { label: string; w: number; h: number }[]; area: number; sheetArea: number; waste: number; cuts: number; heuristic: string }

interface Item { label: string; w: number; h: number; rot: boolean; part: number }
type Fit = 'baf' | 'bssf' | 'blsf'
type SplitRule = 'slas' | 'llas' | 'minas' | 'maxas'

/** Packs items in the given order. Dimensions are inflated by kerf so cuts never overlap parts. */
function packOnce(items: Item[], o: Opts, fit: Fit, rule: SplitRule): Plan {
  const k = o.kerf
  const W = o.sheetW - 2 * o.trim + k
  const H = o.sheetH - 2 * o.trim + k
  const sheets: { placed: Placed[]; free: Rect[] }[] = []
  const unplaced: Plan['unplaced'] = []
  let cuts = 0
  const score = (f: Rect, w: number, h: number) => {
    const dw = f.w - w, dh = f.h - h
    return fit === 'baf' ? f.w * f.h - w * h : fit === 'bssf' ? Math.min(dw, dh) : Math.max(dw, dh)
  }
  const place = (sh: { placed: Placed[]; free: Rect[] }, it: Item) => {
    let best: { fi: number; w: number; h: number; rot: boolean; s: number } | null = null
    sh.free.forEach((f, fi) => {
      const tries: [number, number, boolean][] = [[it.w + k, it.h + k, false]]
      if (it.rot && it.w !== it.h) tries.push([it.h + k, it.w + k, true])
      for (const [w, h, rot] of tries) {
        if (w > f.w + 1e-9 || h > f.h + 1e-9) continue
        const sc = score(f, w, h)
        if (!best || sc < best.s - 1e-9) best = { fi, w, h, rot, s: sc }
      }
    })
    if (!best) return false
    const { fi, w, h, rot } = best as { fi: number; w: number; h: number; rot: boolean }
    const f = sh.free[fi]
    sh.free.splice(fi, 1)
    sh.placed.push({ x: f.x + o.trim, y: f.y + o.trim, w: w - k, h: h - k, label: it.label, rotated: rot, part: it.part })
    const dw = f.w - w, dh = f.h - h
    let horiz: boolean
    if (rule === 'slas') horiz = dw <= dh
    else if (rule === 'llas') horiz = dw > dh
    else if (rule === 'minas') horiz = dw * h > w * dh
    else horiz = dw * h <= w * dh
    // horiz: the cut below the part runs across the full free width.
    const right: Rect = { x: f.x + w, y: f.y, w: dw, h: horiz ? h : f.h }
    const bottom: Rect = { x: f.x, y: f.y + h, w: horiz ? f.w : w, h: dh }
    if (dw > 1e-9) cuts++
    if (dh > 1e-9) cuts++
    for (const r of [right, bottom]) if (r.w > k + 1e-9 && r.h > k + 1e-9) sh.free.push(r)
    return true
  }
  for (const it of items) {
    if (!sheets.some((sh) => place(sh, it))) {
      const sh = { placed: [], free: [{ x: 0, y: 0, w: W, h: H }] }
      if (place(sh, it)) sheets.push(sh)
      else unplaced.push({ label: it.label, w: it.w, h: it.h })
    }
  }
  const area = sheets.reduce((a, s) => a + s.placed.reduce((b, p) => b + p.w * p.h, 0), 0)
  const sheetArea = sheets.length * o.sheetW * o.sheetH
  return {
    sheets: sheets.map((s) => ({
      placed: s.placed,
      free: s.free.map((r) => ({ x: r.x + o.trim, y: r.y + o.trim, w: Math.max(0, r.w - k), h: Math.max(0, r.h - k) })),
      used: s.placed.reduce((b, p) => b + p.w * p.h, 0) / (o.sheetW * o.sheetH),
    })),
    unplaced,
    area,
    sheetArea,
    waste: sheetArea ? 1 - area / sheetArea : 0,
    cuts,
    heuristic: `${fit.toUpperCase()} + ${rule.toUpperCase()}`,
  }
}

/** Expands quantities into individual items. */
export function expand(parts: Part[], globalRotate: boolean): Item[] {
  const out: Item[] = []
  parts.forEach((p, i) => {
    for (let q = 0; q < Math.max(0, Math.floor(p.qty)); q++) out.push({ label: p.label, w: p.w, h: p.h, rot: globalRotate && p.rotate, part: i })
  })
  return out
}

/** Deterministic PRNG for repeatable random restarts. */
function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
}

/** Better plan: fewer sheets, then fewer unplaced, then most material concentrated (emptier last sheet), then fewer cuts. */
function better(a: Plan, b: Plan) {
  if (a.unplaced.length !== b.unplaced.length) return a.unplaced.length < b.unplaced.length
  if (a.sheets.length !== b.sheets.length) return a.sheets.length < b.sheets.length
  const la = a.sheets.at(-1)?.used ?? 0, lb = b.sheets.at(-1)?.used ?? 0
  if (Math.abs(la - lb) > 1e-9) return la < lb
  return a.cuts < b.cuts
}

/** Multi-start search over sort orders, fit/split heuristics and `restarts` random shuffles. */
export function optimize(parts: Part[], o: Opts, restarts = 60): Plan {
  const base = expand(parts, o.rotate).filter((i) => i.w > 0 && i.h > 0)
  const orders: Item[][] = [
    [...base].sort((a, b) => b.w * b.h - a.w * a.h),
    [...base].sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h)),
    [...base].sort((a, b) => b.h - a.h || b.w - a.w),
    [...base].sort((a, b) => b.w - a.w || b.h - a.h),
    [...base].sort((a, b) => b.w + b.h - (a.w + a.h)),
  ]
  const rand = rng(12345)
  for (let r = 0; r < restarts; r++) {
    // perturb the area order: swap a few neighbours
    const arr = [...orders[0]]
    for (let s = 0; s < Math.max(1, arr.length / 4); s++) {
      const i = Math.floor(rand() * arr.length), j = Math.min(arr.length - 1, i + 1 + Math.floor(rand() * 3))
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    orders.push(arr)
  }
  const fits: Fit[] = ['baf', 'bssf', 'blsf']
  const rules: SplitRule[] = ['slas', 'llas', 'minas', 'maxas']
  let best: Plan | null = null
  for (const ord of orders) for (const f of fits) for (const r of rules) {
    const p = packOnce(ord, o, f, r)
    if (!best || better(p, best)) best = p
  }
  return best ?? packOnce([], o, 'baf', 'slas')
}
