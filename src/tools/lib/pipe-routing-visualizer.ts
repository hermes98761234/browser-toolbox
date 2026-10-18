// Pipe routing model: runs of axis-aligned moves on a grid, automatic fittings, material takeoff, isometric projection.

export type V3 = [number, number, number]
export type Dir = 'E' | 'W' | 'N' | 'S' | 'U' | 'D'
export const DIRS: Record<Dir, V3> = { E: [1, 0, 0], W: [-1, 0, 0], N: [0, 0, -1], S: [0, 0, 1], U: [0, 1, 0], D: [0, -1, 0] }
export const DIR_NAMES: Record<Dir, string> = { E: 'East (+X)', W: 'West (−X)', N: 'North (−Z)', S: 'South (+Z)', U: 'Up', D: 'Down' }

export type System = 'cold' | 'hot' | 'drain' | 'vent' | 'gas'
export const SYSTEMS: Record<System, { name: string; color: string }> = {
  cold: { name: 'Cold water', color: '#3b82f6' },
  hot: { name: 'Hot water', color: '#ef4444' },
  drain: { name: 'Drain / waste', color: '#94a3b8' },
  vent: { name: 'Vent', color: '#22c55e' },
  gas: { name: 'Gas', color: '#eab308' },
}
/** Stock length in feet (0 = coil, no joints needed). */
export const MATERIALS: Record<string, number> = { PVC: 10, ABS: 10, 'Cast iron': 10, Copper: 10, PEX: 0, 'Black iron': 21, CPVC: 10 }

export interface Run { id: string; name: string; system: System; material: string; size: string; start: V3; steps: string }
export interface Step { d: Dir; l: number }

export function parseSteps(src: string): { steps: Step[]; error: string } {
  const steps: Step[] = []
  for (const tok of src.trim().split(/[\s,]+/).filter(Boolean)) {
    const m = /^([EWNSUD])(\d*\.?\d+)$/i.exec(tok)
    if (!m || !(Number(m[2]) > 0)) return { steps, error: `Bad step “${tok}”: use a direction letter E W N S U D followed by a length, e.g. U8` }
    steps.push({ d: m[1].toUpperCase() as Dir, l: Number(m[2]) })
  }
  return { steps, error: '' }
}

const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]
const eq = (a: V3, b: V3) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6 && Math.abs(a[2] - b[2]) < 1e-6
const key = (p: V3) => p.map((v) => +v.toFixed(4)).join(',')

/** Vertices of a run after merging consecutive moves in the same direction. */
export function vertices(r: Run): { pts: V3[]; dirs: Dir[]; error: string } {
  const { steps, error } = parseSteps(r.steps)
  const merged: Step[] = []
  for (const s of steps) {
    const last = merged[merged.length - 1]
    if (last && last.d === s.d) last.l += s.l
    else merged.push({ ...s })
  }
  let err = error
  const pts: V3[] = [r.start]
  merged.forEach((s, i) => {
    const prev = merged[i - 1]
    if (prev && DIRS[prev.d].every((v, k) => v === -DIRS[s.d][k])) err ||= `Step ${i + 1} doubles back on itself`
    pts.push(add(pts[pts.length - 1], DIRS[s.d], s.l))
  })
  return { pts, dirs: merged.map((s) => s.d), error: err }
}

/** Is p strictly inside segment a→b (axis-aligned)? */
function inside(p: V3, a: V3, b: V3): boolean {
  for (let k = 0; k < 3; k++) {
    if (a[k] === b[k]) {
      if (Math.abs(p[k] - a[k]) > 1e-6) return false
    } else if (!(p[k] > Math.min(a[k], b[k]) + 1e-6 && p[k] < Math.max(a[k], b[k]) - 1e-6)) return false
  }
  return true
}

export interface Fitting { type: string; material: string; size: string; at: V3; run: string }

const sizeVal = (s: string) => s.split(/[\s-]+/).reduce((a, t) => a + (t.includes('/') ? Number(t.split('/')[0]) / Number(t.split('/')[1]) : Number(t) || 0), 0)

