// Template filling + a minimal DOCX (Office Open XML) writer.
import { zipStore } from './pdf-splitter'

/** Placeholder keys used in a template, in order of first use. */
export function placeholders(tpl: string): string[] {
  return [...new Set([...tpl.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map((m) => m[1]))]
}

/** Replaces {{key}}; missing/empty values become `[Label]` unless `keep` is a function deciding the output. */
export function fill(tpl: string, values: Record<string, string>, missing: (k: string) => string = (k) => `[${k}]`): string {
  return tpl.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k: string) => (values[k]?.trim() ? values[k].trim() : missing(k)))
}

export const words = (s: string) => (s.match(/[\p{L}\p{N}'’-]+/gu) ?? []).length

/** Splits a run of text with **bold** markers into segments. */
export function boldRuns(text: string): { t: string; b: boolean }[] {
  const out: { t: string; b: boolean }[] = []
  text.split(/(\*\*[^*]+\*\*)/).forEach((p) => {
    if (!p) return
    if (/^\*\*[^*]+\*\*$/.test(p)) out.push({ t: p.slice(2, -2), b: true })
    else out.push({ t: p, b: false })
  })
  return out
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export interface DocxOpts {
  font?: string
  sizePt?: number
  marginCm?: number
  title?: string
  author?: string
}

/** Builds word/document.xml body paragraphs. Blank lines separate paragraphs; single newlines become line breaks. */
export function documentXml(text: string, o: DocxOpts = {}): string {
  const half = Math.round((o.sizePt ?? 11) * 2)
  const font = esc(o.font ?? 'Calibri')
  const rpr = (b: boolean) => `<w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}"/>${b ? '<w:b/>' : ''}<w:sz w:val="${half}"/><w:szCs w:val="${half}"/></w:rPr>`
  const paras = text.replace(/\r\n/g, '\n').split(/\n{2,}/)
  const body = paras
    .map((p) => {
      const lines = p.split('\n')
      const runs = lines
        .map((line, i) => (i ? '<w:r><w:br/></w:r>' : '') + boldRuns(line).map((r) => `<w:r>${rpr(r.b)}<w:t xml:space="preserve">${esc(r.t)}</w:t></w:r>`).join(''))
        .join('')
      return `<w:p><w:pPr><w:spacing w:after="${Math.round(half * 10)}" w:line="276" w:lineRule="auto"/></w:pPr>${runs}</w:p>`
    })
    .join('')
  const m = Math.round(((o.marginCm ?? 2.54) / 2.54) * 1440)
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="${m}" w:right="${m}" w:bottom="${m}" w:left="${m}" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`
}

/** A complete .docx file (ZIP) for plain letter-style text. */
export function makeDocx(text: string, o: DocxOpts = {}): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder()
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
  const files: [string, string][] = [
    [
      '[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`,
    ],
    [
      '_rels/.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
    ],
    [
      'docProps/core.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(o.title ?? 'Document')}</dc:title><dc:creator>${esc(o.author ?? '')}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>`,
    ],
    ['word/document.xml', documentXml(text, o)],
  ]
  return zipStore(files.map(([name, s]) => ({ name, data: enc.encode(s) }))) as Uint8Array<ArrayBuffer>
}
