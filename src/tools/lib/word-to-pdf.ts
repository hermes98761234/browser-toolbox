// DOCX → document model → PDF (pdf-lib, standard fonts) and HTML preview. No Mammoth / html2pdf.
import { unzip } from './excel-to-csv'
import { zipStore } from './pdf-splitter'

// ---------- tiny XML parser ----------

export interface XNode { n: string; a: Record<string, string>; c: XNode[]; t?: string }

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
export const unesc = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENT[e] ?? m)))

export function parseXml(src: string): XNode {
  const root: XNode = { n: '#root', a: {}, c: [] }
  const stack = [root]
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    const top = stack[stack.length - 1]
    if (m[6] !== undefined) top.c.push({ n: '#text', a: {}, c: [], t: unesc(m[6]) })
    else if (m[1] !== undefined) top.c.push({ n: '#text', a: {}, c: [], t: m[1] })
    else if (m[3]) {
      if (m[2]) {
        if (stack.length > 1) stack.pop()
        continue
      }
      const a: Record<string, string> = {}
      for (const am of m[4].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) a[am[1]] = unesc(am[2] ?? am[3])
      const node: XNode = { n: m[3], a, c: [] }
      top.c.push(node)
      if (!m[5]) stack.push(node)
    }
  }
  return root
}
const kids = (x: XNode | undefined, n: string) => (x ? x.c.filter((c) => c.n === n) : [])
const kid = (x: XNode | undefined, n: string) => x?.c.find((c) => c.n === n)
function find(x: XNode, n: string): XNode | undefined {
  for (const c of x.c) {
    if (c.n === n) return c
    const f = find(c, n)
    if (f) return f
  }
}
const val = (x: XNode | undefined, attr = 'w:val') => x?.a[attr]
/** OOXML on/off property: present and not "0"/"false"/"none". */
const on = (x: XNode | undefined) => !!x && !['0', 'false', 'none', 'off'].includes(x.a['w:val'] ?? '')

// ---------- model ----------

export interface Run { text: string; b?: boolean; i?: boolean; u?: boolean; s?: boolean; color?: string; size?: number; br?: 'line' | 'page'; img?: { id: string; w: number; h: number }; sup?: boolean }
export type Align = 'left' | 'center' | 'right' | 'justify'
export interface Para { kind: 'p'; level: number; align: Align; runs: Run[]; list?: { label: string; ilvl: number }; indent: number; pageBreakBefore?: boolean; quote?: boolean }
export interface Cell { paras: Para[]; span: number; fill?: string }
export interface Tbl { kind: 'table'; grid: number[]; rows: { cells: Cell[]; header: boolean }[] }
export type Block = Para | Tbl
export interface Img { data: Uint8Array; type: 'png' | 'jpeg' | 'other'; name: string }
export interface Doc { blocks: Block[]; images: Record<string, Img>; page: { w: number; h: number; margin: number } | null; warnings: string[]; title: string }

/** level: 0 body, 1–6 headings, -1 title, -2 subtitle */
function styleLevels(stylesXml: string | undefined): Map<string, number> {
  const out = new Map<string, number>()
  if (!stylesXml) return out
  for (const st of kids(kid(parseXml(stylesXml), 'w:styles'), 'w:style')) {
    const id = st.a['w:styleId']
    const name = (val(kid(st, 'w:name')) ?? id ?? '').toLowerCase()
    const ol = val(find(st, 'w:outlineLvl') ?? { n: '', a: {}, c: [] })
    let lv = 0
    const h = /^heading\s*(\d)$/.exec(name)
    if (h) lv = +h[1]
    else if (name === 'title') lv = -1
    else if (name === 'subtitle') lv = -2
    else if (/quote/.test(name)) lv = -3
    else if (ol !== undefined && +ol < 6) lv = +ol + 1
    if (id) out.set(id, lv)
  }
  return out
}

interface LvlDef { fmt: string; text: string; start: number }
function numberingDefs(xml: string | undefined): Map<string, LvlDef[]> {
  const out = new Map<string, LvlDef[]>()
  if (!xml) return out
  const root = kid(parseXml(xml), 'w:numbering')
  const abs = new Map<string, LvlDef[]>()
  for (const an of kids(root, 'w:abstractNum')) {
    const lv: LvlDef[] = []
    for (const l of kids(an, 'w:lvl')) lv[+(l.a['w:ilvl'] ?? 0)] = { fmt: val(kid(l, 'w:numFmt')) ?? 'decimal', text: val(kid(l, 'w:lvlText')) ?? '%1.', start: +(val(kid(l, 'w:start')) ?? 1) }
    abs.set(an.a['w:abstractNumId'], lv)
  }
  for (const n of kids(root, 'w:num')) out.set(n.a['w:numId'], abs.get(val(kid(n, 'w:abstractNumId')) ?? '') ?? [])
  return out
}

