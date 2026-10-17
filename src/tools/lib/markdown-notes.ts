// Markdown → HTML (safe, escaped), full-text search with prefix matching, and a tiny ZIP writer (stored).

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const safeUrl = (u: string) => (/^(https?:|mailto:|#|\/|\.)/i.test(u.trim()) ? u.trim() : '#')

function inline(src: string): string {
  const keep: string[] = []
  const put = (h: string) => `\u0001${keep.push(h) - 1}\u0001`
  let s = src.replace(/`([^`]+)`/g, (_, c: string) => put(`<code>${esc(c)}</code>`))
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, a: string, u: string) => put(`<img alt="${esc(a)}" src="${esc(safeUrl(u))}">`))
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t: string, u: string) => put(`<a href="${esc(safeUrl(u))}" target="_blank" rel="noreferrer">${esc(t)}</a>`))
  s = s.replace(/\[\[([^\]]+)\]\]/g, (_, t: string) => put(`<a href="#" data-note="${esc(t)}" class="wiki">${esc(t)}</a>`))
  s = s.replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)]/g, (u) => put(`<a href="${esc(u)}" target="_blank" rel="noreferrer">${esc(u)}</a>`))
  s = esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|[^_\w])_([^_\n]+)_/g, '$1<em>$2</em>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    .replace(/==(.+?)==/g, '<mark>$1</mark>')
  // eslint-disable-next-line no-control-regex
  return s.replace(/\u0001(\d+)\u0001/g, (_, i: string) => keep[Number(i)])
}

/** Renders CommonMark-ish markdown: headings, lists (incl. tasks), quotes, code, tables, hr, links, [[wiki links]]. */
export function md(src: string): string {
  const lines = src.replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []
  let i = 0
  const isBlockStart = (l: string) => /^(#{1,6}\s|```|>|\s*([-*+]|\d+[.)])\s|\|)/.test(l) || /^\s*([-*_])(\s*\1){2,}\s*$/.test(l)
  while (i < lines.length) {
    const l = lines[i]
    if (!l.trim()) { i++; continue }
    const fence = /^```\s*([\w-]*)/.exec(l)
    if (fence) {
      const body: string[] = []
      i++
      while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++])
      i++
      out.push(`<pre><code${fence[1] ? ` class="lang-${fence[1]}"` : ''}>${esc(body.join('\n'))}</code></pre>`)
      continue
    }
    const h = /^(#{1,6})\s+(.*?)\s*#*$/.exec(l)
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) { out.push('<hr>'); i++; continue }
    if (/^>/.test(l)) {
      const body: string[] = []
      while (i < lines.length && /^>/.test(lines[i])) body.push(lines[i++].replace(/^>\s?/, ''))
      out.push(`<blockquote>${md(body.join('\n'))}</blockquote>`)
      continue
    }
    if (/^\|/.test(l) && i + 1 < lines.length && /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(lines[i + 1])) {
      const cells = (r: string) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
      const head = cells(l)
      const align = cells(lines[i + 1]).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : ''))
      i += 2
      const rows: string[][] = []
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(cells(lines[i++]))
      const td = (tag: string, c: string, k: number) => `<${tag}${align[k] ? ` style="text-align:${align[k]}"` : ''}>${inline(c)}</${tag}>`
      out.push(`<table><thead><tr>${head.map((c, k) => td('th', c, k)).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${head.map((_, k) => td('td', r[k] ?? '', k)).join('')}</tr>`).join('')}</tbody></table>`)
      continue
    }
    const li = /^\s*([-*+]|\d+[.)])\s+/
    if (li.test(l)) {
      const ordered = /^\s*\d/.test(l)
      const items: string[] = []
      while (i < lines.length && (li.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
        if (li.test(lines[i])) items.push(lines[i].replace(li, ''))
        else items[items.length - 1] += ' ' + lines[i].trim()
        i++
      }
      const body = items.map((it) => {
        const task = /^\[([ xX])\]\s+(.*)$/.exec(it)
        return task ? `<li class="task"><input type="checkbox" disabled${task[1] !== ' ' ? ' checked' : ''}> ${inline(task[2])}</li>` : `<li>${inline(it)}</li>`
      })
      out.push(ordered ? `<ol>${body.join('')}</ol>` : `<ul>${body.join('')}</ul>`)
      continue
    }
    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !(para.length && isBlockStart(lines[i]))) para.push(lines[i++])
    out.push(`<p>${para.map(inline).join('<br>')}</p>`)
  }
  return out.join('\n')
}

