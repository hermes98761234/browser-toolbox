import { useMemo, useState } from 'react'
import { Area, Btn, download, FileDrop, Note, Panel, Row, Seg, Select, Split, Stat, Stats, Table, Txt, toCsv, useToolState } from '../kit'
import { fmtBytes } from './lib/image-compressor'
import { execute, SAMPLE_SQL, type Db, type Result, type Value } from './lib/sql-query-playground'
import { cellText, parseCreateTable, qid, readDatabase, sqlDump, toJsonValue, writeDatabase, type Cell, type Database } from './lib/sqlite-browser'

interface Meta { sql: string; rowidAlias: number; withoutRowid: boolean; pages: number; overflow: number; depth: number }
interface Loaded { name: string; size: number; raw: Database; meta: Record<string, Meta>; db: Db; dirty: number }

const BLOB = /^x'([0-9A-F]*)'$/
const toValue = (c: Cell): Value => (c instanceof Uint8Array ? `x'${Array.from(c, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()}'` : typeof c === 'bigint' ? c.toString() : c)
const toCell = (v: Value): Cell => {
  if (typeof v === 'string') { const m = BLOB.exec(v); if (m) return Uint8Array.from(m[1].match(/../g) ?? [], (h) => parseInt(h, 16)) }
  return v
}

const EXTRA_SAMPLE = `CREATE TABLE reviews (id INTEGER PRIMARY KEY, product_id INTEGER, stars INTEGER, body TEXT);
INSERT INTO reviews VALUES (1,1,5,'Clicky, solid, worth it.'),(2,3,4,'Sharp panel; stand wobbles a bit.'),(3,7,5,'Silence on the train at last.'),(4,9,3,'Great for spreadsheets, heavy.'),(5,10,4,'Motor is quiet. Assembly took an hour.');`

function fromDatabase(name: string, size: number, raw: Database): Loaded {
  const db: Db = { tables: {} }
  const meta: Record<string, Meta> = {}
  for (const t of raw.tables) {
    db.tables[t.name.toLowerCase()] = { name: t.name, cols: t.columns.map((c) => ({ name: c.name, type: c.type || 'ANY' })), rows: t.rows.map((r) => r.map(toValue)), pk: t.rowidAlias >= 0 ? t.rowidAlias : undefined }
    meta[t.name.toLowerCase()] = { sql: t.sql, rowidAlias: t.rowidAlias, withoutRowid: t.withoutRowid, pages: t.pages, overflow: t.overflowPages, depth: t.depth }
  }
  return { name, size, raw, meta, db, dirty: 0 }
}

/** Sample database: shop tables from SQL → written by our own SQLite writer → read back by our reader. */
function sampleBytes(): Uint8Array {
  const { db } = execute({ tables: {} }, SAMPLE_SQL + '\n' + EXTRA_SAMPLE)
  const tables = Object.values(db.tables).map((t) => {
    const sql = `CREATE TABLE ${qid(t.name)} (${t.cols.map((c, i) => `${qid(c.name)} ${c.type}${t.pk === i ? ' PRIMARY KEY' : ''}`).join(', ')})`
    return { name: t.name, sql, columns: t.cols.map((c) => c.name), rows: t.rows as Cell[][], rowidAlias: parseCreateTable(sql).rowidAlias }
  })
  return writeDatabase(tables, [{ type: 'view', name: 'order_totals', tblName: 'order_totals', sql: 'CREATE VIEW order_totals AS SELECT o.id, c.name, SUM(p.price * i.qty) AS total FROM orders o JOIN customers c ON c.id = o.customer_id JOIN order_items i ON i.order_id = o.id JOIN products p ON p.id = i.product_id GROUP BY o.id' }])
}

function tablesForWrite(l: Loaded) {
  return Object.entries(l.db.tables).map(([k, t]) => {
    const m = l.meta[k]
    const sameCols = m && parseCreateTable(m.sql).columns.map((c) => c.name).join('\u0000') === t.cols.map((c) => c.name).join('\u0000')
    let sql = m && sameCols ? m.sql : `CREATE TABLE ${qid(t.name)} (${t.cols.map((c, i) => `${qid(c.name)} ${c.type === 'ANY' ? '' : c.type}${t.pk === i ? ' PRIMARY KEY' : ''}`.trim()).join(', ')})`
    if (m?.withoutRowid) sql = sql.replace(/\)\s*without\s+rowid\s*$/i, ')')
    return { name: t.name, sql, columns: t.cols.map((c) => c.name), rows: t.rows.map((r) => r.map(toCell)), rowidAlias: parseCreateTable(sql).rowidAlias }
  })
}

