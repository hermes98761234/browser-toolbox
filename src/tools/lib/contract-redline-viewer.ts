// Contract redlining: paragraph alignment, word-level changes, accept/reject merging and DOCX output
// (visual redline or real Word tracked changes).
import { diffKeys, diffWords } from './text-diff-viewer'
import { makeZip } from './image-compressor'

export type SegT = 'eq' | 'del' | 'ins'
export interface Seg { t: SegT; text: string; change?: number }
export interface Para { kind: 'same' | 'mod' | 'add' | 'del'; old: string; new: string; segs: Seg[] }
export interface Change { id: number; para: number; kind: 'insert' | 'delete' | 'replace'; old: string; new: string; whole: boolean }
export type Decision = 'accept' | 'reject' | 'pending'

/** Paragraphs: non-empty lines (DOCX paragraphs arrive one per line), whitespace collapsed. */
export const paragraphs = (s: string) => s.replace(/\r\n?/g, '\n').split('\n').map((x) => x.replace(/[ \t ]+/g, ' ').trim()).filter(Boolean)

/** Dice coefficient over lower-cased word multisets (0–1). */
export function similarity(a: string, b: string): number {
  const wa = a.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [], wb = b.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
  if (!wa.length && !wb.length) return 1
  const m = new Map<string, number>()
  for (const w of wa) m.set(w, (m.get(w) ?? 0) + 1)
  let hit = 0
  for (const w of wb) {
    const n = m.get(w) ?? 0
    if (n > 0) { hit++; m.set(w, n - 1) }
  }
  return (2 * hit) / (wa.length + wb.length)
}

/**
 * Aligns paragraphs: exact matches via Myers diff, then inside each changed block old and new paragraphs are
 * paired in order when they are similar enough (a modified clause); the rest are whole insertions/deletions.
 */
export function align(oldText: string, newText: string, threshold = 0.4): Para[] {
  const A = paragraphs(oldText), B = paragraphs(newText)
  const ops = diffKeys(A, B)
  const out: Para[] = []
  let i = 0
  while (i < ops.length) {
    if (ops[i].t === 'eq') {
      out.push({ kind: 'same', old: A[ops[i].a], new: B[ops[i].b], segs: [{ t: 'eq', text: A[ops[i].a] }] })
      i++
      continue
    }
    const dels: string[] = [], ins: string[] = []
    while (i < ops.length && ops[i].t !== 'eq') {
      if (ops[i].t === 'del') dels.push(A[ops[i].a])
      else ins.push(B[ops[i].b])
      i++
    }
    let j = 0
    for (const d of dels) {
      let k = -1, best = threshold
      for (let x = j; x < ins.length; x++) {
        const sim = similarity(d, ins[x])
        if (sim >= best) { best = sim; k = x }
        if (sim > 0.85) break
      }
      if (k < 0) { out.push({ kind: 'del', old: d, new: '', segs: [{ t: 'del', text: d }] }); continue }
      for (; j < k; j++) out.push({ kind: 'add', old: '', new: ins[j], segs: [{ t: 'ins', text: ins[j] }] })
      out.push({ kind: 'mod', old: d, new: ins[k], segs: diffWords(d, ins[k]).map((p) => ({ t: p.t, text: p.text })) })
      j = k + 1
    }
    for (; j < ins.length; j++) out.push({ kind: 'add', old: '', new: ins[j], segs: [{ t: 'ins', text: ins[j] }] })
  }
  return number(out)
}

/**
 * Numbers the changes. Adjacent deletions/insertions form one change; a short whitespace/punctuation-only equal run
 * between two edits is absorbed so "a b" → "x y" is one replacement rather than two.
 */
function number(paras: Para[]): Para[] {
  let id = 0
  return paras.map((p) => {
    if (p.kind === 'same') return p
    const segs = p.segs.map((s) => ({ ...s }))
    let open = false
    for (let k = 0; k < segs.length; k++) {
      const s = segs[k]
      if (s.t === 'eq') {
        const bridge = /^[^\p{L}\p{N}]{1,3}$/u.test(s.text) && open && segs[k + 1] && segs[k + 1].t !== 'eq'
        if (bridge) { s.change = id; continue }
        open = false
        continue
      }
      if (!open) { id++; open = true }
      s.change = id
    }
    return { ...p, segs }
  })
}

