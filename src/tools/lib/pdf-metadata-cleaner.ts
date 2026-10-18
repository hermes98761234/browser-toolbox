// PDF metadata inspection and removal with pdf-lib (the module is passed in so callers can lazy-load it).
import type * as PdfLibNs from 'pdf-lib'

export type PdfLib = typeof PdfLibNs
type Doc = PdfLibNs.PDFDocument
type Obj = PdfLibNs.PDFObject

export interface Report {
  pages: number
  version: string
  encrypted: boolean
  info: [string, string][]
  xmp: { raw: string; fields: [string, string][] } | null
  objectXmp: number
  thumbs: number
  pieceInfo: number
  js: { names: number; openAction: boolean; actions: number }
  annots: { total: number; withAuthor: number; authors: string[]; dated: number }
  embedded: number
  id: string | null
  revisions: number
  linearized: boolean
  rawStrings: [string, string][]
  bytes: number
}

const INFO_KEYS = ['Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer', 'CreationDate', 'ModDate', 'Trapped']

export function pdfDate(s: string): string {
  const m = /^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?([Z+-])?(\d{2})?'?(\d{2})?/.exec(s)
  if (!m) return s
  const [, y, mo = '01', d = '01', h = '00', mi = '00', se = '00', z, oh, om] = m
  return `${y}-${mo}-${d} ${h}:${mi}:${se}${z === 'Z' ? ' UTC' : z ? ` ${z}${oh ?? '00'}:${om ?? '00'}` : ''}`
}

function text(lib: PdfLib, o: Obj | undefined): string {
  if (!o) return ''
  if (o instanceof lib.PDFString || o instanceof lib.PDFHexString) return o.decodeText()
  if (o instanceof lib.PDFName) return o.decodeText()
  if (o instanceof lib.PDFNumber) return String(o.asNumber())
  if (o instanceof lib.PDFBool) return String(o.asBoolean())
  return o.toString().slice(0, 120)
}

function latin1(b: Uint8Array): string {
  let s = ''
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return s
}

function streamText(lib: PdfLib, st: Obj): string {
  try {
    if (st instanceof lib.PDFRawStream) return new TextDecoder().decode(lib.decodePDFRawStream(st).decode())
    if (st instanceof lib.PDFStream) return new TextDecoder().decode(st.getContents())
  } catch {
    /* undecodable filter */
  }
  return ''
}

const dictOf = (lib: PdfLib, o: Obj | undefined): PdfLibNs.PDFDict | null => (o instanceof lib.PDFDict ? o : o instanceof lib.PDFStream ? o.dict : null)

/** Every dictionary in the file (stream dictionaries included). */
function allDicts(lib: PdfLib, doc: Doc): PdfLibNs.PDFDict[] {
  const out: PdfLibNs.PDFDict[] = []
  const seen = new Set<Obj>()
  const walk = (o: Obj | undefined) => {
    if (!o || seen.has(o)) return
    seen.add(o)
    const d = dictOf(lib, o)
    if (d) {
      out.push(d)
      for (const [, v] of d.entries()) if (!(v instanceof lib.PDFRef)) walk(v)
    } else if (o instanceof lib.PDFArray) for (const v of o.asArray()) if (!(v instanceof lib.PDFRef)) walk(v)
  }
  for (const [, o] of doc.context.enumerateIndirectObjects()) walk(o)
  return out
}

