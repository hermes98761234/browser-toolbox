// Mesh integrity analysis for STL triangle soups: welding, edge adjacency, holes, orientation, repair.

export interface Indexed {
  verts: Float64Array // xyz per welded vertex
  faces: Uint32Array // 3 indices per triangle
}

/** Welds identical (within tol) vertices of a triangle soup. */
export function weld(pos: Float32Array, tol = 1e-5): Indexed {
  const map = new Map<string, number>()
  const verts: number[] = []
  const faces = new Uint32Array(pos.length / 3)
  const q = (x: number) => Math.round(x / tol)
  for (let i = 0; i < pos.length; i += 3) {
    const k = `${q(pos[i])},${q(pos[i + 1])},${q(pos[i + 2])}`
    let id = map.get(k)
    if (id === undefined) {
      id = verts.length / 3
      map.set(k, id)
      verts.push(pos[i], pos[i + 1], pos[i + 2])
    }
    faces[i / 3] = id
  }
  return { verts: new Float64Array(verts), faces }
}

export interface Report {
  vertices: number
  faces: number
  edges: number
  boundaryEdges: [number, number][] // directed as they appear in their face
  nonManifoldEdges: [number, number][]
  flippedEdges: [number, number][] // shared by 2 faces with the same direction
  degenerate: number[] // face indices
  duplicates: number[] // face indices (second occurrence)
  holes: number[][] // boundary loops (vertex ids)
  components: number
  euler: number
  genus: number | null // only when closed & manifold
  volume: number // signed, in file units³
  area: number
  watertight: boolean
}

const ekey = (a: number, b: number, V: number) => (a < b ? a * V + b : b * V + a)

function triArea(v: Float64Array, a: number, b: number, c: number) {
  const ux = v[3 * b] - v[3 * a], uy = v[3 * b + 1] - v[3 * a + 1], uz = v[3 * b + 2] - v[3 * a + 2]
  const wx = v[3 * c] - v[3 * a], wy = v[3 * c + 1] - v[3 * a + 1], wz = v[3 * c + 2] - v[3 * a + 2]
  return 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx)
}

function signedVol(v: Float64Array, a: number, b: number, c: number) {
  const [ax, ay, az] = [v[3 * a], v[3 * a + 1], v[3 * a + 2]]
  const [bx, by, bz] = [v[3 * b], v[3 * b + 1], v[3 * b + 2]]
  const [cx, cy, cz] = [v[3 * c], v[3 * c + 1], v[3 * c + 2]]
  return (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6
}

export function analyze(m: Indexed, areaEps = 1e-12): Report {
  const { verts: v, faces: f } = m
  const V = v.length / 3
  const F = f.length / 3
  const degenerate: number[] = []
  const duplicates: number[] = []
  const seen = new Set<string>()
  // edge → list of [face, a, b] (direction as in the face)
  const edges = new Map<number, number[]>()
  let area = 0
  let volume = 0
  for (let i = 0; i < F; i++) {
    const a = f[3 * i], b = f[3 * i + 1], c = f[3 * i + 2]
    const ar = triArea(v, a, b, c)
    if (a === b || b === c || a === c || ar <= areaEps) {
      degenerate.push(i)
      continue
    }
    const fk = [a, b, c].sort((x, y) => x - y).join(',')
    if (seen.has(fk)) {
      duplicates.push(i)
      continue
    }
    seen.add(fk)
    area += ar
    volume += signedVol(v, a, b, c)
    for (const [p, q] of [[a, b], [b, c], [c, a]]) {
      const k = ekey(p, q, V)
      const l = edges.get(k)
      if (l) l.push(i, p, q)
      else edges.set(k, [i, p, q])
    }
  }
  const boundaryEdges: [number, number][] = []
  const nonManifoldEdges: [number, number][] = []
  const flippedEdges: [number, number][] = []
  // union-find over faces for components
  const parent = new Int32Array(F).map((_, i) => i)
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]]
      x = parent[x]
    }
    return x
  }
  for (const l of edges.values()) {
    const n = l.length / 3
    if (n === 1) boundaryEdges.push([l[1], l[2]])
    else if (n > 2) nonManifoldEdges.push([l[1], l[2]])
    else if (l[1] === l[4]) flippedEdges.push([l[1], l[2]])
    if (n === 2) parent[find(l[3])] = find(l[0])
  }
  const bad = new Set([...degenerate, ...duplicates])
  const roots = new Set<number>()
  const usedV = new Set<number>()
  for (let i = 0; i < F; i++) {
    if (bad.has(i)) continue
    roots.add(find(i))
    usedV.add(f[3 * i]).add(f[3 * i + 1]).add(f[3 * i + 2])
  }
  const holes = boundaryLoops(boundaryEdges)
  const Fv = F - bad.size
  const euler = usedV.size - edges.size + Fv
  const closed = boundaryEdges.length === 0 && nonManifoldEdges.length === 0
  const comps = roots.size
  const genus = closed && comps > 0 ? (2 * comps - euler) / 2 : null
  return {
    vertices: usedV.size, faces: F, edges: edges.size, boundaryEdges, nonManifoldEdges, flippedEdges, degenerate, duplicates, holes,
    components: comps, euler, genus, volume, area, watertight: closed && flippedEdges.length === 0,
  }
}