export function changes(paras: Para[]): Change[] {
  const map = new Map<number, Change>()
  paras.forEach((p, pi) => {
    for (const s of p.segs) {
      if (s.change === undefined) continue
      let c = map.get(s.change)
      if (!c) { c = { id: s.change, para: pi, kind: 'replace', old: '', new: '', whole: p.kind === 'add' || p.kind === 'del' }; map.set(s.change, c) }
      if (s.t !== 'ins') c.old += s.text
      if (s.t !== 'del') c.new += s.text
    }
  })
  for (const c of map.values()) {
    c.old = c.old.trim()
    c.new = c.new.trim()
    c.kind = !c.old ? 'insert' : !c.new ? 'delete' : 'replace'
  }
  return [...map.values()]
}

const accepted = (d: Record<number, Decision>, id: number | undefined, pending: 'accept' | 'reject') => {
  const v = id === undefined ? 'accept' : d[id] ?? 'pending'
  return v === 'pending' ? pending === 'accept' : v === 'accept'
}

/** Clean text after decisions: accepted changes take the new wording, rejected ones keep the old. */
export function merge(paras: Para[], d: Record<number, Decision>, pending: 'accept' | 'reject' = 'accept'): string {
  const out: string[] = []
  for (const p of paras) {
    let s = ''
    for (const g of p.segs) {
      if (g.t === 'eq') s += g.text
      else if (g.t === 'ins' && accepted(d, g.change, pending)) s += g.text
      else if (g.t === 'del' && !accepted(d, g.change, pending)) s += g.text
    }
    s = s.replace(/ {2,}/g, ' ').trim()
    if (s) out.push(s)
  }
  return out.join('\n\n')
}

export function stats(paras: Para[]) {
  let added = 0, deleted = 0, same = 0
  const wc = (s: string) => (s.match(/[\p{L}\p{N}]+/gu) ?? []).length
  for (const p of paras) for (const g of p.segs) {
    if (g.t === 'ins') added += wc(g.text)
    else if (g.t === 'del') deleted += wc(g.text)
    else same += wc(g.text)
  }
  return { added, deleted, same, changedParas: paras.filter((p) => p.kind !== 'same').length, paras: paras.length, share: (added + deleted) / Math.max(1, same + deleted + added) }
}

const xe = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export interface DocxOpts { tracked: boolean; author: string; date: string; title: string }

/** WordprocessingML body. tracked = real revisions (w:ins / w:del) Word can accept or reject; otherwise coloured strike/underline. */
export function redlineXml(paras: Para[], o: DocxOpts): string {
  const font = '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="22"/>'
  let rev = 1
  const attrs = () => `w:id="${rev++}" w:author="${xe(o.author || 'Redline')}" w:date="${xe(o.date)}"`
  const run = (t: string, rpr = '', del = false) => `<w:r><w:rPr>${font}${rpr}</w:rPr><w:${del ? 'delText' : 't'} xml:space="preserve">${xe(t)}</w:${del ? 'delText' : 't'}></w:r>`
  const body: string[] = []
  if (o.title) body.push(`<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="240"/></w:pPr>${run(o.title, '<w:b/><w:sz w:val="28"/>')}</w:p>`)
  for (const p of paras) {
    const runs = p.segs.map((g) => {
      if (g.t === 'eq') return run(g.text)
      if (o.tracked) return g.t === 'del' ? `<w:del ${attrs()}>${run(g.text, '', true)}</w:del>` : `<w:ins ${attrs()}>${run(g.text)}</w:ins>`
      return g.t === 'del' ? run(g.text, '<w:strike/><w:color w:val="C00000"/>') : run(g.text, '<w:u w:val="double"/><w:color w:val="0033CC"/>')
    }).join('')
    const mark = o.tracked && (p.kind === 'add' || p.kind === 'del') ? `<w:rPr><w:${p.kind === 'add' ? 'ins' : 'del'} ${attrs()}/></w:rPr>` : ''
    body.push(`<w:p><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/><w:jc w:val="both"/>${mark}</w:pPr>${runs}</w:p>`)
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`
}

export function docxPackage(documentXml: string): Uint8Array {
  const enc = new TextEncoder()
  return makeZip([
    { name: '[Content_Types].xml', data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>') },
    { name: '_rels/.rels', data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>') },
    { name: 'word/document.xml', data: enc.encode(documentXml) },
  ])
}

/** Plain paragraphs as a DOCX body (for the clean, merged version). */
export function plainXml(text: string, title: string): string {
  return redlineXml(paragraphs(text).map((t) => ({ kind: 'same', old: t, new: t, segs: [{ t: 'eq', text: t }] })), { tracked: false, author: '', date: '', title })
}
