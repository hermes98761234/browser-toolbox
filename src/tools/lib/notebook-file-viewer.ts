// Jupyter notebook (.ipynb) parsing, a small syntax highlighter, ANSI → HTML and script export.

export type Output =
  | { kind: 'stream'; name: string; text: string }
  | { kind: 'data'; mime: string; data: string; count?: number | null }
  | { kind: 'error'; ename: string; evalue: string; traceback: string }

export interface Cell {
  type: 'code' | 'markdown' | 'raw'
  source: string
  count: number | null
  outputs: Output[]
  attachments: Record<string, string>
}

export interface Notebook {
  cells: Cell[]
  lang: string
  kernel: string
  nbformat: string
  title: string
}

const text = (v: unknown): string => (Array.isArray(v) ? v.join('') : typeof v === 'string' ? v : v == null ? '' : JSON.stringify(v, null, 2))

/** Preferred display order, richest first (like Jupyter's own frontend). */
export const MIME_ORDER = ['application/vnd.jupyter.widget-view+json', 'text/html', 'image/svg+xml', 'image/png', 'image/jpeg', 'image/gif', 'text/markdown', 'text/latex', 'application/json', 'text/plain']

function pickMime(data: Record<string, unknown>): { mime: string; data: string } | null {
  const keys = Object.keys(data)
  for (const m of MIME_ORDER) {
    if (m === 'application/vnd.jupyter.widget-view+json') continue
    if (keys.includes(m)) return { mime: m, data: text(data[m]) }
  }
  const k = keys[0]
  return k ? { mime: k, data: text(data[k]) } : null
}

function parseOutput(o: Record<string, unknown>): Output | null {
  const t = String(o.output_type ?? '')
  if (t === 'stream') return { kind: 'stream', name: String(o.name ?? o.stream ?? 'stdout'), text: text(o.text) }
  if (t === 'error' || t === 'pyerr') return { kind: 'error', ename: String(o.ename ?? 'Error'), evalue: String(o.evalue ?? ''), traceback: text(Array.isArray(o.traceback) ? (o.traceback as string[]).join('\n') : o.traceback) }
  if (t === 'execute_result' || t === 'display_data' || t === 'pyout') {
    let data = o.data as Record<string, unknown> | undefined
    if (!data) {
      // nbformat 3: mime keys flattened onto the output (png, text, html, …)
      const map: Record<string, string> = { png: 'image/png', jpeg: 'image/jpeg', svg: 'image/svg+xml', html: 'text/html', latex: 'text/latex', json: 'application/json', text: 'text/plain' }
      data = {}
      for (const [k, m] of Object.entries(map)) if (o[k] !== undefined) data[m] = o[k]
    }
    const p = pickMime(data)
    return p ? { kind: 'data', ...p, count: (o.execution_count ?? o.prompt_number ?? null) as number | null } : null
  }
  return null
}

