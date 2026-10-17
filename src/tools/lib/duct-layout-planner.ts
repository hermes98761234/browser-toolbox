// Duct runs as orthogonal polylines (feet; y is up): fitting take-off, lengths, airflow and friction.

export type P3 = [number, number, number]
export interface Run {
  id: string; name: string; kind: 'supply' | 'return'; shape: 'round' | 'rect'
  d: number; w: number; h: number // inches
  cfm: number // airflow delivered by this run's terminal
  pts: P3[]
}

export const snap = (v: number, step: number) => Math.round(v / step) * step
export const segLen = (a: P3, b: P3) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
export const runLength = (r: Run) => r.pts.slice(1).reduce((s, p, i) => s + segLen(r.pts[i], p), 0)
const same = (a: P3, b: P3) => segLen(a, b) < 1e-6

/** Equivalent round diameter of a rectangular duct (Huebscher), inches. */
export const equivDiameter = (w: number, h: number) => (1.3 * (w * h) ** 0.625) / (w + h) ** 0.25
export const diameterOf = (r: Run) => (r.shape === 'round' ? r.d : equivDiameter(r.w, r.h))
/** Cross-section area, ft². */
export const areaOf = (r: Run) => (r.shape === 'round' ? (Math.PI * (r.d / 12) ** 2) / 4 : (r.w / 12) * (r.h / 12))
/** Sheet-metal surface area of a run, ft². */
export const surfaceOf = (r: Run) => runLength(r) * (r.shape === 'round' ? Math.PI * (r.d / 12) : (2 * (r.w + r.h)) / 12)
export const sizeLabel = (r: Run) => (r.shape === 'round' ? `⌀${r.d}″` : `${r.w}×${r.h}″`)

/** Friction loss for galvanised round duct, in. w.g. per 100 ft (ASHRAE fit): 0.109136·q^1.9 / d^5.02. */
export const frictionPer100 = (cfm: number, dIn: number) => (cfm > 0 && dIn > 0 ? (0.109136 * cfm ** 1.9) / dIn ** 5.02 : 0)

/** Where a run's first point attaches to another run: segment index + fraction, or vertex. */
export interface Attach { parent: string; seg: number; t: number; atEnd: boolean }
export function attachment(r: Run, runs: Run[]): Attach | null {
  const p = r.pts[0]
  if (!p) return null
  for (const o of runs) {
    if (o.id === r.id) continue
    for (let k = 0; k + 1 < o.pts.length; k++) {
      const a = o.pts[k], b = o.pts[k + 1]
      const L = segLen(a, b)
      if (!L) continue
      const t = ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1]) + (p[2] - a[2]) * (b[2] - a[2])) / (L * L)
      if (t < -1e-6 || t > 1 + 1e-6) continue
      const q: P3 = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])]
      if (same(p, q)) return { parent: o.id, seg: k, t, atEnd: k === o.pts.length - 2 && t > 1 - 1e-6 }
    }
  }
  return null
}

export interface Fittings { elbow90: number; elbowOther: number; tees: number; transitions: number; terminals: number; collars: number; byRun: Record<string, { elbows: number; tee: boolean; transition: boolean; terminal: boolean }> }

export function fittings(runs: Run[]): Fittings {
  const f: Fittings = { elbow90: 0, elbowOther: 0, tees: 0, transitions: 0, terminals: 0, collars: 0, byRun: {} }
  const att = new Map(runs.map((r) => [r.id, attachment(r, runs)]))
  for (const r of runs) {
    let elbows = 0
    for (let i = 1; i + 1 < r.pts.length; i++) {
      const a = r.pts[i - 1], b = r.pts[i], c = r.pts[i + 1]
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - b[0], c[1] - b[1], c[2] - b[2]]
      const lu = Math.hypot(...u), lv = Math.hypot(...v)
      if (!lu || !lv) continue
      const cos = (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (lu * lv)
      if (cos > 0.999) continue
      elbows++
      if (Math.abs(cos) < 0.02) f.elbow90++
      else f.elbowOther++
    }
    const a = att.get(r.id)
    const parent = a ? runs.find((o) => o.id === a.parent) : undefined
    const transition = !!a && a.atEnd && !!parent && sizeLabel(parent) !== sizeLabel(r)
    const tee = !!a && !a.atEnd
    if (tee) f.tees++
    if (transition) f.transitions++
    if (!a) f.collars++
    const last = r.pts[r.pts.length - 1]
    const continued = runs.some((o) => o.id !== r.id && o.pts[0] && last && same(o.pts[0], last))
    const terminal = r.pts.length > 1 && !continued
    if (terminal) f.terminals++
    f.byRun[r.id] = { elbows, tee, transition, terminal }
  }
  return f
}

