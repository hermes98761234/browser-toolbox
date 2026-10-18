// Family tree model, GEDCOM 5.5.1 import/export, relationship naming and two tree layouts
// (pedigree chart and descendant chart with multiple marriages). Written for this tool.

export type Sex = 'M' | 'F' | 'U'
export interface Event { date: string; place: string }
export interface Person { id: string; given: string; surname: string; sex: Sex; birth: Event; death: Event; notes: string }
export interface Family { id: string; husb?: string; wife?: string; children: string[]; marr: Event; div: boolean }
export interface Tree { people: Person[]; families: Family[] }

export const emptyEvent = (): Event => ({ date: '', place: '' })
export const fullName = (p?: Person) => (p ? `${p.given} ${p.surname}`.trim() || '(unnamed)' : '?')

/** Year from a GEDCOM date such as "ABT 1890", "12 MAR 1950", "BET 1900 AND 1905" (first year). */
export function year(date: string): number {
  const m = /(\d{3,4})/.exec(date)
  return m ? +m[1] : NaN
}
export function lifespan(p: Person): string {
  const b = year(p.birth.date), d = year(p.death.date)
  if (!Number.isFinite(b) && !Number.isFinite(d)) return ''
  return `${Number.isFinite(b) ? b : '?'}–${Number.isFinite(d) ? d : ''}`
}

// ---------- indexes ----------

export interface Index {
  person: Map<string, Person>
  family: Map<string, Family>
  childOf: Map<string, Family[]> // families where the person is a child (FAMC)
  spouseIn: Map<string, Family[]> // families where the person is a partner (FAMS)
}
export function index(t: Tree): Index {
  const person = new Map(t.people.map((p) => [p.id, p]))
  const family = new Map(t.families.map((f) => [f.id, f]))
  const childOf = new Map<string, Family[]>(), spouseIn = new Map<string, Family[]>()
  const push = (m: Map<string, Family[]>, k: string, f: Family) => m.set(k, [...(m.get(k) ?? []), f])
  for (const f of t.families) {
    for (const c of f.children) push(childOf, c, f)
    if (f.husb) push(spouseIn, f.husb, f)
    if (f.wife) push(spouseIn, f.wife, f)
  }
  return { person, family, childOf, spouseIn }
}
export const partner = (f: Family, id: string) => (f.husb === id ? f.wife : f.husb)
export const parentsOf = (ix: Index, id: string) => (ix.childOf.get(id) ?? []).flatMap((f) => [f.husb, f.wife]).filter((x): x is string => !!x)
export function siblingsOf(ix: Index, id: string): { id: string; half: boolean }[] {
  const mine = ix.childOf.get(id) ?? []
  const myParents = new Set(parentsOf(ix, id))
  const out = new Map<string, boolean>()
  for (const f of mine) for (const c of f.children) if (c !== id) out.set(c, false)
  // half-siblings through a parent's other families
  for (const p of myParents)
    for (const f of ix.spouseIn.get(p) ?? [])
      if (!mine.includes(f)) for (const c of f.children) if (c !== id && !out.has(c)) out.set(c, true)
  return [...out].map(([i, half]) => ({ id: i, half }))
}

// ---------- GEDCOM 5.5.1 ----------

const MAX = 248
function textLines(level: number, tag: string, text: string): string[] {
  const out: string[] = []
  text.split(/\r?\n/).forEach((line, i) => {
    let rest = line
    let first = true
    do {
      const chunk = rest.slice(0, MAX)
      rest = rest.slice(MAX)
      if (i === 0 && first) out.push(`${level} ${tag}${chunk ? ' ' + chunk : ''}`)
      else out.push(`${level + 1} ${first ? 'CONT' : 'CONC'}${chunk ? ' ' + chunk : ''}`)
      first = false
    } while (rest.length)
  })
  return out
}
const evLines = (tag: string, e: Event, force = false) =>
  e.date || e.place || force ? [`1 ${tag}`, ...(e.date ? [`2 DATE ${e.date}`] : []), ...(e.place ? [`2 PLAC ${e.place}`] : [])] : []

