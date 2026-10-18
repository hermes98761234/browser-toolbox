import { useEffect, useMemo, useState } from 'react'
import { Area, Btn, CsvButton, download, FileDrop, Note, num, Panel, Row, Select, Seg, Stat, Stats, Table, toCsv, useToolState } from '../kit'
import { CODECS, logicalLabel, readMeta, readTable, sampleColumns, writeParquet, type Codec, type ColumnInfo, type ParquetMeta, type ReadResult, type Value } from './lib/columnar-file-reader'
import { execute, type Db, type Result } from './lib/sql-query-playground'

interface State { sql: string; codec: Codec; pageVersion: '1' | '2' }
const DEF: State = { sql: '', codec: 'SNAPPY', pageVersion: '1' }

interface Loaded { name: string; table: string; buf: Uint8Array; meta: ParquetMeta; data: ReadResult; ms: number }

const bytes = (b: number) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(2)} MB`)
const tableName = (file: string) => {
  const t = file.replace(/\.[^.]*$/, '').replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'data'
  return /^\d/.test(t) ? `t_${t}` : t
}
const qid = (n: string) => (/^[A-Za-z_]\w*$/.test(n) ? n : `"${n}"`)

function examples(table: string, cols: ColumnInfo[]): [string, string][] {
  const text = cols.find((c) => c.sqlType === 'TEXT' && c.logical.kind !== 'date' && c.logical.kind !== 'timestamp')
  const numc = cols.filter((c) => c.sqlType === 'REAL' || c.sqlType === 'INTEGER')
  const metric = numc.find((c) => c.sqlType === 'REAL') ?? numc[numc.length - 1]
  const out: [string, string][] = [['First rows', `SELECT * FROM ${table} LIMIT 50;`], ['Row count', `SELECT count(*) AS rows FROM ${table};`]]
  if (text) out.push([`Group by ${text.name}`, `SELECT ${qid(text.name)}, count(*) AS n${metric ? `, round(avg(${qid(metric.name)}), 2) AS avg_${metric.name.replace(/\W/g, '_')}` : ''}\nFROM ${table}\nGROUP BY ${qid(text.name)}\nORDER BY n DESC;`])
  if (metric) out.push([`Top ${metric.name}`, `SELECT * FROM ${table}\nORDER BY ${qid(metric.name)} DESC\nLIMIT 10;`])
  const nullable = cols.filter((c) => c.optional)
  if (nullable.length) out.push(['Null counts', `SELECT ${nullable.map((c) => `sum(CASE WHEN ${qid(c.name)} IS NULL THEN 1 ELSE 0 END) AS ${c.name.replace(/\W/g, '_')}_nulls`).join(',\n       ')}\nFROM ${table};`])
  return out
}

const SAMPLE_SQL = `-- Revenue by region and product for paid orders
SELECT region, product,
       sum(units) AS units,
       round(sum(units * unit_price * (1 - coalesce(discount, 0))), 2) AS revenue
