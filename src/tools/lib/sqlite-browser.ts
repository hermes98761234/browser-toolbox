// SQLite 3 file format (https://sqlite.org/fileformat2.html): reader for table / index b-trees with
// overflow pages, record decoding and sqlite_schema; plus a simple writer that builds a fresh database
// (table b-trees only) from in-memory rows; and SQL dump / CSV / JSON helpers.

export type Cell = number | bigint | string | Uint8Array | null

export interface Header {
  pageSize: number
  reserved: number
  pageCount: number
  encoding: 'UTF-8' | 'UTF-16le' | 'UTF-16be'
  userVersion: number
  appId: number
  schemaFormat: number
  wal: boolean
  freelistPages: number
  sqliteVersion: number
  changeCounter: number
}

export interface SchemaEntry { type: string; name: string; tblName: string; rootpage: number; sql: string | null }
export interface ColumnDef { name: string; type: string; pk: boolean }
export interface TableData {
  name: string
  sql: string
  columns: ColumnDef[]
  rows: Cell[][]
  rowids: (number | bigint)[]
  rowidAlias: number
  withoutRowid: boolean
  pages: number
  overflowPages: number
  depth: number
}
export interface Database { header: Header; schema: SchemaEntry[]; tables: TableData[]; indexes: { name: string; table: string; sql: string | null; entries: number }[]; warnings: string[] }

// ---------- varints & records ----------

/** Returns [value, bytesRead]. Values beyond 2^53 come back as bigint. */
export function readVarint(b: Uint8Array, o: number): [number | bigint, number] {
  let v = 0n
  for (let i = 0; i < 8; i++) {
    const x = b[o + i]
    v = (v << 7n) | BigInt(x & 0x7f)
    if (!(x & 0x80)) return [toNum(v), i + 1]
  }
  v = (v << 8n) | BigInt(b[o + 8])
  return [toNum(BigInt.asIntN(64, v)), 9]
}
const toNum = (v: bigint) => (v >= BigInt(Number.MIN_SAFE_INTEGER) && v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v)
/** Fast path for small varints used for sizes. */
function varNum(b: Uint8Array, o: number): [number, number] {
  const [v, n] = readVarint(b, o)
  return [Number(v), n]
}

export function writeVarint(v: number | bigint): Uint8Array {
  let x = BigInt.asUintN(64, BigInt(v))
  if (x > 0x00ffffffffffffffn) {
    const out = new Uint8Array(9)
    out[8] = Number(x & 0xffn)
    x >>= 8n
    for (let i = 7; i >= 0; i--) { out[i] = Number(x & 0x7fn) | 0x80; x >>= 7n }
    return out
  }
  const bytes: number[] = []
  do { bytes.unshift(Number(x & 0x7fn)); x >>= 7n } while (x > 0n)
  for (let i = 0; i < bytes.length - 1; i++) bytes[i] |= 0x80
  return Uint8Array.from(bytes)
}

export function decodeRecord(p: Uint8Array, dec: TextDecoder): Cell[] {
  const [hsize, hn] = varNum(p, 0)
  const types: number[] = []
  for (let o = hn; o < hsize;) { const [t, n] = varNum(p, o); types.push(t); o += n }
  const dv = new DataView(p.buffer, p.byteOffset, p.byteLength)
  const out: Cell[] = []
  let o = hsize
  for (const t of types) {
    switch (t) {
      case 0: out.push(null); break
      case 1: out.push(dv.getInt8(o)); o += 1; break
      case 2: out.push(dv.getInt16(o)); o += 2; break
      case 3: out.push(((dv.getInt8(o) << 16) | dv.getUint16(o + 1))); o += 3; break
      case 4: out.push(dv.getInt32(o)); o += 4; break
      case 5: out.push(dv.getInt16(o) * 2 ** 32 + dv.getUint32(o + 2)); o += 6; break
      case 6: out.push(toNum(dv.getBigInt64(o))); o += 8; break
      case 7: out.push(dv.getFloat64(o)); o += 8; break
      case 8: out.push(0); break
      case 9: out.push(1); break
      default: {
        if (t < 12) throw new Error(`reserved serial type ${t}`)
        const len = (t - (t % 2 ? 13 : 12)) / 2
        out.push(t % 2 ? dec.decode(p.subarray(o, o + len)) : p.slice(o, o + len))
        o += len
      }
    }
  }
  return out
}