/** Serialises the tree as a GEDCOM 5.5.1 (UTF-8, lineage-linked) file. */
export function toGedcom(t: Tree, opts: { date?: string; source?: string } = {}): string {
  const ix = index(t)
  const L: string[] = ['0 HEAD', `1 SOUR ${opts.source ?? 'BROWSER_TOOLBOX'}`, '2 NAME Family Tree Builder', '1 GEDC', '2 VERS 5.5.1', '2 FORM LINEAGE-LINKED', '1 CHAR UTF-8']
  if (opts.date) L.push(`1 DATE ${opts.date}`)
  L.push('1 SUBM @U1@')
  for (const p of t.people) {
    L.push(`0 @${p.id}@ INDI`, `1 NAME ${p.given}${p.surname ? ` /${p.surname}/` : ''}`.trimEnd())
    if (p.given) L.push(`2 GIVN ${p.given}`)
    if (p.surname) L.push(`2 SURN ${p.surname}`)
    L.push(`1 SEX ${p.sex}`)
    L.push(...evLines('BIRT', p.birth), ...evLines('DEAT', p.death))
    for (const f of ix.childOf.get(p.id) ?? []) L.push(`1 FAMC @${f.id}@`)
    for (const f of ix.spouseIn.get(p.id) ?? []) L.push(`1 FAMS @${f.id}@`)
    if (p.notes) L.push(...textLines(1, 'NOTE', p.notes))
  }
  for (const f of t.families) {
    L.push(`0 @${f.id}@ FAM`)
    if (f.husb) L.push(`1 HUSB @${f.husb}@`)
    if (f.wife) L.push(`1 WIFE @${f.wife}@`)
    for (const c of f.children) L.push(`1 CHIL @${c}@`)
    L.push(...evLines('MARR', f.marr))
    if (f.div) L.push('1 DIV Y')
  }
  L.push('0 @U1@ SUBM', '1 NAME Family Tree Builder user', '0 TRLR')
  return L.join('\n') + '\n'
}

interface Node { level: number; xref?: string; tag: string; value: string; kids: Node[] }

/** Parses GEDCOM lines into a node tree (CONT/CONC are merged into the parent value). */
export function parseLines(text: string): Node[] {
  const roots: Node[] = []
  const stack: Node[] = []
  for (const raw of text.replace(/^﻿/, '').split(/\r\n|\r|\n/)) {
    const m = /^\s*(\d+)\s+(?:(@[^@]+@)\s+)?(\S+)(?: (.*))?$/.exec(raw)
    if (!m) continue
    const level = +m[1]
    const node: Node = { level, xref: m[2]?.slice(1, -1), tag: m[3].toUpperCase(), value: m[4] ?? '', kids: [] }
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop()
    const parent = stack[stack.length - 1]
    if (parent && (node.tag === 'CONT' || node.tag === 'CONC')) {
      parent.value += (node.tag === 'CONT' ? '\n' : '') + node.value
      continue
    }
    if (parent) parent.kids.push(node)
    else if (level === 0) roots.push(node)
    else continue
    stack.push(node)
  }
  return roots
}

const kid = (n: Node, tag: string) => n.kids.find((k) => k.tag === tag)
const ptr = (v: string) => /^@([^@]+)@$/.exec(v.trim())?.[1]
const ev = (n?: Node): Event => ({ date: n ? (kid(n, 'DATE')?.value ?? '').trim() : '', place: n ? (kid(n, 'PLAC')?.value ?? '').trim() : '' })