FROM orders
WHERE paid = 1
GROUP BY region, product
ORDER BY revenue DESC
LIMIT 15;`

function colStats(rows: Value[][], j: number) {
  let nulls = 0, min: Value = null, max: Value = null
  const seen = new Set<Value>()
  for (const r of rows) {
    const v = r[j]
    if (v === null) { nulls++; continue }
    if (seen.size < 100001) seen.add(v)
    if (min === null || v < min) min = v
    if (max === null || v > max) max = v
  }
  return { nulls, min, max, distinct: seen.size > 100000 ? '> 100k' : String(seen.size) }
}

const show = (v: Value, c?: ColumnInfo) => (v === null ? <span className="muted">null</span> : c?.sqlType === 'BOOLEAN' ? (v ? 'true' : 'false') : typeof v === 'number' ? num(v, 6) : v.length > 80 ? `${v.slice(0, 80)}…` : v)

export default function ColumnarFileReader() {
  const [s, set] = useToolState('columnar-file-reader', DEF)
  const [file, setFile] = useState<Loaded | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<{ results: Result[]; error?: string; ms: number } | null>(null)
  const [view, setView] = useState<'schema' | 'groups' | 'kv'>('schema')

  const open = async (name: string, buf: Uint8Array, sql?: string) => {
    setBusy(true)
    setErr('')
    try {
      const t0 = performance.now()
      const meta = readMeta(buf)
      const data = await readTable(buf, meta)
      const loaded = { name, table: tableName(name), buf, meta, data, ms: performance.now() - t0 }
      setFile(loaded)
      const q = sql ?? `SELECT * FROM ${loaded.table} LIMIT 50;`
      set({ sql: q })
      runSql(loaded, q)
    } catch (e) {
      setErr(`${name}: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const makeSample = async () => writeParquet(sampleColumns(600), { codec: s.codec, pageVersion: s.pageVersion === '2' ? 2 : 1, rowGroupRows: 250, createdBy: 'browser-toolbox sample writer' })
  const loadSample = async () => open('orders.parquet', await makeSample(), SAMPLE_SQL)

  // first screen: generate and open the sample
  useEffect(() => {
    void (async () => {
      const buf = await writeParquet(sampleColumns(600), { codec: 'SNAPPY', rowGroupRows: 250, createdBy: 'browser-toolbox sample writer' })
      await open('orders.parquet', buf, s.sql || SAMPLE_SQL)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function runSql(f: Loaded | null = file, sql = s.sql) {
    if (!f) return
    const t0 = performance.now()
    const d: Db = { tables: { [f.table]: { name: f.table, cols: f.data.columns.map((c) => ({ name: c.name, type: c.sqlType === 'BOOLEAN' ? 'INTEGER' : c.sqlType })), rows: f.data.rows } } }
    try {
      // execute() works on a copy, so UPDATE/DELETE never change the loaded file
      const r = execute(d, sql)
      setRes({ results: r.results, ms: performance.now() - t0 })
    } catch (e) {
      setRes({ results: [], error: (e as Error).message, ms: performance.now() - t0 })
    }
  }

  const stats = useMemo(() => (file ? file.data.columns.map((_, j) => colStats(file.data.rows, j)) : []), [file])
  const last = res?.results.filter((r) => r.columns.length).at(-1)
  const codecs = file ? [...new Set(file.meta.rowGroups.flatMap((g) => g.chunks.map((c) => CODECS[c.codec] ?? `#${c.codec}`)))] : []
  const comp = file ? file.meta.rowGroups.flatMap((g) => g.chunks).reduce((a, c) => [a[0] + c.compressed, a[1] + c.uncompressed], [0, 0]) : [0, 0]

  return (
    <>
      <Panel title="Open a Parquet file" actions={<>
        <Btn onClick={() => void loadSample()}>Load sample</Btn>
        <Btn onClick={() => void makeSample().then((b) => download('orders.parquet', new Blob([b as BlobPart], { type: 'application/vnd.apache.parquet' })))}>⬇ Sample .parquet</Btn>
      </>}>
        <FileDrop accept=".parquet,.parq,.pq" onFiles={async ([f]) => open(f.name, new Uint8Array(await f.arrayBuffer()))} label="Drop a .parquet file here or click to choose — it never leaves your browser" />
        <Row>
          <Select label="Sample codec" value={s.codec} onChange={(codec) => set({ codec })} options={['UNCOMPRESSED', 'SNAPPY', 'GZIP'] as Codec[]} />
          <Select label="Sample data pages" value={s.pageVersion} onChange={(pageVersion) => set({ pageVersion })} options={[['1', 'v1'], ['2', 'v2']]} />
        </Row>
        {busy && <Note>Reading…</Note>}
        {err && <Note tone="err">{err}</Note>}
        <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>
          Supported: flat columns (required or nullable), PLAIN, dictionary, RLE, DELTA and BYTE_STREAM_SPLIT encodings, data pages v1 and v2, UNCOMPRESSED / SNAPPY / GZIP.
          ZSTD, LZ4, Brotli, nested lists/structs/maps and encrypted files are reported as unsupported. Up to 200,000 rows are loaded.
        </p>
      </Panel>

      {file && (
        <>
          <Stats>
            <Stat label="File" value={file.name} sub={`${bytes(file.meta.size)} · read in ${num(file.ms, 0)} ms`} />
            <Stat label="Rows" value={num(file.meta.numRows, 0)} sub={file.data.truncated ? `first ${num(file.data.rows.length, 0)} loaded` : 'all loaded'} tone="accent" />
            <Stat label="Columns" value={file.meta.columns.length} sub={`${file.data.columns.length} readable`} />
            <Stat label="Row groups" value={file.meta.rowGroups.length} sub={`format v${file.meta.version}`} />
            <Stat label="Compression" value={codecs.join(', ') || '—'} sub={comp[0] ? `${bytes(comp[0])} of ${bytes(comp[1])} (${num((comp[0] / comp[1]) * 100, 0)}%)` : ''} />
          </Stats>
          {file.data.errors.length > 0 && <Note tone="warn"><b>Some columns could not be read:</b><ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{file.data.errors.map((e) => <li key={e}>{e}</li>)}</ul></Note>}

          <Panel title="SQL query" actions={<>
            <Btn kind="primary" onClick={() => runSql()}>▶ Run (Ctrl+Enter)</Btn>
            {last && <CsvButton name={`${file.table}-query.csv`} rows={() => [last.columns, ...last.rows.map((r) => r.map((v) => v ?? ''))]} />}
          </>}>
            <Row>{examples(file.table, file.data.columns).map(([l, q]) => <Btn key={l} kind="ghost" onClick={() => { set({ sql: q }); runSql(file, q) }}>{l}</Btn>)}</Row>
            <div onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runSql() } }}>
              <Area value={s.sql} onChange={(sql) => set({ sql })} rows={10} mono />
            </div>
            <p className="muted" style={{ fontSize: 12, margin: '4px 0 8px' }}>
              Table <code>{file.table}</code>. SQLite-style SELECT with WHERE, GROUP BY, HAVING, ORDER BY, LIMIT, JOINs, subqueries, CASE and functions like round, substr, coalesce, strftime. Booleans are 1/0; dates and timestamps are ISO text (UTC).
            </p>
            {res?.error && <Note tone="err">{res.error}</Note>}
            {res && !res.error && res.results.filter((r) => r.message && !r.columns.length).map((r, i) => <Note key={i} tone="ok">{r.message}</Note>)}
            {last && (
              <>
                <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>{num(last.rows.length, 0)} row{last.rows.length === 1 ? '' : 's'} · {num(res?.ms ?? 0, 1)} ms</div>
                <Table head={last.columns} rows={last.rows.map((r) => r.map((v) => show(v)))} max={200} />
              </>
            )}
          </Panel>

          <Panel title="File structure" actions={<>
            <Seg value={view} onChange={setView} options={[['schema', 'Schema'], ['groups', 'Row groups'], ['kv', 'Metadata']]} />
            <Btn onClick={() => download(`${file.table}.csv`, toCsv([file.data.columns.map((c) => c.name), ...file.data.rows.map((r) => r.map((v, j) => (v === null ? '' : file.data.columns[j].sqlType === 'BOOLEAN' ? (v ? 'true' : 'false') : v)))]), 'text/csv')}>⬇ Whole table CSV</Btn>
          </>}>
            {view === 'schema' && (
              <Table
                head={['Column', 'Physical', 'Logical', 'Nullable', 'Nulls', 'Distinct', 'Min', 'Max']}
                rows={file.meta.columns.map((c) => {
                  const j = file.data.columns.indexOf(c)
                  const st = j >= 0 ? stats[j] : null
                  return [
                    <b key="n">{c.path}</b>, c.physical, logicalLabel(c), c.optional ? 'yes' : 'no',
                    st ? num(st.nulls, 0) : '—', st ? st.distinct : '—',
                    st ? show(st.min, c) : <span key="r" className="muted">{c.reason ?? 'unreadable'}</span>, st ? show(st.max, c) : '',
                  ]
                })}
              />
            )}
            {view === 'groups' && (
              <Table
                head={['Group', 'Column', 'Rows', 'Codec', 'Encodings', 'Compressed', 'Uncompressed', 'Nulls (stats)']}
                rows={file.meta.rowGroups.flatMap((g, i) => g.chunks.map((c) => [i, c.path, num(g.numRows, 0), CODECS[c.codec] ?? `#${c.codec}`, c.encodings.join(', '), bytes(c.compressed), bytes(c.uncompressed), c.nullCount ?? '—']))}
                max={300}
              />
            )}
            {view === 'kv' && (
              <>
                <p><b>Created by:</b> {file.meta.createdBy || '—'} · <b>Footer:</b> {bytes(file.meta.footerBytes)}</p>
                {file.meta.kv.length ? <Table head={['Key', 'Value']} rows={file.meta.kv.map(([k, v]) => [k, <code key="v" style={{ wordBreak: 'break-all', fontSize: 12 }}>{v.length > 400 ? `${v.slice(0, 400)}…` : v}</code>])} /> : <Note>No key/value metadata.</Note>}
              </>
            )}
          </Panel>
        </>
      )}
    </>
  )
}
