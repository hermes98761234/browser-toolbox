// PDF metadata editing: Info dictionary, a matching XMP packet, document language and viewer preferences.
// pdf-lib is passed in (lazy-loaded by the tool); helpers shared with the metadata cleaner.
import type * as PdfLibNs from 'pdf-lib'
import { xmpFields, type PdfLib } from './pdf-metadata-cleaner'

export type Trapped = '' | 'True' | 'False' | 'Unknown'
export const LAYOUTS = ['', 'SinglePage', 'OneColumn', 'TwoColumnLeft', 'TwoColumnRight', 'TwoPageLeft', 'TwoPageRight'] as const
export const MODES = ['', 'UseNone', 'UseOutlines', 'UseThumbs', 'FullScreen', 'UseOC', 'UseAttachments'] as const
export type Layout = (typeof LAYOUTS)[number]
export type PageMode = (typeof MODES)[number]

export interface Meta {
  title: string
  author: string
  subject: string
  keywords: string
  creator: string
  producer: string
  /** ISO 8601 with offset, e.g. 2024-03-11T09:30:12+01:00 ('' = absent) */
  created: string
  modified: string
  trapped: Trapped
  lang: string
  displayTitle: boolean
  layout: Layout
  mode: PageMode
  custom: [string, string][]
}

export const EMPTY: Meta = { title: '', author: '', subject: '', keywords: '', creator: '', producer: '', created: '', modified: '', trapped: '', lang: '', displayTitle: false, layout: '', mode: '', custom: [] }
export const STD_KEYS = ['Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer', 'CreationDate', 'ModDate', 'Trapped']
export type Field = Exclude<keyof Meta, 'custom'> | 'custom'

const p2 = (n: number) => String(Math.abs(n)).padStart(2, '0')

/** Current local time as ISO 8601 with the local offset. */
export function nowIso(d = new Date()): string {
  const off = -d.getTimezoneOffset()
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}${off === 0 ? 'Z' : `${off < 0 ? '-' : '+'}${p2(Math.trunc(off / 60))}:${p2(off % 60)}`}`
}

/** PDF date string (D:YYYYMMDDHHmmSS+HH'mm') → ISO 8601. Returns '' when unparseable. */
export function pdfToIso(s: string): string {
  const m = /^(?:D:)?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(?:([Z+-])(\d{2})?'?(\d{2})?'?)?/.exec(s.trim())
  if (!m) return ''
  const [, y, mo = '01', d = '01', h = '00', mi = '00', se = '00', z, oh = '00', om = '00'] = m
  const tz = !z ? '' : z === 'Z' ? 'Z' : `${z}${oh}:${om}`
  return `${y}-${mo}-${d}T${h}:${mi}:${se}${tz}`
}

/** ISO 8601 (with or without seconds/offset) → PDF date string. Returns '' when unparseable. */
export function isoToPdf(s: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(s.trim())
  if (!m) return ''
  const [, y, mo, d, h = '00', mi = '00', se = '00', tz] = m
  let z = ''
  if (tz === 'Z') z = 'Z'
  else if (tz) {
    const t = tz.replace(':', '')
    z = `${t[0]}${t.slice(1, 3)}'${t.slice(3, 5)}'`
  }
  return `D:${y}${mo}${d}${h}${mi}${se}${z}`
}

/** Splits a keyword string on commas/semicolons. */
export const keywordList = (s: string) => s.split(/[;,]/).map((x) => x.trim()).filter(Boolean)
const xe = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
/** XML element name for a custom key: letters, digits, '-', '_' and '.'; must not start with a digit. */
export const xmlName = (k: string) => {
  const n = k.replace(/[^A-Za-z0-9_.-]/g, '_')
  return /^[A-Za-z_]/.test(n) ? n : `_${n}`
}
/** PDF name keys may not contain whitespace or delimiters. */
export const pdfKey = (k: string) => k.trim().replace(/[\s()<>[\]{}/%#]/g, '_')

/** A complete XMP packet that mirrors the Info dictionary (ISO 32000 §14.3.2 / XMP spec part 1 & 2). */
export function buildXmp(m: Meta, ids: { doc: string; inst: string }, metadataDate = nowIso()): string {
  const authors = m.author.split(';').map((x) => x.trim()).filter(Boolean)
  const kw = keywordList(m.keywords)
  const alt = (v: string) => `<rdf:Alt><rdf:li xml:lang="x-default">${xe(v)}</rdf:li></rdf:Alt>`
  const L: string[] = []
  if (m.title) L.push(`<dc:title>${alt(m.title)}</dc:title>`)
  if (authors.length) L.push(`<dc:creator><rdf:Seq>${authors.map((a) => `<rdf:li>${xe(a)}</rdf:li>`).join('')}</rdf:Seq></dc:creator>`)
  if (m.subject) L.push(`<dc:description>${alt(m.subject)}</dc:description>`)
  if (kw.length) L.push(`<dc:subject><rdf:Bag>${kw.map((k) => `<rdf:li>${xe(k)}</rdf:li>`).join('')}</rdf:Bag></dc:subject>`)
  if (m.lang) L.push(`<dc:language><rdf:Bag><rdf:li>${xe(m.lang)}</rdf:li></rdf:Bag></dc:language>`)
  L.push('<dc:format>application/pdf</dc:format>')
  if (m.keywords) L.push(`<pdf:Keywords>${xe(m.keywords)}</pdf:Keywords>`)
  if (m.producer) L.push(`<pdf:Producer>${xe(m.producer)}</pdf:Producer>`)
  if (m.trapped) L.push(`<pdf:Trapped>${m.trapped}</pdf:Trapped>`)
  if (m.creator) L.push(`<xmp:CreatorTool>${xe(m.creator)}</xmp:CreatorTool>`)
  if (m.created) L.push(`<xmp:CreateDate>${xe(m.created)}</xmp:CreateDate>`)
  if (m.modified) L.push(`<xmp:ModifyDate>${xe(m.modified)}</xmp:ModifyDate>`)
  L.push(`<xmp:MetadataDate>${xe(metadataDate)}</xmp:MetadataDate>`)
  L.push(`<xmpMM:DocumentID>${xe(ids.doc)}</xmpMM:DocumentID><xmpMM:InstanceID>${xe(ids.inst)}</xmpMM:InstanceID>`)
  for (const [k, v] of m.custom) if (k.trim()) L.push(`<pdfx:${xmlName(pdfKey(k))}>${xe(v)}</pdfx:${xmlName(pdfKey(k))}>`)
  const ns = 'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/" xmlns:pdfx="http://ns.adobe.com/pdfx/1.3/"'
  const pad = (' '.repeat(99) + '\n').repeat(20) // writable padding so later tools can edit in place
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>\n<x:xmpmeta xmlns:x="adobe:ns:meta/">\n<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n<rdf:Description rdf:about="" ${ns}>\n${L.join('\n')}\n</rdf:Description>\n</rdf:RDF>\n</x:xmpmeta>\n${pad}<?xpacket end="w"?>`
}

