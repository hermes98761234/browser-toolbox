// CSV / JSON / XML conversion core (pure, no DOM). XML parsing lives in the component (DOMParser).

export type Rec = Record<string, unknown>

/** Guesses the delimiter from the first lines (outside quotes). */
export function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 10)
  let best = ',', score = -1
  for (const d of [',', ';', '\t', '|']) {
    const counts = sample.filter((l) => l.trim()).map((l) => {
      let n = 0, q = false
      for (const ch of l) {
        if (ch === '"') q = !q
        else if (ch === d && !q) n++
      }
      return n
    })
    if (!counts.length || counts[0] === 0) continue
    const consistent = counts.filter((c) => c === counts[0]).length / counts.length
    const sc = counts[0] * consistent
    if (sc > score) {
      score = sc
      best = d
    }
  }
  return best
}

/** RFC 4180 parser: quoted fields, escaped quotes, newlines inside quotes, CRLF. */
export function parseCsv(text: string, delim = ','): string[][] {
  const rows: string[][] = []
  let row: string[] = [], f = '', q = false
  const src = text.replace(/^﻿/, '')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (q) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          f += '"'
          i++
        } else q = false
      } else f += c
    } else if (c === '"' && f === '') q = true
    else if (c === delim) {
      row.push(f)
      f = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(f)
      rows.push(row)
      row = []
      f = ''
    } else f += c
  }
  if (f !== '' || row.length) {
    row.push(f)
    rows.push(row)
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''))
}

export function csvCell(v: unknown, delim = ','): string {
  const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
  return s.includes(delim) || /["\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** "42" → 42, "true" → true, "" → null (keeps leading-zero codes like "007" and long digit strings as text). */
export function typed(s: string): unknown {
  const t = s.trim()
  if (t === '') return null
  if (/^(true|false)$/i.test(t)) return t.toLowerCase() === 'true'
  if (/^null$/i.test(t)) return null
  if (/^-?(0|[1-9]\d{0,14})(\.\d+)?([eE][+-]?\d+)?$/.test(t)) return Number(t)
  return s
}

/** {a:{b:1}, t:[1,2]} → {"a.b":1, "t.0":1, "t.1":2} (or "t": "1;2" with joinArrays). */
export function flatten(o: unknown, joinArrays = '', prefix = '', out: Rec = {}): Rec {
  if (Array.isArray(o)) {
    if (joinArrays && o.every((x) => x === null || typeof x !== 'object')) out[prefix] = o.join(joinArrays)
    else if (!o.length) out[prefix] = ''
    else o.forEach((v, i) => flatten(v, joinArrays, prefix ? `${prefix}.${i}` : String(i), out))
  } else if (o && typeof o === 'object') {
    const ks = Object.keys(o)
    if (!ks.length && prefix) out[prefix] = ''
    for (const k of ks) flatten((o as Rec)[k], joinArrays, prefix ? `${prefix}.${k}` : k, out)
  } else out[prefix || 'value'] = o
  return out
}

/** Inverse of flatten: numeric segments become arrays. */
export function unflatten(r: Rec): Rec {
  const root: Rec = {}
  for (const [key, v] of Object.entries(r)) {
    const parts = key.split('.')
    let cur: Rec | unknown[] = root
    parts.forEach((p, i) => {
      const last = i === parts.length - 1
      const next = parts[i + 1]
      const holder = cur as Record<string, unknown>
      if (last) holder[p] = v
      else {
        if (holder[p] === undefined || typeof holder[p] !== 'object' || holder[p] === null) holder[p] = /^\d+$/.test(next) ? [] : {}
        cur = holder[p] as Rec
      }
    })
  }
  return root
}

/** Union of keys in first-seen order. */
export function columns(rows: Rec[]): string[] {
  const seen = new Set<string>()
  for (const r of rows) for (const k of Object.keys(r)) seen.add(k)
  return [...seen]
}

export function csvToRecords(text: string, opts: { delim: string; header: boolean; typed: boolean; nest: boolean }): Rec[] {
  const rows = parseCsv(text, opts.delim)
  if (!rows.length) return []
  const width = Math.max(...rows.map((r) => r.length))
  const head = opts.header ? rows[0].map((h, i) => h.trim() || `column${i + 1}`) : Array.from({ length: width }, (_, i) => `column${i + 1}`)
  for (let i = head.length; i < width; i++) head.push(`column${i + 1}`)
  const body = opts.header ? rows.slice(1) : rows
  return body.map((r) => {
    const o: Rec = {}
    head.forEach((h, i) => (o[h] = opts.typed ? typed(r[i] ?? '') : (r[i] ?? '')))
    return opts.nest ? unflatten(o) : o
  })
}

/** Accepts an array, an object holding an array, or a single object. */
export function jsonToRecords(text: string): Rec[] {
  const v: unknown = JSON.parse(text)
  const wrap = (x: unknown): Rec => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Rec) : { value: x })
  if (Array.isArray(v)) return v.map(wrap)
  if (v && typeof v === 'object') {
    const arr = Object.values(v as Rec).find((x) => Array.isArray(x) && x.some((y) => y && typeof y === 'object'))
    return arr ? (arr as unknown[]).map(wrap) : [v as Rec]
  }
  return [{ value: v }]
}

export function recordsToCsv(rows: Rec[], opts: { delim: string; header: boolean; joinArrays: string; eol?: string }): string {
  const flat = rows.map((r) => flatten(r, opts.joinArrays))
  const cols = columns(flat)
  const lines = flat.map((r) => cols.map((c) => csvCell(r[c], opts.delim)).join(opts.delim))
  if (opts.header) lines.unshift(cols.map((c) => csvCell(c, opts.delim)).join(opts.delim))
  return lines.join(opts.eol ?? '\n')
}

export const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Valid XML element name from any key. */
export function xmlName(k: string): string {
  let n = k.trim().replace(/[^A-Za-z0-9_.-]+/g, '_')
  if (!/^[A-Za-z_]/.test(n) || /^xml/i.test(n)) n = `_${n}`
  return n || '_'
}

export function recordsToXml(rows: Rec[], root = 'rows', row = 'row', indent = '  '): string {
  const nl = indent ? '\n' : ''
  const el = (name: string, v: unknown, depth: number): string => {
    const pad = indent.repeat(depth)
    const tag = xmlName(name)
    if (Array.isArray(v)) return v.map((x) => el(name, x, depth)).join(nl)
    if (v === null || v === undefined || v === '') return `${pad}<${tag}/>`
    if (typeof v === 'object') {
      const inner = Object.entries(v as Rec).map(([k, x]) => el(k, x, depth + 1)).join(nl)
      return inner ? `${pad}<${tag}>${nl}${inner}${nl}${pad}</${tag}>` : `${pad}<${tag}/>`
    }
    return `${pad}<${tag}>${xmlEscape(String(v))}</${tag}>`
  }
  const body = rows.map((r) => el(row, r, 1)).join(nl)
  return `<?xml version="1.0" encoding="UTF-8"?>${nl}<${xmlName(root)}>${nl}${body}${nl}</${xmlName(root)}>`
}
