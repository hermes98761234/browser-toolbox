// NDA templating (handlebars-style {{var}} and {{#if flag}}…{{else}}…{{/if}}) and a minimal DOCX writer.
import { makeZip } from './image-compressor'

export type Vars = Record<string, string | number | boolean>

/** Renders {{name}}, {{#if flag}}…{{else}}…{{/if}} (nestable) and {{#unless flag}}…{{/unless}}. */
export function render(tpl: string, v: Vars): string {
  let s = tpl
  // Innermost blocks first so nesting works.
  const block = /\{\{#(if|unless) (\w+)\}\}((?:(?!\{\{#(?:if|unless) )[\s\S])*?)\{\{\/\1\}\}/
  for (let m = block.exec(s); m; m = block.exec(s)) {
    const [yes, no = ''] = m[3].split('{{else}}')
    const truthy = !!v[m[2]]
    s = s.slice(0, m.index) + ((m[1] === 'if') === truthy ? yes : no) + s.slice(m.index + m[0].length)
  }
  return s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => (v[k] === undefined || v[k] === '' ? `[${k}]` : String(v[k])))
}

export interface Section {
  heading: string
  paras: string[]
}

/** Splits rendered text into numbered sections: lines starting with "## " are headings, blank lines separate paragraphs. */
export function toSections(text: string): Section[] {
  const out: Section[] = []
  let cur: Section = { heading: '', paras: [] }
  for (const block of text.split(/\n\s*\n/)) {
    const t = block.trim().replace(/[ \t]*\n[ \t]*/g, ' ')
    if (!t) continue
    if (t.startsWith('## ')) {
      if (cur.heading || cur.paras.length) out.push(cur)
      cur = { heading: t.slice(3), paras: [] }
    } else cur.paras.push(t)
  }
  if (cur.heading || cur.paras.length) out.push(cur)
  return out
}

export const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** **bold** spans become bold runs. */
function runs(text: string, size = 22): string {
  return text
    .split(/(\*\*[^*]+\*\*)/)
    .filter(Boolean)
    .map((p) => {
      const b = p.startsWith('**') && p.endsWith('**')
      const t = b ? p.slice(2, -2) : p
      return `<w:r><w:rPr>${b ? '<w:b/>' : ''}<w:sz w:val="${size}"/></w:rPr><w:t xml:space="preserve">${xmlEscape(t)}</w:t></w:r>`
    })
    .join('')
}

export function documentXml(title: string, sections: Section[]): string {
  const p = (inner: string, ppr = '') => `<w:p><w:pPr>${ppr}<w:spacing w:after="120" w:line="300" w:lineRule="auto"/></w:pPr>${inner}</w:p>`
  const body: string[] = [p(runs(`**${title}**`, 32), '<w:jc w:val="center"/>')]
  sections.forEach((s, i) => {
    if (s.heading) body.push(p(runs(`**${s.heading.match(/^\d/) ? s.heading : `${i}. ${s.heading}`}**`, 24), '<w:keepNext/>'))
    for (const para of s.paras) body.push(p(runs(para), '<w:jc w:val="both"/>'))
  })
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1418" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>`
}

export function makeDocx(title: string, sections: Section[]): Uint8Array {
  const enc = new TextEncoder()
  const files: [string, string][] = [
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>'],
    ['docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xmlEscape(title)}</dc:title><dc:creator>Browser Toolbox</dc:creator></cp:coreProperties>`],
    ['word/document.xml', documentXml(title, sections)],
  ]
  return makeZip(files.map(([name, s]) => ({ name, data: enc.encode(s) })))
}

/** Plain text / Markdown rendering with numbered headings. */
export function toMarkdown(title: string, sections: Section[]): string {
  return [`# ${title}`, ...sections.map((s, i) => [s.heading ? `## ${i}. ${s.heading}` : '', ...s.paras].filter(Boolean).join('\n\n'))].join('\n\n') + '\n'
}
