// Mail-merge core: {{field | filter}} placeholders for plain text and DOCX (WordprocessingML),
// a tiny ZIP reader (stored + deflate via DecompressionStream) for .docx templates.

export type Row = Record<string, string>

const PH = /\{\{\s*([^{}|]+?)\s*(?:\|\s*([^{}]*?)\s*)?\}\}/g

/** Unique field names used in a template (first-seen order). */
export function fields(tpl: string): string[] {
  return [...new Set([...tpl.matchAll(PH)].map((m) => m[1].trim()))]
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** Apply a pipe filter: upper, lower, title, money[:sym], number, date, default:x. */
export function applyFilter(v: string, filter: string): string {
  const [name, ...rest] = filter.split(':')
  const arg = rest.join(':').trim()
  const f = name.trim().toLowerCase()
  if (f === 'default') return v.trim() === '' ? arg : v
  if (v.trim() === '') return v
  if (f === 'upper') return v.toUpperCase()
  if (f === 'lower') return v.toLowerCase()
  if (f === 'title') return v.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase())
  if (f === 'money' || f === 'number') {
    const n = Number(v.replace(/[^\d.-]/g, ''))
    if (!Number.isFinite(n)) return v
    const s = n.toLocaleString('en-US', { minimumFractionDigits: f === 'money' ? 2 : 0, maximumFractionDigits: 2 })
    return f === 'money' ? (arg || '$') + s : s
  }
  if (f === 'date') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim())
    return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}` : v
  }
  return v
}

function lookup(row: Row, key: string): string | undefined {
  if (key in row) return row[key]
  const k = Object.keys(row).find((x) => x.toLowerCase() === key.toLowerCase())
  return k === undefined ? undefined : row[k]
}

/** Fill a text template. Unknown fields become `missing(name)`. */
export function fillText(tpl: string, row: Row, missing: (k: string) => string = (k) => `[${k}]`): string {
  return tpl.replace(PH, (_, key: string, filters?: string) => {
    let v = lookup(row, key.trim())
    if (v === undefined) return missing(key.trim())
    for (const f of (filters ?? '').split('|').filter((x) => x.trim())) v = applyFilter(v, f)
    return v
  })
}

const xmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const xmlUnesc = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')

/**
 * Fill placeholders inside WordprocessingML. Word often splits "{{name}}" across several runs,
 * so each paragraph's <w:t> texts are joined, replaced, and the result is written back: the
 * replacement goes into the run where the placeholder starts and the rest of it is removed.
 */
export function fillDocxXml(xml: string, row: Row, missing?: (k: string) => string): string {
  return xml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, (para) => {
    const re = /(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/g
    const nodes = [...para.matchAll(re)]
    if (!nodes.length) return para
    const texts = nodes.map((n) => xmlUnesc(n[2]))
    const joined = texts.join('')
    if (!joined.includes('{{')) return para
    // owner node for each character of the joined text
    const owner: number[] = []
    texts.forEach((t, i) => { for (let k = 0; k < t.length; k++) owner.push(i) })
    const out = texts.map(() => '')
    let pos = 0
    for (const m of joined.matchAll(PH)) {
      for (; pos < m.index!; pos++) out[owner[pos]] += joined[pos]
      out[owner[m.index!]] += fillText(m[0], row, missing)
      pos = m.index! + m[0].length
    }
    for (; pos < joined.length; pos++) out[owner[pos]] += joined[pos]
    let i = 0
    return para.replace(re, () => {
      const t = out[i++]
      return `<w:t xml:space="preserve">${xmlEsc(t)}</w:t>`
    })
  })
}

/** Plain text of a WordprocessingML body (paragraphs separated by blank lines) — for previews and field detection. */
export function docxText(xml: string): string {
  return (xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? [])
    .map((p) => [...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:br\/>|<w:tab\/>/g)].map((m) => (m[0].startsWith('<w:br') ? '\n' : m[0].startsWith('<w:tab') ? '\t' : xmlUnesc(m[1]))).join(''))
    .join('\n')
}

export interface ZipEntry { name: string; data: Uint8Array }

/** Reads a ZIP archive (stored or deflated entries). */
export async function unzip(buf: Uint8Array): Promise<ZipEntry[]> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) throw new Error('Not a ZIP / DOCX file')
  const count = dv.getUint16(eocd + 10, true)
  let p = dv.getUint32(eocd + 16, true)
  const dec = new TextDecoder()
  const out: ZipEntry[] = []
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Corrupt ZIP directory')
    const method = dv.getUint16(p + 10, true)
    const size = dv.getUint32(p + 20, true)
    const nameLen = dv.getUint16(p + 28, true), extra = dv.getUint16(p + 30, true), comment = dv.getUint16(p + 32, true)
    const local = dv.getUint32(p + 42, true)
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen))
    p += 46 + nameLen + extra + comment
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true)
    const raw = buf.subarray(start, start + size)
    if (name.endsWith('/')) continue
    if (method === 0) out.push({ name, data: raw.slice() })
    else if (method === 8) {
      const ds = new Blob([raw.slice()]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
      out.push({ name, data: new Uint8Array(await new Response(ds).arrayBuffer()) })
    } else throw new Error(`Unsupported ZIP method ${method} in ${name}`)
  }
  return out
}

/** Safe file name from a pattern like "{{name}} - offer". */
export function fileName(pattern: string, row: Row, i: number): string {
  const base = fillText(pattern || 'document-{{#}}', { '#': String(i + 1), ...row }, () => '')
  return base.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || `document-${i + 1}`
}
