// Network topology: JSON/CSV import, 3D force-directed layout, latency colours, routing and resilience checks.

export type NodeType = 'internet' | 'firewall' | 'router' | 'switch' | 'server' | 'database' | 'storage' | 'wifi' | 'client' | 'cloud'
export const TYPES: NodeType[] = ['internet', 'firewall', 'router', 'switch', 'server', 'database', 'storage', 'wifi', 'client', 'cloud']
export interface NetNode { id: string; label: string; type: NodeType; group: string; ip: string }
export interface NetLink { source: string; target: string; latency: number; bandwidth: number }
export interface Topology { nodes: NetNode[]; links: NetLink[]; warnings: string[] }

/** Guesses a device type from a free-form name or type string. */
export function guessType(s: string): NodeType {
  const t = s.toLowerCase()
  if (/internet|wan|isp/.test(t)) return 'internet'
  if (/fw|firewall|waf/.test(t)) return 'firewall'
  if (/cloud|aws|gcp|azure|cdn|vpc/.test(t)) return 'cloud'
  if (/router|rtr|gw|gateway|core|edge|bgp/.test(t)) return 'router'
  if (/switch|sw\b|sw-|tor|leaf|spine|agg/.test(t)) return 'switch'
  if (/db|sql|postgres|mysql|mongo|redis/.test(t)) return 'database'
  if (/nas|san|storage|s3|backup/.test(t)) return 'storage'
  if (/ap\b|ap-|wifi|wlan|wireless/.test(t)) return 'wifi'
  if (/pc|laptop|client|desk|phone|printer|user/.test(t)) return 'client'
  return 'server'
}

function finish(nodes: Map<string, NetNode>, links: NetLink[], warnings: string[]): Topology {
  for (const l of links)
    for (const id of [l.source, l.target])
      if (!nodes.has(id)) nodes.set(id, { id, label: id, type: guessType(id), group: '', ip: '' })
  const seen = new Set<string>()
  const out: NetLink[] = []
  for (const l of links) {
    if (l.source === l.target) {
      warnings.push(`Self-loop on ${l.source} ignored`)
      continue
    }
    const k = [l.source, l.target].sort().join('\u0000')
    if (seen.has(k)) {
      warnings.push(`Duplicate link ${l.source} – ${l.target} ignored`)
      continue
    }
    seen.add(k)
    out.push(l)
  }
  return { nodes: [...nodes.values()], links: out, warnings }
}

/** JSON: { nodes: [{id, label?, type?, group?, ip?}], links|edges: [{source, target, latency?, bandwidth?}] } */
export function parseJson(text: string): Topology {
  const d = JSON.parse(text) as { nodes?: unknown[]; links?: unknown[]; edges?: unknown[] }
  const warnings: string[] = []
  const nodes = new Map<string, NetNode>()
  for (const raw of d.nodes ?? []) {
    const n = raw as Record<string, unknown>
    const id = String(n.id ?? n.name ?? '')
    if (!id) {
      warnings.push('Node without id skipped')
      continue
    }
    const ty = String(n.type ?? '')
    nodes.set(id, {
      id,
      label: String(n.label ?? n.name ?? id),
      type: (TYPES as string[]).includes(ty) ? (ty as NodeType) : guessType(ty || id),
      group: String(n.group ?? n.site ?? ''),
      ip: String(n.ip ?? ''),
    })
  }
  const links: NetLink[] = []
  for (const raw of d.links ?? d.edges ?? []) {
    const l = raw as Record<string, unknown>
    const source = String(l.source ?? l.from ?? ''), target = String(l.target ?? l.to ?? '')
    if (!source || !target) {
      warnings.push('Link without source/target skipped')
      continue
    }
    links.push({ source, target, latency: Math.max(0, Number(l.latency ?? l.ms ?? 1) || 0), bandwidth: Math.max(0, Number(l.bandwidth ?? l.mbps ?? 1000) || 0) })
  }
  return finish(nodes, links, warnings)
}

