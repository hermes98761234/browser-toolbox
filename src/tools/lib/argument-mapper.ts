// Argument map model: a tree of claims, reasons, objections, rebuttals and evidence.

export type Kind = 'claim' | 'reason' | 'objection' | 'rebuttal' | 'evidence'
export interface Node { id: string; parent: string | null; kind: Kind; text: string }

export const KINDS: Kind[] = ['claim', 'reason', 'objection', 'rebuttal', 'evidence']
export const LABEL: Record<Kind, string> = { claim: 'Claim', reason: 'Reason', objection: 'Objection', rebuttal: 'Rebuttal', evidence: 'Evidence' }
/** Word shown on the edge from parent to a child of this kind. */
export const LINK: Record<Kind, string> = { claim: '', reason: 'because', objection: 'but', rebuttal: 'however', evidence: 'e.g.' }

export const children = (ns: Node[], id: string | null) => ns.filter((n) => n.parent === id)

/** Greedy word wrap to at most `max` characters per line (long words are split). */
export function wrap(text: string, max: number): string[] {
  const out: string[] = []
  let line = ''
  for (let w of text.trim().split(/\s+/).filter(Boolean)) {
    while (w.length > max) {
      if (line) out.push(line)
      out.push(w.slice(0, max - 1) + '-')
      w = w.slice(max - 1)
      line = ''
    }
    if (!line) line = w
    else if (line.length + 1 + w.length <= max) line += ' ' + w
    else {
      out.push(line)
      line = w
    }
  }
  if (line || !out.length) out.push(line)
  return out
}

export interface Box { id: string; x: number; y: number; w: number; h: number; lines: string[]; depth: number }

/**
 * Tidy top-down tree layout: leaves take consecutive slots, parents centre over their children.
 * Rows are as tall as their tallest box so every level lines up.
 */
export function layout(ns: Node[], opt = { w: 190, chars: 26, line: 16, pad: 30, hgap: 24, vgap: 56 }): { boxes: Box[]; width: number; height: number } {
  const roots = children(ns, null)
  const boxes = new Map<string, Box>()
  let cursor = 0
  const depthH: number[] = []
  const visit = (n: Node, depth: number, seen: Set<string>): number => {
    if (seen.has(n.id)) return cursor
    seen.add(n.id)
    const lines = wrap(n.text || '…', opt.chars)
    const h = opt.pad + lines.length * opt.line
    depthH[depth] = Math.max(depthH[depth] ?? 0, h)
    const kids = children(ns, n.id)
    let cx: number
    if (!kids.length) {
      cx = cursor + opt.w / 2
      cursor += opt.w + opt.hgap
    } else {
      const xs = kids.map((k) => visit(k, depth + 1, seen))
      cx = (xs[0] + xs[xs.length - 1]) / 2
    }
    boxes.set(n.id, { id: n.id, x: cx - opt.w / 2, y: depth, w: opt.w, h, lines, depth })
    return cx
  }
  const seen = new Set<string>()
  for (const r of roots) {
    visit(r, 0, seen)
    cursor += opt.hgap
  }
  const rowY: number[] = []
  depthH.reduce((y, h, i) => ((rowY[i] = y), y + h + opt.vgap), 0)
  const list = [...boxes.values()].map((b) => ({ ...b, y: rowY[b.depth] }))
  const width = Math.max(opt.w, cursor - 2 * opt.hgap)
  const height = depthH.reduce((a, h) => a + h + opt.vgap, 0) - opt.vgap
  return { boxes: list, width, height: Math.max(height, 40) }
}

/** Nested Markdown outline: "- **Reason:** text". */
export function toMarkdown(ns: Node[], title = 'Argument map'): string {
  const lines = [`# ${title}`, '']
  const walk = (id: string | null, depth: number) => {
    for (const n of children(ns, id)) {
      lines.push(`${'  '.repeat(depth)}- **${LABEL[n.kind]}:** ${n.text.replace(/\s+/g, ' ').trim()}`)
      walk(n.id, depth + 1)
    }
  }
  walk(null, 0)
  return lines.join('\n') + '\n'
}

/** Parses an indented outline back into nodes (kind prefixes optional; default reason/claim). */
export function fromMarkdown(md: string, mkId: () => string): Node[] {
  const out: Node[] = []
  const stack: { indent: number; id: string }[] = []
  for (const raw of md.split(/\r?\n/)) {
    const m = /^(\s*)[-*+]\s+(.*)$/.exec(raw)
    if (!m) continue
    const indent = m[1].replace(/\t/g, '  ').length
    let text = m[2].trim()
    let kind: Kind | null = null
    const k = /^\*{0,2}(claim|reason|objection|rebuttal|evidence)\s*:\s*\*{0,2}\s*/i.exec(text)
    if (k) {
      kind = k[1].toLowerCase() as Kind
      text = text.slice(k[0].length).trim()
    }
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop()
    const parent = stack.length ? stack[stack.length - 1].id : null
    const id = mkId()
    out.push({ id, parent, kind: kind ?? (parent ? 'reason' : 'claim'), text })
    stack.push({ indent, id })
  }
  return out
}

/** Objections with no rebuttal underneath them. */
export const unanswered = (ns: Node[]) => ns.filter((n) => n.kind === 'objection' && !children(ns, n.id).some((c) => c.kind === 'rebuttal'))

/** Removes a node and its whole subtree. */
export function removeTree(ns: Node[], id: string): Node[] {
  const gone = new Set([id])
  let grew = true
  while (grew) {
    grew = false
    for (const n of ns) if (n.parent && gone.has(n.parent) && !gone.has(n.id)) {
      gone.add(n.id)
      grew = true
    }
  }
  return ns.filter((n) => !gone.has(n.id))
}

/** Sensible default kind for a new child of `parent`. */
export const childKind = (p: Kind): Kind => (p === 'objection' ? 'rebuttal' : p === 'reason' || p === 'rebuttal' ? 'evidence' : 'reason')
