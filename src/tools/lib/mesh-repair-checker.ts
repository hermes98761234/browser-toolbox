// Print/CNC readiness on top of the STL integrity analysis: OBJ parsing, shells, per-face orientation, checks.
import { analyze, gridCube, weld, type Indexed, type Report } from './stl-repair-checker'

/** Parses Wavefront OBJ (v / f with v, v/vt, v//vn, v/vt/vn and negative indices); polygons are fan-triangulated. */
export function parseObj(text: string): Float32Array {
  const v: number[] = []
  const out: number[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line.startsWith('v ')) {
      const p = line.split(/\s+/)
      v.push(+p[1], +p[2], +p[3])
    } else if (line.startsWith('f ')) {
      const ids = line
        .split(/\s+/)
        .slice(1)
        .map((t) => {
          const i = parseInt(t.split('/')[0], 10)
          return i < 0 ? v.length / 3 + i : i - 1
        })
      if (ids.some((i) => !Number.isFinite(i) || i < 0 || i >= v.length / 3)) throw new Error(`Bad face index in: ${line.slice(0, 60)}`)
      for (let k = 1; k + 1 < ids.length; k++) for (const i of [ids[0], ids[k], ids[k + 1]]) out.push(v[3 * i], v[3 * i + 1], v[3 * i + 2])
    }
  }
  if (!out.length) throw new Error('No faces found in OBJ.')
  return new Float32Array(out)
}

export function toObj(m: Indexed, name = 'mesh'): string {
  const lines = [`# exported by Browser Toolbox mesh repair checker`, `o ${name}`]
  for (let i = 0; i < m.verts.length; i += 3) lines.push(`v ${+m.verts[i].toFixed(6)} ${+m.verts[i + 1].toFixed(6)} ${+m.verts[i + 2].toFixed(6)}`)
  for (let i = 0; i < m.faces.length; i += 3) lines.push(`f ${m.faces[i] + 1} ${m.faces[i + 1] + 1} ${m.faces[i + 2] + 1}`)
  return lines.join('\n') + '\n'
}

export interface Shell {
  faces: number[]
  area: number
  volume: number // signed, using the faces' own winding
  closed: boolean // no boundary or non-manifold edges inside this shell
  flipped: number // faces disagreeing with the shell's majority orientation
  min: [number, number, number]
  max: [number, number, number]
  role: 'body' | 'void' | 'open' | 'debris'
}

const ek = (a: number, b: number, V: number) => (a < b ? a * V + b : b * V + a)

/**
 * Splits the mesh into edge-connected shells and orients each face relative to its shell:
 * `faceSign[i]` is +1 when face i points outward, −1 when it points inward (flipped or inside-out shell).
 */
export function shells(m: Indexed): { shells: Shell[]; faceSign: Int8Array; faceShell: Int32Array } {
  const { verts: v, faces: f } = m
  const V = v.length / 3, F = f.length / 3
  const adj = new Map<number, number[]>()
  for (let i = 0; i < F; i++)
    for (let j = 0; j < 3; j++) {
      const k = ek(f[3 * i + j], f[3 * i + ((j + 1) % 3)], V)
      const l = adj.get(k)
      if (l) l.push(i)
      else adj.set(k, [i])
    }
  const dir = (i: number, a: number, b: number) => {
    for (let j = 0; j < 3; j++) if (f[3 * i + j] === a && f[3 * i + ((j + 1) % 3)] === b) return true
    return false
  }
  const parity = new Int8Array(F)
  const faceShell = new Int32Array(F).fill(-1)
  const faceSign = new Int8Array(F)
  const out: Shell[] = []
  for (let s = 0; s < F; s++) {
    if (faceShell[s] >= 0) continue
    const id = out.length
    const comp = [s]
    faceShell[s] = id
    parity[s] = 1
    let open = false
    for (let q = 0; q < comp.length; q++) {
      const i = comp[q]
      for (let j = 0; j < 3; j++) {
        const a = f[3 * i + j], b = f[3 * i + ((j + 1) % 3)]
        const l = adj.get(ek(a, b, V))!
        if (l.length !== 2) open = true
        for (const n of l) {
          if (n === i || faceShell[n] >= 0) continue
          faceShell[n] = id
          // a consistently wound neighbour traverses the shared edge as b→a
          parity[n] = (l.length === 2 && dir(n, a, b) ? -parity[i] : parity[i]) as 1 | -1
          comp.push(n)
        }
      }
    }
    let vol = 0, area = 0, volOwn = 0
    const min: [number, number, number] = [Infinity, Infinity, Infinity], max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
    for (const i of comp) {
      const [a, b, c] = [f[3 * i], f[3 * i + 1], f[3 * i + 2]]
      const P = [a, b, c].map((k) => [v[3 * k], v[3 * k + 1], v[3 * k + 2]])
      for (const p of P) for (let d = 0; d < 3; d++) {
        min[d] = Math.min(min[d], p[d])
        max[d] = Math.max(max[d], p[d])
      }
      const t = (P[0][0] * (P[1][1] * P[2][2] - P[1][2] * P[2][1]) - P[0][1] * (P[1][0] * P[2][2] - P[1][2] * P[2][0]) + P[0][2] * (P[1][0] * P[2][1] - P[1][1] * P[2][0])) / 6
      vol += t * parity[i]
      volOwn += t
      const u = [P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]], w = [P[2][0] - P[0][0], P[2][1] - P[0][1], P[2][2] - P[0][2]]
      area += 0.5 * Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0])
    }
    // outward = the parity class that gives positive volume; for open shells use the majority
    let pos = 0
    for (const i of comp) if (parity[i] > 0) pos++
    const outward = open ? (pos * 2 >= comp.length ? 1 : -1) : vol >= 0 ? 1 : -1
    let flipped = 0
    for (const i of comp) {
      faceSign[i] = parity[i] === outward ? 1 : -1
      if (faceSign[i] < 0) flipped++
    }
    out.push({ faces: comp, area, volume: volOwn, closed: !open, flipped: open ? Math.min(flipped, comp.length - flipped) : flipped, min, max, role: open ? 'open' : 'body' })
  }
  // closed shells: inside-out is a flip unless the shell sits inside another one (a cavity)
  const biggest = Math.max(0, ...out.map((s) => Math.abs(s.volume)))
  const inside = (a: Shell, b: Shell) => a !== b && [0, 1, 2].every((d) => a.min[d] >= b.min[d] && a.max[d] <= b.max[d])
  for (const s of out) {
    if (!s.closed) continue
    const host = out.find((o) => o.closed && inside(s, o))
    if (host && s.volume < 0) {
      s.role = 'void'
      for (const i of s.faces) faceSign[i] = (-faceSign[i]) as 1 | -1 // a cavity should face inward
      s.flipped = s.faces.length - s.flipped
    } else if (Math.abs(s.volume) < biggest * 0.01) s.role = 'debris'
  }
  return { shells: out, faceSign, faceShell }
}