/** Imports INDI and FAM records from GEDCOM text. Unknown tags are ignored. */
export function fromGedcom(text: string): Tree {
  const roots = parseLines(text)
  if (!roots.some((r) => r.tag === 'HEAD') && !roots.some((r) => r.tag === 'INDI')) throw new Error('This does not look like a GEDCOM file (no HEAD or INDI records).')
  const people: Person[] = []
  const families: Family[] = []
  for (const r of roots) {
    if (r.tag === 'INDI' && r.xref) {
      const nm = kid(r, 'NAME')
      const v = nm?.value ?? ''
      const sm = /\/([^/]*)\//.exec(v)
      const given = (kid(nm ?? r, 'GIVN')?.value ?? v.replace(/\/[^/]*\/?/, '')).replace(/\s+/g, ' ').trim()
      const surname = (kid(nm ?? r, 'SURN')?.value ?? sm?.[1] ?? '').trim()
      const sx = (kid(r, 'SEX')?.value ?? 'U').trim().toUpperCase()
      people.push({
        id: r.xref, given, surname, sex: sx === 'M' || sx === 'F' ? sx : 'U',
        birth: ev(kid(r, 'BIRT') ?? kid(r, 'CHR') ?? kid(r, 'BAPM')), death: ev(kid(r, 'DEAT') ?? kid(r, 'BURI')),
        notes: r.kids.filter((k) => k.tag === 'NOTE' && !ptr(k.value)).map((k) => k.value).join('\n'),
      })
    } else if (r.tag === 'FAM' && r.xref) {
      const h = kid(r, 'HUSB'), w = kid(r, 'WIFE')
      families.push({
        id: r.xref, husb: h ? ptr(h.value) : undefined, wife: w ? ptr(w.value) : undefined,
        children: r.kids.filter((k) => k.tag === 'CHIL').map((k) => ptr(k.value)).filter((x): x is string => !!x),
        marr: ev(kid(r, 'MARR')), div: !!kid(r, 'DIV'),
      })
    }
  }
  const ids = new Set(people.map((p) => p.id))
  for (const f of families) {
    if (f.husb && !ids.has(f.husb)) f.husb = undefined
    if (f.wife && !ids.has(f.wife)) f.wife = undefined
    f.children = f.children.filter((c) => ids.has(c))
  }
  return { people, families }
}

// ---------- relationships ----------

interface Anc { gen: number; fam: string | null }
export function ancestors(ix: Index, id: string): Map<string, Anc> {
  const out = new Map<string, Anc>([[id, { gen: 0, fam: null }]])
  const q = [id]
  while (q.length) {
    const p = q.shift()!
    const g = out.get(p)!.gen
    for (const f of ix.childOf.get(p) ?? [])
      for (const par of [f.husb, f.wife])
        if (par && !out.has(par)) {
          out.set(par, { gen: g + 1, fam: f.id })
          q.push(par)
        }
  }
  return out
}

const ORD = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth']
const ordinal = (n: number) => ORD[n] ?? `${n}th`
const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : n === 3 ? 'three times' : `${n} times`)
const greats = (k: number) => (k <= 0 ? '' : k === 1 ? 'great-' : k === 2 ? 'great-great-' : `${k}× great-`)

export interface Blood { label: string; gA: number; gB: number; half: boolean; via: string[] }