export function roman(n: number): string {
  const t: [number, string][] = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]
  let s = ''
  for (const [v, r] of t) while (n >= v) { s += r; n -= v }
  return s
}
const letters = (n: number) => { let s = ''; while (n > 0) { s = String.fromCharCode(97 + ((n - 1) % 26)) + s; n = Math.floor((n - 1) / 26) } return s }
export function fmtNum(n: number, fmt: string): string {
  switch (fmt) {
    case 'lowerLetter': return letters(n)
    case 'upperLetter': return letters(n).toUpperCase()
    case 'lowerRoman': return roman(n)
    case 'upperRoman': return roman(n).toUpperCase()
    case 'decimalZero': return String(n).padStart(2, '0')
    default: return String(n)
  }
}
const BULLETS = ['•', '–', '·']

export async function parseDocx(buf: Uint8Array): Promise<Doc> {
  const files = await unzip(buf)
  const dec = new TextDecoder()
  const txt = (p: string) => { const f = files.get(p); return f ? dec.decode(f) : undefined }
  const main = txt('word/document.xml')
  if (!main) throw new Error('This ZIP has no word/document.xml — is it really a .docx file?')
  const levels = styleLevels(txt('word/styles.xml'))
  const nums = numberingDefs(txt('word/numbering.xml'))
  const rels = new Map<string, string>()
  const relXml = txt('word/_rels/document.xml.rels')
  if (relXml) for (const r of find(parseXml(relXml), 'Relationships')?.c ?? []) if (r.a.Id) rels.set(r.a.Id, r.a.Target)
  const warnings: string[] = []
  const images: Record<string, Img> = {}
  const counters = new Map<string, number[]>()
  let imgN = 0

  const loadImg = (rid: string | undefined): string | null => {
    const target = rid && rels.get(rid)
    if (!target) return null
    const path = target.startsWith('/') ? target.slice(1) : 'word/' + target.replace(/^\.\//, '')
    const data = files.get(path)
    if (!data) return null
    const id = `img${++imgN}`
    const type = data[0] === 0x89 && data[1] === 0x50 ? 'png' : data[0] === 0xff && data[1] === 0xd8 ? 'jpeg' : 'other'
    if (type === 'other') warnings.push(`Image ${path.split('/').pop()} is not PNG/JPEG — shown as a placeholder.`)
    images[id] = { data, type, name: path.split('/').pop() ?? id }
    return id
  }

  const runsOf = (x: XNode, out: Run[], skipDel = true) => {
    for (const c of x.c) {
      if (c.n === 'w:r') {
        const pr = kid(c, 'w:rPr')
        const u = kid(pr, 'w:u')
        const col = val(kid(pr, 'w:color'))
        const sz = val(kid(pr, 'w:sz'))
        const base: Run = {
          text: '', b: on(kid(pr, 'w:b')), i: on(kid(pr, 'w:i')), u: !!u && val(u) !== 'none', s: on(kid(pr, 'w:strike')) || on(kid(pr, 'w:dstrike')),
          color: col && col !== 'auto' && /^[0-9a-f]{6}$/i.test(col) ? '#' + col.toLowerCase() : undefined,
          size: sz ? +sz / 2 : undefined, sup: val(kid(pr, 'w:vertAlign')) === 'superscript',
        }
        const caps = on(kid(pr, 'w:caps'))
        for (const e of c.c) {
          if (e.n === 'w:t') out.push({ ...base, text: (caps ? (e.c[0]?.t ?? '').toUpperCase() : e.c[0]?.t ?? '') })
          else if (e.n === 'w:tab') out.push({ ...base, text: '\t' })
          else if (e.n === 'w:br' || e.n === 'w:cr') out.push({ ...base, br: e.a['w:type'] === 'page' ? 'page' : 'line' })
          else if (e.n === 'w:noBreakHyphen') out.push({ ...base, text: '-' })
          else if (e.n === 'w:sym') out.push({ ...base, text: '•' })
          else if (e.n === 'w:drawing' || e.n === 'w:pict' || e.n === 'mc:AlternateContent') {
            const blip = find(e, 'a:blip')
            const vimg = find(e, 'v:imagedata')
            const ext = find(e, 'wp:extent')
            const id = loadImg(blip?.a['r:embed'] ?? vimg?.a['r:id'])
            if (id) out.push({ ...base, img: { id, w: ext ? +ext.a.cx / 12700 : 240, h: ext ? +ext.a.cy / 12700 : 160 } })
          }
        }
      } else if (c.n === 'w:del' && skipDel) continue
      else if (['w:hyperlink', 'w:ins', 'w:smartTag', 'w:sdt', 'w:sdtContent', 'w:fldSimple', 'w:customXml'].includes(c.n)) runsOf(c, out)
    }
  }

  const para = (p: XNode): Para => {
    const pr = kid(p, 'w:pPr')
    const style = val(kid(pr, 'w:pStyle')) ?? ''
    let level = levels.get(style) ?? (/^heading(\d)$/i.exec(style) ? +style.slice(-1) : /^title$/i.test(style) ? -1 : 0)
    const ol = val(kid(pr, 'w:outlineLvl'))
    if (!level && ol !== undefined && +ol < 6) level = +ol + 1
    const jc = val(kid(pr, 'w:jc'))
    const align: Align = jc === 'center' ? 'center' : jc === 'right' || jc === 'end' ? 'right' : jc === 'both' || jc === 'distribute' ? 'justify' : 'left'
    const runs: Run[] = []
    runsOf(p, runs)
    const out: Para = { kind: 'p', level: level === -3 ? 0 : level, quote: level === -3, align, runs, indent: +(kid(pr, 'w:ind')?.a['w:left'] ?? kid(pr, 'w:ind')?.a['w:start'] ?? 0) / 20, pageBreakBefore: on(kid(pr, 'w:pageBreakBefore')) }
    const np = kid(pr, 'w:numPr')
    const numId = val(kid(np, 'w:numId'))
    if (numId && numId !== '0' && nums.has(numId)) {
      const ilvl = +(val(kid(np, 'w:ilvl')) ?? 0)
      const defs = nums.get(numId)!
      const d = defs[ilvl] ?? { fmt: 'bullet', text: '•', start: 1 }
      const cnt = counters.get(numId) ?? []
      cnt[ilvl] = (cnt[ilvl] ?? (d.start - 1)) + 1
      cnt.length = ilvl + 1
      counters.set(numId, cnt)
      const label = d.fmt === 'bullet' ? BULLETS[ilvl % 3] : d.fmt === 'none' ? '' : d.text.replace(/%(\d)/g, (_, k: string) => fmtNum(cnt[+k - 1] ?? defs[+k - 1]?.start ?? 1, defs[+k - 1]?.fmt ?? 'decimal'))
      out.list = { label, ilvl }
      if (!out.indent) out.indent = 18 * (ilvl + 1)
    }
    return out
  }

  const table = (t: XNode): Tbl => {
    const grid = kids(kid(t, 'w:tblGrid'), 'w:gridCol').map((g) => +(g.a['w:w'] ?? 0) / 20)
    const rows = kids(t, 'w:tr').map((tr) => ({
      header: on(kid(kid(tr, 'w:trPr'), 'w:tblHeader')),
      cells: kids(tr, 'w:tc').map((tc): Cell => {
        const pr = kid(tc, 'w:tcPr')
        const vm = kid(pr, 'w:vMerge')
        const fill = kid(pr, 'w:shd')?.a['w:fill']
        const paras: Para[] = []
        if (!(vm && vm.a['w:val'] !== 'restart')) for (const c of tc.c) {
          if (c.n === 'w:p') paras.push(para(c))
          else if (c.n === 'w:tbl') for (const r of kids(c, 'w:tr')) paras.push({ kind: 'p', level: 0, align: 'left', indent: 0, runs: [{ text: kids(r, 'w:tc').map((x) => textOf(x)).join(' | ') }] })
        }
        return { paras, span: +(val(kid(pr, 'w:gridSpan')) ?? 1), fill: fill && /^[0-9a-f]{6}$/i.test(fill) ? '#' + fill.toLowerCase() : undefined }
      }),
    }))
    const ncols = Math.max(grid.length, ...rows.map((r) => r.cells.reduce((a, c) => a + c.span, 0)))
    while (grid.length < ncols) grid.push(0)
    return { kind: 'table', grid, rows }
  }

  const body = find(parseXml(main), 'w:body')
  if (!body) throw new Error('word/document.xml has no <w:body>.')
  const blocks: Block[] = []
  const walk = (x: XNode) => {
    for (const c of x.c) {
      if (c.n === 'w:p') blocks.push(para(c))
      else if (c.n === 'w:tbl') blocks.push(table(c))
      else if (c.n === 'w:sdt' || c.n === 'w:sdtContent' || c.n === 'w:customXml') walk(c)
    }
  }
  walk(body)
  const sect = kid(body, 'w:sectPr')
  const pg = kid(sect, 'w:pgSz')
  const mar = kid(sect, 'w:pgMar')
  const page = pg ? { w: +pg.a['w:w'] / 20, h: +pg.a['w:h'] / 20, margin: mar ? +(mar.a['w:left'] ?? 1440) / 20 : 72 } : null
  const core = txt('docProps/core.xml')
  const title = core ? textOf(find(parseXml(core), 'dc:title') ?? { n: '', a: {}, c: [] }) : ''
  if (find(parseXml(main), 'm:oMath')) warnings.push('Equations (OMML) are not rendered.')
  return { blocks, images, page, warnings, title }
}

function textOf(x: XNode): string {
  return x.n === '#text' ? x.t ?? '' : x.n === 'w:tab' ? '\t' : x.c.map(textOf).join('')
}

export const paraText = (p: Para) => p.runs.map((r) => (r.br ? '\n' : r.text)).join('')

// ---------- PDF ----------

const WIN = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ')
const SUBST: Record<string, string> = { '−': '-', '‐': '-', '‑': '-', '→': '->', '←': '<-', '≤': '<=', '≥': '>=', '≠': '!=', '✓': 'v', '✔': 'v', ' ': ' ', ' ': ' ', ' ': ' ', ' ': ' ', ' ': ' ', '′': "'", '″': '"', '™': '™', '●': '•', '▪': '•', '∙': '·' }
/** Maps text to what the standard (WinAnsi) PDF fonts can draw; counts characters replaced with "?". */
export function winAnsi(s: string): { text: string; lost: number } {
  let lost = 0
  let out = ''
  for (const ch of s) {
    const c = ch.codePointAt(0)!
    if ((c >= 32 && c < 127) || (c >= 160 && c <= 255) || WIN.has(ch)) out += ch
    else if (SUBST[ch]) out += SUBST[ch]
    else {
      const base = ch.normalize('NFKD').replace(/[̀-ͯ]/g, '')
      if (base && [...base].every((b) => b.charCodeAt(0) >= 32 && b.charCodeAt(0) < 256)) out += base
      else if (c >= 32) { out += '?'; lost++ }
    }
  }
  return { text: out, lost }
}

export interface PdfOpts { family: 'Helvetica' | 'Times' | 'Courier'; size: number; paper: 'auto' | 'A4' | 'Letter'; margin: number; pageNumbers: boolean; lineHeight: number }
export const PAPER = { A4: [595.28, 841.89], Letter: [612, 792] } as const
export const HEAD_SCALE: Record<number, number> = { [-1]: 2.2, [-2]: 1.35, 1: 1.75, 2: 1.45, 3: 1.25, 4: 1.1, 5: 1, 6: 1 }
const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255]