export function xmpFields(raw: string): [string, string][] {
  const out: [string, string][] = []
  const push = (k: string, v: string) => {
    v = v.trim()
    if (v && !k.startsWith('xmlns') && !out.some(([a, b]) => a === k && b === v) && out.length < 40) out.push([k, v])
  }
  for (const m of raw.matchAll(/<(\w+:\w+)>([^<]{1,300})<\/\1>/g)) if (!m[1].startsWith('rdf:')) push(m[1], m[2])
  for (const m of raw.matchAll(/<(\w+:\w+)>\s*<rdf:(?:Seq|Bag|Alt)>([\s\S]{0,2000}?)<\/rdf:(?:Seq|Bag|Alt)>/g)) {
    const items = [...m[2].matchAll(/<rdf:li[^>]*>([^<]{1,300})<\/rdf:li>/g)].map((x) => x[1].trim())
    if (items.length) push(m[1], items.join('; '))
  }
  for (const m of raw.matchAll(/\s(\w+:\w+)="([^"]{1,300})"/g)) if (!m[1].startsWith('rdf:') && !m[1].startsWith('xmlns')) push(m[1], m[2])
  return out
}

export function scanRaw(bytes: Uint8Array): { revisions: number; linearized: boolean; strings: [string, string][] } {
  const s = latin1(bytes)
  const linearized = /\/Linearized\s/.test(s.slice(0, 2048))
  const eofs = (s.match(/%%EOF/g) ?? []).length
  const strings: [string, string][] = []
  const re = /\/(Author|Title|Subject|Keywords|Creator|Producer|Company|Manager|SourceModified|T)\s*\(((?:\\.|[^\\)]){1,120})\)/g
  for (const m of s.matchAll(re)) {
    const v = m[2].replace(/\\([()\\])/g, '$1')
    if (!strings.some(([k, x]) => k === m[1] && x === v)) strings.push([m[1] === 'T' ? 'T (annotation author)' : m[1], v])
  }
  for (const m of s.matchAll(/<(dc:creator|xmp:CreatorTool|pdf:Producer|xmpMM:DocumentID)>(?:\s*<rdf:Seq>\s*<rdf:li>)?([^<]{1,120})</g)) strings.push([m[1], m[2].trim()])
  return { revisions: Math.max(1, eofs - (linearized ? 1 : 0)), linearized, strings: strings.slice(0, 40) }
}