/** Chains directed boundary edges into closed loops. */
export function boundaryLoops(edges: [number, number][]): number[][] {
  const next = new Map<number, number[]>()
  for (const [a, b] of edges) {
    const l = next.get(a)
    if (l) l.push(b)
    else next.set(a, [b])
  }
  const loops: number[][] = []
  for (const [start] of edges) {
    if (!next.get(start)?.length) continue
    const loop = [start]
    let cur = start
    for (let guard = 0; guard <= edges.length; guard++) {
      const l = next.get(cur)
      if (!l?.length) break
      const n = l.pop()!
      if (n === start) break
      loop.push(n)
      cur = n
    }
    loops.push(loop)
  }
  return loops
}

export interface RepairResult {
  mesh: Indexed
  removedDegenerate: number
  removedDuplicates: number
  filledHoles: number
  flippedFaces: number
}

/**
 * Removes degenerate/duplicate faces, makes winding consistent across manifold edges,
 * orients each closed component outward, and fan-fills holes up to `maxHole` edges.
 */
export function repair(m: Indexed, opts: { fill?: boolean; orient?: boolean; maxHole?: number } = {}): RepairResult {
  const { fill = true, orient = true, maxHole = 500 } = opts
  const r0 = analyze(m)
  const bad = new Set([...r0.degenerate, ...r0.duplicates])
  const faces: number[] = []
  for (let i = 0; i < m.faces.length / 3; i++) if (!bad.has(i)) faces.push(m.faces[3 * i], m.faces[3 * i + 1], m.faces[3 * i + 2])
  const verts = [...m.verts]
  let flipped = 0
  let filled = 0
  if (fill) {
    const cur = analyze({ verts: m.verts, faces: new Uint32Array(faces) })
    for (const loop of cur.holes) {
      if (loop.length < 3 || loop.length > maxHole) continue
      if (loop.length === 3) faces.push(loop[2], loop[1], loop[0])
      else {
        let cx = 0, cy = 0, cz = 0
        for (const i of loop) {
          cx += verts[3 * i]
          cy += verts[3 * i + 1]
          cz += verts[3 * i + 2]
        }
        const c = verts.length / 3
        verts.push(cx / loop.length, cy / loop.length, cz / loop.length)
        for (let j = 0; j < loop.length; j++) faces.push(loop[(j + 1) % loop.length], loop[j], c)
      }
      filled++
    }
  }
  const vArr = new Float64Array(verts)
  if (orient) flipped = orientFaces(vArr, faces)
  return { mesh: { verts: vArr, faces: new Uint32Array(faces) }, removedDegenerate: r0.degenerate.length, removedDuplicates: r0.duplicates.length, filledHoles: filled, flippedFaces: flipped }
}

