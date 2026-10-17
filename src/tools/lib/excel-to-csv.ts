// Minimal XLSX reader (ZIP + SpreadsheetML) and CSV writer — no SheetJS.
import { crc32 } from './image-compressor'

// ---------- ZIP ----------

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw')
  const out = new Response(new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(ds))
  return new Uint8Array(await out.arrayBuffer())
}
async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('deflate-raw')
  const out = new Response(new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(cs))
  return new Uint8Array(await out.arrayBuffer())
}

/** Reads every entry of a ZIP archive (stored or deflated) via its central directory. */
export async function unzip(buf: Uint8Array): Promise<Map<string, Uint8Array>> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('Not a ZIP/XLSX file (no end-of-central-directory record). Old .xls files are not supported — save as .xlsx first.')
  const count = dv.getUint16(eocd + 10, true)
  let p = dv.getUint32(eocd + 16, true)
  const dec = new TextDecoder()
  const files = new Map<string, Uint8Array>()
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Corrupt ZIP central directory')
    const method = dv.getUint16(p + 10, true)
    const csize = dv.getUint32(p + 20, true)
    const nlen = dv.getUint16(p + 28, true)
    const xlen = dv.getUint16(p + 30, true)
    const clen = dv.getUint16(p + 32, true)
    const off = dv.getUint32(p + 42, true)
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nlen))
    p += 46 + nlen + xlen + clen
    if (name.endsWith('/')) continue
    const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true)
    const raw = buf.subarray(start, start + csize)
    if (method === 0) files.set(name, raw)
    else if (method === 8) files.set(name, await inflateRaw(raw))
    else throw new Error(`Unsupported compression method ${method} in ${name}`)
  }
  return files
}

/** Writes a ZIP with deflated entries (used for the sample workbook). */
export async function zipDeflate(entries: { name: string; text: string }[]): Promise<Uint8Array> {
  const enc = new TextEncoder()
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let off = 0
  for (const e of entries) {
    const raw = enc.encode(e.text)
    const comp = await deflateRaw(raw)
    const name = enc.encode(e.name)
    const crc = crc32(raw)
    const h = new DataView(new ArrayBuffer(30))
    h.setUint32(0, 0x04034b50, true)
    h.setUint16(4, 20, true)
    h.setUint16(6, 0x0800, true)
    h.setUint16(8, 8, true)
    h.setUint32(14, crc, true)
    h.setUint32(18, comp.length, true)
    h.setUint32(22, raw.length, true)
    h.setUint16(26, name.length, true)
    parts.push(new Uint8Array(h.buffer), name, comp)
    const c = new DataView(new ArrayBuffer(46))
    c.setUint32(0, 0x02014b50, true)
    c.setUint16(4, 20, true)
    c.setUint16(6, 20, true)
    c.setUint16(8, 0x0800, true)
    c.setUint16(10, 8, true)
    c.setUint32(16, crc, true)
    c.setUint32(20, comp.length, true)
    c.setUint32(24, raw.length, true)
    c.setUint16(28, name.length, true)
    c.setUint32(42, off, true)
    central.push(new Uint8Array(c.buffer), name)
    off += 30 + name.length + comp.length
  }
  const cdLen = central.reduce((a, x) => a + x.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, entries.length, true)
  end.setUint16(10, entries.length, true)
  end.setUint32(12, cdLen, true)
  end.setUint32(16, off, true)
  const all = [...parts, ...central, new Uint8Array(end.buffer)]
  const out = new Uint8Array(all.reduce((a, x) => a + x.length, 0))
  let o = 0
  for (const x of all) {
    out.set(x, o)
    o += x.length
  }
  return out
}