interface Item { text: string; x: number; w: number; size: number; font: number; color?: string; u?: boolean; s?: boolean; rise: number }
interface Line { h: number; asc: number; items: Item[]; img?: { id: string; w: number; h: number; x: number }; brk?: boolean }
interface FontLike { widthOfTextAtSize: (t: string, s: number) => number }

/** Wraps a paragraph into lines of at most `width` points. fonts[i]: 0 regular, 1 bold, 2 italic, 3 bold-italic. */
export function layoutPara(p: Para, width: number, fonts: FontLike[], o: Pick<PdfOpts, 'size' | 'lineHeight'>, stat = { lost: 0 }): Line[] {
  const heading = p.level !== 0
  const scale = HEAD_SCALE[p.level] ?? 1
  const lines: Line[] = []
  const indent = Math.min(p.indent, width * 0.5)
  const avail = width - indent
  let cur: Item[] = []
  let x = 0
  const strong = heading && p.level !== -2
  const fi = (r: Run) => (r.b || strong ? 1 : 0) + (r.i || p.level === -2 || p.quote ? 2 : 0)
  const fs = (r: Run) => (r.size ?? o.size) * (r.size && heading ? 1 : scale) * (r.sup ? 0.65 : 1)
  const flush = (last: boolean, brk = false) => {
    while (cur.length && cur[cur.length - 1].w > 0 && !cur[cur.length - 1].text.trim()) x -= cur.pop()!.w
    const mx = cur.reduce((a, it) => Math.max(a, it.size), (p.runs.find((r) => r.size)?.size ?? o.size) * scale)
    const extra = Math.max(0, avail - x)
    const spaces = cur.filter((it) => it.w > 0 && !it.text.trim()).length
    const just = p.align === 'justify' && !last && spaces > 0
    const dx = p.align === 'center' ? extra / 2 : p.align === 'right' ? extra : 0
    let shift = 0
    for (const it of cur) {
      it.x += indent + dx + shift
      if (just && it.w > 0 && !it.text.trim()) { it.w += extra / spaces; shift += extra / spaces }
    }
    lines.push({ h: mx * o.lineHeight, asc: mx * 0.95, items: cur, brk })
    cur = []
    x = 0
  }
  const push = (text: string, r: Run) => {
    const size = fs(r)
    const w = fonts[fi(r)].widthOfTextAtSize(text, size)
    cur.push({ text, x, w, size, font: fi(r), color: r.color ?? (heading ? '#1f3864' : p.quote ? '#555555' : undefined), u: r.u, s: r.s, rise: r.sup ? size * 0.5 : 0 })
    x += w
  }
  if (p.list?.label) {
    const r = p.runs[0] ?? { text: '' }
    const lab = winAnsi(p.list.label).text
    const size = (r.size ?? o.size) * scale
    const lf = strong ? 1 : 0
    const w = fonts[lf].widthOfTextAtSize(lab, size)
    cur.push({ text: lab, x: -Math.max(14, w + 5), w: 0, size, font: lf, rise: 0 })
  }
  for (const r of p.runs) {
    if (r.br) { flush(true, r.br === 'page'); continue }
    if (r.img) {
      if (cur.length) flush(true)
      const sc = Math.min(1, avail / r.img.w)
      const iw = r.img.w * sc
      lines.push({ h: r.img.h * sc + 4, asc: 0, items: [], img: { id: r.img.id, w: iw, h: r.img.h * sc, x: indent + (p.align === 'center' ? (avail - iw) / 2 : p.align === 'right' ? avail - iw : 0) } })
      continue
    }
    const conv = winAnsi(r.text.replace(/\t/g, '    '))
    stat.lost += conv.lost
    for (const tok of conv.text.match(/\s+|\S+/g) ?? []) {
      const w = fonts[fi(r)].widthOfTextAtSize(tok, fs(r))
      const word = tok.trim() !== ''
      if (!word && cur.length === 0) continue
      if (word && x + w > avail && cur.some((it) => it.w > 0 && it.text.trim())) flush(false)
      if (word && w > avail) {
        // a single word longer than the line: hard-split by characters
        let part = ''
        for (const ch of tok) {
          if (part && x + fonts[fi(r)].widthOfTextAtSize(part + ch, fs(r)) > avail) { push(part, r); flush(false); part = '' }
          part += ch
        }
        if (part) push(part, r)
        continue
      }
      push(tok, r)
    }
  }
  if (cur.length || !lines.length) flush(true)
  return lines
}

