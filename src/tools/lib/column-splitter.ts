// Column Splitter logic: a small pipeline of split / explode / extract / combine steps over a table.

export interface Tbl { header: string[]; rows: string[][] }

export interface SplitOpts { sep: string; regex: boolean; max: number; fromRight: boolean; trim: boolean }

/** Splits one value. max = 0 → unlimited; otherwise at most `max` parts (the rest stays joined in the last/first part). */
export function splitValue(v: string, o: SplitOpts): string[] {
  if (!o.sep) return [v]
  let parts: string[]
  let seps: string[] = []
  if (o.regex) {
    const re = new RegExp(o.sep, 'gu')
    parts = []
    let last = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(v))) {
      if (m[0] === '') {
        re.lastIndex++
        continue
      }
      parts.push(v.slice(last, m.index))
      seps.push(m[0])
      last = m.index + m[0].length
    }
    parts.push(v.slice(last))
  } else {
    const sep = o.sep === '\\t' ? '\t' : o.sep
    parts = v.split(sep)
    seps = parts.slice(1).map(() => sep)
  }
  if (o.max > 0 && parts.length > o.max) {
    const k = o.max - 1
    if (o.fromRight) {
      const cut = parts.length - k
      const head = parts.slice(0, cut).reduce((a, p, i) => (i ? a + seps[i - 1] + p : p), '')
      parts = [head, ...parts.slice(cut)]
    } else {
      const tail = parts.slice(k).reduce((a, p, i) => (i ? a + seps[k + i - 1] + p : p), '')
      parts = [...parts.slice(0, k), tail]
    }
  }
  return o.trim ? parts.map((p) => p.trim()) : parts
}

export type Step =
  | { kind: 'split'; col: string; o: SplitOpts; names: string; keep: boolean }
  | { kind: 'explode'; col: string; o: SplitOpts }
  | { kind: 'extract'; col: string; pattern: string; names: string; keep: boolean }
  | { kind: 'combine'; template: string; name: string; clean: boolean; drop: boolean }

const colIdx = (t: Tbl, name: string) => {
  const i = t.header.indexOf(name)
  if (i < 0) throw new Error(`Column "${name}" not found`)
  return i
}
const uniq = (header: string[], name: string) => {
  let n = name || 'Column', k = 2
  while (header.includes(n)) n = `${name}_${k++}`
  return n
}
const nameList = (names: string, base: string, n: number) => {
  const given = names.split(',').map((s) => s.trim()).filter(Boolean)
  return Array.from({ length: n }, (_, i) => given[i] ?? `${base}_${i + 1}`)
}

/** Splits a column into several new columns placed right after it. */
export function applySplit(t: Tbl, col: string, o: SplitOpts, names = '', keep = false): Tbl {
  const i = colIdx(t, col)
  const parts = t.rows.map((r) => splitValue(r[i] ?? '', o))
  const n = Math.max(1, ...parts.map((p) => p.length))
  const rest = t.header.filter((_, j) => keep || j !== i)
  const newNames: string[] = []
  for (const nm of nameList(names, col, n)) newNames.push(uniq([...rest, ...newNames], nm))
  const at = keep ? i + 1 : i
  const header = [...t.header.slice(0, at), ...newNames, ...t.header.slice(i + 1)]
  const rows = t.rows.map((r, k) => {
    const p = parts[k]
    // Right-aligned splits pad on the left so "last part" stays in the last column.
    const cells = o.fromRight ? [...Array(n - p.length).fill(''), ...p] : [...p, ...Array(n - p.length).fill('')]
    return [...r.slice(0, at), ...cells, ...r.slice(i + 1)]
  })
  return { header, rows }
}

/** One output row per part of the column value ("a;b" → two rows). */
export function applyExplode(t: Tbl, col: string, o: SplitOpts): Tbl {
  const i = colIdx(t, col)
  const rows: string[][] = []
  for (const r of t.rows) {
    const parts = splitValue(r[i] ?? '', o).filter((p, _k, a) => p !== '' || a.length === 1)
    for (const p of parts) rows.push(r.map((c, j) => (j === i ? p : c)))
  }
  return { header: t.header, rows }
}