function splitCsv(line: string): string[] {
  const out: string[] = []
  let cur = '', q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (c === '"') q = false
      else cur += c
    } else if (c === '"') q = true
    else if (c === ',' || c === ';' || c === '\t') {
      out.push(cur.trim())
      cur = ''
    } else cur += c
  }
  out.push(cur.trim())
  return out
}

/** CSV edge list: source,target,latency_ms[,bandwidth_mbps][,source_type][,target_type]. Header optional. */
export function parseCsv(text: string): Topology {
  const warnings: string[] = []
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
  let cols = { s: 0, t: 1, lat: 2, bw: 3, st: 4, tt: 5 }
  if (lines.length && /source|from|src/i.test(lines[0])) {
    const h = splitCsv(lines.shift()!).map((x) => x.toLowerCase())
    const f = (re: RegExp, d: number) => {
      const i = h.findIndex((x) => re.test(x))
      return i < 0 ? d : i
    }
    cols = { s: f(/^(source|from|src)$/, 0), t: f(/^(target|to|dst|dest)/, 1), lat: f(/lat|ms|rtt/, -1), bw: f(/band|mbps|speed/, -1), st: f(/source.?type|from.?type/, -1), tt: f(/target.?type|to.?type/, -1) }
  }
  const nodes = new Map<string, NetNode>()
  const links: NetLink[] = []
  lines.forEach((line, i) => {
    const c = splitCsv(line)
    const s = c[cols.s], t = c[cols.t]
    if (!s || !t) {
      warnings.push(`Line ${i + 1}: needs source and target`)
      return
    }
    for (const [id, ti] of [[s, cols.st], [t, cols.tt]] as const) {
      if (nodes.has(id)) continue
      const ty = ti >= 0 ? c[ti] ?? '' : ''
      nodes.set(id, { id, label: id, type: (TYPES as string[]).includes(ty) ? (ty as NodeType) : guessType(ty || id), group: '', ip: '' })
    }
    const lat = cols.lat >= 0 ? Number(c[cols.lat]) : 1
    const bw = cols.bw >= 0 ? Number(c[cols.bw]) : 1000
    if (cols.lat >= 0 && !Number.isFinite(lat)) warnings.push(`Line ${i + 1}: latency "${c[cols.lat]}" is not a number`)
    links.push({ source: s, target: t, latency: Number.isFinite(lat) ? Math.max(0, lat) : 1, bandwidth: Number.isFinite(bw) ? Math.max(0, bw) : 1000 })
  })
  return finish(nodes, links, warnings)
}

export type P3 = [number, number, number]