/** Parse ipynb JSON (nbformat 4, with best-effort support for nbformat 3). */
export function parseNotebook(src: string): Notebook {
  const j = JSON.parse(src) as Record<string, unknown>
  if (!j || typeof j !== 'object') throw new Error('Not a notebook')
  const meta = (j.metadata ?? {}) as Record<string, Record<string, unknown> | undefined>
  let raw = j.cells as Record<string, unknown>[] | undefined
  if (!raw && Array.isArray(j.worksheets)) raw = (j.worksheets as { cells?: Record<string, unknown>[] }[]).flatMap((w) => w.cells ?? [])
  if (!Array.isArray(raw)) throw new Error('No "cells" array: this does not look like a Jupyter notebook')
  const cells: Cell[] = raw.map((c) => {
    let type = String(c.cell_type ?? 'code')
    let source = text(c.source ?? c.input)
    if (type === 'heading') {
      source = '#'.repeat(Number(c.level ?? 1)) + ' ' + source
      type = 'markdown'
    }
    const att: Record<string, string> = {}
    for (const [name, bundle] of Object.entries((c.attachments ?? {}) as Record<string, Record<string, unknown>>)) {
      const m = Object.keys(bundle).find((k) => k.startsWith('image/'))
      if (m) att[name] = `data:${m};base64,${text(bundle[m]).replace(/\s/g, '')}`
    }
    return {
      type: type === 'markdown' ? 'markdown' : type === 'code' ? 'code' : 'raw',
      source,
      count: (c.execution_count ?? c.prompt_number ?? null) as number | null,
      outputs: Array.isArray(c.outputs) ? (c.outputs as Record<string, unknown>[]).map(parseOutput).filter((x): x is Output => !!x) : [],
      attachments: att,
    }
  })
  const lang = String(meta.language_info?.name ?? meta.kernelspec?.language ?? (j as { language?: string }).language ?? 'python')
  const kernel = String(meta.kernelspec?.display_name ?? meta.kernelspec?.name ?? lang)
  const firstH = cells.find((c) => c.type === 'markdown' && /^#\s/m.test(c.source))
  const title = String(meta.title ?? (firstH ? /^#\s+(.+)$/m.exec(firstH.source)?.[1] ?? '' : ''))
  return { cells, lang, kernel, nbformat: `${j.nbformat ?? '?'}.${j.nbformat_minor ?? 0}`, title }
}

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const KW: Record<string, string> = {
  python: 'False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case',
  r: 'if else repeat while function for in next break TRUE FALSE NULL Inf NaN NA library require return',
  julia: 'function end if elseif else for while return using import module struct mutable begin let do try catch finally true false nothing const global local break continue in',
  javascript: 'const let var function return if else for while do switch case break continue new class extends import export from default async await try catch finally throw typeof instanceof in of this null undefined true false yield',
}
KW.typescript = KW.javascript + ' interface type enum implements readonly public private protected'
const BUILTIN: Record<string, string> = {
  python: 'print len range list dict set tuple int float str bool open sum min max abs enumerate zip map filter sorted round isinstance type super self np pd plt',
  r: 'c print paste data.frame summary mean sum length head plot',
  julia: 'println print length push! size zeros ones collect',
  javascript: 'console Math JSON Object Array Promise document window',
}
BUILTIN.typescript = BUILTIN.javascript

/** Tiny syntax highlighter → HTML with <span class="t-…"> tokens. */
export function highlight(code: string, lang = 'python'): string {
  const L = /^(py|ipython)/.test(lang) ? 'python' : lang.startsWith('jul') ? 'julia' : lang === 'r' || lang === 'R' ? 'r' : /^(js|javascript|node)/.test(lang) ? 'javascript' : /^(ts|typescript)/.test(lang) ? 'typescript' : 'python'
  const kw = new Set(KW[L].split(' '))
  const bi = new Set(BUILTIN[L].split(' '))
  const hashComment = L !== 'javascript' && L !== 'typescript'
  const re = new RegExp(
    [
      hashComment ? '(#[^\\n]*)' : '(\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/)',
      '((?:[rRbBuUfF]{0,2})(?:"""[\\s\\S]*?"""|\'\'\'[\\s\\S]*?\'\'\'|"(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\'|`(?:\\\\.|[^`\\\\])*`))',
      '(\\b(?:0[xX][\\da-fA-F_]+|\\d[\\d_]*\\.?\\d*(?:[eE][+-]?\\d+)?j?)\\b)',
      '(@[A-Za-z_][\\w.]*)',
      '([A-Za-z_][\\w!]*)',
      '(^[%!][^\\n]*)',
    ].join('|'),
    'gm',
  )
  let out = ''
  let last = 0
  let prev = ''
  for (let m = re.exec(code); m; m = re.exec(code)) {
    out += esc(code.slice(last, m.index))
    last = m.index + m[0].length
    const [t, com, str, numb, deco, word, magic] = m
    if (com) out += `<span class="t-com">${esc(t)}</span>`
    else if (str) out += `<span class="t-str">${esc(t)}</span>`
    else if (numb) out += `<span class="t-num">${esc(t)}</span>`
    else if (deco) out += `<span class="t-deco">${esc(t)}</span>`
    else if (magic) out += `<span class="t-deco">${esc(t)}</span>`
    else if (word) {
      if (kw.has(word)) out += `<span class="t-kw">${word}</span>`
      else if (prev === 'def' || prev === 'class' || prev === 'function' || prev === 'struct') out += `<span class="t-fn">${word}</span>`
      else if (bi.has(word)) out += `<span class="t-bi">${word}</span>`
      else if (code[last] === '(') out += `<span class="t-call">${word}</span>`
      else out += word
      prev = word
      continue
    }
    if (t.length === 0) re.lastIndex++
    prev = ''
  }
  return out + esc(code.slice(last))
}

const ANSI = ['#1e293b', '#dc2626', '#16a34a', '#ca8a04', '#2563eb', '#c026d3', '#0891b2', '#94a3b8']
const ANSI_BRIGHT = ['#64748b', '#ef4444', '#22c55e', '#eab308', '#3b82f6', '#d946ef', '#06b6d4', '#f1f5f9']

/** Converts ANSI SGR colour codes (as found in tracebacks) to HTML spans. */
export function ansiToHtml(s: string): string {
  let out = ''
  let fg = ''
  let bold = false
  // eslint-disable-next-line no-control-regex
  const parts = s.split(/\u001b\[([\d;]*)m/)
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      if (!parts[i]) continue
      const style = `${fg ? `color:${fg};` : ''}${bold ? 'font-weight:700;' : ''}`
      out += style ? `<span style="${style}">${esc(parts[i])}</span>` : esc(parts[i])
    } else {
      const codes = parts[i] === '' ? [0] : parts[i].split(';').map(Number)
      for (let k = 0; k < codes.length; k++) {
        const c = codes[k]
        if (c === 0) { fg = ''; bold = false }
        else if (c === 1) bold = true
        else if (c === 22) bold = false
        else if (c >= 30 && c <= 37) fg = ANSI[c - 30]
        else if (c >= 90 && c <= 97) fg = ANSI_BRIGHT[c - 90]
        else if (c === 39) fg = ''
        else if (c === 38 && codes[k + 1] === 5) k += 2
        else if (c === 38 && codes[k + 1] === 2) { fg = `rgb(${codes[k + 2]},${codes[k + 3]},${codes[k + 4]})`; k += 4 }
      }
    }
  }
  return out
}

// eslint-disable-next-line no-control-regex
export const stripAnsi = (s: string) => s.replace(/\u001b\[[\d;]*m/g, '')

/** Export code cells as a script with `# %%` cell markers (VS Code / Jupytext "percent" format). */
export function toScript(nb: Notebook): string {
  const c = nb.lang === 'javascript' || nb.lang === 'typescript' ? '//' : '#'
  return nb.cells
    .map((cell) => {
      if (cell.type === 'code') return `${c} %%\n${cell.source.trimEnd()}\n`
      if (cell.type === 'markdown') return `${c} %% [markdown]\n${cell.source.trimEnd().split('\n').map((l) => `${c} ${l}`.trimEnd()).join('\n')}\n`
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

export function stats(nb: Notebook) {
  const code = nb.cells.filter((c) => c.type === 'code')
  const counts = code.map((c) => c.count).filter((x): x is number => typeof x === 'number')
  const inOrder = counts.every((v, i) => i === 0 || v > counts[i - 1])
  return {
    code: code.length,
    markdown: nb.cells.filter((c) => c.type === 'markdown').length,
    outputs: nb.cells.reduce((a, c) => a + c.outputs.length, 0),
    images: nb.cells.reduce((a, c) => a + c.outputs.filter((o) => o.kind === 'data' && o.mime.startsWith('image/')).length, 0),
    errors: nb.cells.reduce((a, c) => a + c.outputs.filter((o) => o.kind === 'error').length, 0),
    lines: code.reduce((a, c) => a + (c.source ? c.source.split('\n').length : 0), 0),
    unexecuted: code.filter((c) => c.count === null && c.source.trim()).length,
    inOrder,
  }
}
