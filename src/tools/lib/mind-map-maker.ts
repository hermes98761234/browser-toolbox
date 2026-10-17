// Mind map model, balanced two-sided tree layout and outline import/export.

export interface MNode { text: string; children: string[]; collapsed?: boolean }
export interface MindMap { root: string; nodes: Record<string, MNode> }
export interface Box { id: string; x: number; y: number; w: number; h: number; side: 1 | -1 | 0; depth: number; parent: string | null; branch: number }

export const H_GAP = 56
export const V_GAP = 12

export function parentOf(m: MindMap, id: string): string | null {
  for (const [k, n] of Object.entries(m.nodes)) if (n.children.includes(id)) return k
  return null
}

/** Splits the root's children into right/left halves by subtree height, keeping their order. */
export function splitSides(heights: number[]): (1 | -1)[] {
  const total = heights.reduce((a, b) => a + b, 0)
  let acc = 0
  return heights.map((h, i) => {
    const right = i === 0 || acc + h / 2 <= total / 2
    acc += h
    return right ? 1 : -1
  })
}

/** Lays the map out around the root at (0, 0). `size` returns a node's box size. */
export function layout(m: MindMap, size: (id: string, depth: number) => { w: number; h: number }): Map<string, Box> {
  const out = new Map<string, Box>()
  const sz = new Map<string, { w: number; h: number }>()
  const sub = new Map<string, number>()
  const kids = (id: string) => (m.nodes[id]?.collapsed ? [] : (m.nodes[id]?.children ?? []).filter((c) => m.nodes[c]))
  const measure = (id: string, depth: number): number => {
    const s = size(id, depth)
    sz.set(id, s)
    const ch = kids(id)
    const childH = ch.reduce((a, c) => a + measure(c, depth + 1), 0) + V_GAP * Math.max(0, ch.length - 1)
    const h = Math.max(s.h, childH)
    sub.set(id, h)
    return h
  }
  measure(m.root, 0)
  const place = (id: string, side: 1 | -1, edge: number, cy: number, depth: number, parent: string, branch: number) => {
    const s = sz.get(id)!
    const cx = edge + side * s.w / 2
    out.set(id, { id, x: cx, y: cy, w: s.w, h: s.h, side, depth, parent, branch })
    stack(kids(id), side, edge + side * (s.w + H_GAP), cy, depth + 1, id, () => branch)
  }
  const stack = (ids: string[], side: 1 | -1, edge: number, cy: number, depth: number, parent: string, br: (i: number) => number) => {
    const total = ids.reduce((a, c) => a + sub.get(c)!, 0) + V_GAP * Math.max(0, ids.length - 1)
    let y = cy - total / 2
    ids.forEach((c, i) => {
      const h = sub.get(c)!
      place(c, side, edge, y + h / 2, depth, parent, br(i))
      y += h + V_GAP
    })
  }
  const rs = sz.get(m.root)!
  out.set(m.root, { id: m.root, x: 0, y: 0, w: rs.w, h: rs.h, side: 0, depth: 0, parent: null, branch: -1 })
  const top = kids(m.root)
  const sides = splitSides(top.map((c) => sub.get(c)!))
  const index = new Map(top.map((c, i) => [c, i]))
  for (const side of [1, -1] as const) {
    const ids = top.filter((_, i) => sides[i] === side)
    stack(ids, side, side * (rs.w / 2 + H_GAP), 0, 1, m.root, (i) => index.get(ids[i])!)
  }
  return out
}

/** Cubic edge from the parent's side to the child's facing side. */
export function edgePath(p: Box, c: Box): string {
  const s = c.side
  const x1 = p.x + s * p.w / 2, y1 = p.y, x2 = c.x - s * c.w / 2, y2 = c.y
  const mx = (x1 + x2) / 2
  return `M${x1.toFixed(1)},${y1.toFixed(1)} C${mx.toFixed(1)},${y1.toFixed(1)} ${mx.toFixed(1)},${y2.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`
}

let n = 0
export const newId = () => `n${Date.now().toString(36)}${(n++).toString(36)}`

/** Indented outline ("- item", tabs/2+ spaces, or # headings) → mind map. First line is the root. */
export function parseOutline(text: string): MindMap | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (!lines.length) return null
  const items = lines.map((l) => {
    const h = /^(#+)\s+(.*)$/.exec(l.trim())
    if (h) return { level: h[1].length - 1, text: h[2].trim() }
    const ind = /^[\t ]*/.exec(l)![0].replace(/\t/g, '  ').length
    return { level: Math.floor(ind / 2) + (/^\s*[-*+]\s/.test(l) || /^\s*\d+[.)]\s/.test(l) ? 1 : 0), text: l.trim().replace(/^([-*+]|\d+[.)])\s+/, '') }
  })
  const nodes: Record<string, MNode> = {}
  const root = newId()
  nodes[root] = { text: items[0].text, children: [] }
  const stack: { id: string; level: number }[] = [{ id: root, level: -1 }]
  for (const it of items.slice(1)) {
    while (stack.length > 1 && stack[stack.length - 1].level >= it.level) stack.pop()
    const id = newId()
    nodes[id] = { text: it.text, children: [] }
    nodes[stack[stack.length - 1].id].children.push(id)
    stack.push({ id, level: it.level })
  }
  return { root, nodes }
}

export function toOutline(m: MindMap): string {
  const out: string[] = [m.nodes[m.root].text]
  const walk = (id: string, d: number) => {
    for (const c of m.nodes[id].children) {
      if (!m.nodes[c]) continue
      out.push(`${'  '.repeat(d)}- ${m.nodes[c].text}`)
      walk(c, d + 1)
    }
  }
  walk(m.root, 0)
  return out.join('\n')
}

/** Removes a node and its whole subtree (never the root). */
export function removeNode(m: MindMap, id: string): MindMap {
  if (id === m.root) return m
  const nodes = { ...m.nodes }
  const drop = (x: string) => { for (const c of nodes[x]?.children ?? []) drop(c); delete nodes[x] }
  const p = parentOf(m, id)
  drop(id)
  if (p && nodes[p]) nodes[p] = { ...nodes[p], children: nodes[p].children.filter((c) => c !== id) }
  return { ...m, nodes }
}

export const countNodes = (m: MindMap) => Object.keys(m.nodes).length