function orientFaces(v: Float64Array, f: number[]): number {
  const V = v.length / 3
  const F = f.length / 3
  const adj = new Map<number, number[]>()
  for (let i = 0; i < F; i++)
    for (let j = 0; j < 3; j++) {
      const k = ekey(f[3 * i + j], f[3 * i + ((j + 1) % 3)], V)
      const l = adj.get(k)
      if (l) l.push(i)
      else adj.set(k, [i])
    }
  const flip = (i: number) => {
    const t = f[3 * i + 1]
    f[3 * i + 1] = f[3 * i + 2]
    f[3 * i + 2] = t
  }
  const hasDir = (i: number, a: number, b: number) => {
    for (let j = 0; j < 3; j++) if (f[3 * i + j] === a && f[3 * i + ((j + 1) % 3)] === b) return true
    return false
  }
  const done = new Uint8Array(F)
  let flips = 0
  for (let s = 0; s < F; s++) {
    if (done[s]) continue
    const comp: number[] = [s]
    done[s] = 1
    for (let qi = 0; qi < comp.length; qi++) {
      const i = comp[qi]
      for (let j = 0; j < 3; j++) {
        const a = f[3 * i + j], b = f[3 * i + ((j + 1) % 3)]
        const l = adj.get(ekey(a, b, V))!
        if (l.length !== 2) continue
        const n = l[0] === i ? l[1] : l[0]
        if (done[n]) continue
        if (hasDir(n, a, b)) {
          flip(n)
          flips++
        }
        done[n] = 1
        comp.push(n)
      }
    }
    let vol = 0
    for (const i of comp) vol += signedVol(v, f[3 * i], f[3 * i + 1], f[3 * i + 2])
    if (vol < 0) {
      for (const i of comp) flip(i)
      flips += comp.length
    }
  }
  return flips
}

/** Back to a triangle soup for three.js / STL export. */
export function toSoup(m: Indexed): Float32Array {
  const out = new Float32Array(m.faces.length * 3)
  for (let i = 0; i < m.faces.length; i++) {
    const k = m.faces[i]
    out[3 * i] = m.verts[3 * k]
    out[3 * i + 1] = m.verts[3 * k + 1]
    out[3 * i + 2] = m.verts[3 * k + 2]
  }
  return out
}

// ---------- samples ----------

const CUBE_V = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]
const CUBE_F = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]]

function soup(faces: number[][], verts: number[][], s = 1, off: number[] = [0, 0, 0]) {
  return faces.flatMap((t) => t.flatMap((i) => verts[i].map((x, k) => x * s + off[k])))
}

/** A subdivided cube (n×n per face) as a triangle soup. */
export function gridCube(n: number, s: number): number[][] {
  const tris: number[][] = []
  const P = (axis: number, sign: number, u: number, v: number) => {
    const p = [0, 0, 0]
    const [ua, va] = [(axis + 1) % 3, (axis + 2) % 3]
    p[axis] = sign > 0 ? s : 0
    p[ua] = (u / n) * s
    p[va] = (v / n) * s
    return p
  }
  for (let axis = 0; axis < 3; axis++)
    for (const sign of [1, -1])
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          const a = P(axis, sign, i, j), b = P(axis, sign, i + 1, j), c = P(axis, sign, i + 1, j + 1), d = P(axis, sign, i, j + 1)
          if (sign > 0) tris.push([...a, ...b, ...c], [...a, ...c, ...d])
          else tris.push([...a, ...c, ...b], [...a, ...d, ...c])
        }
  return tris
}

export const SAMPLES: Record<string, { name: string; make: () => Float32Array }> = {
  holes: {
    name: 'Box with 2 holes + flipped face',
    make: () => {
      const t = gridCube(4, 20)
      // punch a 2×2 hole in the top (+Z) face and a 1-quad hole in a side, flip one triangle
      const drop = new Set<number>()
      const top = 2 * 2 * 32 // axis 2, sign +1 block start
      for (const [i, j] of [[1, 1], [1, 2], [2, 1], [2, 2]]) drop.add(top + (i * 4 + j) * 2).add(top + (i * 4 + j) * 2 + 1)
      drop.add(5 * 2).add(5 * 2 + 1)
      const out = t.filter((_, i) => !drop.has(i))
      const x = out[40]
      out[40] = [...x.slice(0, 3), ...x.slice(6, 9), ...x.slice(3, 6)]
      return new Float32Array(out.flat())
    },
  },
  nonmanifold: {
    name: 'Two cubes sharing an edge',
    make: () => new Float32Array([...soup(CUBE_F, CUBE_V, 15), ...soup(CUBE_F, CUBE_V, 15, [15, 15, 0])]),
  },
  clean: { name: 'Clean watertight cube', make: () => new Float32Array(gridCube(3, 20).flat()) },
  inverted: { name: 'Inside-out cube', make: () => new Float32Array(soup(CUBE_F.map(([a, b, c]) => [a, c, b]), CUBE_V, 20)) },
}