export async function buildPdf(doc: Doc, o: PdfOpts): Promise<{ bytes: Uint8Array; pages: number; lost: number; clipped: number }> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const pdf = await PDFDocument.create()
  pdf.setTitle(doc.title || 'Converted document')
  pdf.setProducer('Browser Toolbox — Word to PDF')
  const F = { Helvetica: ['Helvetica', 'HelveticaBold', 'HelveticaOblique', 'HelveticaBoldOblique'], Times: ['TimesRoman', 'TimesRomanBold', 'TimesRomanItalic', 'TimesRomanBoldItalic'], Courier: ['Courier', 'CourierBold', 'CourierOblique', 'CourierBoldOblique'] }[o.family] as (keyof typeof StandardFonts)[]
  const fonts = await Promise.all(F.map((f) => pdf.embedFont(StandardFonts[f])))
  const [PW, PH] = o.paper === 'auto' && doc.page ? [doc.page.w, doc.page.h] : PAPER[o.paper === 'auto' ? 'A4' : o.paper]
  const M = o.margin
  const W = PW - 2 * M
  const embedded = new Map<string, Awaited<ReturnType<typeof pdf.embedPng>>>()
  for (const [id, im] of Object.entries(doc.images)) {
    try {
      if (im.type === 'png') embedded.set(id, await pdf.embedPng(im.data))
      else if (im.type === 'jpeg') embedded.set(id, await pdf.embedJpg(im.data))
    } catch { /* broken image → placeholder */ }
  }
  const stat = { lost: 0 }
  let clipped = 0
  let page = pdf.addPage([PW, PH])
  let y = PH - M
  const newPage = () => { page = pdf.addPage([PW, PH]); y = PH - M }
  const atTop = () => y >= PH - M - 0.5

  const drawLine = (ln: Line, x0: number, top: number) => {
    if (ln.img) {
      x0 += ln.img.x
      const e = embedded.get(ln.img.id)
      if (e) page.drawImage(e, { x: x0, y: top - ln.img.h, width: ln.img.w, height: ln.img.h })
      else {
        page.drawRectangle({ x: x0, y: top - ln.img.h, width: ln.img.w, height: ln.img.h, borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 0.8, color: rgb(0.95, 0.95, 0.95) })
        page.drawText(`[image: ${winAnsi(doc.images[ln.img.id]?.name ?? '').text}]`, { x: x0 + 6, y: top - 14, size: 9, font: fonts[2], color: rgb(0.4, 0.4, 0.4) })
      }
      return
    }
    const base = top - ln.asc
    for (const it of ln.items) {
      const c = it.color ? rgb(...hex(it.color)) : rgb(0.1, 0.1, 0.1)
      const space = !it.text.trim()
      if (!space) page.drawText(it.text, { x: x0 + it.x, y: base + it.rise, size: it.size, font: fonts[it.font], color: c })
      const tw = space ? it.w : fonts[it.font].widthOfTextAtSize(it.text, it.size)
      if (it.u) page.drawLine({ start: { x: x0 + it.x, y: base - it.size * 0.12 }, end: { x: x0 + it.x + tw, y: base - it.size * 0.12 }, thickness: it.size * 0.06, color: c })
      if (it.s) page.drawLine({ start: { x: x0 + it.x, y: base + it.size * 0.3 }, end: { x: x0 + it.x + tw, y: base + it.size * 0.3 }, thickness: it.size * 0.06, color: c })
    }
  }

  for (const b of doc.blocks) {
    if (b.kind === 'p') {
      if (b.pageBreakBefore && !atTop()) newPage()
      const scale = HEAD_SCALE[b.level] ?? 1
      if (b.level > 0 && !atTop()) y -= o.size * scale * 0.7
      const lines = layoutPara(b, W, fonts, o, stat)
      for (const ln of lines) {
        if (ln.img && ln.h > PH - 2 * M) { const k = (PH - 2 * M - 4) / ln.img.h; ln.img = { ...ln.img, w: ln.img.w * k, h: ln.img.h * k }; ln.h = ln.img.h + 4 }
        if (y - ln.h < M && !atTop()) newPage()
        drawLine(ln, M, y)
        y -= ln.h
        if (ln.brk) newPage()
      }
      if (b.level === -1) page.drawLine({ start: { x: M, y: y - 3 }, end: { x: M + W, y: y - 3 }, thickness: 1, color: rgb(0.12, 0.22, 0.39) })
      y -= b.list ? o.size * 0.25 : o.size * (b.level === -1 ? 1.1 : 0.6)
    } else {
      const total = b.grid.reduce((a, g) => a + g, 0)
      const cw = total > 0 && b.grid.every((g) => g > 0) ? b.grid.map((g) => (g / total) * Math.min(W, Math.max(total, W * 0.5))) : b.grid.map(() => W / b.grid.length)
      const pad = 4
      const cellSize = { ...o, size: o.size * 0.92 }
      const header = b.rows[0]?.header ? b.rows[0] : null
      const layoutRow = (row: (typeof b.rows)[number]) => {
        let col = 0
        return row.cells.map((c) => {
          const w = cw.slice(col, col + c.span).reduce((a, x) => a + x, 0)
          const x = cw.slice(0, col).reduce((a, x) => a + x, 0)
          col += c.span
          const lines = c.paras.flatMap((p, i) => {
            const ls = layoutPara({ ...p, indent: p.list ? 12 : 0 }, w - 2 * pad, fonts, cellSize, stat)
            if (i < c.paras.length - 1 && ls.length) ls[ls.length - 1] = { ...ls[ls.length - 1], h: ls[ls.length - 1].h + 2 }
            return ls
          })
          return { c, w, x, lines, h: lines.reduce((a, l) => a + l.h, 0) + 2 * pad }
        })
      }
      const drawRow = (cells: ReturnType<typeof layoutRow>, bold: boolean) => {
        let rh = Math.max(16, ...cells.map((c) => c.h))
        if (y - rh < M && !atTop()) {
          newPage()
          if (header && !bold) drawRow(layoutRow(header), true)
        }
        if (rh > PH - 2 * M) { rh = PH - 2 * M; clipped++ }
        for (const cell of cells) {
          if (cell.c.fill && cell.c.fill !== '#ffffff') page.drawRectangle({ x: M + cell.x, y: y - rh, width: cell.w, height: rh, color: rgb(...hex(cell.c.fill)) })
          page.drawRectangle({ x: M + cell.x, y: y - rh, width: cell.w, height: rh, borderColor: rgb(0.55, 0.55, 0.55), borderWidth: 0.6 })
          let ty = y - pad
          for (const ln of cell.lines) {
            if (ty - ln.h < y - rh) break
            drawLine(ln, M + cell.x + pad, ty)
            ty -= ln.h
          }
        }
        y -= rh
      }
      for (const row of b.rows) drawRow(layoutRow(row), row === header)
      y -= o.size * 0.8
    }
  }
  const n = pdf.getPageCount()
  if (o.pageNumbers) pdf.getPages().forEach((pg, i) => {
    const t = `Page ${i + 1} of ${n}`
    pg.drawText(t, { x: PW / 2 - fonts[0].widthOfTextAtSize(t, 8.5) / 2, y: M / 2 - 4, size: 8.5, font: fonts[0], color: rgb(0.45, 0.45, 0.45) })
  })
  return { bytes: await pdf.save(), pages: n, lost: stat.lost, clipped }
}