// ---------- XML helpers ----------

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
export const unescapeXml = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENT[e] ?? m)))
const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const attr = (tag: string, name: string) => {
  const m = new RegExp(`(?:^|\\s)(?:\\w+:)?${name}="([^"]*)"`).exec(tag)
  return m ? unescapeXml(m[1]) : undefined
}
const P = '(?:\\w+:)?' // optional namespace prefix (x:c, x:row …)
/** Concatenates the text of all <t> runs, ignoring phonetic hints (<rPh>). */
const runText = (xml: string) =>
  [...xml.replace(new RegExp(`<${P}rPh\\b[\\s\\S]*?</${P}rPh>`, 'g'), '').matchAll(new RegExp(`<${P}t(?:\\s[^>]*)?>([\\s\\S]*?)</${P}t>`, 'g'))].map((m) => unescapeXml(m[1])).join('')

// ---------- workbook ----------

export type Cell = string | number | boolean | Date | null
export interface Sheet {
  name: string
  rows: Cell[][]
  hidden: boolean
}

export function colIndex(ref: string): number {
  const m = /^([A-Z]+)/i.exec(ref)
  if (!m) return -1
  let n = 0
  for (const ch of m[1].toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64
  return n - 1
}
export function colName(i: number): string {
  let s = ''
  for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s
  return s
}

const BUILTIN_DATE = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57])
/** True when a number format code shows a date or time (ignores quoted text, [colours] and escapes). */
export function isDateFormat(code: string): boolean {
  const c = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '').replace(/_./g, '')
  return /[dmyhs]/i.test(c) && !/^[#0.,%E+\-\s]*$/i.test(c)
}

/** Excel serial → JS Date (UTC). Handles the 1900 leap-year bug and the 1904 system. */
export function serialToDate(serial: number, date1904 = false): Date {
  let days = serial
  if (!date1904 && serial < 61) days += 1 // serials before the fake 29 Feb 1900
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 31)
  return new Date(epoch + Math.round((days - (date1904 ? 0 : 1)) * 86400000))
}