export interface Loaded {
  meta: Meta
  pages: number
  version: string
  encrypted: boolean
  xmp: [string, string][] | null
  /** Fields where the old XMP disagreed with the Info dictionary. */
  conflicts: string[]
  docId: string
}

function str(lib: PdfLib, o: PdfLibNs.PDFObject | undefined): string {
  if (!o) return ''
  if (o instanceof lib.PDFString || o instanceof lib.PDFHexString) return o.decodeText()
  if (o instanceof lib.PDFName) return o.decodeText()
  if (o instanceof lib.PDFNumber) return String(o.asNumber())
  if (o instanceof lib.PDFBool) return String(o.asBoolean())
  return ''
}

function resolveDict(lib: PdfLib, doc: PdfLibNs.PDFDocument, o: PdfLibNs.PDFObject | undefined): PdfLibNs.PDFDict | null {
  const r = o instanceof lib.PDFRef ? doc.context.lookup(o) : o
  return r instanceof lib.PDFDict ? r : null
}

function xmpText(lib: PdfLib, doc: PdfLibNs.PDFDocument): string | null {
  const ref = doc.catalog.get(lib.PDFName.of('Metadata'))
  const st = ref instanceof lib.PDFRef ? doc.context.lookup(ref) : ref
  try {
    if (st instanceof lib.PDFRawStream) return new TextDecoder().decode(lib.decodePDFRawStream(st).decode())
    if (st instanceof lib.PDFStream) return new TextDecoder().decode(st.getContents())
  } catch {
    /* unsupported filter */
  }
  return null
}