export function fittings(runs: Run[]): Fitting[] {
  const out: Fitting[] = []
  const geo = runs.map((r) => ({ r, ...vertices(r) }))
  const elbowAt = new Map<string, number>() // key → index in out
  for (const g of geo) {
    for (let i = 1; i < g.pts.length - 1; i++) {
      const vert = g.dirs[i - 1] === 'U' || g.dirs[i - 1] === 'D' || g.dirs[i] === 'U' || g.dirs[i] === 'D'
      const t = g.r.system === 'drain' && vert ? '90° elbow (long sweep)' : '90° elbow'
      elbowAt.set(`${g.r.id}|${key(g.pts[i])}`, out.length)
      out.push({ type: t, material: g.r.material, size: g.r.size, at: g.pts[i], run: g.r.name })
    }
    // couplings on long straight segments of rigid pipe
    const stock = MATERIALS[g.r.material] ?? 10
    if (stock > 0)
      for (let i = 1; i < g.pts.length; i++) {
        const len = Math.abs(g.pts[i][0] - g.pts[i - 1][0]) + Math.abs(g.pts[i][1] - g.pts[i - 1][1]) + Math.abs(g.pts[i][2] - g.pts[i - 1][2])
        for (let c = 1; c * stock < len - 1e-6; c++) out.push({ type: 'Coupling', material: g.r.material, size: g.r.size, at: add(g.pts[i - 1], DIRS[g.dirs[i - 1]], c * stock), run: g.r.name })
      }
  }
  // run ends: tees, end-to-end joints or caps
  for (const g of geo) {
    if (g.pts.length < 2) continue
    for (const [end, p] of [['start', g.pts[0]], ['end', g.pts[g.pts.length - 1]]] as const) {
      let joined = false
      for (const h of geo) {
        if (h === g) continue
        const red = sizeVal(h.r.size) !== sizeVal(g.r.size)
        const tee = (h.r.system === 'drain' || h.r.system === 'vent' ? 'Sanitary tee / wye' : 'Tee') + (red ? ` (${h.r.size}×${g.r.size})` : '')
        for (let i = 1; i < h.pts.length; i++)
          if (inside(p, h.pts[i - 1], h.pts[i])) {
            out.push({ type: tee, material: h.r.material, size: h.r.size, at: p, run: `${h.r.name} ← ${g.r.name}` })
            joined = true
          }
        for (let i = 1; i < h.pts.length - 1 && !joined; i++)
          if (eq(p, h.pts[i])) {
            const ei = elbowAt.get(`${h.r.id}|${key(p)}`)
            if (ei !== undefined) out[ei] = { ...out[ei], type: tee, run: `${h.r.name} ← ${g.r.name}` }
            joined = true
          }
        if (!joined && (eq(p, h.pts[0]) || eq(p, h.pts[h.pts.length - 1])) && g.r.id < h.r.id) {
          out.push({ type: red ? `Reducer (${h.r.size}×${g.r.size})` : h.r.material !== g.r.material ? `Transition coupling (${g.r.material}→${h.r.material})` : 'Coupling', material: g.r.material, size: g.r.size, at: p, run: `${g.r.name} → ${h.r.name}` })
          joined = true
        } else if (!joined && (eq(p, h.pts[0]) || eq(p, h.pts[h.pts.length - 1]))) joined = true
        if (joined) break
      }
      if (!joined) out.push({ type: g.r.system === 'vent' && end === 'end' ? 'Vent terminal' : g.r.system === 'drain' ? 'Cleanout / stub-out' : 'Stub-out / cap', material: g.r.material, size: g.r.size, at: p, run: g.r.name })
    }
  }
  return out
}

export interface PipeLine { material: string; size: string; system: System; length: number; sticks: number }

export function pipeTakeoff(runs: Run[], waste = 0.1): PipeLine[] {
  const m = new Map<string, PipeLine>()
  for (const r of runs) {
    const { pts } = vertices(r)
    let len = 0
    for (let i = 1; i < pts.length; i++) len += Math.abs(pts[i][0] - pts[i - 1][0]) + Math.abs(pts[i][1] - pts[i - 1][1]) + Math.abs(pts[i][2] - pts[i - 1][2])
    const k = `${r.material}|${r.size}`
    const e = m.get(k) ?? { material: r.material, size: r.size, system: r.system, length: 0, sticks: 0 }
    e.length += len
    m.set(k, e)
  }
  return [...m.values()].map((e) => {
    const stock = MATERIALS[e.material] ?? 10
    return { ...e, sticks: stock > 0 ? Math.ceil((e.length * (1 + waste)) / stock) : 0 }
  })
}

export function groupFittings(f: Fitting[]): { type: string; material: string; size: string; qty: number }[] {
  const m = new Map<string, { type: string; material: string; size: string; qty: number }>()
  for (const x of f) {
    const k = `${x.type}|${x.material}|${x.size}`
    const e = m.get(k) ?? { type: x.type, material: x.material, size: x.size, qty: 0 }
    e.qty++
    m.set(k, e)
  }
  return [...m.values()].sort((a, b) => a.type.localeCompare(b.type) || a.size.localeCompare(b.size))
}

/** Classic plumbing isometric: X and Z axes at ±30°, Y vertical. Returns 2-D drawing coordinates (y down). */
export const iso = (p: V3): [number, number] => [(p[0] - p[2]) * Math.cos(Math.PI / 6), (p[0] + p[2]) * Math.sin(Math.PI / 6) - p[1]]

export const feetInches = (ft: number) => {
  const total = Math.round(ft * 12 * 2) / 2
  const f = Math.floor(total / 12), i = total - f * 12
  return i ? `${f}'-${i}"` : `${f}'`
}