/** Blood relationship of B to A ("B is A's …"), or null. */
export function blood(ix: Index, a: string, b: string): Blood | null {
  if (a === b) return { label: 'same person', gA: 0, gB: 0, half: false, via: [a] }
  const A = ancestors(ix, a), B = ancestors(ix, b)
  let best = Infinity
  for (const [x, ia] of A) {
    const ib = B.get(x)
    if (ib && ia.gen + ib.gen < best) best = ia.gen + ib.gen
  }
  if (!Number.isFinite(best)) return null
  const common = [...A].filter(([x, ia]) => B.has(x) && ia.gen + B.get(x)!.gen === best)
  // prefer the pair with the smallest gap if several exist
  common.sort((p, q) => Math.abs(p[1].gen - B.get(p[0])!.gen) - Math.abs(q[1].gen - B.get(q[0])!.gen))
  const gA = common[0][1].gen, gB = B.get(common[0][0])!.gen
  const at = common.filter(([x, ia]) => ia.gen === gA && B.get(x)!.gen === gB)
  const half = gA > 0 && gB > 0 && !at.some(([x, ia]) => ia.fam === B.get(x)!.fam)
  const sex = ix.person.get(b)?.sex ?? 'U'
  const g = (m: string, f: string, n: string) => (sex === 'M' ? m : sex === 'F' ? f : n)
  const h = half ? 'half-' : ''
  let label: string
  if (gA === 0) label = gB === 1 ? g('son', 'daughter', 'child') : greats(gB - 2) + g('grandson', 'granddaughter', 'grandchild')
  else if (gB === 0) label = gA === 1 ? g('father', 'mother', 'parent') : greats(gA - 2) + g('grandfather', 'grandmother', 'grandparent')
  else if (gA === 1 && gB === 1) label = h + g('brother', 'sister', 'sibling')
  else if (gA === 1) label = h + greats(gB - 2) + g('nephew', 'niece', 'nibling')
  else if (gB === 1) label = h + greats(gA - 2) + g('uncle', 'aunt', 'aunt/uncle')
  else {
    const deg = Math.min(gA, gB) - 1, rem = Math.abs(gA - gB)
    label = `${half ? 'half ' : ''}${ordinal(deg)} cousin${rem ? ` ${times(rem)} removed` : ''}`
  }
  return { label, gA, gB, half, via: at.map(([x]) => x) }
}

export interface Relation { label: string; detail: string }

/** Names how B is related to A, including spouses and in-laws. */
export function relationship(t: Tree, a: string, b: string): Relation {
  const ix = index(t)
  const P = (id: string) => fullName(ix.person.get(id))
  const sexB = ix.person.get(b)?.sex ?? 'U'
  const g = (m: string, f: string, n: string) => (sexB === 'M' ? m : sexB === 'F' ? f : n)
  const r = blood(ix, a, b)
  if (r) {
    if (r.label === 'same person') return { label: 'the same person', detail: '' }
    const anc = r.via.map(P).join(' & ')
    const detail = r.gA === 0 || r.gB === 0
      ? `${r.gA + r.gB} generation${r.gA + r.gB > 1 ? 's' : ''} apart in a direct line.`
      : `Closest common ancestor${r.via.length > 1 ? 's' : ''}: ${anc} (${r.gA} generation${r.gA > 1 ? 's' : ''} up from ${P(a)}, ${r.gB} from ${P(b)}).${r.half ? ' They share only one ancestor of that couple, hence “half”.' : ''}`
    return { label: r.label, detail }
  }
  const spouses = (id: string) => (ix.spouseIn.get(id) ?? []).map((f) => ({ s: partner(f, id), f })).filter((x): x is { s: string; f: Family } => !!x.s)
  const sp = spouses(a).find((x) => x.s === b)
  if (sp) return { label: (sp.f.div ? 'former ' : '') + g('husband', 'wife', 'spouse'), detail: sp.f.marr.date ? `Married ${sp.f.marr.date}${sp.f.marr.place ? ` in ${sp.f.marr.place}` : ''}.` : 'Partners in a family record.' }
  for (const { s } of spouses(a)) {
    const x = blood(ix, s, b)
    if (!x) continue
    if (x.gA === 1 && x.gB === 0) return { label: g('father', 'mother', 'parent') + '-in-law', detail: `${P(b)} is a parent of ${P(a)}’s spouse ${P(s)}.` }
    if (x.gA === 1 && x.gB === 1) return { label: g('brother', 'sister', 'sibling') + '-in-law', detail: `${P(b)} is a sibling of ${P(a)}’s spouse ${P(s)}.` }
    if (x.gA === 0 && x.gB === 1) return { label: 'step' + g('son', 'daughter', 'child'), detail: `${P(b)} is a child of ${P(a)}’s spouse ${P(s)}.` }
    return { label: `spouse’s ${x.label}`, detail: `${P(b)} is the ${x.label} of ${P(a)}’s spouse ${P(s)}.` }
  }
  for (const { s } of spouses(b)) {
    const x = blood(ix, a, s)
    if (!x) continue
    if (x.gA === 1 && x.gB === 1) return { label: g('brother', 'sister', 'sibling') + '-in-law', detail: `${P(b)} is married to ${P(a)}’s sibling ${P(s)}.` }
    if (x.gA === 0 && x.gB === 1) return { label: g('son', 'daughter', 'child') + '-in-law', detail: `${P(b)} is married to ${P(a)}’s child ${P(s)}.` }
    if (x.gA === 1 && x.gB === 0) return { label: 'step' + g('father', 'mother', 'parent'), detail: `${P(b)} is married to ${P(a)}’s parent ${P(s)}.` }
    return { label: `${g('husband', 'wife', 'spouse')} of ${P(a)}’s ${x.label}`, detail: `${P(s)} is ${P(a)}’s ${x.label}.` }
  }
  return { label: 'no relationship found', detail: 'They are not connected by blood or by a single marriage in this tree.' }
}