export async function analyze(lib: PdfLib, bytes: Uint8Array): Promise<Report> {
  const doc = await lib.PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
  const { PDFName } = lib
  const info: [string, string][] = []
  const infoObj = doc.context.lookup(doc.context.trailerInfo.Info as Obj)
  if (infoObj instanceof lib.PDFDict)
    for (const [k, v] of infoObj.entries()) {
      const key = k.decodeText()
      const t = text(lib, doc.context.lookup(v) ?? v)
      info.push([key, /Date$/.test(key) ? pdfDate(t) : t])
    }
  const rank = (k: string) => (INFO_KEYS.includes(k) ? INFO_KEYS.indexOf(k) : 100)
  info.sort((a, b) => rank(a[0]) - rank(b[0]))
  const cat = doc.catalog
  const xmpObj = cat.get(PDFName.of('Metadata'))
  let xmp: Report['xmp'] = null
  if (xmpObj) {
    const raw = streamText(lib, doc.context.lookup(xmpObj) as Obj)
    xmp = { raw, fields: xmpFields(raw) }
  }
  const dicts = allDicts(lib, doc)
  let objectXmp = 0, thumbs = 0, pieceInfo = 0, actions = 0, total = 0, withAuthor = 0, dated = 0
  const authors = new Set<string>()
  for (const d of dicts) {
    if (d !== cat && d.has(PDFName.of('Metadata'))) objectXmp++
    if (d.has(PDFName.of('Thumb'))) thumbs++
    if (d.has(PDFName.of('PieceInfo'))) pieceInfo++
    const s = d.get(PDFName.of('S'))
    if (s instanceof lib.PDFName && s.decodeText() === 'JavaScript') actions++
    const type = d.get(PDFName.of('Type')), sub = d.get(PDFName.of('Subtype'))
    if ((type instanceof lib.PDFName && type.decodeText() === 'Annot') || (sub instanceof lib.PDFName && d.has(PDFName.of('Rect')) && !d.has(PDFName.of('Width')))) {
      total++
      const t = d.get(PDFName.of('T'))
      if (t && !(sub instanceof lib.PDFName && sub.decodeText() === 'Widget')) {
        withAuthor++
        authors.add(text(lib, t))
      }
      if (d.has(PDFName.of('M')) || d.has(PDFName.of('CreationDate'))) dated++
    }
  }
  const names = dictOf(lib, doc.context.lookup(cat.get(PDFName.of('Names')) as Obj))
  const countTree = (o: Obj | undefined): number => {
    const d = dictOf(lib, doc.context.lookup(o as Obj))
    if (!d) return 0
    const n = doc.context.lookup(d.get(PDFName.of('Names')) as Obj)
    const kids = doc.context.lookup(d.get(PDFName.of('Kids')) as Obj)
    return (n instanceof lib.PDFArray ? n.size() / 2 : 0) + (kids instanceof lib.PDFArray ? kids.asArray().reduce((a, k) => a + countTree(k), 0) : 0)
  }
  const oa = dictOf(lib, doc.context.lookup(cat.get(PDFName.of('OpenAction')) as Obj))
  const oaS = oa?.get(PDFName.of('S'))
  const idArr = doc.context.trailerInfo.ID
  const idObj = idArr ? doc.context.lookup(idArr as Obj) : undefined
  const raw = scanRaw(bytes)
  return {
    pages: doc.getPageCount(),
    version: latin1(bytes.subarray(0, 16)).match(/%PDF-(\d\.\d)/)?.[1] ?? '?',
    encrypted: doc.isEncrypted,
    info,
    xmp,
    objectXmp,
    thumbs,
    pieceInfo,
    js: { names: names ? countTree(names.get(PDFName.of('JavaScript'))) : 0, openAction: oaS instanceof lib.PDFName && oaS.decodeText() === 'JavaScript', actions },
    annots: { total, withAuthor, authors: [...authors].slice(0, 12), dated },
    embedded: names ? countTree(names.get(PDFName.of('EmbeddedFiles'))) : 0,
    id: idObj instanceof lib.PDFArray ? idObj.asArray().map((x) => (x instanceof lib.PDFHexString ? x.asString() : text(lib, x))).join(' / ') : null,
    revisions: raw.revisions,
    linearized: raw.linearized,
    rawStrings: raw.strings,
    bytes: bytes.length,
  }
}

export interface CleanOpts { info: boolean; keepTitle: boolean; xmp: boolean; thumbs: boolean; pieceInfo: boolean; js: boolean; annotAuthors: boolean; embedded: boolean; newId: boolean }
export const ALL: CleanOpts = { info: true, keepTitle: false, xmp: true, thumbs: true, pieceInfo: true, js: true, annotAuthors: true, embedded: false, newId: true }