/** Reads every editable field. Values present only in XMP fill gaps left by the Info dictionary. */
export async function readMeta(lib: PdfLib, bytes: Uint8Array): Promise<Loaded> {
  const doc = await lib.PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
  const info = resolveDict(lib, doc, doc.context.trailerInfo.Info)
  const get = (k: string) => (info ? str(lib, info.get(lib.PDFName.of(k))) : '')
  const custom: [string, string][] = []
  if (info) for (const [k, v] of info.entries()) if (!STD_KEYS.includes(k.decodeText())) custom.push([k.decodeText(), str(lib, v)])
  const raw = xmpText(lib, doc)
  const xf = raw ? xmpFields(raw) : null
  const x = (k: string) => xf?.find(([a]) => a === k)?.[1] ?? ''
  const vp = resolveDict(lib, doc, doc.catalog.get(lib.PDFName.of('ViewerPreferences')))
  const dt = vp?.get(lib.PDFName.of('DisplayDocTitle'))
  const t = get('Trapped')
  const meta: Meta = {
    title: get('Title') || x('dc:title'),
    author: get('Author') || x('dc:creator'),
    subject: get('Subject') || x('dc:description'),
    keywords: get('Keywords') || x('pdf:Keywords'),
    creator: get('Creator') || x('xmp:CreatorTool'),
    producer: get('Producer') || x('pdf:Producer'),
    created: pdfToIso(get('CreationDate')) || x('xmp:CreateDate'),
    modified: pdfToIso(get('ModDate')) || x('xmp:ModifyDate'),
    trapped: t === 'True' || t === 'False' || t === 'Unknown' ? t : '',
    lang: str(lib, doc.catalog.get(lib.PDFName.of('Lang'))),
    displayTitle: dt instanceof lib.PDFBool ? dt.asBoolean() : false,
    layout: (LAYOUTS as readonly string[]).includes(str(lib, doc.catalog.get(lib.PDFName.of('PageLayout')))) ? (str(lib, doc.catalog.get(lib.PDFName.of('PageLayout'))) as Layout) : '',
    mode: (MODES as readonly string[]).includes(str(lib, doc.catalog.get(lib.PDFName.of('PageMode')))) ? (str(lib, doc.catalog.get(lib.PDFName.of('PageMode'))) as PageMode) : '',
    custom,
  }
  const conflicts: string[] = []
  if (xf) {
    const pairs: [string, string, string][] = [['Title', get('Title'), x('dc:title')], ['Author', get('Author'), x('dc:creator').replace(/; /g, ';')], ['Producer', get('Producer'), x('pdf:Producer')], ['Creator', get('Creator'), x('xmp:CreatorTool')]]
    for (const [k, a, b] of pairs) if (a && b && a.replace(/;\s*/g, ';') !== b) conflicts.push(k)
  }
  const id = doc.context.trailerInfo.ID
  const first = id instanceof lib.PDFArray ? id.get(0) : undefined
  const docId = first instanceof lib.PDFHexString ? first.asString() : ''
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 16))
  return { meta, pages: doc.getPageCount(), version: /%PDF-(\d\.\d)/.exec(head)?.[1] ?? '?', encrypted: doc.isEncrypted, xmp: xf, conflicts, docId }
}

const uuid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : '00000000-0000-4000-8000-000000000000'.replace(/0/g, () => Math.floor(Math.random() * 16).toString(16)))

/** Writes the metadata: a fresh Info dictionary, catalog /Lang, /ViewerPreferences, page layout/mode and XMP. */
export async function writeMeta(lib: PdfLib, bytes: Uint8Array, m: Meta, o: { touchModified?: boolean; xmp?: boolean } = {}): Promise<Uint8Array> {
  const { PDFName, PDFString, PDFHexString, PDFBool } = lib
  const doc = await lib.PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
  const ctx = doc.context
  const meta = { ...m, modified: o.touchModified ? nowIso() : m.modified }
  // Text strings: PDFHexString.fromText writes UTF-16BE so any script survives.
  const ts = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? PDFString.of(s) : PDFHexString.fromText(s))
  const info = ctx.obj({})
  const put = (k: string, v: string) => v && info.set(PDFName.of(k), ts(v))
  put('Title', meta.title)
  put('Author', meta.author)
  put('Subject', meta.subject)
  put('Keywords', meta.keywords)
  put('Creator', meta.creator)
  put('Producer', meta.producer)
  if (isoToPdf(meta.created)) info.set(PDFName.of('CreationDate'), PDFString.of(isoToPdf(meta.created)))
  if (isoToPdf(meta.modified)) info.set(PDFName.of('ModDate'), PDFString.of(isoToPdf(meta.modified)))
  if (meta.trapped) info.set(PDFName.of('Trapped'), PDFName.of(meta.trapped))
  for (const [k, v] of meta.custom) if (pdfKey(k) && !STD_KEYS.includes(pdfKey(k))) info.set(PDFName.of(pdfKey(k)), ts(v))
  ctx.trailerInfo.Info = ctx.register(info)
  const cat = doc.catalog
  if (meta.lang) cat.set(PDFName.of('Lang'), PDFString.of(meta.lang))
  else cat.delete(PDFName.of('Lang'))
  if (meta.layout) cat.set(PDFName.of('PageLayout'), PDFName.of(meta.layout))
  else cat.delete(PDFName.of('PageLayout'))
  if (meta.mode) cat.set(PDFName.of('PageMode'), PDFName.of(meta.mode))
  else cat.delete(PDFName.of('PageMode'))
  const vp = resolveDict(lib, doc, cat.get(PDFName.of('ViewerPreferences'))) ?? ctx.obj({})
  if (meta.displayTitle) vp.set(PDFName.of('DisplayDocTitle'), PDFBool.True)
  else vp.delete(PDFName.of('DisplayDocTitle'))
  if (vp.keys().length) cat.set(PDFName.of('ViewerPreferences'), vp)
  else cat.delete(PDFName.of('ViewerPreferences'))
  if (o.xmp !== false) {
    // Keep the document ID if the old packet had one; a new instance ID marks this save.
    const old = xmpText(lib, doc)
    const docId = (old && /<xmpMM:DocumentID>([^<]+)</.exec(old)?.[1]) || `uuid:${uuid()}`
    const xs = ctx.stream(new TextEncoder().encode(buildXmp(meta, { doc: docId, inst: `uuid:${uuid()}` })), { Type: 'Metadata', Subtype: 'XML' })
    cat.set(PDFName.of('Metadata'), ctx.register(xs))
  }
  return doc.save({ useObjectStreams: false })
}

