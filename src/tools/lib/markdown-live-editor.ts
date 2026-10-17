// A compact Markdown → HTML converter (CommonMark core + GFM tables, task lists, strikethrough, autolinks).
// Raw HTML is escaped unless `allowHtml` is set (the caller must then sanitize the output).

export interface MdOptions { allowHtml?: boolean }
export interface Heading { level: number; text: string; id: string }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Blocks script-capable URL schemes; allows data: only for raster images. */
export function safeUrl(u: string, image = false): string {
  // eslint-disable-next-line no-control-regex
  const t = u.trim().replace(/[\u0000-\u001f\s]/g, '')
  if (/^(javascript|vbscript|file):/i.test(t)) return '#'
  if (/^data:/i.test(t) && !(image && /^data:image\/(png|gif|jpe?g|webp);/i.test(t))) return '#'
  return u.trim()
}

export const slug = (s: string) => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-') || 'section'

/** Inline formatting. */
export function inline(src: string, o: MdOptions = {}): string {
  const keep: string[] = []
  const hold = (html: string) => `\uE000${keep.push(html) - 1}\uE001`
  let s = src
  // code spans first: their content is literal
  s = s.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_, _t, code: string) => hold(`<code>${esc(code.replace(/^ (.*) $/, '$1'))}</code>`))
  // backslash escapes
  s = s.replace(/\\([\\`*_{}[\]()#+\-.!|~<>"'])/g, (_, c: string) => hold(esc(c)))
  // autolinks <https://…>
  s = s.replace(/<((?:https?|mailto|ftp):[^\s<>]+)>/gi, (_, u: string) => hold(`<a href="${esc(safeUrl(u))}">${esc(u)}</a>`))
  // inline html (kept only when allowed)
  if (o.allowHtml) s = s.replace(/<\/?[a-zA-Z][^<>]*>/g, (t) => hold(t))
  s = esc(s)
  // images and links: ![alt](src "title"), [text](href "title")
  s = s.replace(/!\[([^\]]*)\]\(\s*([^\s)]+)(?:\s+&quot;(.*?)&quot;)?\s*\)/g, (_, alt: string, u: string, t?: string) =>
    hold(`<img src="${esc(safeUrl(unesc(u), true))}" alt="${alt}"${t ? ` title="${t}"` : ''} loading="lazy">`))
  s = s.replace(/\[((?:[^[\]]|\[[^\]]*\])+)\]\(\s*([^\s)]+)(?:\s+&quot;(.*?)&quot;)?\s*\)/g, (_, text: string, u: string, t?: string) =>
    hold(`<a href="${esc(safeUrl(unesc(u)))}"${t ? ` title="${t}"` : ''}>${emph(text)}</a>`))
  // bare URLs
  s = s.replace(/(^|[\s(])((?:https?:\/\/|www\.)[^\s<]*[^\s<.,:;"')\]])/g, (_, pre: string, u: string) =>
    pre + hold(`<a href="${esc(safeUrl(u.startsWith('www.') ? 'https://' + unesc(u) : unesc(u)))}">${u}</a>`))
  s = emph(s)
  // hard breaks: two trailing spaces or backslash before newline
  s = s.replace(/(?: {2,}|\\)\n/g, '<br>\n')
  const restore = (x: string) => x.replace(/\uE000(\d+)\uE001/g, (_, i: string) => keep[+i])
  return restore(restore(s))
}

const unesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&')

function emph(s: string): string {
  return s
    .replace(/(\*\*\*|___)(?=\S)([\s\S]*?\S)\1/g, '<strong><em>$2</em></strong>')
    .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, (m, d: string, t: string, off: number, all: string) =>
      d === '__' && (/\w/.test(all[off - 1] ?? '') || /\w/.test(all[off + m.length] ?? '')) ? m : `<strong>${t}</strong>`)
    .replace(/(^|[^*\w])\*(?=[^\s*])([\s\S]*?[^\s*])\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/(^|[^_\w])_(?=[^\s_])([\s\S]*?[^\s_])_(?![_\w])/g, '$1<em>$2</em>')
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>')
}

const RE = {
  fence: /^ {0,3}(`{3,}|~{3,})\s*([\w+#.-]*).*$/,
  atx: /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/,
  hr: /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/,
  quote: /^ {0,3}> ?/,
  item: /^( {0,3})([-*+]|\d{1,9}[.)])([ \t]+|$)/,
  tableSep: /^ *\|? *:?-+:? *(\| *:?-+:? *)*\|? *$/,
  html: /^ {0,3}<\/?([a-zA-Z][\w-]*)(\s|\/?>|$)/,
}
const isBlank = (l: string) => /^\s*$/.test(l)
const startsBlock = (l: string) => RE.fence.test(l) || RE.atx.test(l) || RE.hr.test(l) || RE.quote.test(l) || RE.item.test(l)

function cells(row: string): string[] {
  let r = row.trim()
  if (r.startsWith('|')) r = r.slice(1)
  if (r.endsWith('|') && !r.endsWith('\\|')) r = r.slice(0, -1)
  const out: string[] = []
  let cur = ''
  for (let i = 0; i < r.length; i++) {
    if (r[i] === '\\' && r[i + 1] === '|') {
      cur += '|'
      i++
    } else if (r[i] === '|') {
      out.push(cur.trim())
      cur = ''
    } else cur += r[i]
  }
  out.push(cur.trim())
  return out
}

class Parser {
  ids = new Map<string, number>()
  headings: Heading[] = []
  o: MdOptions
  constructor(o: MdOptions) {
    this.o = o
  }

  heading(level: number, raw: string) {
    const html = inline(raw, this.o)
    let id = slug(html)
    const n = this.ids.get(id) ?? 0
    this.ids.set(id, n + 1)
    if (n) id += `-${n}`
    this.headings.push({ level, text: html.replace(/<[^>]+>/g, ''), id })
    return `<h${level} id="${id}">${html}</h${level}>`
  }

  blocks(lines: string[]): string {
    const out: string[] = []
    let i = 0
    while (i < lines.length) {
      const l = lines[i]
      if (isBlank(l)) {
        i++
        continue
      }
      let m: RegExpExecArray | null
      if ((m = RE.fence.exec(l))) {
        const fence = m[1], lang = m[2]
        const body: string[] = []
        i++
        while (i < lines.length && !new RegExp(`^ {0,3}${fence[0]}{${fence.length},}\\s*$`).test(lines[i])) body.push(lines[i++])
        i++
        out.push(`<pre><code${lang ? ` class="language-${esc(lang)}"` : ''}>${esc(body.join('\n'))}${body.length ? '\n' : ''}</code></pre>`)
        continue
      }
      if ((m = RE.atx.exec(l))) {
        out.push(this.heading(m[1].length, m[2] ?? ''))
        i++
        continue
      }
      if (RE.hr.test(l)) {
        out.push('<hr>')
        i++
        continue
      }
      if (RE.quote.test(l)) {
        const body: string[] = []
        while (i < lines.length && (RE.quote.test(lines[i]) || (!isBlank(lines[i]) && !startsBlock(lines[i]) && body.length && !isBlank(body[body.length - 1])))) body.push(lines[i++].replace(RE.quote, ''))
        out.push(`<blockquote>\n${this.blocks(body)}\n</blockquote>`)
        continue
      }
      if ((m = RE.item.exec(l))) {
        const r = this.list(lines, i)
        out.push(r.html)
        i = r.next
        continue
      }
      if (/^( {4}|\t)/.test(l)) {
        const body: string[] = []
        while (i < lines.length && (/^( {4}|\t)/.test(lines[i]) || isBlank(lines[i]))) body.push(lines[i++].replace(/^( {4}|\t)/, ''))
        while (body.length && isBlank(body[body.length - 1])) body.pop()
        out.push(`<pre><code>${esc(body.join('\n'))}\n</code></pre>`)
        continue
      }
      if (l.includes('|') && i + 1 < lines.length && RE.tableSep.test(lines[i + 1]) && lines[i + 1].includes('-')) {
        const head = cells(l)
        const align = cells(lines[i + 1]).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : c.startsWith(':') ? 'left' : ''))
        i += 2
        const rows: string[][] = []
        while (i < lines.length && !isBlank(lines[i]) && lines[i].includes('|')) rows.push(cells(lines[i++]))
        const td = (tag: string, c: string, k: number) => `<${tag}${align[k] ? ` style="text-align:${align[k]}"` : ''}>${inline(c, this.o)}</${tag}>`
        out.push(`<table>\n<thead><tr>${head.map((c, k) => td('th', c, k)).join('')}</tr></thead>\n<tbody>\n${rows.map((r) => `<tr>${head.map((_, k) => td('td', r[k] ?? '', k)).join('')}</tr>`).join('\n')}\n</tbody>\n</table>`)
        continue
      }
      if (this.o.allowHtml && RE.html.test(l)) {
        const body: string[] = []
        while (i < lines.length && !isBlank(lines[i])) body.push(lines[i++])
        out.push(body.join('\n'))
        continue
      }
      // paragraph (with setext heading detection)
      const para: string[] = []
      while (i < lines.length && !isBlank(lines[i])) {
        if (para.length && (startsBlock(lines[i]) && !/^ {0,3}(=+|-+)\s*$/.test(lines[i]))) break
        if (para.length && /^ {0,3}=+\s*$/.test(lines[i])) {
          out.push(this.heading(1, para.join('\n').trim()))
          para.length = 0
          i++
          break
        }
        if (para.length && /^ {0,3}-+\s*$/.test(lines[i])) {
          out.push(this.heading(2, para.join('\n').trim()))
          para.length = 0
          i++
          break
        }
        para.push(lines[i++])
      }
      if (para.length) out.push(`<p>${inline(para.map((p) => p.replace(/^ {1,3}/, '')).join('\n').replace(/[ \t]+$/, ''), this.o)}</p>`)
    }
    return out.join('\n')
  }

  list(lines: string[], start: number): { html: string; next: number } {
    const first = RE.item.exec(lines[start])!
    const ordered = /\d/.test(first[2])
    const startNum = ordered ? parseInt(first[2], 10) : 1
    const items: string[][] = []
    let loose = false
    let i = start
    while (i < lines.length) {
      const m = RE.item.exec(lines[i])
      if (!m || /\d/.test(m[2]) !== ordered) break
      const indent = m[0].length + (m[3] === '' ? 1 : 0)
      const body = [lines[i].slice(m[0].length)]
      i++
      let sawBlank = false
      while (i < lines.length) {
        const l = lines[i]
        if (isBlank(l)) {
          sawBlank = true
          body.push('')
          i++
          continue
        }
        const ind = /^ */.exec(l)![0].length
        if (ind >= Math.min(indent, 4)) {
          if (sawBlank) loose = true
          body.push(l.slice(Math.min(ind, indent)))
          sawBlank = false
          i++
          continue
        }
        if (!sawBlank && !startsBlock(l)) {
          body.push(l) // lazy continuation
          i++
          continue
        }
        break
      }
      while (body.length && isBlank(body[body.length - 1])) body.pop()
      items.push(body)
      const nx = i < lines.length ? RE.item.exec(lines[i]) : null
      if (sawBlank && nx && /\d/.test(nx[2]) === ordered) loose = true
    }
    const lis = items.map((b) => {
      let task = ''
      const tm = /^\[([ xX])\][ \t]+/.exec(b[0])
      if (tm) {
        task = `<input type="checkbox" disabled${tm[1] !== ' ' ? ' checked' : ''}> `
        b = [b[0].slice(tm[0].length), ...b.slice(1)]
      }
      let html = this.blocks(b)
      if (!loose) html = html.replace(/^<p>([\s\S]*?)<\/p>/, '$1').replace(/\n<p>([\s\S]*?)<\/p>/g, '\n$1')
      return `<li${task ? ' class="task"' : ''}>${task}${html}</li>`
    })
    const tag = ordered ? 'ol' : 'ul'
    return { html: `<${tag}${ordered && startNum !== 1 ? ` start="${startNum}"` : ''}>\n${lis.join('\n')}\n</${tag}>`, next: i }
  }
}

export function markdown(src: string, o: MdOptions = {}): { html: string; headings: Heading[] } {
  const p = new Parser(o)
  const html = p.blocks(src.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n'))
  return { html, headings: p.headings }
}

export function textStats(src: string) {
  const text = src.replace(/```[\s\S]*?```/g, ' ').replace(/[#>*_`~[\]()!|-]/g, ' ')
  const words = (text.match(/[\p{L}\p{N}'’]+/gu) ?? []).length
  return { words, chars: src.length, minutes: Math.max(1, Math.round(words / 230)) }
}