/** Deterministic 3D Fruchterman–Reingold layout; result is centred and scaled to roughly ±radius. */
export function forceLayout3D(t: Topology, iterations = 300, radius = 6): Map<string, P3> {
  const n = t.nodes.length
  const idx = new Map(t.nodes.map((nd, i) => [nd.id, i]))
  const P = new Float64Array(n * 3)
  // golden-spiral seed: reproducible, no clumping
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / Math.max(1, n)
    const r = Math.sqrt(1 - y * y), a = i * 2.399963
    P[i * 3] = Math.cos(a) * r * 3
    P[i * 3 + 1] = y * 3
    P[i * 3 + 2] = Math.sin(a) * r * 3
  }
  const E = t.links.map((l) => [idx.get(l.source)!, idx.get(l.target)!])
  const k = Math.cbrt(27 / Math.max(1, n)) * 1.4
  const D = new Float64Array(n * 3)
  let temp = 1.5
  for (let it = 0; it < iterations; it++) {
    D.fill(0)
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        let dx = P[i * 3] - P[j * 3], dy = P[i * 3 + 1] - P[j * 3 + 1], dz = P[i * 3 + 2] - P[j * 3 + 2]
        let d2 = dx * dx + dy * dy + dz * dz
        if (d2 < 1e-6) {
          dx = 0.01 * ((i % 3) - 1) + 0.005
          dy = 0.01
          dz = 0
          d2 = dx * dx + dy * dy
        }
        const f = (k * k) / d2
        D[i * 3] += dx * f; D[i * 3 + 1] += dy * f; D[i * 3 + 2] += dz * f
        D[j * 3] -= dx * f; D[j * 3 + 1] -= dy * f; D[j * 3 + 2] -= dz * f
      }
    for (const [a, b] of E) {
      const dx = P[a * 3] - P[b * 3], dy = P[a * 3 + 1] - P[b * 3 + 1], dz = P[a * 3 + 2] - P[b * 3 + 2]
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-3
      const f = d / k
      D[a * 3] -= dx * f; D[a * 3 + 1] -= dy * f; D[a * 3 + 2] -= dz * f
      D[b * 3] += dx * f; D[b * 3 + 1] += dy * f; D[b * 3 + 2] += dz * f
    }
    for (let i = 0; i < n; i++) {
      // weak gravity keeps disconnected parts close
      D[i * 3] -= P[i * 3] * 0.05; D[i * 3 + 1] -= P[i * 3 + 1] * 0.05; D[i * 3 + 2] -= P[i * 3 + 2] * 0.05
      const len = Math.hypot(D[i * 3], D[i * 3 + 1], D[i * 3 + 2]) || 1
      const s = Math.min(len, temp) / len
      P[i * 3] += D[i * 3] * s; P[i * 3 + 1] += D[i * 3 + 1] * s; P[i * 3 + 2] += D[i * 3 + 2] * s
    }
    temp = Math.max(0.02, temp * 0.985)
  }
  const c = [0, 0, 0]
  for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++) c[a] += P[i * 3 + a] / n
  let max = 0
  for (let i = 0; i < n; i++) max = Math.max(max, Math.hypot(P[i * 3] - c[0], P[i * 3 + 1] - c[1], P[i * 3 + 2] - c[2]))
  const sc = max ? radius / max : 1
  const out = new Map<string, P3>()
  t.nodes.forEach((nd, i) => out.set(nd.id, [(P[i * 3] - c[0]) * sc, (P[i * 3 + 1] - c[1]) * sc, (P[i * 3 + 2] - c[2]) * sc]))
  return out
}

/** Latency colour: green (fast) → amber → red (slow), on a log scale between `lo` and `hi` ms. */
export function latencyColor(ms: number, lo = 0.5, hi = 150): string {
  const t = Math.max(0, Math.min(1, (Math.log(Math.max(ms, 0.01)) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))))
  const hue = 130 * (1 - t)
  return `hsl(${hue.toFixed(0)}, 80%, 52%)`
}

export function adjacency(t: Topology): Map<string, { to: string; link: NetLink }[]> {
  const adj = new Map<string, { to: string; link: NetLink }[]>(t.nodes.map((n) => [n.id, []]))
  for (const l of t.links) {
    adj.get(l.source)?.push({ to: l.target, link: l })
    adj.get(l.target)?.push({ to: l.source, link: l })
  }
  return adj
}

/** Lowest-latency path (Dijkstra). Returns null if unreachable. */
export function shortestPath(t: Topology, from: string, to: string): { path: string[]; latency: number; bottleneck: number } | null {
  const adj = adjacency(t)
  if (!adj.has(from) || !adj.has(to)) return null
  const dist = new Map<string, number>([[from, 0]])
  const prev = new Map<string, string>()
  const done = new Set<string>()
  for (;;) {
    let u: string | null = null, best = Infinity
    for (const [k, d] of dist) if (!done.has(k) && d < best) [u, best] = [k, d]
    if (u === null) return null
    if (u === to) break
    done.add(u)
    for (const { to: v, link } of adj.get(u)!) {
      const nd = best + link.latency
      if (nd < (dist.get(v) ?? Infinity)) {
        dist.set(v, nd)
        prev.set(v, u)
      }
    }
  }
  const path = [to]
  while (path[0] !== from) path.unshift(prev.get(path[0])!)
  let bottleneck = Infinity
  for (let i = 1; i < path.length; i++) {
    const l = adj.get(path[i - 1])!.find((e) => e.to === path[i])!.link
    bottleneck = Math.min(bottleneck, l.bandwidth)
  }
  return { path, latency: dist.get(to)!, bottleneck: path.length > 1 ? bottleneck : 0 }
}

