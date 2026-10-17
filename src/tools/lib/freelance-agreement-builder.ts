// Tiny Handlebars-style renderer, payment maths and PDF text helpers for the Freelance Agreement Builder.

export type Ctx = Record<string, unknown>

const get = (ctx: Ctx[], path: string): unknown => {
  if (path === 'this') return 'this' in ctx[0] ? ctx[0].this : ctx[0]
  for (const c of ctx) {
    let v: unknown = c
    let ok = true
    for (const k of path.replace(/^this\./, '').split('.')) {
      if (v && typeof v === 'object' && k in (v as Ctx)) v = (v as Ctx)[k]
      else {
        ok = false
        break
      }
    }
    if (ok) return v
  }
  return undefined
}
const truthy = (v: unknown) => (Array.isArray(v) ? v.length > 0 : !!v)

type Node = { t: 'text'; v: string } | { t: 'var'; v: string } | { t: 'block'; kind: string; arg: string; body: Node[]; alt: Node[] }

function parse(tpl: string): Node[] {
  const root: Node[] = []
  const stack: { node: Extract<Node, { t: 'block' }>; inAlt: boolean }[] = []
  const push = (n: Node) => {
    const top = stack[stack.length - 1]
    if (!top) root.push(n)
    else (top.inAlt ? top.node.alt : top.node.body).push(n)
  }
  let last = 0
  for (const m of tpl.matchAll(/\{\{\s*([#/]?)([^}]*?)\s*\}\}/g)) {
    if (m.index! > last) push({ t: 'text', v: tpl.slice(last, m.index) })
    last = m.index! + m[0].length
    const sigil = m[1]
    const [word, ...rest] = m[2].split(/\s+/)
    const arg = rest.join(' ')
    if (sigil === '#') {
      const node = { t: 'block' as const, kind: word, arg, body: [], alt: [] }
      push(node)
      stack.push({ node, inAlt: false })
    } else if (sigil === '/') {
      const top = stack.pop()
      if (!top || top.node.kind !== word) throw new Error(`Unexpected {{/${word}}}`)
    } else if (word === 'else' && !arg) {
      const top = stack[stack.length - 1]
      if (!top) throw new Error('{{else}} outside a block')
      top.inAlt = true
    } else push({ t: 'var', v: word })
  }
  if (stack.length) throw new Error(`Unclosed {{#${stack[stack.length - 1].node.kind}}}`)
  if (last < tpl.length) push({ t: 'text', v: tpl.slice(last) })
  return root
}

function run(nodes: Node[], ctx: Ctx[]): string {
  let out = ''
  for (const n of nodes) {
    if (n.t === 'text') out += n.v
    else if (n.t === 'var') {
      const v = get(ctx, n.v)
      out += v === undefined || v === null ? '' : String(v)
    } else if (n.kind === 'if' || n.kind === 'unless') {
      const ok = truthy(get(ctx, n.arg)) !== (n.kind === 'unless')
      out += run(ok ? n.body : n.alt, ctx)
    } else if (n.kind === 'each') {
      const list = get(ctx, n.arg)
      if (Array.isArray(list) && list.length) list.forEach((item, i) => (out += run(n.body, [{ ...(typeof item === 'object' ? item : { this: item }), '@index': i, '@number': i + 1, '@last': i === list.length - 1 }, ...ctx])))
      else out += run(n.alt, ctx)
    } else if (n.kind === 'eq') {
      const [a, b] = n.arg.split(/\s+/)
      const bv = /^["'].*["']$/.test(b) ? b.slice(1, -1) : get(ctx, b)
      out += run(String(get(ctx, a)) === String(bv) ? n.body : n.alt, ctx)
    }
  }
  return out
}

/** Renders {{var}}, {{#if}}/{{#unless}}/{{else}}, {{#each list}} (with {{@number}}) and {{#eq a "b"}}. */
export function render(tpl: string, data: Ctx): string {
  return run(parse(tpl), [data])
}

/** Replaces "## Heading" lines with "## 1. Heading", "## 2. …" and squeezes blank lines. */
export function numberSections(text: string): string {
  let n = 0
  return text
    .split('\n')
    .map((l) => (l.startsWith('## ') ? `## ${++n}. ${l.slice(3)}` : l))
    .join('\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export interface Milestone { name: string; amount: number; due: string }
export interface PayInput { type: 'fixed' | 'hourly' | 'milestones'; fixed: number; rate: number; hours: number; milestones: Milestone[]; depositPct: number }

export const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100

export function payment(p: PayInput) {
  const total = p.type === 'fixed' ? p.fixed : p.type === 'hourly' ? p.rate * p.hours : p.milestones.reduce((a, m) => a + (m.amount || 0), 0)
  const deposit = r2((total * Math.min(100, Math.max(0, p.depositPct))) / 100)
  return { total: r2(total), deposit, balance: r2(total - deposit) }
}

/** Word-wraps text to a pixel width using a measuring function. */
export function wrap(text: string, maxW: number, width: (s: string) => number): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const cand = line ? `${line} ${word}` : word
      if (width(cand) <= maxW || !line) line = cand
      else {
        out.push(line)
        line = word
      }
    }
    out.push(line)
  }
  return out
}

const WINANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'
/** Replaces characters the PDF standard fonts (WinAnsi) cannot encode. */
export const winAnsi = (s: string) => [...s].map((c) => (c.charCodeAt(0) < 256 || WINANSI_EXTRA.includes(c) ? c : c === '≈' ? '~' : '?')).join('')