// ---------- HTML preview ----------

const he = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const CSS_FAMILY = { Helvetica: 'Helvetica, Arial, sans-serif', Times: '"Times New Roman", Times, serif', Courier: '"Courier New", Courier, monospace' }

export function toHtml(doc: Doc, o: PdfOpts, imgUrl: (id: string) => string): string {
  const runHtml = (r: Run) => {
    if (r.br) return r.br === 'page' ? '<hr class="pb">' : '<br>'
    if (r.img) return `<img src="${imgUrl(r.img.id)}" alt="${he(doc.images[r.img.id]?.name ?? '')}" style="width:${r.img.w}pt;max-width:100%">`
    let s = he(r.text).replace(/\t/g, '&emsp;')
    const st = [r.color && `color:${r.color}`, r.size && `font-size:${r.size}pt`].filter(Boolean).join(';')
    if (st) s = `<span style="${st}">${s}</span>`
    if (r.b) s = `<b>${s}</b>`
    if (r.i) s = `<i>${s}</i>`
    if (r.u) s = `<u>${s}</u>`
    if (r.s) s = `<s>${s}</s>`
    if (r.sup) s = `<sup>${s}</sup>`
    return s
  }
  const paraHtml = (p: Para) => {
    const tag = p.level > 0 ? `h${p.level}` : p.level === -1 ? 'h1' : 'p'
    const cls = p.level === -1 ? ' class="title"' : p.level === -2 ? ' class="subtitle"' : p.quote ? ' class="quote"' : ''
    const st = [`text-align:${p.align}`, p.indent && `padding-left:${p.indent}pt`, p.pageBreakBefore && 'break-before:page'].filter(Boolean).join(';')
    const lab = p.list?.label ? `<span class="lab">${he(p.list.label)}</span>` : ''
    return `<${tag}${cls} style="${st}">${lab}${p.runs.map(runHtml).join('') || '&nbsp;'}</${tag}>`
  }
  const body = doc.blocks.map((b) => {
    if (b.kind === 'p') return paraHtml(b)
    const total = b.grid.reduce((a, g) => a + g, 0) || 1
    return `<table><colgroup>${b.grid.map((g) => `<col style="width:${((g || total / b.grid.length) / total) * 100}%">`).join('')}</colgroup>${b.rows.map((r) => `<tr>${r.cells.map((c) => `<td colspan="${c.span}"${c.fill ? ` style="background:${c.fill}"` : ''}>${c.paras.map(paraHtml).join('')}</td>`).join('')}</tr>`).join('')}</table>`
  }).join('\n')
  const [PW] = o.paper === 'auto' && doc.page ? [doc.page.w] : PAPER[o.paper === 'auto' ? 'A4' : o.paper]
  return `<!doctype html><html><head><meta charset="utf-8"><title>${he(doc.title || 'Document')}</title><style>
@page{margin:${o.margin}pt}
html{background:#e5e7eb}body{margin:0;padding:16px 0;font-family:${CSS_FAMILY[o.family]};font-size:${o.size}pt;line-height:${o.lineHeight};color:#1a1a1a}
.page{background:#fff;width:${PW}pt;max-width:calc(100% - 16px);box-sizing:border-box;margin:0 auto;padding:${o.margin}pt;box-shadow:0 2px 12px #0002}
p{margin:0 0 .6em}h1,h2,h3,h4,h5,h6{color:#1f3864;margin:.9em 0 .4em;line-height:1.2}h1{font-size:1.75em}h2{font-size:1.45em}h3{font-size:1.25em}h4{font-size:1.1em}h5,h6{font-size:1em}
.title{font-size:2.2em;border-bottom:1px solid #1f3864;padding-bottom:4px;margin-top:0}.subtitle{font-style:italic;color:#1f3864;font-size:1.35em}.quote{font-style:italic;color:#555}
.lab{display:inline-block;min-width:14pt;margin-left:-18pt;padding-right:4pt;text-align:right}
table{border-collapse:collapse;width:100%;margin:0 0 1em;font-size:.92em}td{border:.6pt solid #8c8c8c;padding:4pt;vertical-align:top}td p{margin:0 0 .2em}
img{display:block;margin:4pt 0}hr.pb{border:0;border-top:1px dashed #bbb;margin:18pt 0}
@media print{html{background:#fff}body{padding:0}.page{box-shadow:none;padding:0;width:auto;max-width:none}hr.pb{border:0;break-after:page;margin:0}}
</style></head><body><div class="page">${body}</div></body></html>`
}

