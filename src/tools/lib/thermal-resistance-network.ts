// Thermal Resistance Network logic: nodal analysis of a steady-state thermal network
// (heat ≈ current, temperature ≈ voltage, K/W ≈ ohms), series/parallel helpers,
// heatsink requirement and typical heatsink classes.

export interface TNode { id: string; name: string; power: number; fixed: number | null; tmax: number | null }
export interface TLink { id: string; a: string; b: string; r: number; label: string }
export interface Net { nodes: TNode[]; links: TLink[] }

export interface Solution {
  temps: Map<string, number>
  flows: Map<string, number> // heat from a to b, W
  error: string
  /** Factor by which all powers can be scaled before the first node reaches its limit (Infinity if none). */
  headroom: number
  limiting: string
}

/** Solves A x = b in place by Gaussian elimination with partial pivoting; null if singular. */
export function gauss(A: number[][], b: number[]): number[] | null {
  const n = b.length
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r
    if (Math.abs(A[p][c]) < 1e-12) return null
    ;[A[c], A[p]] = [A[p], A[c]]
    ;[b[c], b[p]] = [b[p], b[c]]
    for (let r = c + 1; r < n; r++) {
      const f = A[r][c] / A[c][c]
      if (!f) continue
      for (let k = c; k < n; k++) A[r][k] -= f * A[c][k]
      b[r] -= f * b[c]
    }
  }
  const x = new Array<number>(n).fill(0)
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r]
    for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k]
    x[r] = s / A[r][r]
  }
  return x
}

export function solve(net: Net): Solution {
  const temps = new Map<string, number>(), flows = new Map<string, number>()
  const fail = (error: string): Solution => ({ temps, flows, error, headroom: NaN, limiting: '' })
  const fixed = net.nodes.filter((n) => n.fixed !== null)
  if (!fixed.length) return fail('Add at least one fixed-temperature node (ambient, coolant or cold plate).')
  const links = net.links.filter((l) => l.a !== l.b && net.nodes.some((n) => n.id === l.a) && net.nodes.some((n) => n.id === l.b))
  if (links.some((l) => !(l.r > 0))) return fail('Every thermal resistance must be greater than zero.')
  // Every free node needs a path to a fixed node, otherwise its temperature is undefined.
  const adj = new Map<string, string[]>(net.nodes.map((n) => [n.id, []]))
  for (const l of links) {
    adj.get(l.a)!.push(l.b)
    adj.get(l.b)!.push(l.a)
  }
  const seen = new Set(fixed.map((n) => n.id))
  const queue = [...seen]
  while (queue.length) for (const m of adj.get(queue.shift()!)!) if (!seen.has(m)) { seen.add(m); queue.push(m) }
  const floating = net.nodes.filter((n) => !seen.has(n.id))
  if (floating.length) return fail(`No heat path to a fixed temperature from: ${floating.map((n) => n.name).join(', ')}.`)
  const free = net.nodes.filter((n) => n.fixed === null)
  const idx = new Map(free.map((n, i) => [n.id, i]))
  const solveFor = (powerScale: number, fixedScale: number): Map<string, number> | null => {
    const k = free.length
    const A = Array.from({ length: k }, () => new Array<number>(k).fill(0))
    const b = free.map((n) => n.power * powerScale)
    for (const l of links) {
      const g = 1 / l.r
      const ia = idx.get(l.a), ib = idx.get(l.b)
      const na = net.nodes.find((n) => n.id === l.a)!, nb = net.nodes.find((n) => n.id === l.b)!
      if (ia !== undefined) { A[ia][ia] += g; if (ib !== undefined) A[ia][ib] -= g; else b[ia] += g * nb.fixed! * fixedScale }
      if (ib !== undefined) { A[ib][ib] += g; if (ia !== undefined) A[ib][ia] -= g; else b[ib] += g * na.fixed! * fixedScale }
    }
    const x = gauss(A, b)
    if (!x) return null
    const t = new Map<string, number>()
    for (const n of net.nodes) t.set(n.id, n.fixed !== null ? n.fixed * fixedScale : x[idx.get(n.id)!])
    return t
  }
  const T = solveFor(1, 1)
  if (!T) return fail('The network is singular; check the connections.')
  for (const [k, v] of T) temps.set(k, v)
  for (const l of links) flows.set(l.id, (T.get(l.a)! - T.get(l.b)!) / l.r)
  // Linearity: T = T_fixedOnly + T_powerOnly; scale the power part until a limit is reached.
  const Tp = solveFor(1, 0)!, Tf = solveFor(0, 1)!
  let headroom = Infinity, limiting = ''
  for (const n of net.nodes) {
    if (n.tmax === null || n.fixed !== null) continue
    const rise = Tp.get(n.id)!
    if (rise <= 1e-12) continue
    const h = (n.tmax - Tf.get(n.id)!) / rise
    if (h < headroom) { headroom = h; limiting = n.name }
  }
  return { temps, flows, error: '', headroom, limiting }
}