const EXAMPLES: [string, string][] = [
  ['Revenue by category', `SELECT p.category, ROUND(SUM(p.price * i.qty), 2) AS revenue, COUNT(DISTINCT i.order_id) AS orders\nFROM order_items i JOIN products p ON p.id = i.product_id\nGROUP BY p.category ORDER BY revenue DESC;`],
  ['Best customers', `SELECT c.name, c.country, COUNT(o.id) AS orders\nFROM customers c LEFT JOIN orders o ON o.customer_id = c.id\nGROUP BY c.id ORDER BY orders DESC LIMIT 5;`],
  ['Edit: price rise', `UPDATE products SET price = ROUND(price * 1.05, 2) WHERE category = 'Accessories';\nSELECT name, price FROM products WHERE category = 'Accessories';`],
  ['Table sizes', `SELECT (SELECT COUNT(*) FROM customers) AS customers, (SELECT COUNT(*) FROM orders) AS orders,\n       (SELECT COUNT(*) FROM order_items) AS items, (SELECT AVG(stars) FROM reviews) AS avg_stars;`],
]

export default function SqliteBrowser() {
  const [s, set] = useToolState('sqlite-browser', { tab: 'browse' as 'browse' | 'sql' | 'schema' | 'export', sql: EXAMPLES[0][1], pageSize: 50 })
  const [l, setL] = useState<Loaded | null>(() => { const b = sampleBytes(); return fromDatabase('sample-shop.sqlite', b.length, readDatabase(b)) })
  const [table, setTable] = useState('customers')
  const [page, setPage] = useState(0)
  const [filter, setFilter] = useState('')
  const [res, setRes] = useState<Result[] | null>(null)
  const [err, setErr] = useState('')

  const open = (name: string, bytes: Uint8Array) => {
    setErr('')
    try {
      const raw = readDatabase(bytes)
      const ld = fromDatabase(name, bytes.length, raw)
      setL(ld)
      setTable(raw.tables.find((t) => !t.name.startsWith('sqlite_'))?.name.toLowerCase() ?? '')
      setPage(0); setRes(null)
    } catch (e) { setErr(`${name}: ${(e as Error).message}`) }
  }

  const run = () => {
    if (!l) return
    try {
      const before = JSON.stringify(Object.values(l.db.tables).map((t) => t.rows.length))
      const r = execute(l.db, s.sql)
      const changed = r.results.some((x) => x.message && !/^\d+ rows?$/.test(x.message)) || before !== JSON.stringify(Object.values(r.db.tables).map((t) => t.rows.length))
      setL({ ...l, db: r.db, dirty: l.dirty + (changed ? 1 : 0) })
      setRes(r.results); setErr('')
    } catch (e) { setErr((e as Error).message); setRes(null) }
  }

  const t = l?.db.tables[table]
  const rows = useMemo(() => {
    if (!t) return []
    const q = filter.trim().toLowerCase()
    return q ? t.rows.filter((r) => r.some((v) => v !== null && String(v).toLowerCase().includes(q))) : t.rows
  }, [t, filter])
  const pages = Math.max(1, Math.ceil(rows.length / s.pageSize))
  const shown = rows.slice(page * s.pageSize, (page + 1) * s.pageSize)
  const last = res?.[res.length - 1]
  const base = l?.name.replace(/\.[^.]+$/, '') ?? 'database'
  const userTables = l ? Object.values(l.db.tables) : []
  const fmtV = (v: Value) => (v === null ? <i className="muted">NULL</i> : typeof v === 'string' && BLOB.test(v) ? <span className="muted">{cellText(toCell(v))}</span> : String(v).length > 120 ? String(v).slice(0, 120) + '…' : String(v))

  const exportSqlite = () => {
    if (!l) return
    try {
      const views = l.raw.schema.filter((e) => (e.type === 'view' || e.type === 'trigger') && e.sql).map((e) => ({ type: e.type as 'view' | 'trigger', name: e.name, tblName: e.tblName, sql: e.sql! }))
      const bytes = writeDatabase(tablesForWrite(l), views)
      readDatabase(bytes) // self-check: must re-open
      download(`${base}-edited.sqlite`, new Blob([bytes as BlobPart], { type: 'application/vnd.sqlite3' }))
    } catch (e) { setErr('Could not write the database: ' + (e as Error).message + ' — use the SQL dump instead.') }
  }
  const dump = () => (l ? sqlDump(tablesForWrite(l), l.raw.schema.filter((e) => e.type !== 'table' && e.sql && !e.name.startsWith('sqlite_autoindex'))) : '')

  return (
    <Split wide="right">
      <div>
        <Panel title="Database">
          <FileDrop accept=".sqlite,.sqlite3,.db,.db3,.s3db,.gpkg,.mbtiles,application/vnd.sqlite3,application/x-sqlite3" onFiles={async ([f]) => open(f.name, new Uint8Array(await f.arrayBuffer()))} label="Drop a .sqlite / .db file" />
          <Row><Btn onClick={() => open('sample-shop.sqlite', sampleBytes())}>Load sample shop DB</Btn></Row>
          {err && <Note tone="err">{err}</Note>}
          {l && (
            <p className="muted" style={{ fontSize: 13, margin: '8px 0 0' }}>
              <b>{l.name}</b> · {fmtBytes(l.size)} · page {l.raw.header.pageSize} B × {l.raw.header.pageCount} · {l.raw.header.encoding} · SQLite {Math.floor(l.raw.header.sqliteVersion / 1e6)}.{Math.floor(l.raw.header.sqliteVersion / 1e3) % 1000}.{l.raw.header.sqliteVersion % 1000} · user_version {l.raw.header.userVersion}
            </p>
          )}
          {l?.raw.warnings.map((w) => <Note key={w} tone="warn">{w}</Note>)}
        </Panel>
        {l && (
          <Panel title="Objects">
            <div style={{ display: 'grid', gap: 4 }}>
              {userTables.map((x) => (
                <button key={x.name} type="button" className={`k-btn ${table === x.name.toLowerCase() ? 'primary' : 'ghost'}`} style={{ justifyContent: 'space-between', display: 'flex' }} onClick={() => { setTable(x.name.toLowerCase()); setPage(0); set({ tab: 'browse' }) }}>
                  <span>▦ {x.name}</span><span style={{ opacity: 0.75 }}>{x.rows.length.toLocaleString()} rows · {x.cols.length} cols</span>
                </button>
              ))}
              {l.raw.indexes.map((i) => <div key={i.name} className="muted" style={{ fontSize: 13, padding: '2px 12px' }}>⚲ index {i.name} on {i.table} ({i.entries} entries)</div>)}
              {l.raw.schema.filter((e) => e.type === 'view' || e.type === 'trigger').map((e) => <div key={e.name} className="muted" style={{ fontSize: 13, padding: '2px 12px' }}>{e.type === 'view' ? '◫ view' : '⚡ trigger'} {e.name}</div>)}
            </div>
          </Panel>
        )}
        <Note>The file is parsed by a SQLite file-format reader written for this page (b-tree pages, overflow chains, record serial types) — nothing is uploaded. Queries run on an in-memory SQL engine (SQLite-flavoured subset).</Note>
      </div>

      <div>
        <Stats>
          <Stat label="Tables" value={userTables.length} sub={l ? `${l.raw.indexes.length} indexes · ${l.raw.schema.filter((e) => e.type === 'view').length} views` : ''} />
          <Stat label="Rows" value={userTables.reduce((a, x) => a + x.rows.length, 0).toLocaleString()} />
          <Stat label="Pages read" value={l ? Object.values(l.meta).reduce((a, m) => a + m.pages + m.overflow, 0) : '—'} sub={l ? `${Object.values(l.meta).reduce((a, m) => a + m.overflow, 0)} overflow` : ''} />
          <Stat label="Unsaved edits" value={l?.dirty ?? 0} tone={l?.dirty ? 'accent' : undefined} sub={l?.dirty ? 'export to keep them' : 'read-only so far'} />
        </Stats>
        <Seg value={s.tab} onChange={(tab) => set({ tab })} options={[['browse', '▦ Browse'], ['sql', '⌨ SQL'], ['schema', '🧬 Schema'], ['export', '⬇ Export']]} />

        {s.tab === 'browse' && t && (
          <Panel title={`${t.name} — ${rows.length.toLocaleString()} rows`} actions={<Btn onClick={() => download(`${t.name}.csv`, toCsv([t.cols.map((c) => c.name), ...rows.map((r) => r.map((v) => (v === null ? '' : v)))]), 'text/csv')}>⬇ CSV</Btn>}>
            <Row>
              <Txt label="Filter rows" value={filter} onChange={(v) => { setFilter(v); setPage(0) }} placeholder="contains…" />
              <Select label="Rows per page" value={s.pageSize} onChange={(pageSize) => { set({ pageSize }); setPage(0) }} options={[25, 50, 100, 500]} />
            </Row>
            <Table head={t.cols.map((c, i) => <span key={c.name} title={c.type}>{t.pk === i ? '🔑 ' : ''}{c.name} <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}>{c.type !== 'ANY' ? c.type : ''}</span></span>)} rows={shown.map((r) => r.map(fmtV))} />
            <Row>
              <Btn disabled={page === 0} onClick={() => setPage(page - 1)}>‹ Prev</Btn>
              <span className="muted">page {page + 1} / {pages}</span>
              <Btn disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next ›</Btn>
            </Row>
          </Panel>
        )}

        {s.tab === 'sql' && (
          <Panel title="Query" actions={<Btn kind="primary" onClick={run}>▶ Run (Ctrl+Enter)</Btn>}>
            <Row>{EXAMPLES.map(([n, q]) => <Btn key={n} kind="ghost" onClick={() => set({ sql: q })}>{n}</Btn>)}</Row>
            <div onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run() } }}>
              <Area value={s.sql} onChange={(sql) => set({ sql })} rows={7} mono />
            </div>
            {err && <Note tone="err">{err}</Note>}
            {res && res.filter((r) => r.message).map((r, i) => <Note key={i} tone="ok">{r.message} <span className="muted">({(r.ms ?? 0).toFixed(1)} ms)</span></Note>)}
            {last && last.columns.length > 0 && (
              <>
                <Table head={last.columns} rows={last.rows.slice(0, 1000).map((r) => r.map(fmtV))} />
                <Row>
                  <span className="muted">{last.rows.length} row(s){last.rows.length > 1000 ? ' (first 1000 shown)' : ''}</span>
                  <Btn onClick={() => download('result.csv', toCsv([last.columns, ...last.rows.map((r) => r.map((v) => (v === null ? '' : v)))]), 'text/csv')}>⬇ CSV</Btn>
                  <Btn onClick={() => download('result.json', JSON.stringify(last.rows.map((r) => Object.fromEntries(last.columns.map((c, i) => [c, r[i]]))), null, 2), 'application/json')}>⬇ JSON</Btn>
                </Row>
              </>
            )}
            <p className="muted" style={{ fontSize: 13 }}>Supports SELECT with JOINs, GROUP BY, subqueries, CASE and common functions, plus INSERT / UPDATE / DELETE / CREATE TABLE / DROP TABLE. Changes stay in memory until you export.</p>
          </Panel>
        )}

        {s.tab === 'schema' && l && (
          <Panel title="Schema">
            <Table
              head={['Object', 'Type', 'Root page', 'B-tree', 'SQL']}
              rows={l.raw.schema.map((e) => {
                const m = l.meta[e.name.toLowerCase()]
                return [<b key="n">{e.name}</b>, e.type, e.rootpage || '—', m ? `${m.pages} pages, depth ${m.depth}${m.overflow ? `, ${m.overflow} overflow` : ''}${m.withoutRowid ? ', WITHOUT ROWID' : ''}` : '—', <code key="s" style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{e.sql ?? '(auto)'}</code>]
              })}
            />
          </Panel>
        )}

        {s.tab === 'export' && l && (
          <Panel title="Export">
            <Row>
              <Btn kind="primary" onClick={exportSqlite}>⬇ .sqlite file</Btn>
              <Btn onClick={() => download(`${base}.sql`, dump(), 'application/sql')}>⬇ SQL dump</Btn>
              <Btn onClick={() => download(`${base}.json`, JSON.stringify(Object.fromEntries(Object.values(l.db.tables).map((x) => [x.name, x.rows.map((r) => Object.fromEntries(x.cols.map((c, i) => [c.name, toJsonValue(toCell(r[i]))])))])), null, 2), 'application/json')}>⬇ JSON (all tables)</Btn>
              {t && <Btn onClick={() => download(`${t.name}.csv`, toCsv([t.cols.map((c) => c.name), ...t.rows.map((r) => r.map((v) => (v === null ? '' : v)))]), 'text/csv')}>⬇ CSV ({t.name})</Btn>}
            </Row>
            <Note>
              <b>.sqlite export</b> writes a fresh database (4 KiB pages, UTF-8) with every table and your edits, re-checked by the reader before download; it has passed SQLite’s own <code>PRAGMA integrity_check</code> in testing. Views and triggers are kept.
              Indexes are <b>not</b> rebuilt{l.raw.indexes.length ? ` (${l.raw.indexes.length} here)` : ''} and WITHOUT ROWID tables become ordinary tables — the <b>SQL dump</b> keeps everything: load it with <code>sqlite3 new.db &lt; dump.sql</code>.
            </Note>
            <details>
              <summary>Preview SQL dump</summary>
              <pre style={{ maxHeight: 300, overflow: 'auto', fontSize: 12 }}>{dump().slice(0, 6000)}</pre>
            </details>
          </Panel>
        )}
      </div>
    </Split>
  )
}