/** Connected components (lists of node ids). */
export function components(t: Topology): string[][] {
  const adj = adjacency(t)
  const seen = new Set<string>()
  const out: string[][] = []
  for (const n of t.nodes) {
    if (seen.has(n.id)) continue
    const comp: string[] = []
    const stack = [n.id]
    seen.add(n.id)
    while (stack.length) {
      const u = stack.pop()!
      comp.push(u)
      for (const { to } of adj.get(u)!) if (!seen.has(to)) {
        seen.add(to)
        stack.push(to)
      }
    }
    out.push(comp)
  }
  return out
}

/** Articulation points: devices whose failure splits the network (single points of failure). */
export function articulationPoints(t: Topology): Set<string> {
  const adj = adjacency(t)
  const disc = new Map<string, number>(), low = new Map<string, number>()
  const out = new Set<string>()
  let time = 0
  const dfs = (u: string, parent: string | null) => {
    disc.set(u, time)
    low.set(u, time++)
    let kids = 0
    for (const { to: v } of adj.get(u)!) {
      if (!disc.has(v)) {
        kids++
        dfs(v, u)
        low.set(u, Math.min(low.get(u)!, low.get(v)!))
        if (parent !== null && low.get(v)! >= disc.get(u)!) out.add(u)
      } else if (v !== parent) low.set(u, Math.min(low.get(u)!, disc.get(v)!))
    }
    if (parent === null && kids > 1) out.add(u)
  }
  for (const n of t.nodes) if (!disc.has(n.id)) dfs(n.id, null)
  return out
}

/** One node / link per line: readable and compact. */
export function pretty(d: { nodes: unknown[]; links: unknown[] }): string {
  const rows = (a: unknown[]) => a.map((x) => '    ' + JSON.stringify(x)).join(',\n')
  return `{\n  "nodes": [\n${rows(d.nodes)}\n  ],\n  "links": [\n${rows(d.links)}\n  ]\n}`
}