export const series = (rs: number[]) => rs.reduce((a, r) => a + r, 0)
export const parallel = (rs: number[]) => 1 / rs.reduce((a, r) => a + 1 / r, 0)

/** Maximum sink-to-ambient resistance so that Tj stays at or below tjMax. */
export function requiredRsa(power: number, tjMax: number, ta: number, rjc: number, rcs: number): number {
  return (tjMax - ta) / power - rjc - rcs
}

/** Typical heatsink classes with Rθsa ranges (K/W). Indicative only; real values come from datasheets. */
export const SINKS: { name: string; lo: number; hi: number; note: string }[] = [
  { name: 'Stamped clip-on (TO-220)', lo: 18, hi: 30, note: 'Natural convection, small parts' },
  { name: 'Small extruded 25 × 25 × 15 mm', lo: 9, hi: 14, note: 'Natural convection' },
  { name: 'Extruded 40 × 40 × 20 mm', lo: 4.5, hi: 7, note: 'Natural convection' },
  { name: 'Extruded 75 × 50 × 25 mm', lo: 2, hi: 3.5, note: 'Natural convection, fins vertical' },
  { name: 'Extruded 100 × 100 × 40 mm', lo: 0.9, hi: 1.6, note: 'Natural convection' },
  { name: 'Extruded 60 mm + fan (1–2 m/s)', lo: 0.5, hi: 1, note: 'Forced air' },
  { name: 'Heat-pipe tower + 120 mm fan', lo: 0.12, hi: 0.3, note: 'CPU-class cooler' },
  { name: 'Liquid cold plate / AIO', lo: 0.05, hi: 0.15, note: 'Depends on radiator and flow' },
]

/**
 * Column layout following the heat flow: each link is oriented from the hotter to the colder node and a
 * node's column is the longest such path reaching it, so heat always flows left → right.
 */
export function layout(net: Net, temps: Map<string, number>): Map<string, { col: number; row: number; cols: number; rows: number }> {
  const T = (id: string) => temps.get(id) ?? 0
  const order = [...net.nodes].sort((a, b) => T(b.id) - T(a.id))
  const col = new Map<string, number>(order.map((n) => [n.id, 0]))
  for (const n of order) for (const l of net.links) {
    const other = l.a === n.id ? l.b : l.b === n.id ? l.a : null
    if (other && col.has(other) && T(other) < T(n.id) - 1e-9) col.set(other, Math.max(col.get(other)!, col.get(n.id)! + 1))
  }
  const maxC = Math.max(0, ...col.values())
  const byCol = new Map<number, string[]>()
  for (const n of order) byCol.set(col.get(n.id)!, [...(byCol.get(col.get(n.id)!) ?? []), n.id])
  const rows = Math.max(1, ...[...byCol.values()].map((l) => l.length))
  const out = new Map<string, { col: number; row: number; cols: number; rows: number }>()
  for (const [c, ids] of byCol) ids.forEach((id, i) => out.set(id, { col: c, row: i + (rows - ids.length) / 2, cols: maxC + 1, rows }))
  return out
}