// ---------- search ----------

export interface Doc { id: string; title: string; body: string; tags: string[] }
export const tokens = (s: string) => (s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').match(/[\p{L}\p{N}]+/gu) ?? [])

export interface Hit { id: string; score: number }

/** AND search over words (prefix match). `#tag` terms filter by tag. Title ×3, tag ×2, body ×1 per occurrence. */
export function search(docs: Doc[], query: string): Hit[] {
  const tagTerms = (query.match(/#[\p{L}\p{N}_-]+/gu) ?? []).map((t) => t.slice(1).toLowerCase())
  const terms = tokens(query.replace(/#[\p{L}\p{N}_-]+/gu, ' '))
  const hits: Hit[] = []
  for (const d of docs) {
    const tags = d.tags.map((t) => t.toLowerCase())
    if (!tagTerms.every((t) => tags.includes(t))) continue
    if (!terms.length) { hits.push({ id: d.id, score: 0 }); continue }
    const ti = tokens(d.title), bi = tokens(d.body), gi = tags.flatMap(tokens)
    let score = 0
    let ok = true
    for (const q of terms) {
      const c = (arr: string[]) => arr.reduce((a, w) => a + (w === q ? 1.5 : w.startsWith(q) ? 1 : 0), 0)
      const s = 3 * c(ti) + 2 * c(gi) + c(bi)
      if (!s) { ok = false; break }
      score += s
    }
    if (ok) hits.push({ id: d.id, score })
  }
  return hits.sort((a, b) => b.score - a.score)
}

/** Short excerpt around the first matching term. */
export function snippet(body: string, query: string, len = 140): string {
  const q = tokens(query.replace(/#\S+/g, ''))[0]
  const plain = body.replace(/[#>*_`~[\]()|-]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!q) return plain.slice(0, len)
  const at = plain.toLowerCase().indexOf(q)
  const from = Math.max(0, at - 40)
  return (from ? '…' : '') + plain.slice(from, from + len) + (from + len < plain.length ? '…' : '')
}

// ---------- zip ----------

const CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
export function crc32(b: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Uncompressed ("stored") ZIP archive with UTF-8 names. */
export function zip(files: { name: string; text: string }[], date = new Date()): Uint8Array {
  const enc = new TextEncoder()
  const dt = ((date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)) & 0xffff
  const dd = (((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const f of files) {
    const name = enc.encode(f.name)
    const data = enc.encode(f.text)
    const crc = crc32(data)
    const h = new DataView(new ArrayBuffer(30))
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true)
    h.setUint16(10, dt, true); h.setUint16(12, dd, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true)
    h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true)
    const c = new DataView(new ArrayBuffer(46))
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true)
    c.setUint16(10, 0, true); c.setUint16(12, dt, true); c.setUint16(14, dd, true); c.setUint32(16, crc, true)
    c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true)
    c.setUint32(42, offset, true)
    parts.push(new Uint8Array(h.buffer), name, data)
    central.push(new Uint8Array(c.buffer), name)
    offset += 30 + name.length + data.length
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0)
  const e = new DataView(new ArrayBuffer(22))
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true)
  e.setUint32(12, cdSize, true); e.setUint32(16, offset, true)
  const all = [...parts, ...central, new Uint8Array(e.buffer)]
  const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0))
  let p = 0
  for (const a of all) { out.set(a, p); p += a.length }
  return out
}
