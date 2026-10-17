// Hash joins for two CSV tables: inner, left, right, full outer, left anti and right anti.
import { csvCell, detectDelimiter, parseCsv } from './csv-json-converter'

export type JoinType = 'inner' | 'left' | 'right' | 'full' | 'anti' | 'ranti'
export interface Table { header: string[]; rows: string[][] }
export interface JoinOpts { type: JoinType; leftKeys: number[]; rightKeys: number[]; ignoreCase: boolean; trim: boolean; coalesceKeys: boolean; suffix: [string, string] }
export interface JoinResult {
  header: string[]
  rows: string[][]
  /** Origin of each output row: matched in both, left only, right only. */
  origin: ('both' | 'left' | 'right')[]
  matchedLeft: number
  matchedRight: number
  unmatchedLeft: number[]
  unmatchedRight: number[]
  manyToMany: number
  blankKeys: number
}

export function parseTable(text: string): Table {
  const d = detectDelimiter(text)
  const rows = parseCsv(text, d)
  const header = (rows.shift() ?? []).map((h, i) => h.trim() || `col${i + 1}`)
  const w = header.length
  return { header, rows: rows.map((r) => (r.length >= w ? r.slice(0, w) : [...r, ...Array(w - r.length).fill('')])) }
}

export const normKey = (vals: string[], o: Pick<JoinOpts, 'ignoreCase' | 'trim'>) =>
  vals.map((v) => {
    let s = o.trim ? v.trim() : v
    if (o.ignoreCase) s = s.toLowerCase()
    return s
  }).join('\u0001')

/** Picks a likely key: the first column name shared by both tables (id-like names first). */
export function guessKeys(a: string[], b: string[]): [number, number] {
  const la = a.map((x) => x.toLowerCase().trim()), lb = b.map((x) => x.toLowerCase().trim())
  const shared = la.map((x, i) => [x, i, lb.indexOf(x)] as const).filter(([, , j]) => j >= 0)
  const idLike = shared.find(([x]) => /(^|_|\s)(id|key|code|sku|email)$/.test(x) || x === 'id')
  const pick = idLike ?? shared[0]
  return pick ? [pick[1], pick[2]] : [0, 0]
}

export function join(L: Table, R: Table, o: JoinOpts): JoinResult {
  const index = new Map<string, number[]>()
  let blankKeys = 0
  const keyOf = (row: string[], keys: number[]) => normKey(keys.map((k) => row[k] ?? ''), o)
  const isBlank = (row: string[], keys: number[]) => keys.every((k) => (row[k] ?? '').trim() === '')
  R.rows.forEach((r, i) => {
    if (isBlank(r, o.rightKeys)) return // blank keys never match (SQL NULL semantics)
    const k = keyOf(r, o.rightKeys)
    const list = index.get(k)
    if (list) list.push(i)
    else index.set(k, [i])
  })
  const rightKeySet = new Set(o.rightKeys)
  const coalesce = o.coalesceKeys && o.type !== 'anti' && o.type !== 'ranti'
  const rCols = R.header.map((_, j) => j).filter((j) => !(coalesce && rightKeySet.has(j)))
  const lNames = new Set(L.header)
  const rNames = new Set(rCols.map((j) => R.header[j]))
  const header =
    o.type === 'anti' ? [...L.header]
    : o.type === 'ranti' ? [...R.header]
    : [...L.header.map((h) => (rNames.has(h) ? h + o.suffix[0] : h)), ...rCols.map((j) => (lNames.has(R.header[j]) ? R.header[j] + o.suffix[1] : R.header[j]))]
  const rows: string[][] = []
  const origin: JoinResult['origin'] = []
  const usedRight = new Uint8Array(R.rows.length)
  const unmatchedLeft: number[] = []
  let matchedLeft = 0, manyToMany = 0
  const emptyR = rCols.map(() => '')
  for (const [i, l] of L.rows.entries()) {
    if (isBlank(l, o.leftKeys)) blankKeys++
    const hits = isBlank(l, o.leftKeys) ? undefined : index.get(keyOf(l, o.leftKeys))
    if (hits) {
      matchedLeft++
      if (hits.length > 1) manyToMany++
      for (const j of hits) usedRight[j] = 1
      if (o.type === 'inner' || o.type === 'left' || o.type === 'right' || o.type === 'full')
        for (const j of hits) {
          rows.push([...l, ...rCols.map((c) => R.rows[j][c])])
          origin.push('both')
        }
    } else {
      unmatchedLeft.push(i)
      if (o.type === 'left' || o.type === 'full' || o.type === 'anti') {
        rows.push(o.type === 'anti' ? [...l] : [...l, ...emptyR])
        origin.push('left')
      }
    }
  }
  const unmatchedRight: number[] = []
  R.rows.forEach((r, j) => {
    if (usedRight[j]) return
    unmatchedRight.push(j)
    if (o.type === 'right' || o.type === 'full') {
      const lpart = L.header.map(() => '')
      // coalesced key columns take the right table's key value
      if (coalesce) o.leftKeys.forEach((lk, n) => (lpart[lk] = r[o.rightKeys[n]] ?? ''))
      rows.push([...lpart, ...rCols.map((c) => r[c])])
      origin.push('right')
    } else if (o.type === 'ranti') {
      rows.push([...r])
      origin.push('right')
    }
  })
  return { header, rows, origin, matchedLeft, matchedRight: R.rows.length - unmatchedRight.length, unmatchedLeft, unmatchedRight, manyToMany, blankKeys }
}

export const toCsvText = (header: string[], rows: string[][], d = ',') => [header, ...rows].map((r) => r.map((c) => csvCell(c, d)).join(d)).join('\r\n')
