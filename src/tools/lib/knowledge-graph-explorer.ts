// Wiki-link note parsing and a 3D force-directed layout (Fruchterman–Reingold style, Barnes–Hut octree for repulsion).

export interface Note { title: string; body: string }
export interface GNode { id: string; title: string; body: string; tags: string[]; ghost: boolean; out: string[]; inc: string[] }
export interface Graph { nodes: GNode[]; edges: [number, number][]; index: Map<string, number> }

export const key = (t: string) => t.trim().toLowerCase().replace(/\s+/g, ' ')
const LINK = /\[\[([^\]|#\n]+)(?:#[^\]|\n]*)?(?:\|[^\]\n]*)?\]\]/g

/** Splits pasted markdown into notes at level-1 headings ("# Title"). Text before the first heading is ignored if blank. */
export function splitNotes(text: string): Note[] {
  const out: Note[] = []
  let cur: Note | null = null
  for (const line of text.replace(/\r/g, '').split('\n')) {
    const m = line.match(/^#\s+(.+?)\s*$/)
    if (m) { cur = { title: m[1], body: '' }; out.push(cur); continue }
    if (!cur) { if (!line.trim()) continue; cur = { title: 'Untitled', body: '' }; out.push(cur) }
    cur.body += (cur.body ? '\n' : '') + line
  }
  return out.map((n) => ({ title: n.title, body: n.body.trim() }))
}

export function parseLinks(body: string): string[] {
  const out: string[] = []
  for (const m of body.matchAll(LINK)) out.push(m[1].trim())
  return out
}

export function parseTags(body: string): string[] {
  const out = new Set<string>()
  for (const m of body.matchAll(/(?:^|\s)#([A-Za-z][\w/-]*)/g)) out.add(m[1].toLowerCase())
  return [...out]
}

/** Builds the graph; links to missing notes become "ghost" nodes. Duplicate titles are merged. */
export function buildGraph(notes: Note[]): Graph {
  const nodes: GNode[] = []
  const index = new Map<string, number>()
  const ensure = (title: string, ghost: boolean) => {
    const k = key(title)
    let i = index.get(k)
    if (i === undefined) { i = nodes.length; index.set(k, i); nodes.push({ id: k, title: title.trim(), body: '', tags: [], ghost, out: [], inc: [] }) }
    return i
  }
  for (const n of notes) {
    const i = ensure(n.title, false)
    const node = nodes[i]
    node.ghost = false
    node.body = node.body ? node.body + '\n\n' + n.body : n.body
    node.tags = [...new Set([...node.tags, ...parseTags(n.body)])]
  }
  const seen = new Set<string>()
  const edges: [number, number][] = []
  for (const n of notes) {
    const a = index.get(key(n.title))!
    for (const l of parseLinks(n.body)) {
      const b = ensure(l, true)
      if (a === b) continue
      const ek = a < b ? `${a}-${b}` : `${b}-${a}`
      if (!nodes[a].out.includes(nodes[b].id)) nodes[a].out.push(nodes[b].id)
      if (!nodes[b].inc.includes(nodes[a].id)) nodes[b].inc.push(nodes[a].id)
      if (seen.has(ek)) continue
      seen.add(ek)
      edges.push([a, b])
    }
  }
  return { nodes, edges, index }
}

/** Node indices within `depth` hops of `start` (undirected). */
export function neighborhood(g: Graph, start: number, depth: number): Set<number> {
  const adj: number[][] = g.nodes.map(() => [])
  for (const [a, b] of g.edges) { adj[a].push(b); adj[b].push(a) }
  const seen = new Set([start])
  let frontier = [start]
  for (let d = 0; d < depth; d++) {
    const next: number[] = []
    for (const v of frontier) for (const w of adj[v]) if (!seen.has(w)) { seen.add(w); next.push(w) }
    frontier = next
  }
  return seen
}

export function shortestPath(g: Graph, from: number, to: number): number[] | null {
  const adj: number[][] = g.nodes.map(() => [])
  for (const [a, b] of g.edges) { adj[a].push(b); adj[b].push(a) }
  const prev = new Map<number, number>([[from, -1]])
  const q = [from]
  while (q.length) {
    const v = q.shift()!
    if (v === to) break
    for (const w of adj[v]) if (!prev.has(w)) { prev.set(w, v); q.push(w) }
  }
  if (!prev.has(to)) return null
  const path: number[] = []
  for (let v = to; v !== -1; v = prev.get(v)!) path.unshift(v)
  return path
}

// ---------- 3D force simulation ----------

interface Oct { cx: number; cy: number; cz: number; half: number; mass: number; mx: number; my: number; mz: number; body: number; kids: (Oct | null)[] | null }

export class ForceSim {
  pos: Float64Array
  vel: Float64Array
  alpha = 1
  n: number
  edges: [number, number][]
  constructor(n: number, edges: [number, number][], seed = 1, init?: (i: number) => [number, number, number] | undefined) {
    this.n = n
    this.edges = edges
    this.pos = new Float64Array(n * 3)
    this.vel = new Float64Array(n * 3)
    let s = seed >>> 0 || 1
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
    const r = 4 * Math.cbrt(n + 1)
    for (let i = 0; i < n; i++) {
      const p = init?.(i)
      if (p) { this.pos.set(p, i * 3); continue }
      const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, rr = r * Math.cbrt(rnd())
      const q = Math.sqrt(1 - u * u)
      this.pos[i * 3] = rr * q * Math.cos(th); this.pos[i * 3 + 1] = rr * q * Math.sin(th); this.pos[i * 3 + 2] = rr * u
    }
  }

  private build(): Oct {
    const P = this.pos
    let m = 1
    for (let i = 0; i < P.length; i++) m = Math.max(m, Math.abs(P[i]))
    const root: Oct = { cx: 0, cy: 0, cz: 0, half: m * 1.01, mass: 0, mx: 0, my: 0, mz: 0, body: -1, kids: null }
    const insert = (o: Oct, i: number, depth: number) => {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2]
      o.mx = (o.mx * o.mass + x) / (o.mass + 1); o.my = (o.my * o.mass + y) / (o.mass + 1); o.mz = (o.mz * o.mass + z) / (o.mass + 1)
      o.mass++
      if (o.mass === 1) { o.body = i; return }
      if (depth > 30) return
      if (!o.kids) {
        o.kids = [null, null, null, null, null, null, null, null]
        const b = o.body
        o.body = -1
        if (b >= 0) place(o, b, depth)
      }
      place(o, i, depth)
    }
    const place = (o: Oct, i: number, depth: number) => {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2]
      const k = (x > o.cx ? 1 : 0) | (y > o.cy ? 2 : 0) | (z > o.cz ? 4 : 0)
      let c = o.kids![k]
      if (!c) {
        const h = o.half / 2
        c = { cx: o.cx + (k & 1 ? h : -h), cy: o.cy + (k & 2 ? h : -h), cz: o.cz + (k & 4 ? h : -h), half: h, mass: 0, mx: 0, my: 0, mz: 0, body: -1, kids: null }
        o.kids![k] = c
      }
      insert(c, i, depth + 1)
    }
    for (let i = 0; i < this.n; i++) insert(root, i, 0)
    return root
  }

  /** One integration step; returns mean displacement. `theta` is the Barnes–Hut opening angle (0 = exact). */
  step(opts: { charge?: number; link?: number; gravity?: number; theta?: number } = {}): number {
    const { charge = 6, link = 2.2, gravity = 0.02, theta = 0.8 } = opts
    const { n, pos: P, vel: V } = this
    if (!n) return 0
    const F = new Float64Array(n * 3)
    const repel = (i: number, x: number, y: number, z: number, m: number) => {
      let dx = P[i * 3] - x, dy = P[i * 3 + 1] - y, dz = P[i * 3 + 2] - z
      let d2 = dx * dx + dy * dy + dz * dz
      if (d2 < 1e-6) { dx = (i % 3) * 0.01 + 0.01; dy = 0.01; dz = 0; d2 = dx * dx + dy * dy }
      const f = (charge * m) / d2
      const d = Math.sqrt(d2)
      F[i * 3] += (dx / d) * f; F[i * 3 + 1] += (dy / d) * f; F[i * 3 + 2] += (dz / d) * f
    }
    if (theta > 0 && n > 64) {
      const root = this.build()
      for (let i = 0; i < n; i++) {
        const stack: Oct[] = [root]
        while (stack.length) {
          const o = stack.pop()!
          if (!o.mass || o.body === i) continue
          const dx = P[i * 3] - o.mx, dy = P[i * 3 + 1] - o.my, dz = P[i * 3 + 2] - o.mz
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
          if (!o.kids || (o.half * 2) / d < theta) { if (o.body !== i) repel(i, o.mx, o.my, o.mz, o.mass) }
          else for (const k of o.kids) if (k) stack.push(k)
        }
      }
    } else {
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j) repel(i, P[j * 3], P[j * 3 + 1], P[j * 3 + 2], 1)
    }
    const deg = new Float64Array(n)
    for (const [a, b] of this.edges) { deg[a]++; deg[b]++ }
    for (const [a, b] of this.edges) {
      const dx = P[b * 3] - P[a * 3], dy = P[b * 3 + 1] - P[a * 3 + 1], dz = P[b * 3 + 2] - P[a * 3 + 2]
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-3
      const f = (d - link) * 0.5
      const wa = 1 / Math.max(1, Math.sqrt(deg[a])), wb = 1 / Math.max(1, Math.sqrt(deg[b]))
      F[a * 3] += (dx / d) * f * wa; F[a * 3 + 1] += (dy / d) * f * wa; F[a * 3 + 2] += (dz / d) * f * wa
      F[b * 3] -= (dx / d) * f * wb; F[b * 3 + 1] -= (dy / d) * f * wb; F[b * 3 + 2] -= (dz / d) * f * wb
    }
    let moved = 0
    const maxStep = 1.5 * this.alpha + 0.02
    for (let i = 0; i < n * 3; i++) {
      F[i] -= P[i] * gravity
      V[i] = (V[i] + F[i] * 0.08 * this.alpha) * 0.6
      const s = Math.max(-maxStep, Math.min(maxStep, V[i]))
      P[i] += s
      moved += Math.abs(s)
    }
    this.alpha = Math.max(0.001, this.alpha * 0.985)
    return moved / n
  }

  run(iterations: number, opts?: Parameters<ForceSim['step']>[0]) {
    for (let k = 0; k < iterations; k++) this.step(opts)
    return this
  }

  dist(a: number, b: number) {
    const P = this.pos
    return Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2])
  }
}