export type Level = 'pass' | 'warn' | 'fail'
export interface Check { name: string; level: Level; detail: string }

/** Readiness checks for slicing / CAM. `bed` = printer build volume in model units. */
export function readiness(r: Report, sh: Shell[], bed: [number, number, number], minFeature: number): Check[] {
  const size = [0, 1, 2].map((d) => Math.max(...sh.map((s) => s.max[d])) - Math.min(...sh.map((s) => s.min[d])))
  const flipped = sh.reduce((a, s) => a + s.flipped, 0)
  const debris = sh.filter((s) => s.role === 'debris')
  const open = sh.filter((s) => !s.closed)
  const voids = sh.filter((s) => s.role === 'void')
  const fitsBed = [...size].sort((a, b) => a - b).every((x, i) => x <= [...bed].sort((a, b) => a - b)[i])
  const tiny = size.some((x) => x < minFeature)
  const L = (ok: boolean, bad: Level = 'fail'): Level => (ok ? 'pass' : bad)
  return [
    { name: 'Watertight (no holes)', level: L(r.boundaryEdges.length === 0), detail: r.boundaryEdges.length ? `${r.holes.length} hole(s), ${r.boundaryEdges.length} open edges in ${open.length} shell(s)` : 'every edge is closed' },
    { name: 'Manifold edges', level: L(r.nonManifoldEdges.length === 0), detail: r.nonManifoldEdges.length ? `${r.nonManifoldEdges.length} edges shared by 3+ faces` : 'each edge joins exactly 2 faces' },
    { name: 'Normals face outward', level: L(flipped === 0), detail: flipped ? `${flipped} face(s) point the wrong way` : 'all faces oriented consistently' },
    { name: 'No degenerate / duplicate faces', level: L(r.degenerate.length + r.duplicates.length === 0, 'warn'), detail: `${r.degenerate.length} zero-area, ${r.duplicates.length} duplicate` },
    { name: 'Single body', level: L(sh.length - voids.length - debris.length <= 1, 'warn'), detail: `${sh.length} shell(s): ${sh.length - voids.length - debris.length} body, ${voids.length} cavity, ${debris.length} debris` },
    { name: 'No loose debris', level: L(debris.length === 0, 'warn'), detail: debris.length ? `${debris.length} tiny shell(s) under 1 % of the main volume` : 'no stray islands' },
    { name: 'Fits the build volume', level: L(fitsBed, 'fail'), detail: `${size.map((x) => +x.toFixed(2)).join(' × ')} vs ${bed.join(' × ')}` },
    { name: 'Above minimum feature size', level: L(!tiny, 'warn'), detail: tiny ? `a dimension is below ${minFeature} — wrong units?` : `smallest extent ${Math.min(...size).toFixed(2)}` },
  ]
}

// ---------- samples ----------

function quadsToSoup(tris: number[][], off: number[], flipIdx: Set<number> = new Set()): number[] {
  return tris.flatMap((t, i) => {
    const p = t.map((x, k) => x + off[k % 3])
    return flipIdx.has(i) ? [...p.slice(0, 3), ...p.slice(6, 9), ...p.slice(3, 6)] : p
  })
}

/** OBJ text: a 40 mm block with a hole and flipped patch, a second body, and a loose sliver of debris. */
export function sampleObj(): string {
  const main = gridCube(4, 40).filter((_, i) => i !== 70 && i !== 71) // open one quad on top
  const soup = [
    ...quadsToSoup(main, [0, 0, 0], new Set([10, 11, 12, 13])),
    ...quadsToSoup(gridCube(2, 15), [55, 0, 0]),
    ...quadsToSoup(gridCube(1, 1.2), [20, 50, 0]),
  ]
  return toObj(weld(new Float32Array(soup), 1e-5), 'sample-parts')
}

/** Hollow box: outer shell plus an inward-facing cavity (valid for printing). */
export function sampleHollow(): Float32Array {
  const outer = quadsToSoup(gridCube(3, 30), [0, 0, 0])
  const inner = gridCube(2, 20).map((t) => [...t.slice(0, 3), ...t.slice(6, 9), ...t.slice(3, 6)])
  return new Float32Array([...outer, ...quadsToSoup(inner, [5, 5, 5])])
}

export { analyze, weld }