/** Removes the selected metadata, drops unreachable objects and writes a fresh single-revision file. */
export async function clean(lib: PdfLib, bytes: Uint8Array, o: CleanOpts): Promise<Uint8Array> {
  const doc = await lib.PDFDocument.load(bytes, { updateMetadata: false })
  const { PDFName, PDFHexString } = lib
  const ctx = doc.context
  const cat = doc.catalog
  if (o.info) {
    const old = ctx.lookup(ctx.trailerInfo.Info as Obj)
    const title = old instanceof lib.PDFDict ? old.get(PDFName.of('Title')) : undefined
    if (o.keepTitle && title) ctx.trailerInfo.Info = ctx.register(ctx.obj({ Title: ctx.lookup(title) ?? title }))
    else ctx.trailerInfo.Info = undefined
  }
  const dicts = allDicts(lib, doc)
  for (const d of dicts) {
    if (o.xmp) d.delete(PDFName.of('Metadata'))
    if (o.thumbs) d.delete(PDFName.of('Thumb'))
    if (o.pieceInfo) {
      d.delete(PDFName.of('PieceInfo'))
      if (d !== cat) d.delete(PDFName.of('LastModified'))
    }
    const type = d.get(PDFName.of('Type')), sub = d.get(PDFName.of('Subtype'))
    const isAnnot = (type instanceof lib.PDFName && type.decodeText() === 'Annot') || (sub instanceof lib.PDFName && d.has(PDFName.of('Rect')) && !d.has(PDFName.of('Width')))
    if (o.annotAuthors && isAnnot && !(sub instanceof lib.PDFName && sub.decodeText() === 'Widget')) {
      d.delete(PDFName.of('T'))
      d.delete(PDFName.of('M'))
      d.delete(PDFName.of('CreationDate'))
    }
    if (o.js && !isAnnot && d.has(PDFName.of('AA'))) d.delete(PDFName.of('AA'))
  }
  if (o.js) {
    const oa = dictOf(lib, ctx.lookup(cat.get(PDFName.of('OpenAction')) as Obj))
    const s = oa?.get(PDFName.of('S'))
    if (s instanceof lib.PDFName && s.decodeText() === 'JavaScript') cat.delete(PDFName.of('OpenAction'))
  }
  const names = dictOf(lib, ctx.lookup(cat.get(PDFName.of('Names')) as Obj))
  if (names) {
    if (o.js) names.delete(PDFName.of('JavaScript'))
    if (o.embedded) names.delete(PDFName.of('EmbeddedFiles'))
  }
  if (o.newId) {
    const hex = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('')
    const h = hex()
    ctx.trailerInfo.ID = ctx.obj([PDFHexString.of(h), PDFHexString.of(h)])
  }
  // garbage-collect: keep only objects reachable from the trailer
  const keep = new Set<string>()
  const stack: Obj[] = [ctx.trailerInfo.Root as Obj]
  if (ctx.trailerInfo.Info) stack.push(ctx.trailerInfo.Info as Obj)
  if (ctx.trailerInfo.Encrypt) stack.push(ctx.trailerInfo.Encrypt as Obj)
  while (stack.length) {
    const x = stack.pop()
    if (!x) continue
    if (x instanceof lib.PDFRef) {
      if (keep.has(x.toString())) continue
      keep.add(x.toString())
      stack.push(ctx.lookup(x) as Obj)
      continue
    }
    const d = dictOf(lib, x)
    if (d) for (const [, v] of d.entries()) stack.push(v)
    else if (x instanceof lib.PDFArray) stack.push(...x.asArray())
  }
  for (const [ref] of ctx.enumerateIndirectObjects()) if (!keep.has(ref.toString())) ctx.delete(ref)
  return doc.save({ updateFieldAppearances: false })
}