// ---------- layouts ----------

export const BOX_W = 150, BOX_H = 54, GAP_X = 18, GAP_Y = 64
export interface Box { id: string; x: number; y: number; ghost?: string }
export interface Line { d: string; dashed?: boolean }
export interface Layout { boxes: Box[]; lines: Line[]; w: number; h: number }

const byBirth = (ix: Index) => (p: string, q: string) => (year(ix.person.get(p)?.birth.date ?? '') || 9999) - (year(ix.person.get(q)?.birth.date ?? '') || 9999)

/**
 * Descendant chart from `root`: each person is drawn with their partners (two partners sit either side,
 * more continue to the right), and each family's children hang under that couple's marriage line.
 */
export function descendantLayout(t: Tree, root: string, maxGen = 8): Layout {
  const ix = index(t)
  const boxes: Box[] = [], lines: Line[] = []
  const placed = new Set<string>()
  const unitW = (n: number) => n * BOX_W + (n - 1) * GAP_X
  interface U { id: string; fams: { f: Family; sp?: string; kids: U[] }[]; w: number; ref: boolean }
  function build(id: string, gen: number): U {
    if (placed.has(id)) return { id, fams: [], w: BOX_W, ref: true }
    placed.add(id)
    const fams = (ix.spouseIn.get(id) ?? []).map((f) => {
      const sp = partner(f, id)
      if (sp) placed.add(sp)
      return { f, sp, kids: [] as U[] }
    })
    for (const fm of fams) fm.kids = gen < maxGen ? [...fm.f.children].sort(byBirth(ix)).map((c) => build(c, gen + 1)) : []
    const self = unitW(1 + fams.filter((x) => x.sp).length)
    const kidsW = fams.flatMap((x) => x.kids).reduce((a, k, i) => a + k.w + (i ? GAP_X * 2 : 0), 0)
    return { id, fams, w: Math.max(self, kidsW), ref: false }
  }
  function place(u: U, x0: number, y: number) {
    const spouses = u.fams.filter((x) => x.sp)
    const kidsW = u.fams.flatMap((x) => x.kids).reduce((a, k, i) => a + k.w + (i ? GAP_X * 2 : 0), 0)
    const selfW = unitW(1 + spouses.length)
    const sx = x0 + (u.w - selfW) / 2
    // order in the row: [s1, P, s2] for two partners, otherwise [P, s1, s2, …]
    const row = spouses.length === 2 ? [spouses[0].sp!, u.id, spouses[1].sp!] : [u.id, ...spouses.map((x) => x.sp!)]
    const pos = new Map(row.map((id, i) => [id, sx + i * (BOX_W + GAP_X)]))
    row.forEach((id) => boxes.push({ id, x: pos.get(id)!, y, ghost: u.ref && id === u.id ? 'shown elsewhere' : undefined }))
    const px = pos.get(u.id)!
    let kx = x0 + (u.w - kidsW) / 2
    const cy = y + BOX_H / 2
    u.fams.forEach((fm, fi) => {
      let dropX: number, dropY: number
      if (fm.sp) {
        const qx = pos.get(fm.sp)!
        const [l, r] = px < qx ? [px, qx] : [qx, px]
        if (Math.abs(r - l) <= BOX_W + GAP_X + 1) {
          lines.push({ d: `M${l + BOX_W},${cy}H${r}`, dashed: fm.f.div })
          dropX = (l + BOX_W + r) / 2
          dropY = cy
        } else {
          const lift = 14 + fi * 6
          lines.push({ d: `M${l + BOX_W / 2},${y}V${y - lift}H${r + BOX_W / 2}V${y}`, dashed: fm.f.div })
          dropX = (l + r + BOX_W) / 2
          dropY = y - lift
        }
      } else {
        dropX = px + BOX_W / 2
        dropY = y + BOX_H
      }
      if (!fm.kids.length) return
      const ky = y + BOX_H + GAP_Y
      const bar = ky - GAP_Y / 2
      const centers: number[] = []
      fm.kids.forEach((k) => {
        place(k, kx, ky)
        centers.push(kx + k.w / 2 - (k.fams.filter((x) => x.sp).length === 2 ? 0 : (unitW(1 + k.fams.filter((x) => x.sp).length) - BOX_W) / 2))
        kx += k.w + GAP_X * 2
      })
      const lo = Math.min(dropX, ...centers), hi = Math.max(dropX, ...centers)
      lines.push({ d: `M${dropX},${dropY}V${bar}M${lo},${bar}H${hi}${centers.map((c) => `M${c},${bar}V${ky}`).join('')}` })
    })
  }
  const u = build(root, 0)
  place(u, 20, 40)
  const w = Math.max(...boxes.map((b) => b.x + BOX_W)) + 20
  const h = Math.max(...boxes.map((b) => b.y + BOX_H)) + 20
  return { boxes, lines, w, h }
}