/** Copies the selected fields of `src` onto `dst`. */
export function applyFields(dst: Meta, src: Meta, fields: Field[]): Meta {
  const out: Meta = { ...dst, custom: [...dst.custom] }
  for (const f of fields) {
    if (f === 'custom') {
      for (const [k, v] of src.custom) {
        const i = out.custom.findIndex(([a]) => a === k)
        if (i >= 0) out.custom[i] = [k, v]
        else out.custom.push([k, v])
      }
    } else (out as unknown as Record<string, unknown>)[f] = src[f]
  }
  return out
}

/** Light checks that make metadata useful for search and accessibility (PDF/UA wants Title + DisplayDocTitle + Lang). */
export function lint(m: Meta): string[] {
  const w: string[] = []
  if (!m.title.trim()) w.push('No title: viewers and search engines will show the file name instead.')
  if (m.title && !m.displayTitle) w.push('“Display document title” is off, so the window shows the file name (PDF/UA requires it on).')
  if (!m.lang) w.push('No document language: screen readers may pick the wrong voice (PDF/UA requires /Lang).')
  else if (!/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(m.lang)) w.push(`“${m.lang}” is not a valid BCP 47 language tag (e.g. en-GB, de, pt-BR).`)
  if (m.created && !isoToPdf(m.created)) w.push('Creation date is not a valid date.')
  if (m.modified && !isoToPdf(m.modified)) w.push('Modification date is not a valid date.')
  if (m.created && m.modified && isoToPdf(m.created) && isoToPdf(m.modified) && new Date(m.modified) < new Date(m.created)) w.push('Modified date is earlier than the creation date.')
  if (m.keywords.length > 300) w.push('Very long keyword list; most viewers truncate it.')
  for (const [k] of m.custom) if (STD_KEYS.includes(pdfKey(k))) w.push(`Custom key “${k}” clashes with a standard field and is ignored.`)
  return w
}

/** Small multi-page demo PDF with deliberately messy metadata. */
export async function demoPdf(lib: PdfLib, title: string, pages = 2): Promise<Uint8Array> {
  const doc = await lib.PDFDocument.create({ updateMetadata: false })
  const font = await doc.embedFont(lib.StandardFonts.Helvetica)
  for (let i = 0; i < pages; i++) {
    const p = doc.addPage([595, 842])
    p.drawText(`${title} — page ${i + 1}`, { x: 60, y: 760, size: 20, font })
    p.drawText('Demo document generated in your browser for the PDF Metadata Editor.', { x: 60, y: 730, size: 11, font })
  }
  doc.setTitle('untitled')
  doc.setAuthor('user')
  doc.setProducer('Demo PDF writer 1.0')
  doc.setCreator('Word processor')
  doc.setCreationDate(new Date(Date.UTC(2025, 1, 3, 9, 15, 0)))
  doc.setModificationDate(new Date(Date.UTC(2025, 1, 4, 16, 40, 0)))
  const info = resolveDict(lib, doc, doc.context.trailerInfo.Info)
  info?.set(lib.PDFName.of('Department'), lib.PDFString.of('Ops'))
  return doc.save({ useObjectStreams: false })
}