/** Builds a demo PDF stuffed with metadata, then appends an incremental update that changes the author. */
export async function samplePdf(lib: PdfLib): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, PDFName, PDFString, rgb } = lib
  const doc = await PDFDocument.create({ updateMetadata: false })
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 0; i < 2; i++) {
    const p = doc.addPage([595, 842])
    p.drawText(i === 0 ? 'Quarterly plan — internal draft' : 'Appendix', { x: 60, y: 760, size: 22, font, color: rgb(0.1, 0.1, 0.2) })
    p.drawText('This sample file carries an Info dictionary, XMP, a page thumbnail, private application data,', { x: 60, y: 720, size: 11, font })
    p.drawText('document JavaScript, an annotation with an author name and an older revision of its metadata.', { x: 60, y: 704, size: 11, font })
  }
  const ctx = doc.context
  const info = ctx.obj({
    Title: PDFString.of('Quarterly plan (draft 3)'), Author: PDFString.of('J. Draft (old laptop)'), Subject: PDFString.of('Budget 2025'), Keywords: PDFString.of('confidential, budget'),
    Creator: PDFString.of('Microsoft Word for Microsoft 365'), Producer: PDFString.of('Microsoft: Print To PDF'), CreationDate: PDFString.of("D:20240311093012+01'00'"), ModDate: PDFString.of("D:20240312174455+01'00'"),
    Company: PDFString.of('Acme Widgets Ltd'), SourceModified: PDFString.of('D:20240312164401'),
  })
  ctx.trailerInfo.Info = ctx.register(info)
  const xmp = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/" xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/"><dc:creator><rdf:Seq><rdf:li>Jane Doe</rdf:li></rdf:Seq></dc:creator><xmp:CreatorTool>Microsoft Word for Microsoft 365</xmp:CreatorTool><xmp:CreateDate>2024-03-11T09:30:12+01:00</xmp:CreateDate><pdf:Producer>Microsoft: Print To PDF</pdf:Producer><xmpMM:DocumentID>uuid:5f1c2d1e-8a7b-4c3d-9e0f-112233445566</xmpMM:DocumentID></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`
  const xs = ctx.stream(xmp, { Type: 'Metadata', Subtype: 'XML' })
  doc.catalog.set(PDFName.of('Metadata'), ctx.register(xs))
  const page = doc.getPage(0)
  const thumb = ctx.stream(new Uint8Array(16 * 16).map((_, i) => ((i % 16) * 16) ^ (Math.floor(i / 16) * 16)), { Width: 16, Height: 16, ColorSpace: 'DeviceGray', BitsPerComponent: 8 })
  page.node.set(PDFName.of('Thumb'), ctx.register(thumb))
  page.node.set(PDFName.of('PieceInfo'), ctx.obj({ Illustrator: { LastModified: PDFString.of('D:20240312'), Private: PDFString.of('C:\\Users\\jdoe\\Documents\\plan.ai') } }))
  const annot = ctx.obj({ Type: 'Annot', Subtype: 'Text', Rect: [500, 760, 520, 780], Contents: PDFString.of('Check these numbers before sending!'), T: PDFString.of('Jane Doe'), M: PDFString.of('D:20240312170000Z'), Name: 'Comment' })
  page.node.set(PDFName.of('Annots'), ctx.obj([ctx.register(annot)]))
  const js = ctx.obj({ S: 'JavaScript', JS: PDFString.of("app.alert('Opened by ' + identity.loginName);") })
  doc.catalog.set(PDFName.of('Names'), ctx.obj({ JavaScript: { Names: [PDFString.of('track'), ctx.register(js)] } }))
  const h = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'
  ctx.trailerInfo.ID = ctx.obj([lib.PDFHexString.of(h), lib.PDFHexString.of(h)])
  const base = await doc.save({ useObjectStreams: false })
  // incremental update: new Info object, xref section and trailer with /Prev
  const s = latin1(base)
  const prev = Number(/startxref\s+(\d+)\s+%%EOF\s*$/.exec(s)?.[1])
  const size = Number(/\/Size (\d+)/.exec(s.slice(prev))?.[1])
  const root = /\/Root (\d+ \d+ R)/.exec(s.slice(prev))?.[1]
  const obj = `${size} 0 obj\n<< /Title (Quarterly plan) /Author (Jane Doe) /Creator (Microsoft Word for Microsoft 365) /Producer (Microsoft: Print To PDF) /ModDate (D:20240314081500+01'00') >>\nendobj\n`
  const objOff = base.length + 1
  const xrefOff = objOff + obj.length
  const tail = `\n${obj}xref\n${size} 1\n${String(objOff).padStart(10, '0')} 00000 n \ntrailer\n<< /Size ${size + 1} /Root ${root} /Info ${size} 0 R /Prev ${prev} /ID [<${h}> <${h}>] >>\nstartxref\n${xrefOff}\n%%EOF\n`
  const out = new Uint8Array(base.length + tail.length)
  out.set(base)
  for (let i = 0; i < tail.length; i++) out[base.length + i] = tail.charCodeAt(i)
  return out
}