export async function readXlsx(buf: Uint8Array): Promise<Sheet[]> {
  const files = await unzip(buf)
  const dec = new TextDecoder()
  const text = (n: string) => {
    const f = files.get(n) ?? files.get(n.replace(/^\//, ''))
    return f ? dec.decode(f) : ''
  }
  const wb = text('xl/workbook.xml')
  if (!wb) throw new Error('No xl/workbook.xml — this is a ZIP but not an Excel workbook.')
  const date1904 = /date1904="(1|true)"/.test(wb)
  const rels = new Map<string, string>()
  for (const m of text('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b([^>]*)>/g)) {
    const id = attr(m[1], 'Id')
    const target = attr(m[1], 'Target')
    if (id && target) rels.set(id, target.startsWith('/') ? target.slice(1) : `xl/${target}`)
  }
  const shared = [...text('xl/sharedStrings.xml').matchAll(new RegExp(`<${P}si\\b[^>]*>([\\s\\S]*?)</${P}si>|<${P}si\\s*/>`, 'g'))].map((m) => runText(m[1] ?? ''))
  // styles: which cell style index (s=) is a date format
  const st = text('xl/styles.xml')
  const custom = new Map<number, string>()
  for (const m of st.matchAll(new RegExp(`<${P}numFmt\\b([^>]*)/?>`, 'g'))) custom.set(Number(attr(m[1], 'numFmtId')), attr(m[1], 'formatCode') ?? '')
  const xfs = new RegExp(`<${P}cellXfs\\b[^>]*>([\\s\\S]*?)</${P}cellXfs>`).exec(st)?.[1] ?? ''
  const dateStyle = [...xfs.matchAll(new RegExp(`<${P}xf\\b([^>]*?)/?>`, 'g'))].map((m) => {
    const id = Number(attr(m[1], 'numFmtId') ?? 0)
    return BUILTIN_DATE.has(id) || (custom.has(id) && isDateFormat(custom.get(id)!))
  })

  const sheets: Sheet[] = []
  for (const m of wb.matchAll(new RegExp(`<${P}sheet\\b([^>]*)/?>`, 'g'))) {
    const name = attr(m[1], 'name') ?? `Sheet${sheets.length + 1}`
    const rid = attr(m[1], 'id')
    const path = (rid && rels.get(rid)) || `xl/worksheets/sheet${sheets.length + 1}.xml`
    const xml = text(path)
    const rows: Cell[][] = []
    let rIdx = -1
    for (const r of xml.matchAll(new RegExp(`<${P}row\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${P}row>)`, 'g'))) {
      const rn = attr(r[1], 'r')
      rIdx = rn ? Number(rn) - 1 : rIdx + 1
      const row: Cell[] = []
      let cIdx = -1
      for (const c of (r[2] ?? '').matchAll(new RegExp(`<${P}c\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${P}c>)`, 'g'))) {
        const ref = attr(c[1], 'r')
        cIdx = ref ? colIndex(ref) : cIdx + 1
        const t = attr(c[1], 't') ?? 'n'
        const s = Number(attr(c[1], 's') ?? 0)
        const inner = c[2] ?? ''
        const v = new RegExp(`<${P}v>([\\s\\S]*?)</${P}v>`).exec(inner)?.[1]
        let val: Cell = null
        if (t === 's') val = v !== undefined ? (shared[Number(v)] ?? '') : null
        else if (t === 'inlineStr') val = runText(inner)
        else if (t === 'str' || t === 'e') val = v !== undefined ? unescapeXml(v) : null
        else if (t === 'b') val = v === '1'
        else if (t === 'd') val = v ? new Date(v) : null
        else if (v !== undefined && v !== '') {
          const n = Number(v)
          val = dateStyle[s] ? serialToDate(n, date1904) : n
        }
        row[cIdx] = val
      }
      for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = null
      rows[rIdx] = row
    }
    for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = []
    sheets.push({ name, rows, hidden: /state="(hidden|veryHidden)"/.test(m[1]) })
  }
  return sheets
}

// ---------- CSV ----------

export interface CsvOpts {
  delimiter: string
  quoteAll: boolean
  eol: '\n' | '\r\n'
  dates: 'iso' | 'datetime' | 'us' | 'eu'
  trim: boolean
  decimal: '.' | ','
  /** strip leading/trailing spaces from text cells */
  trimText?: boolean
}

export function formatCell(v: Cell, o: CsvOpts): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  if (typeof v === 'number') {
    const s = Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(15)))
    return o.decimal === ',' ? s.replace('.', ',') : s
  }
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return ''
    const iso = v.toISOString()
    const [d, tm] = [iso.slice(0, 10), iso.slice(11, 19)]
    const hasTime = tm !== '00:00:00'
    const day = o.dates === 'us' ? `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(0, 4)}` : o.dates === 'eu' ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : d
    if (d === '1899-12-30' || d === '1899-12-31') return tm // pure time value
    return hasTime || o.dates === 'datetime' ? `${day} ${tm}` : day
  }
  return v
}