// ---------- sample DOCX ----------

const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"'
const x = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
type R = string | { t: string; b?: 1; i?: 1; u?: 1; c?: string }
const run = (r: R) => (typeof r === 'string' ? `<w:r><w:t xml:space="preserve">${x(r)}</w:t></w:r>` : `<w:r><w:rPr>${r.b ? '<w:b/>' : ''}${r.i ? '<w:i/>' : ''}${r.u ? '<w:u w:val="single"/>' : ''}${r.c ? `<w:color w:val="${r.c}"/>` : ''}</w:rPr><w:t xml:space="preserve">${x(r.t)}</w:t></w:r>`)
const p = (runs: R[], o: { style?: string; jc?: string; num?: [number, number]; pb?: 1 } = {}) =>
  `<w:p><w:pPr>${o.style ? `<w:pStyle w:val="${o.style}"/>` : ''}${o.pb ? '<w:pageBreakBefore/>' : ''}${o.num ? `<w:numPr><w:ilvl w:val="${o.num[1]}"/><w:numId w:val="${o.num[0]}"/></w:numPr>` : ''}${o.jc ? `<w:jc w:val="${o.jc}"/>` : ''}</w:pPr>${runs.map(run).join('')}</w:p>`

/** Builds a demo .docx exercising headings, inline styles, lists, a table, an image and a page break. */
export function sampleDocx(png?: Uint8Array): Uint8Array {
  const enc = new TextEncoder()
  const cell = (t: string, head = false) => `<w:tc><w:tcPr>${head ? '<w:shd w:val="clear" w:fill="DCE6F2"/>' : ''}</w:tcPr>${p([head ? { t, b: 1 } : t])}</w:tc>`
  const rows = [['Site', 'Visits', 'Issues found', 'Status'], ['North depot', '4', '2', 'Resolved'], ['Harbour office', '3', '5', 'In progress'], ['Hill station', '2', '0', 'Clear']]
  const tbl = `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid>${[3200, 1600, 2000, 2200].map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${rows.map((r, i) => `<w:tr>${i === 0 ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${r.map((c) => cell(c, i === 0)).join('')}</w:tr>`).join('')}</w:tbl>`
  const img = png ? `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline><wp:extent cx="${300 * 12700}" cy="${150 * 12700}"/><wp:docPr id="1" name="Chart"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:blipFill><a:blip r:embed="rIdImg1"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>` : ''
  const body = [
    p(['Quarterly Field Report'], { style: 'Title' }),
    p([{ t: 'Prepared by the operations team · third quarter', i: 1 }], { style: 'Subtitle' }),
    p(['Summary'], { style: 'Heading1' }),
    p(['This quarter the team visited ', { t: 'nine sites', b: 1 }, ' across three regions. Most findings were minor and were fixed on the spot; one item at the harbour office still ', { t: 'needs a follow-up', u: 1 }, '. Overall equipment health is ', { t: 'good', c: '2E7D32', b: 1 }, ', and response times improved compared with the previous period.'], { jc: 'both' }),
    p(['Highlights'], { style: 'Heading2' }),
    p(['Average repair time fell from 3.4 to 2.1 days.'], { num: [1, 0] }),
    p(['Two new technicians completed their field training.'], { num: [1, 0] }),
    p(['Both worked mainly at the north depot.'], { num: [1, 1] }),
    p(['Spare-part stock is now tracked weekly.'], { num: [1, 0] }),
    p(['Next steps'], { style: 'Heading2' }),
    p(['Close the open harbour office ticket.'], { num: [2, 0] }),
    p(['Schedule the annual inspection at the hill station.'], { num: [2, 0] }),
    p([{ t: 'Share this report', i: 1 }, ' with regional leads before the planning meeting.'], { num: [2, 0] }),
    p(['Visits by site'], { style: 'Heading2' }),
    tbl,
    img,
    png ? p([{ t: 'Figure 1. Visits per month (sample chart drawn in the browser).', i: 1 }], { jc: 'center' }) : '',
    p(['Appendix'], { style: 'Heading1', pb: 1 }),
    p(['Method'], { style: 'Heading2' }),
    p(['Each visit followed the same checklist: a visual inspection, a test of every safety switch, a check of the spare-part shelf and a short interview with the person in charge of the site. Findings were logged on a tablet and reviewed the same evening. Items that could not be fixed during the visit received a ticket with an owner and a due date. This appendix exists mainly to show how longer justified text wraps across the page width in the converted PDF.'], { jc: 'both' }),
    p(['Contact: ', { t: 'operations@example.com', u: 1, c: '1F5FBF' }]),
  ].join('')
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W_NS}><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`
  const style = (id: string, name: string, ol?: number) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/>${ol !== undefined ? `<w:pPr><w:outlineLvl w:val="${ol}"/></w:pPr>` : ''}</w:style>`
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W_NS}>${style('Normal', 'Normal')}${style('Title', 'Title')}${style('Subtitle', 'Subtitle')}${style('Heading1', 'heading 1', 0)}${style('Heading2', 'heading 2', 1)}</w:styles>`
  const lvl = (i: number, fmt: string, text: string) => `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${text}"/></w:lvl>`
  const numbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering ${W_NS}><w:abstractNum w:abstractNumId="0">${lvl(0, 'bullet', '•')}${lvl(1, 'bullet', 'o')}</w:abstractNum><w:abstractNum w:abstractNumId="1">${lvl(0, 'decimal', '%1.')}${lvl(1, 'lowerLetter', '%1.%2)')}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>`
  const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>`
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/></Relationships>`
  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdS" Type="${R}/styles" Target="styles.xml"/><Relationship Id="rIdN" Type="${R}/numbering" Target="numbering.xml"/>${png ? `<Relationship Id="rIdImg1" Type="${R}/image" Target="media/image1.png"/>` : ''}</Relationships>`
  const files = [
    { name: '[Content_Types].xml', data: enc.encode(ct) },
    { name: '_rels/.rels', data: enc.encode(rootRels) },
    { name: 'word/document.xml', data: enc.encode(doc) },
    { name: 'word/styles.xml', data: enc.encode(styles) },
    { name: 'word/numbering.xml', data: enc.encode(numbering) },
    { name: 'word/_rels/document.xml.rels', data: enc.encode(docRels) },
    ...(png ? [{ name: 'word/media/image1.png', data: png }] : []),
  ]
  return zipStore(files)
}