/** Airflow in each segment of each run: own terminal flow + flow of runs attached downstream. */
export function segmentFlows(runs: Run[]): Map<string, number[]> {
  const att = new Map(runs.map((r) => [r.id, attachment(r, runs)]))
  const memo = new Map<string, number[]>()
  const visiting = new Set<string>()
  const flows = (r: Run): number[] => {
    if (memo.has(r.id)) return memo.get(r.id)!
    if (visiting.has(r.id)) return r.pts.slice(1).map(() => r.cfm)
    visiting.add(r.id)
    const last = r.pts[r.pts.length - 1]
    const terminal = !runs.some((o) => o.id !== r.id && o.pts[0] && same(o.pts[0], last))
    const out = r.pts.slice(1).map(() => (terminal ? r.cfm : 0))
    for (const c of runs) {
      const a = att.get(c.id)
      if (!a || a.parent !== r.id) continue
      const cf = flows(c)[0] ?? 0
      for (let k = 0; k <= a.seg && k < out.length; k++) out[k] += cf
    }
    visiting.delete(r.id)
    memo.set(r.id, out)
    return out
  }
  for (const r of runs) flows(r)
  return memo
}

export const EL = { elbow90: 10, elbowOther: 5, teeBranch: 25, teeThrough: 10, transition: 5, terminal: 15 } // equivalent lengths, ft

export interface PathResult { run: string; length: number; tel: number; loss: number; chain: string[] }

/** For every terminal: physical length from the source, total effective length and friction loss. */
export function paths(runs: Run[]): PathResult[] {
  const att = new Map(runs.map((r) => [r.id, attachment(r, runs)]))
  const fl = segmentFlows(runs)
  const fit = fittings(runs)
  const byId = new Map(runs.map((r) => [r.id, r]))
  const out: PathResult[] = []
  for (const r of runs) {
    if (!fit.byRun[r.id]?.terminal) continue
    let length = 0, tel = 0, loss = 0
    const chain: string[] = []
    let cur: Run | undefined = r
    let upto = r.pts.length - 1 // number of segments to count
    const guard = new Set<string>()
    while (cur && !guard.has(cur.id)) {
      guard.add(cur.id)
      chain.unshift(cur.id)
      const flows = fl.get(cur.id) ?? []
      const dIn = diameterOf(cur)
      for (let k = 0; k < upto; k++) {
        const L = segLen(cur.pts[k], cur.pts[k + 1])
        length += L
        loss += (frictionPer100(flows[k] ?? 0, dIn) * L) / 100
      }
      // elbows on counted part of this run
      let eq = 0
      for (let i = 1; i < Math.min(upto + 1, cur.pts.length - 1); i++) {
        const a = cur.pts[i - 1], b = cur.pts[i], c = cur.pts[i + 1]
        const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - b[0], c[1] - b[1], c[2] - b[2]]
        const cos = (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / ((Math.hypot(...u) * Math.hypot(...v)) || 1)
        if (cos < 0.999) eq += Math.abs(cos) < 0.02 ? EL.elbow90 : EL.elbowOther
      }
      tel += eq
      const a = att.get(cur.id)
      if (!a) break
      const parent = byId.get(a.parent)
      if (!parent) break
      // partial segment up to the attachment point
      const flows2 = fl.get(parent.id) ?? []
      const Lp = segLen(parent.pts[a.seg], parent.pts[a.seg + 1]) * a.t
      length += Lp
      loss += (frictionPer100(flows2[a.seg] ?? 0, diameterOf(parent)) * Lp) / 100
      if (a.atEnd) {
        if (sizeLabel(parent) !== sizeLabel(cur)) tel += EL.transition
      } else tel += EL.teeBranch
      upto = a.seg
      cur = parent
    }
    tel += length + EL.terminal
    out.push({ run: r.id, length, tel, loss, chain })
  }
  return out
}

/** Velocity (fpm) for a flow through a run's section. */
export const velocity = (cfm: number, r: Run) => cfm / (areaOf(r) || 1)
