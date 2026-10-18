import { gunzipSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { decodeRecord, encodeRecord, parseCreateTable, readDatabase, readVarint, sqlDump, writeDatabase, writeVarint, type WriteTable } from './sqlite-browser'

// Made by Python's sqlite3 (SQLite 3.45, page_size 512 so trees are multi-level): users ×120 with an index,
// notes with a 2.4 kB overflowing text, a WITHOUT ROWID table, 64-bit integers and a view.
const FIXTURE = gunzipSync(Buffer.from('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', 'base64'))

describe('varints and records', () => {
  it('round-trips varints including 9-byte values', () => {
    for (const v of [0, 1, 127, 128, 240, 2287, 16383, 16384, 2 ** 31, 2 ** 53 - 1, -1, 2n ** 62n, -(2n ** 63n)]) {
      const b = writeVarint(v)
      const [r, n] = readVarint(b, 0)
      expect(n).toBe(b.length)
      expect(BigInt(r)).toBe(BigInt(v))
    }
    expect(writeVarint(-1).length).toBe(9)
  })
  it('round-trips records with every serial type', () => {
    const vals = [null, 0, 1, -5, 300, -70000, 2 ** 40, 2n ** 60n, 3.25, 'héllo', new Uint8Array([1, 2, 3])]
    const back = decodeRecord(encodeRecord(vals), new TextDecoder())
    expect(back.slice(0, 10)).toEqual(vals.slice(0, 10))
    expect(Array.from(back[10] as Uint8Array)).toEqual([1, 2, 3])
  })
})

describe('CREATE TABLE parsing', () => {
  it('finds columns, types, rowid alias and WITHOUT ROWID', () => {
    const a = parseCreateTable('CREATE TABLE t (id INTEGER PRIMARY KEY, "full name" VARCHAR(20) NOT NULL DEFAULT \'x\', [n] NUMERIC(10, 2), CHECK (id > 0))')
    expect(a.columns.map((c) => c.name)).toEqual(['id', 'full name', 'n'])
    expect(a.columns[1].type).toBe('VARCHAR(20)')
    expect(a.rowidAlias).toBe(0)
    const b = parseCreateTable('CREATE TABLE kv (k TEXT, v, PRIMARY KEY (k)) WITHOUT ROWID')
    expect(b.withoutRowid).toBe(true)
    expect(b.rowidAlias).toBe(-1)
    expect(parseCreateTable('CREATE TABLE x (id INT PRIMARY KEY)').rowidAlias).toBe(-1)
  })
})

describe('reading a real SQLite file', () => {
  const db = readDatabase(new Uint8Array(FIXTURE))
  const t = (n: string) => db.tables.find((x) => x.name === n)!
  it('parses the header', () => {
    expect(db.header.pageSize).toBe(512)
    expect(db.header.encoding).toBe('UTF-8')
    expect(db.header.pageCount * 512).toBe(FIXTURE.length)
  })
  it('reads the schema', () => {
    expect(db.schema.map((s) => s.type + ':' + s.name)).toEqual(expect.arrayContaining(['table:users', 'table:notes', 'table:kv', 'table:nums', 'table:sqlite_sequence', 'index:users_name', 'view:top_users']))
  })
  it('reads multi-level table b-trees with the rowid alias', () => {
    const u = t('users')
    expect(u.rows.length).toBe(120)
    expect(u.depth).toBeGreaterThan(1)
    expect(u.rows[0]).toEqual([1, 'User 001 Ünïcødé', 'u1@example.com', 0.83, expect.any(Uint8Array)])
    expect(Array.from(u.rows[119][4] as Uint8Array)).toEqual([120, 255, 0])
    expect(u.rows.map((r) => r[0])).toEqual(Array.from({ length: 120 }, (_, i) => i + 1))
  })
  it('follows overflow pages', () => {
    const n = t('notes')
    expect((n.rows[0][2] as string).length).toBe(2400)
    expect(n.overflowPages).toBeGreaterThan(2)
    expect(n.rows[1]).toEqual([2, 2, 'short'])
  })
  it('reads WITHOUT ROWID tables and index b-trees', () => {
    expect(t('kv').rows).toEqual([['alpha', 1], ['beta', 'two'], ['delta', null], ['gamma', 3.5]])
    expect(db.indexes.find((i) => i.name === 'users_name')?.entries).toBe(120)
  })
  it('decodes 64-bit integers', () => {
    expect(t('nums').rows).toEqual([[2 ** 40, -1, 2n ** 62n], [-(2n ** 63n), 127, -129], [0, 1, 1e-300]])
  })
  it('rejects non-SQLite files', () => {
    expect(() => readDatabase(new TextEncoder().encode('hello world'.repeat(20)))).toThrow(/Not a SQLite/)
  })
})

describe('writer', () => {
  const db = readDatabase(new Uint8Array(FIXTURE))
  const tables: WriteTable[] = db.tables.filter((x) => !x.withoutRowid).map((x) => ({ name: x.name, sql: x.sql, columns: x.columns.map((c) => c.name), rows: x.rows, rowidAlias: x.rowidAlias }))
  it('re-opens with the reader (multi-level trees, overflow, page-1 schema)', () => {
    const bytes = writeDatabase(tables, [{ type: 'view', name: 'top_users', tblName: 'top_users', sql: 'CREATE VIEW top_users AS SELECT name, score FROM users WHERE score > 90' }], 512)
    if (process.env.SQLITE_OUT) writeFileSync(process.env.SQLITE_OUT, bytes)
    const back = readDatabase(bytes)
    expect(back.warnings).toEqual([])
    for (const t of tables) {
      const b = back.tables.find((x) => x.name === t.name)!
      expect(b.rows).toEqual(t.rows)
    }
    expect(back.tables.find((x) => x.name === 'users')!.depth).toBeGreaterThan(1)
    expect(back.schema.some((s) => s.type === 'view')).toBe(true)
  })
  it('handles many tables and big tables at 4 KiB pages', () => {
    const many: WriteTable[] = Array.from({ length: 60 }, (_, k) => ({ name: 't' + k, sql: `CREATE TABLE t${k} (id INTEGER PRIMARY KEY, v TEXT)`, columns: ['id', 'v'], rowidAlias: 0, rows: Array.from({ length: k * 40 }, (_, i) => [i + 1, 'value ' + i + ' '.repeat(i % 50)]) }))
    const back = readDatabase(writeDatabase(many))
    expect(back.tables.length).toBe(60)
    expect(back.tables[59].rows.length).toBe(59 * 40)
    expect(back.tables[59].rows[1000]).toEqual(many[59].rows[1000])
  })
  it('rejects duplicate rowids', () => {
    expect(() => writeDatabase([{ name: 'x', sql: 'CREATE TABLE x (id INTEGER PRIMARY KEY)', columns: ['id'], rowidAlias: 0, rows: [[1], [1]] }])).toThrow(/Duplicate/)
  })
  it('dumps SQL', () => {
    const d = sqlDump([{ name: 'a b', sql: 'CREATE TABLE "a b" (x, y)', columns: ['x', 'y'], rows: [[1, "it's"], [null, new Uint8Array([255])]] }])
    expect(d).toContain(`INSERT INTO "a b" VALUES(1,'it''s');`)
    expect(d).toContain(`VALUES(NULL,X'FF');`)
  })
})
