// Line de-duplication with normalisation options, occurrence counting and sorting.

export interface Opts {
  trim: boolean; ignoreCase: boolean; collapseSpaces: boolean; dropEmpty: boolean
  keep: 'first' | 'last'; mode: 'dedupe' | 'duplicates' | 'uniques' | 'count'
  sort: 'none' | 'az' | 'za' | 'natural' | 'length' | 'count' | 'reverse'
}

export const DEFAULT_OPTS: Opts = { trim: true, ignoreCase: false, collapseSpaces: false, dropEmpty: true, keep: 'first', mode: 'dedupe', sort: 'none' }

export interface Row { text: string; key: string; count: number; first: number }

export function keyOf(line: string, o: Pick<Opts, 'trim' | 'ignoreCase' | 'collapseSpaces'>) {
  let k = line
  if (o.collapseSpaces) k = k.replace(/\s+/g, ' ')
  if (o.trim) k = k.trim()
  if (o.ignoreCase) k = k.toLocaleLowerCase()
  return k
}

const coll = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

export function process(text: string, o: Opts): { rows: Row[]; output: string; total: number; unique: number; removed: number; dupGroups: number } {
  const lines = text.split(/\r?\n/)
  if (lines.length && lines[lines.length - 1] === '' && text.endsWith('\n')) lines.pop()
  const map = new Map<string, Row>()
  let total = 0
  lines.forEach((raw, i) => {
    const line = o.trim ? raw.trim() : raw
    if (o.dropEmpty && !line.trim()) return
    total++
    const key = keyOf(raw, o)
    const r = map.get(key)
    if (r) {
      r.count++
      if (o.keep === 'last') { r.text = line; r.first = i }
    } else map.set(key, { text: line, key, count: 1, first: i })
  })
  let rows = [...map.values()].sort((a, b) => a.first - b.first)
  if (o.mode === 'duplicates') rows = rows.filter((r) => r.count > 1)
  if (o.mode === 'uniques') rows = rows.filter((r) => r.count === 1)
  const cmp: Record<Opts['sort'], ((a: Row, b: Row) => number) | null> = {
    none: null,
    az: (a, b) => (a.text < b.text ? -1 : a.text > b.text ? 1 : 0),
    za: (a, b) => (a.text < b.text ? 1 : a.text > b.text ? -1 : 0),
    natural: (a, b) => coll.compare(a.text, b.text),
    length: (a, b) => a.text.length - b.text.length || coll.compare(a.text, b.text),
    count: (a, b) => b.count - a.count || a.first - b.first,
    reverse: (a, b) => b.first - a.first,
  }
  const c = cmp[o.sort]
  if (c) rows = [...rows].sort(c)
  const output = rows.map((r) => (o.mode === 'count' ? `${r.count}\t${r.text}` : r.text)).join('\n')
  return { rows, output, total, unique: map.size, removed: total - map.size, dupGroups: [...map.values()].filter((r) => r.count > 1).length }
}