/** Pedigree (ancestor) chart: focus person on the left, parents to the right, `gens` generations. */
export function pedigreeLayout(t: Tree, focus: string, gens = 4): Layout & { slots: { x: number; y: number; child: string; role: 'father' | 'mother' }[] } {
  const ix = index(t)
  const boxes: Box[] = [], lines: Line[] = []
  const slots: { x: number; y: number; child: string; role: 'father' | 'mother' }[] = []
  const rowH = BOX_H + 12
  const H = 2 ** (gens - 1) * rowH
  const colW = BOX_W + 46
  function go(id: string, g: number, lo: number, hi: number) {
    const y = (lo + hi) / 2 - BOX_H / 2
    const x = 20 + g * colW
    boxes.push({ id, x, y })
    if (g >= gens - 1) return
    const f = (ix.childOf.get(id) ?? [])[0]
    const mid = (lo + hi) / 2
    const kids: [string | undefined, number, number, 'father' | 'mother'][] = [[f?.husb, lo, mid, 'father'], [f?.wife, mid, hi, 'mother']]
    for (const [pid, a, b, role] of kids) {
      const cy = (a + b) / 2
      const nx = x + colW
      lines.push({ d: `M${x + BOX_W},${y + BOX_H / 2}H${x + BOX_W + 23}V${cy}H${nx}`, dashed: !pid })
      if (pid) go(pid, g + 1, a, b)
      else slots.push({ x: nx, y: cy - BOX_H / 2, child: id, role })
    }
  }
  go(focus, 0, 20, 20 + H)
  return { boxes, lines, slots, w: 20 + gens * colW, h: H + 40 }
}

// ---------- sample (invented family) ----------

const pe = (id: string, given: string, surname: string, sex: Sex, b: string, bp: string, d = '', dp = '', notes = ''): Person =>
  ({ id, given, surname, sex, birth: { date: b, place: bp }, death: { date: d, place: dp }, notes })
const fa = (id: string, husb: string | undefined, wife: string | undefined, children: string[], date = '', place = '', div = false): Family =>
  ({ id, husb, wife, children, marr: { date, place }, div })

