// Org chart: CSV → tree (with validation) → tidy layout with optional compact leaf stacking.

export interface Person { id: string; name: string; title: string; manager: string; dept: string }
export interface Node extends Person { children: Node[]; depth: number; size: number } // size = all descendants
export interface Problems { missingManager: string[]; cycles: string[]; duplicates: string[] }

export function parseRows(rows: string[][]): Person[] {
  if (!rows.length) return []
  const h = rows[0].map((x) => x.toLowerCase().trim())
  const find = (...k: string[]) => h.findIndex((x) => k.some((y) => x === y || x.includes(y)))
  let iName = find('name', 'employee'), iTitle = find('title', 'role', 'position'), iMgr = find('manager', 'reports', 'parent', 'boss'), iId = find('id')
  const iDept = find('dept', 'department', 'team')
  let body = rows.slice(1)
  if (iName < 0) {
    // headerless: name, title, manager
    body = rows
    iName = 0
    iTitle = 1
    iMgr = 2
    iId = -1
  }
  return body
    .filter((r) => (r[iName] ?? '').trim())
    .map((r) => {
      const name = r[iName].trim()
      const id = iId >= 0 && r[iId]?.trim() ? r[iId].trim() : name
      return { id, name, title: iTitle >= 0 ? (r[iTitle] ?? '').trim() : '', manager: iMgr >= 0 ? (r[iMgr] ?? '').trim() : '', dept: iDept >= 0 ? (r[iDept] ?? '').trim() : '' }
    })
}

/** Builds a forest. Managers may be referenced by id or by name. */
export function buildTree(people: Person[]): { roots: Node[]; problems: Problems; byId: Map<string, Node> } {
  const problems: Problems = { missingManager: [], cycles: [], duplicates: [] }
  const byId = new Map<string, Node>()
  for (const p of people) {
    if (byId.has(p.id)) {
      problems.duplicates.push(p.id)
      continue
    }
    byId.set(p.id, { ...p, children: [], depth: 0, size: 0 })
  }
  const byName = new Map<string, Node>()
  for (const n of byId.values()) if (!byName.has(n.name.toLowerCase())) byName.set(n.name.toLowerCase(), n)
  const parent = new Map<string, Node | null>()
  for (const n of byId.values()) {
    const m = n.manager ? (byId.get(n.manager) ?? byName.get(n.manager.toLowerCase()) ?? null) : null
    if (n.manager && !m) problems.missingManager.push(`${n.name} → ${n.manager}`)
    parent.set(n.id, m && m !== n ? m : null)
  }
  // break cycles: walk up; if we revisit, cut the link at the start node
  for (const n of byId.values()) {
    const seen = new Set<string>([n.id])
    let p = parent.get(n.id)
    while (p) {
      if (seen.has(p.id)) {
        problems.cycles.push(n.name)
        parent.set(n.id, null)
        break
      }
      seen.add(p.id)
      p = parent.get(p.id) ?? null
    }
  }
  const roots: Node[] = []
  for (const n of byId.values()) {
    const p = parent.get(n.id)
    if (p) p.children.push(n)
    else roots.push(n)
  }
  const walk = (n: Node, d: number): number => {
    n.depth = d
    n.size = n.children.reduce((a, c) => a + 1 + walk(c, d + 1), 0)
    return n.size
  }
  roots.forEach((r) => walk(r, 0))
  return { roots, problems, byId }
}

export interface Box { node: Node; x: number; y: number; parent?: Box; hidden: number; stacked?: boolean }

/**
 * Tidy top-down layout. Coordinates are box top-left corners in "main/cross" space:
 * x along siblings, y along depth. `compact` stacks leaf-only children in a column.
 */
export function layout(roots: Node[], collapsed: Set<string>, o: { w: number; h: number; gx: number; gy: number; compact: boolean }): { boxes: Box[]; width: number; height: number } {
  const boxes: Box[] = []
  const kids = (n: Node) => (collapsed.has(n.id) ? [] : n.children)
  const stacked = (n: Node) => o.compact && kids(n).length >= 2 && kids(n).every((c) => kids(c).length === 0)
  const widthOf = (n: Node): number => {
    const ch = kids(n)
    if (!ch.length) return o.w
    if (stacked(n)) return o.w + o.gx * 0.6
    return Math.max(o.w, ch.reduce((a, c) => a + widthOf(c), 0) + o.gx * (ch.length - 1))
  }
  let maxY = 0
  const place = (n: Node, left: number, y: number, parent?: Box) => {
    const W = widthOf(n)
    const b: Box = { node: n, x: stacked(n) ? left : left + (W - o.w) / 2, y, parent, hidden: collapsed.has(n.id) ? n.size : 0 }
    boxes.push(b)
    maxY = Math.max(maxY, y + o.h)
    const ch = kids(n)
    if (stacked(n)) {
      ch.forEach((c, i) => {
        const cb: Box = { node: c, x: b.x + o.gx * 0.6, y: y + (o.h + o.gy * 0.5) * (i + 1), parent: b, hidden: 0, stacked: true }
        boxes.push(cb)
        maxY = Math.max(maxY, cb.y + o.h)
      })
      return
    }
    let x = left + (W - (ch.reduce((a, c) => a + widthOf(c), 0) + o.gx * Math.max(0, ch.length - 1))) / 2
    for (const c of ch) {
      place(c, x, y + o.h + o.gy, b)
      x += widthOf(c) + o.gx
    }
  }
  let x = 0
  for (const r of roots) {
    place(r, x, 0)
    x += widthOf(r) + o.gx * 2
  }
  return { boxes, width: Math.max(0, x - o.gx * 2), height: maxY }
}

export function stats(roots: Node[]) {
  let count = 0, depth = 0, managers = 0, spanSum = 0, spanMax = 0
  const go = (n: Node) => {
    count++
    depth = Math.max(depth, n.depth + 1)
    if (n.children.length) {
      managers++
      spanSum += n.children.length
      spanMax = Math.max(spanMax, n.children.length)
    }
    n.children.forEach(go)
  }
  roots.forEach(go)
  return { count, depth, managers, avgSpan: managers ? spanSum / managers : 0, spanMax }
}