const enc = new TextEncoder()
export function encodeRecord(vals: Cell[]): Uint8Array {
  const types: number[] = []
  const bodies: Uint8Array[] = []
  for (const v of vals) {
    if (v === null || v === undefined) { types.push(0); bodies.push(new Uint8Array(0)) }
    else if (typeof v === 'number' && !Number.isInteger(v)) {
      const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, v); types.push(7); bodies.push(b)
    } else if (typeof v === 'number' || typeof v === 'bigint') {
      const x = BigInt(v)
      if (x === 0n) { types.push(8); bodies.push(new Uint8Array(0)); continue }
      if (x === 1n) { types.push(9); bodies.push(new Uint8Array(0)); continue }
      const sizes: [number, number][] = [[1, 1], [2, 2], [3, 3], [4, 4], [5, 6], [6, 8]]
      const [t, n] = sizes.find(([, n]) => x >= -(1n << BigInt(n * 8 - 1)) && x < 1n << BigInt(n * 8 - 1))!
      const b = new Uint8Array(n)
      let y = BigInt.asUintN(n * 8, x)
      for (let i = n - 1; i >= 0; i--) { b[i] = Number(y & 0xffn); y >>= 8n }
      types.push(t); bodies.push(b)
    } else if (typeof v === 'string') { const b = enc.encode(v); types.push(13 + 2 * b.length); bodies.push(b) }
    else { types.push(12 + 2 * v.length); bodies.push(v) }
  }
  const th = types.map(writeVarint)
  let hlen = th.reduce((a, b) => a + b.length, 0)
  hlen += writeVarint(hlen + 1).length === 1 ? 1 : writeVarint(hlen + 2).length
  const parts = [writeVarint(hlen), ...th, ...bodies]
  const out = new Uint8Array(parts.reduce((a, b) => a + b.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}

// ---------- CREATE TABLE parsing ----------

function splitTop(s: string): string[] {
  const out: string[] = []
  let depth = 0, cur = '', q = ''
  for (const ch of s) {
    if (q) { cur += ch; if (ch === q) q = ''; continue }
    if (ch === '"' || ch === "'" || ch === '`') { q = ch; cur += ch; continue }
    if (ch === '[') { q = ']'; cur += ch; continue }
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue }
    cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}
const unq = (s: string) => (/^["`[]/.test(s) ? s.slice(1, -1).replace(/""/g, '"') : s)
function firstIdent(s: string): [string, string] {
  const m = /^\s*("(?:[^"]|"")*"|`[^`]*`|\[[^\]]*\]|'(?:[^']|'')*'|[^\s(]+)/.exec(s)
  return m ? [unq(m[1]), s.slice(m[0].length)] : ['', s]
}

export function parseCreateTable(sql: string): { columns: ColumnDef[]; withoutRowid: boolean; rowidAlias: number } {
  const open = sql.indexOf('('), close = sql.lastIndexOf(')')
  if (open < 0 || close < open) return { columns: [], withoutRowid: false, rowidAlias: -1 }
  const withoutRowid = /without\s+rowid/i.test(sql.slice(close))
  const columns: ColumnDef[] = []
  let tablePk: string[] = []
  for (const def of splitTop(sql.slice(open + 1, close))) {
    if (/^(constraint|primary\s+key|unique|check|foreign\s+key)\b/i.test(def)) {
      const m = /primary\s+key\s*\(([^)]*)\)/i.exec(def)
      if (m) tablePk = splitTop(m[1]).map((c) => unq(c.trim().split(/\s+/)[0]))
      continue
    }
    const [name, rest] = firstIdent(def)
    const typeM = /^\s*((?:(?!\b(?:constraint|primary|not|null|unique|check|default|collate|references|generated|as)\b)[^,])*)/i.exec(rest)
    const type = (typeM?.[1] ?? '').trim().replace(/\s+/g, ' ')
    columns.push({ name, type, pk: /\bprimary\s+key\b/i.test(rest) })
  }
  for (const c of columns) if (tablePk.includes(c.name)) c.pk = true
  const pks = columns.filter((c) => c.pk)
  let rowidAlias = -1
  if (!withoutRowid && pks.length === 1 && pks[0].type.toUpperCase() === 'INTEGER') {
    const def = splitTop(sql.slice(open + 1, close)).find((d) => firstIdent(d)[0] === pks[0].name) ?? ''
    if (!/primary\s+key\s+desc/i.test(def)) rowidAlias = columns.indexOf(pks[0])
  }
  return { columns, withoutRowid, rowidAlias }
}

// ---------- reader ----------

export function readHeader(b: Uint8Array): Header {
  const magic = new TextDecoder('latin1').decode(b.subarray(0, 16))
  if (b.length < 100 || magic !== 'SQLite format 3\u0000') throw new Error('Not a SQLite 3 database (bad header).')
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const ps = dv.getUint16(16)
  const pageSize = ps === 1 ? 65536 : ps
  if (pageSize < 512 || pageSize & (pageSize - 1)) throw new Error(`Invalid page size ${pageSize}.`)
  const e = dv.getUint32(56)
  const declared = dv.getUint32(28)
  return {
    pageSize,
    reserved: b[20],
    pageCount: declared && dv.getUint32(24) === dv.getUint32(92) ? declared : Math.floor(b.length / pageSize),
    encoding: e === 2 ? 'UTF-16le' : e === 3 ? 'UTF-16be' : 'UTF-8',
    userVersion: dv.getInt32(60),
    appId: dv.getInt32(68),
    schemaFormat: dv.getUint32(44),
    wal: b[18] === 2 || b[19] === 2,
    freelistPages: dv.getUint32(36),
    sqliteVersion: dv.getUint32(96),
    changeCounter: dv.getUint32(24),
  }
}

class Reader {
  b: Uint8Array
  h: Header
  usable: number
  dec: TextDecoder
  pagesSeen = 0
  overflowSeen = 0
  constructor(b: Uint8Array) {
    this.b = b
    this.h = readHeader(b)
    this.usable = this.h.pageSize - this.h.reserved
    this.dec = new TextDecoder(this.h.encoding === 'UTF-8' ? 'utf-8' : this.h.encoding.toLowerCase())
  }
  page(n: number): Uint8Array {
    if (n < 1 || n > this.h.pageCount) throw new Error(`Page ${n} out of range.`)
    const o = (n - 1) * this.h.pageSize
    return this.b.subarray(o, o + this.h.pageSize)
  }
  /** Assembles a payload: local part + overflow chain. */
  payload(pg: Uint8Array, o: number, P: number, index: boolean): Uint8Array {
    const U = this.usable
    const X = index ? Math.floor(((U - 12) * 64) / 255) - 23 : U - 35
    if (P <= X) return pg.subarray(o, o + P)
    const M = Math.floor(((U - 12) * 32) / 255) - 23
    const K = M + ((P - M) % (U - 4))
    const local = K <= X ? K : M
    const out = new Uint8Array(P)
    out.set(pg.subarray(o, o + local))
    let pos = local
    let next = new DataView(pg.buffer, pg.byteOffset).getUint32(o + local)
    let guard = 0
    while (pos < P && next) {
      if (++guard > this.h.pageCount) throw new Error('Overflow chain loops.')
      const op = this.page(next)
      this.overflowSeen++
      const n = Math.min(U - 4, P - pos)
      out.set(op.subarray(4, 4 + n), pos)
      pos += n
      next = new DataView(op.buffer, op.byteOffset).getUint32(0)
    }
    return out
  }
  /** Walks a b-tree, calling `cell` for every leaf cell; returns depth. */
  walk(root: number, cell: (payload: Uint8Array, rowid: number | bigint | null) => void, depth = 1, seen = new Set<number>()): number {
    if (seen.has(root)) throw new Error(`B-tree cycle at page ${root}.`)
    seen.add(root)
    this.pagesSeen++
    const pg = this.page(root)
    const ho = root === 1 ? 100 : 0
    const type = pg[ho]
    const dv = new DataView(pg.buffer, pg.byteOffset, pg.byteLength)
    const n = dv.getUint16(ho + 3)
    const interior = type === 0x05 || type === 0x02
    const cp = ho + (interior ? 12 : 8)
    let maxDepth = depth
    if (![0x0d, 0x05, 0x0a, 0x02].includes(type)) throw new Error(`Page ${root}: unknown b-tree page type ${type}.`)
    for (let i = 0; i < n; i++) {
      let o = dv.getUint16(cp + i * 2)
      if (type === 0x0d) {
        const [P, a] = varNum(pg, o); o += a
        const [rowid, c] = readVarint(pg, o); o += c
        cell(this.payload(pg, o, P, false), rowid)
      } else if (type === 0x05) {
        maxDepth = Math.max(maxDepth, this.walk(dv.getUint32(o), cell, depth + 1, seen))
      } else if (type === 0x0a) {
        const [P, a] = varNum(pg, o); o += a
        cell(this.payload(pg, o, P, true), null)
      } else {
        const child = dv.getUint32(o); o += 4
        maxDepth = Math.max(maxDepth, this.walk(child, cell, depth + 1, seen))
        const [P, a] = varNum(pg, o); o += a
        cell(this.payload(pg, o, P, true), null)
      }
    }
    if (interior) maxDepth = Math.max(maxDepth, this.walk(dv.getUint32(ho + 8), cell, depth + 1, seen))
    return maxDepth
  }
}

export function readDatabase(bytes: Uint8Array): Database {
  const r = new Reader(bytes)
  const warnings: string[] = []
  if (r.h.wal) warnings.push('The database is in WAL mode: changes still in a separate -wal file are not visible. Checkpoint it (PRAGMA wal_checkpoint) for the latest data.')
  if (bytes.length < r.h.pageCount * r.h.pageSize) warnings.push('The file is shorter than its header says — it may be truncated.')
  const schema: SchemaEntry[] = []
  r.walk(1, (p) => {
    const v = decodeRecord(p, r.dec)
    schema.push({ type: String(v[0]), name: String(v[1]), tblName: String(v[2]), rootpage: Number(v[3] ?? 0), sql: v[4] === null || v[4] === undefined ? null : String(v[4]) })
  })
  const tables: TableData[] = []
  const indexes: Database['indexes'] = []
  for (const e of schema) {
    if (e.type === 'table' && e.rootpage > 0) {
      const def = parseCreateTable(e.sql ?? '')
      const t: TableData = { name: e.name, sql: e.sql ?? '', columns: def.columns, rows: [], rowids: [], rowidAlias: def.rowidAlias, withoutRowid: def.withoutRowid, pages: 0, overflowPages: 0, depth: 0 }
      if (/^create\s+virtual/i.test(e.sql ?? '')) { warnings.push(`Virtual table ${e.name} skipped (needs its module).`); continue }
      const p0 = r.pagesSeen, o0 = r.overflowSeen
      // WITHOUT ROWID: record = primary-key columns (declared PK order) then the rest
      const pkCols = def.columns.filter((c) => c.pk)
      const order = def.withoutRowid ? [...pkCols, ...def.columns.filter((c) => !c.pk)].map((c) => def.columns.indexOf(c)) : null
      try {
        t.depth = r.walk(e.rootpage, (p, rowid) => {
          const rec = decodeRecord(p, r.dec)
          let row: Cell[]
          if (order) { row = new Array(def.columns.length).fill(null); order.forEach((ci, k) => (row[ci] = rec[k] ?? null)) }
          else {
            row = def.columns.map((_, k) => (k < rec.length ? rec[k] : null))
            if (rec.length > def.columns.length) for (let k = def.columns.length; k < rec.length; k++) { def.columns.push({ name: `col${k + 1}`, type: '', pk: false }); row.push(rec[k]) }
          }
          if (def.rowidAlias >= 0 && rowid !== null) row[def.rowidAlias] = rowid
          t.rows.push(row)
          t.rowids.push(rowid ?? t.rows.length)
        })
      } catch (err) { warnings.push(`Table ${e.name}: ${(err as Error).message} (read ${t.rows.length} rows).`) }
      t.pages = r.pagesSeen - p0
      t.overflowPages = r.overflowSeen - o0
      if (!t.columns.length) t.columns = (t.rows[0] ?? []).map((_, k) => ({ name: `col${k + 1}`, type: '', pk: false }))
      tables.push(t)
    } else if (e.type === 'index' && e.rootpage > 0) {
      let entries = 0
      try { r.walk(e.rootpage, () => { entries++ }) } catch (err) { warnings.push(`Index ${e.name}: ${(err as Error).message}`) }
      indexes.push({ name: e.name, table: e.tblName, sql: e.sql, entries })
    }
  }
  return { header: r.h, schema, tables, indexes, warnings }
}

// ---------- writer ----------

export interface WriteTable { name: string; sql: string; columns: string[]; rows: Cell[][]; rowidAlias: number }
export interface WriteExtra { type: 'view' | 'trigger'; name: string; tblName: string; sql: string }

/**
 * Builds a fresh SQLite database (page size 4096, UTF-8) with rowid table b-trees. Indexes are not
 * written (re-create them from the SQL dump); views and triggers are kept in sqlite_schema.
 */
export function writeDatabase(tables: WriteTable[], extras: WriteExtra[] = [], pageSize = 4096): Uint8Array {
  const U = pageSize
  const pages: Uint8Array[] = [new Uint8Array(pageSize)] // page 1 reserved
  const alloc = () => { pages.push(new Uint8Array(pageSize)); return pages.length }
  const X = U - 35, M = Math.floor(((U - 12) * 32) / 255) - 23

  /** Leaf cell bytes for one row (spilling to overflow pages when needed). */
  const leafCell = (rowid: number | bigint, rec: Uint8Array): Uint8Array => {
    const P = rec.length
    let local = P
    if (P > X) { const K = M + ((P - M) % (U - 4)); local = K <= X ? K : M }
    const head = [writeVarint(P), writeVarint(rowid)]
    const hl = head[0].length + head[1].length
    const cell = new Uint8Array(hl + local + (local < P ? 4 : 0))
    cell.set(head[0]); cell.set(head[1], head[0].length); cell.set(rec.subarray(0, local), hl)
    if (local < P) {
      // write overflow chain
      let pos = local, prevPage = 0, first = 0
      while (pos < P) {
        const pn = alloc()
        const pg = pages[pn - 1]
        const n = Math.min(U - 4, P - pos)
        pg.set(rec.subarray(pos, pos + n), 4)
        if (prevPage) new DataView(pages[prevPage - 1].buffer).setUint32(0, pn)
        else first = pn
        prevPage = pn
        pos += n
      }
      new DataView(cell.buffer).setUint32(hl + local, first)
    }
    return cell
  }

  /** Lays cells into pages of the given type; returns [pageNumber, lastKey] per page. */
  const fill = (cells: { bytes: Uint8Array; key: number | bigint; child?: number }[], leaf: boolean, firstPage?: number): { page: number; key: number | bigint }[] => {
    const hdr = leaf ? 8 : 12
    const out: { page: number; key: number | bigint }[] = []
    let i = 0
    do {
      const pn = firstPage !== undefined && out.length === 0 ? firstPage : alloc()
      const pg = pages[pn - 1]
      const ho = pn === 1 ? 100 : 0
      const dv = new DataView(pg.buffer)
      // choose the run of cells for this page; on interior pages the last one becomes the right pointer
      let used = ho + hdr, j = i
      while (j < cells.length && used + cells[j].bytes.length + 2 <= pageSize) { used += cells[j].bytes.length + 2; j++ }
      if (j === i && i < cells.length) throw new Error('Cell too large for page.')
      const stored = leaf ? cells.slice(i, j) : cells.slice(i, j - 1)
      let content = pageSize
      stored.forEach((c, k) => { content -= c.bytes.length; pg.set(c.bytes, content); dv.setUint16(ho + hdr + k * 2, content) })
      pg[ho] = leaf ? 0x0d : 0x05
      dv.setUint16(ho + 1, 0)
      dv.setUint16(ho + 3, stored.length)
      dv.setUint16(ho + 5, content === 65536 ? 0 : content)
      pg[ho + 7] = 0
      if (!leaf) dv.setUint32(ho + 8, cells[j - 1].child!)
      out.push({ page: pn, key: j > 0 ? cells[j - 1].key : 0 })
      i = j
    } while (i < cells.length)
    return out
  }

  /** Builds a table b-tree; returns its root page. Root is `fixedRoot` (page 1 for the schema) if given. */
  const buildTree = (rows: { rowid: number | bigint; rec: Uint8Array }[], fixedRoot?: number): number => {
    const leafCells = rows.map((r) => ({ bytes: leafCell(r.rowid, r.rec), key: r.rowid }))
    // if everything fits on the root page, write it there directly
    const ho = fixedRoot === 1 ? 100 : 0
    const total = leafCells.reduce((a, c) => a + c.bytes.length + 2, 0)
    if (total + 8 + ho <= pageSize) return fill(leafCells, true, fixedRoot ?? alloc())[0].page
    let level = fill(leafCells, true)
    while (level.length > 1) {
      const groupCells = level.map((p) => {
        const kv = writeVarint(p.key)
        const b = new Uint8Array(4 + kv.length)
        new DataView(b.buffer).setUint32(0, p.page)
        b.set(kv, 4)
        return { bytes: b, key: p.key, child: p.page }
      })
      const willBeRoot = groupCells.reduce((a, c) => a + c.bytes.length + 2, 0) + 12 + ho <= pageSize
      level = fill(groupCells, false, willBeRoot ? fixedRoot : undefined)
    }
    if (fixedRoot !== undefined && level[0].page !== fixedRoot) throw new Error('Schema root did not fit on page 1.')
    return level[0].page
  }

  const schemaRows: { rowid: number; rec: Uint8Array }[] = []
  let rid = 1
  for (const t of tables) {
    const rows = t.rows.map((row, i) => {
      const rowid = t.rowidAlias >= 0 && row[t.rowidAlias] !== null && row[t.rowidAlias] !== undefined ? (row[t.rowidAlias] as number | bigint) : i + 1
      return { rowid, rec: encodeRecord(row.map((v, k) => (k === t.rowidAlias ? null : v))) }
    })
    rows.sort((a, b) => (a.rowid < b.rowid ? -1 : a.rowid > b.rowid ? 1 : 0))
    for (let i = 1; i < rows.length; i++) if (rows[i].rowid === rows[i - 1].rowid) throw new Error(`Duplicate rowid ${rows[i].rowid} in ${t.name}.`)
    const root = buildTree(rows)
    schemaRows.push({ rowid: rid++, rec: encodeRecord(['table', t.name, t.name, root, t.sql]) })
  }
  for (const e of extras) schemaRows.push({ rowid: rid++, rec: encodeRecord([e.type, e.name, e.tblName, 0, e.sql]) })
  buildTree(schemaRows, 1)

  // header
  const p1 = pages[0]
  p1.set(new TextEncoder().encode('SQLite format 3\u0000'))
  const dv = new DataView(p1.buffer)
  dv.setUint16(16, pageSize === 65536 ? 1 : pageSize)
  p1[18] = 1; p1[19] = 1; p1[20] = 0; p1[21] = 64; p1[22] = 32; p1[23] = 32
  dv.setUint32(24, 1)
  dv.setUint32(28, pages.length)
  dv.setUint32(32, 0); dv.setUint32(36, 0)
  dv.setUint32(40, 1) // schema cookie
  dv.setUint32(44, 4) // schema format
  dv.setUint32(48, 0)
  dv.setUint32(52, 0)
  dv.setUint32(56, 1) // UTF-8
  dv.setUint32(92, 1) // version-valid-for = change counter
  dv.setUint32(96, 3045001)
  const out = new Uint8Array(pages.length * pageSize)
  pages.forEach((p, i) => out.set(p, i * pageSize))
  return out
}

// ---------- exports ----------

export const qid = (s: string) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(s) && !/^(select|from|where|table|order|group|index|key|default|check|values|primary|references)$/i.test(s) ? s : `"${s.replace(/"/g, '""')}"`)
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('').toUpperCase()