/** Regex capture groups → new columns (named groups give the names). Non-matching rows get blanks. */
export function applyExtract(t: Tbl, col: string, pattern: string, names = '', keep = true): Tbl {
  const i = colIdx(t, col)
  const re = new RegExp(pattern, 'u')
  const probe = new RegExp(`${pattern}|`, 'u').exec('')!
  const groups = probe.length - 1
  if (!groups) throw new Error('The pattern needs at least one (capture group)')
  const named = Object.keys(probe.groups ?? {})
  const given = names.split(',').map((x) => x.trim())
  const base = Array.from({ length: groups }, (_, k) => given[k] || named[k] || `${col}_${k + 1}`)
  const rest = t.header.filter((_, j) => keep || j !== i)
  const newNames: string[] = []
  for (const nm of base) newNames.push(uniq([...rest, ...newNames], nm))
  const at = keep ? i + 1 : i
  return {
    header: [...t.header.slice(0, at), ...newNames, ...t.header.slice(i + 1)],
    rows: t.rows.map((r) => {
      const m = re.exec(r[i] ?? '')
      const cells = Array.from({ length: groups }, (_, k) => m?.[k + 1] ?? '')
      return [...r.slice(0, at), ...cells, ...r.slice(i + 1)]
    }),
  }
}

/** Template pieces: literal text and {Column} placeholders. "{{" / "}}" escape braces. */
export function parseTemplate(tpl: string): { lit: string[]; fields: string[] } {
  const lit: string[] = []
  const fields: string[] = []
  let cur = ''
  for (let k = 0; k < tpl.length; k++) {
    const c = tpl[k]
    if (c === '{' && tpl[k + 1] === '{') { cur += '{'; k++ }
    else if (c === '}' && tpl[k + 1] === '}') { cur += '}'; k++ }
    else if (c === '{') {
      const end = tpl.indexOf('}', k)
      if (end < 0) { cur += tpl.slice(k); break }
      lit.push(cur)
      fields.push(tpl.slice(k + 1, end))
      cur = ''
      k = end
    } else cur += c
  }
  lit.push(cur)
  return { lit, fields }
}

/** Fills a template for one row. `clean` drops the separator text around empty fields. */
export function fillTemplate(tpl: { lit: string[]; fields: string[] }, get: (f: string) => string, clean: boolean): string {
  if (!clean) return tpl.lit.reduce((a, l, k) => a + l + (k < tpl.fields.length ? get(tpl.fields[k]) : ''), '')
  let out = tpl.lit[0]
  let any = false
  tpl.fields.forEach((f, k) => {
    const v = get(f)
    if (v.trim() === '') return
    if (any) out += tpl.lit[k] // separators before the first non-empty field are dropped
    out += v
    any = true
  })
  return out + tpl.lit[tpl.lit.length - 1]
}

/** Adds a column built from a template such as "{Last}, {First}". */
export function applyCombine(t: Tbl, template: string, name: string, clean = true, drop = false): Tbl {
  const tpl = parseTemplate(template)
  const idx = tpl.fields.map((f) => colIdx(t, f))
  const keepCols = t.header.map((_, j) => !drop || !idx.includes(j))
  const header = [...t.header.filter((_, j) => keepCols[j])]
  header.push(uniq(header, name || 'Combined'))
  return {
    header,
    rows: t.rows.map((r) => [...r.filter((_, j) => keepCols[j]), fillTemplate(tpl, (f) => r[t.header.indexOf(f)] ?? '', clean)]),
  }
}

/** Runs the pipeline; a failing step is skipped and reported. */
export function run(t: Tbl, steps: Step[]): { table: Tbl; errors: (string | null)[] } {
  const errors: (string | null)[] = []
  let cur = t
  for (const s of steps) {
    try {
      if (s.kind === 'split') cur = applySplit(cur, s.col, s.o, s.names, s.keep)
      else if (s.kind === 'explode') cur = applyExplode(cur, s.col, s.o)
      else if (s.kind === 'extract') cur = applyExtract(cur, s.col, s.pattern, s.names, s.keep)
      else cur = applyCombine(cur, s.template, s.name, s.clean, s.drop)
      errors.push(null)
    } catch (e) {
      errors.push((e as Error).message)
    }
  }
  return { table: cur, errors }
}

/** Normalises parsed rows into a table (pads ragged rows, invents headers). */
export function toTable(rows: string[][], hasHeader: boolean): Tbl {
  const w = Math.max(0, ...rows.map((r) => r.length))
  const pad = (r: string[]) => [...r, ...Array(w - r.length).fill('')]
  if (!rows.length) return { header: [], rows: [] }
  const header = hasHeader ? pad(rows[0]).map((h, i) => h.trim() || `Column ${i + 1}`) : Array.from({ length: w }, (_, i) => `Column ${i + 1}`)
  return { header, rows: (hasHeader ? rows.slice(1) : rows).map(pad) }
}