export const SAMPLE_JSON = pretty({
    nodes: [
      { id: 'isp-a', label: 'ISP A', type: 'internet' }, { id: 'isp-b', label: 'ISP B', type: 'internet' },
      { id: 'fw1', label: 'Edge firewall', type: 'firewall', ip: '203.0.113.1' },
      { id: 'core1', label: 'Core router 1', type: 'router', ip: '10.0.0.1' }, { id: 'core2', label: 'Core router 2', type: 'router', ip: '10.0.0.2' },
      { id: 'spine1', label: 'Spine 1', type: 'switch' }, { id: 'spine2', label: 'Spine 2', type: 'switch' },
      { id: 'leaf1', label: 'Leaf 1', type: 'switch' }, { id: 'leaf2', label: 'Leaf 2', type: 'switch' }, { id: 'leaf3', label: 'Leaf 3', type: 'switch' },
      { id: 'web1', label: 'web-01', type: 'server', group: 'web', ip: '10.1.1.11' }, { id: 'web2', label: 'web-02', type: 'server', group: 'web', ip: '10.1.1.12' },
      { id: 'app1', label: 'app-01', type: 'server', group: 'app', ip: '10.1.2.21' }, { id: 'app2', label: 'app-02', type: 'server', group: 'app', ip: '10.1.2.22' },
      { id: 'db1', label: 'pg-primary', type: 'database', ip: '10.1.3.31' }, { id: 'db2', label: 'pg-replica', type: 'database', ip: '10.1.3.32' },
      { id: 'nas', label: 'Backup NAS', type: 'storage', ip: '10.1.4.40' },
      { id: 'office', label: 'Office switch', type: 'switch' }, { id: 'ap1', label: 'Wi-Fi AP', type: 'wifi' },
      { id: 'pc1', label: 'Laptop', type: 'client' }, { id: 'pc2', label: 'Desktop', type: 'client' },
      { id: 'vpc', label: 'Cloud VPC', type: 'cloud' }, { id: 'cdn', label: 'CDN edge', type: 'cloud' },
    ],
    links: [
      { source: 'isp-a', target: 'fw1', latency: 8, bandwidth: 1000 }, { source: 'isp-b', target: 'fw1', latency: 14, bandwidth: 500 },
      { source: 'fw1', target: 'core1', latency: 0.4, bandwidth: 10000 }, { source: 'fw1', target: 'core2', latency: 0.4, bandwidth: 10000 },
      { source: 'core1', target: 'core2', latency: 0.2, bandwidth: 40000 },
      { source: 'core1', target: 'spine1', latency: 0.3, bandwidth: 40000 }, { source: 'core2', target: 'spine2', latency: 0.3, bandwidth: 40000 },
      { source: 'spine1', target: 'leaf1', latency: 0.1, bandwidth: 25000 }, { source: 'spine1', target: 'leaf2', latency: 0.1, bandwidth: 25000 }, { source: 'spine1', target: 'leaf3', latency: 0.1, bandwidth: 25000 },
      { source: 'spine2', target: 'leaf1', latency: 0.1, bandwidth: 25000 }, { source: 'spine2', target: 'leaf2', latency: 0.1, bandwidth: 25000 }, { source: 'spine2', target: 'leaf3', latency: 0.1, bandwidth: 25000 },
      { source: 'leaf1', target: 'web1', latency: 0.05, bandwidth: 10000 }, { source: 'leaf1', target: 'web2', latency: 0.05, bandwidth: 10000 },
      { source: 'leaf2', target: 'app1', latency: 0.05, bandwidth: 10000 }, { source: 'leaf2', target: 'app2', latency: 0.05, bandwidth: 10000 },
      { source: 'leaf3', target: 'db1', latency: 0.05, bandwidth: 10000 }, { source: 'leaf3', target: 'db2', latency: 0.05, bandwidth: 10000 },
      { source: 'leaf3', target: 'nas', latency: 0.08, bandwidth: 1000 },
      { source: 'core2', target: 'office', latency: 1.2, bandwidth: 1000 }, { source: 'office', target: 'ap1', latency: 2, bandwidth: 1000 },
      { source: 'ap1', target: 'pc1', latency: 6, bandwidth: 300 }, { source: 'office', target: 'pc2', latency: 0.6, bandwidth: 1000 },
      { source: 'isp-a', target: 'vpc', latency: 24, bandwidth: 1000 }, { source: 'isp-b', target: 'cdn', latency: 11, bandwidth: 1000 },
      { source: 'vpc', target: 'cdn', latency: 38, bandwidth: 1000 },
    ],
})

export const SAMPLE_CSV = `source,target,latency_ms,bandwidth_mbps,source_type,target_type
Frankfurt-core,Amsterdam-core,7,100000,router,router
Frankfurt-core,Paris-core,9,100000,router,router
Amsterdam-core,London-core,6,100000,router,router
Paris-core,London-core,5,100000,router,router
London-core,NewYork-core,72,40000,router,router
Paris-core,Madrid-core,14,40000,router,router
NewYork-core,Chicago-core,18,40000,router,router
Chicago-core,Dallas-core,21,40000,router,router
Dallas-core,LosAngeles-core,32,40000,router,router
NewYork-core,Ashburn-core,6,100000,router,router
Ashburn-core,Dallas-core,28,40000,router,router
LosAngeles-core,Tokyo-core,105,10000,router,router
Tokyo-core,Singapore-core,68,10000,router,router
Singapore-core,Mumbai-core,58,10000,router,router
Mumbai-core,Frankfurt-core,112,10000,router,router
Frankfurt-core,FRA-dc,0.6,10000,router,server
Ashburn-core,IAD-dc,0.5,10000,router,server
Tokyo-core,NRT-dc,0.7,10000,router,server
Madrid-core,MAD-pop,0.9,1000,router,cloud`