export function sqlLiteral(v: Cell): string {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'bigint') return v.toString()
  if (typeof v === 'number') return Number.isFinite(v) ? (Number.isInteger(v) ? String(v) : String(v).includes('e') || String(v).includes('.') ? String(v) : v.toFixed(1)) : v > 0 ? '1e999' : v < 0 ? '-1e999' : 'NULL'
  if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`
  return `X'${hex(v)}'`
}

export function sqlDump(tables: { name: string; sql: string; columns: string[]; rows: Cell[][] }[], extras: { sql: string | null }[] = []): string {
  const lines = ['PRAGMA foreign_keys=OFF;', 'BEGIN TRANSACTION;']
  for (const t of tables) {
    lines.push(t.sql.trim().replace(/;?$/, ';'))
    if (t.name === 'sqlite_sequence') lines[lines.length - 1] = `DELETE FROM sqlite_sequence;`
    for (const r of t.rows) lines.push(`INSERT INTO ${qid(t.name)} VALUES(${r.map(sqlLiteral).join(',')});`)
  }
  for (const e of extras) if (e.sql) lines.push(e.sql.trim().replace(/;?$/, ';'))
  lines.push('COMMIT;')
  return lines.join('\n') + '\n'
}

export function cellText(v: Cell): string {
  if (v === null || v === undefined) return ''
  if (v instanceof Uint8Array) return `x'${hex(v).slice(0, 64)}${v.length > 32 ? '…' : ''}'`
  return String(v)
}
export function toJsonValue(v: Cell): unknown {
  if (v instanceof Uint8Array) return { $blob: btoa(String.fromCharCode(...v)) }
  if (typeof v === 'bigint') return v.toString()
  return v
}