export function toCsvText(rows: Cell[][], o: CsvOpts): string {
  let data = rows.map((r) => r.map((c) => (o.trimText ? formatCell(c, o).trim() : formatCell(c, o))))
  if (o.trim) {
    while (data.length && data[data.length - 1].every((c) => c === '')) data.pop()
    const width = Math.max(0, ...data.map((r) => { let n = r.length; while (n && r[n - 1] === '') n--; return n }))
    data = data.map((r) => r.slice(0, width))
  }
  const width = Math.max(0, ...data.map((r) => r.length))
  const needs = new RegExp(`["\\r\\n${o.delimiter === '\t' ? '\\t' : o.delimiter.replace(/[|\\^$*+?.()[\]{}]/g, '\\$&')}]|^\\s|\\s$`)
  return data
    .map((r) => Array.from({ length: width }, (_, i) => r[i] ?? '').map((c) => (o.quoteAll || needs.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(o.delimiter))
    .join(o.eol) + (data.length ? o.eol : '')
}

// ---------- sample workbook ----------

/** Builds a small but realistic .xlsx (shared strings, dates, booleans, formulas, inline strings, hidden sheet). */
export async function sampleXlsx(): Promise<Uint8Array> {
  const strings: string[] = []
  const si = (s: string) => {
    let i = strings.indexOf(s)
    if (i < 0) i = strings.push(s) - 1
    return i
  }
  type In = string | number | boolean | { d: number } | { f: string; v: number } | { is: string }
  const sheetXml = (rows: In[][]) =>
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows
      .map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
        const ref = `${colName(ci)}${ri + 1}`
        if (typeof v === 'string') return v === '' ? '' : `<c r="${ref}" t="s"><v>${si(v)}</v></c>`
        if (typeof v === 'number') return `<c r="${ref}" s="2"><v>${v}</v></c>`
        if (typeof v === 'boolean') return `<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`
        if ('d' in v) return `<c r="${ref}" s="1"><v>${v.d}</v></c>`
        if ('f' in v) return `<c r="${ref}" s="2"><f>${escapeXml(v.f)}</f><v>${v.v}</v></c>`
        return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(v.is)}</t></is></c>`
      }).join('')}</row>`)
      .join('')}</sheetData></worksheet>`
  const sales: In[][] = [['Date', 'Region', 'Product', 'Units', 'Unit price', 'Revenue', 'Paid']]
  const products: [string, number][] = [['Widget "Pro"', 24.5], ['Gadget, large', 89], ['Cable 2 m', 7.25], ['Dock', 129.99]]
  const regions = ['North', 'South', 'East', 'West']
  for (let i = 0; i < 18; i++) {
    const [p, price] = products[(i * 3) % 4]
    const units = 3 + ((i * 37) % 41)
    const r = i + 2
    sales.push([{ d: 46023 + i * 3 }, regions[i % 4], p, units, price, { f: `D${r}*E${r}`, v: Math.round(units * price * 100) / 100 }, i % 3 !== 0])
  }
  sales.push(['', '', 'Total', { f: 'SUM(D2:D19)', v: sales.slice(1).reduce((a, r) => a + (r[3] as number), 0) }, '', { f: 'SUM(F2:F19)', v: Math.round(sales.slice(1).reduce((a, r) => a + (r[5] as { v: number }).v, 0) * 100) / 100 }])
  const staff: In[][] = [
    ['ID', 'Name', 'Department', 'Start date', 'Salary', 'Notes'],
    [101, 'Olena Kovalenko', 'Engineering', { d: 44200 }, 72000, { is: 'Team lead;\nmentors two juniors' }],
    [102, 'James O’Brien', 'Sales', { d: 44929 }, 58000, ''],
    [103, 'Mei Tanaka', 'Design', { d: 45310 }, 61500, { is: 'Remote — Kyoto' }],
    [104, 'Lucas Müller', 'Engineering', { d: 45658 }, 69000, ''],
    [105, 'Ana Souza', 'Support', { d: 45900 }, 47250, { is: 'Part-time, 0.8 FTE' }],
  ]
  const notes: In[][] = [['Internal lookup (hidden sheet)'], ['VAT', 0.2], ['FX EUR', 1.08]]
  const s1 = sheetXml(sales), s2 = sheetXml(staff), s3 = sheetXml(notes)
  const sst = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">${strings.map((s) => `<si><t xml:space="preserve">${escapeXml(s)}</t></si>`).join('')}</sst>`
  const ws = (n: number) => `<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  return zipDeflate([
    { name: '[Content_Types].xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${ws(1)}${ws(2)}${ws(3)}<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
    { name: '_rels/.rels', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sales Q1" sheetId="1" r:id="rId1"/><sheet name="Staff" sheetId="2" r:id="rId2"/><sheet name="Lookup" sheetId="3" state="hidden" r:id="rId3"/></sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd"/></numFmts><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>` },
    { name: 'xl/worksheets/sheet1.xml', text: s1 },
    { name: 'xl/worksheets/sheet2.xml', text: s2 },
    { name: 'xl/worksheets/sheet3.xml', text: s3 },
    { name: 'xl/sharedStrings.xml', text: sst },
  ])
}