/** A fictional five-generation family with a second marriage, half-siblings and cousins. */
export function sampleTree(): Tree {
  return {
    people: [
      pe('I1', 'Arthur', 'Penhallow', 'M', '3 FEB 1902', 'Falmouth, Cornwall', '11 NOV 1979', 'Falmouth, Cornwall', 'Boat builder. Kept a workshop on the harbour for forty years.'),
      pe('I2', 'Edith', 'Marlowe', 'F', 'ABT 1905', 'Penryn, Cornwall', '2 JUN 1990', 'Falmouth, Cornwall'),
      pe('I3', 'Walter', 'Penhallow', 'M', '14 JUL 1928', 'Falmouth, Cornwall', '30 JAN 2004', 'Exeter, Devon'),
      pe('I4', 'Margaret', 'Penhallow', 'F', '9 SEP 1931', 'Falmouth, Cornwall', '17 MAR 2019', 'Bristol, England'),
      pe('I5', 'Dorothy', 'Keane', 'F', '1930', 'Plymouth, Devon', '1962', 'Exeter, Devon'),
      pe('I6', 'Ruth', 'Abernathy', 'F', '22 APR 1934', 'Leeds, England', '2011', 'Exeter, Devon'),
      pe('I7', 'Henry', 'Tolliver', 'M', '1929', 'Bath, England', '2001', 'Bristol, England'),
      pe('I8', 'Peter', 'Penhallow', 'M', '5 MAY 1952', 'Exeter, Devon'),
      pe('I9', 'Susan', 'Penhallow', 'F', '18 OCT 1955', 'Exeter, Devon'),
      pe('I10', 'Daniel', 'Penhallow', 'M', '1 DEC 1965', 'Exeter, Devon', '', '', 'Half-brother of Peter and Susan (father’s second marriage).'),
      pe('I11', 'Alice', 'Tolliver', 'F', '1954', 'Bristol, England'),
      pe('I12', 'George', 'Tolliver', 'M', '1957', 'Bristol, England'),
      pe('I13', 'Linda', 'Osei', 'F', '1954', 'Manchester, England'),
      pe('I14', 'Raj', 'Varma', 'M', '1953', 'Leicester, England'),
      pe('I15', 'Frank', 'Moreau', 'M', '1950', 'Rouen, France'),
      pe('I16', 'Emma', 'Penhallow', 'F', '12 AUG 1980', 'Exeter, Devon'),
      pe('I17', 'Oliver', 'Penhallow', 'M', '1983', 'Exeter, Devon'),
      pe('I18', 'Nina', 'Varma', 'F', '1985', 'Leicester, England'),
      pe('I19', 'Chloe', 'Moreau', 'F', '1979', 'Bristol, England'),
      pe('I20', 'James', 'Whitcombe', 'M', '1977', 'Cardiff, Wales'),
      pe('I21', 'Lily', 'Whitcombe', 'F', '2008', 'Cardiff, Wales'),
      pe('I22', 'Sam', 'Penhallow', 'U', '2012', 'Exeter, Devon'),
    ],
    families: [
      fa('F1', 'I1', 'I2', ['I3', 'I4'], '1926', 'Falmouth, Cornwall'),
      fa('F2', 'I3', 'I5', ['I8', 'I9'], '1950', 'Exeter, Devon'),
      fa('F3', 'I3', 'I6', ['I10'], '1964', 'Exeter, Devon'),
      fa('F4', 'I7', 'I4', ['I11', 'I12'], '1953', 'Bristol, England'),
      fa('F5', 'I8', 'I13', ['I16', 'I17'], '1978', 'Exeter, Devon'),
      fa('F6', 'I14', 'I9', ['I18'], '1982', 'Leicester, England'),
      fa('F7', 'I15', 'I11', ['I19'], '1977', 'Bristol, England', true),
      fa('F8', 'I20', 'I19', ['I21'], '2005', 'Cardiff, Wales'),
      fa('F9', 'I10', undefined, ['I22']),
    ],
  }
}
