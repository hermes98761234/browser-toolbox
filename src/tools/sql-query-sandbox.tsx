import { useMemo, useState } from 'react'
import { Btn, CopyButton, download, FileDrop, Note, num, Panel, Row, Split, Stat, Stats, toCsv, Txt, useToolState } from '../kit'
import { detectDelimiter, parseCsv } from './lib/csv-json-converter'
import { execute, SqlError, tableFromCsv, type Db, type Result, type Value } from './lib/sql-query-playground'
import { locate, sampleDb, sortIndex, SUPPORTED, tableName, toMarkdown } from './lib/sql-query-sandbox'

interface Hist { sql: string; at: number; ms: number; rows: number; ok: boolean; star?: boolean }
interface State { sql: string; history: Hist[] }

const FIRST = `-- Payroll by department (LEFT JOIN keeps departments without staff)
SELECT d.name AS department,
       count(e.id) AS people,
       round(avg(e.salary)) AS avg_salary,
       sum(e.salary) AS payroll,
       round(100.0 * sum(e.salary) / d.budget, 1) AS pct_of_budget
FROM departments d
LEFT JOIN employees e ON e.department_id = d.id
GROUP BY d.name
ORDER BY payroll DESC;`

const EXAMPLES: [string, string][] = [
  ['Payroll', FIRST],
  ['Monthly sales', `SELECT strftime('%Y-%m', sold_on) AS month, count(*) AS deals, sum(amount) AS revenue,
       round(avg(amount)) AS avg_deal
FROM sales GROUP BY month ORDER BY month;`],
  ['Top sellers', `SELECT e.name, e.city, count(s.id) AS deals, sum(s.amount) AS revenue
FROM employees e JOIN sales s ON s.employee_id = e.id
GROUP BY e.name, e.city HAVING revenue > 50000 ORDER BY revenue DESC;`],
  ['Tenure', `SELECT name, hired,
       round((julianday('2025-10-01') - julianday(hired)) / 365.25, 1) AS years,
       CASE WHEN hired < '2020-01-01' THEN 'veteran' WHEN hired < '2023-01-01' THEN 'established' ELSE 'new' END AS band,
       date(hired, '+1 year', 'start of month') AS first_review
FROM employees ORDER BY hired;`],
  ['Above average', `SELECT name, title, salary FROM employees
WHERE salary > (SELECT avg(salary) FROM employees)
ORDER BY salary DESC;`],
  ['No department', `SELECT e.name, e.title FROM employees e
LEFT JOIN departments d ON d.id = e.department_id
WHERE d.id IS NULL;`],
  ['Paging', `SELECT DISTINCT city, upper(substr(city, 1, 3)) AS code FROM employees
ORDER BY city LIMIT 4 OFFSET 2;`],
]

const DEF: State = { sql: FIRST, history: [] }
type Run = { results: Result[]; error?: string; pos?: number; ms: number; db?: Db }

function run(db: Db, sql: string): Run {
  const t0 = performance.now()
  try {
    const r = execute(db, sql)
    return { results: r.results, db: r.db, ms: performance.now() - t0 }
  } catch (e) {
    return { results: [], error: (e as Error).message, pos: e instanceof SqlError ? e.pos : undefined, ms: performance.now() - t0 }
  }
}

const PAGE = 100
const cell = (v: Value) => (v === null ? <span className="muted">NULL</span> : typeof v === 'number' ? num(v, 6) : v)
const csvOf = (r: Result) => [r.columns, ...r.rows.map((x) => x.map((v) => (v === null ? '' : v)))]

export default function SqlQuerySandbox() {
  const [s, set] = useToolState('sql-query-sandbox', DEF)
  const [db, setDb, resetDb] = useToolState<Db>('sql-query-sandbox-db', sampleDb())
  const [out, setOut] = useState<Run>(() => run(db, s.sql))
  const [sort, setSort] = useState<[number, 1 | -1] | null>(null)
  const [filter, setFilter] = useState('')
  const [page, setPage] = useState(0)
  const [paste, setPaste] = useState('')
  const [pasteName, setPasteName] = useState('pasted')
  const [msg, setMsg] = useState('')

  const go = (sql = s.sql) => {
    const r = run(db, sql)
    setOut(r)
    setSort(null)
    setPage(0)
    if (r.db) setDb(r.db)
    const shown = r.results.length ? r.results[r.results.length - 1].rows.length : 0
    set((st) => {
      const starred = st.history.find((h) => h.sql === sql)?.star
      const h: Hist = { sql, at: Date.now(), ms: Math.round(r.ms * 10) / 10, rows: shown, ok: !r.error, star: starred }
      return { ...st, sql, history: [h, ...st.history.filter((x) => x.sql !== sql)].filter((x, i) => x.star || i < 40) }
    })
  }

  const addCsv = (name: string, text: string) => {
    const rows = parseCsv(text.replace(/^﻿/, ''), detectDelimiter(text))
    if (rows.length < 2) return setMsg(`“${name}”: needs a header row and at least one data row.`)
    const n = tableName(name, Object.keys(db.tables))
    setDb({ tables: { ...db.tables, [n]: tableFromCsv(n, rows) } })
    setMsg(`Loaded table ${n} (${rows.length - 1} rows).`)
    const q = `SELECT * FROM ${n} LIMIT 50;`
    set({ sql: q })
  }

  const tables = Object.values(db.tables)
  const res = [...out.results].reverse().find((r) => !r.message) ?? out.results[out.results.length - 1]
  const messages = out.results.filter((r) => r.message).map((r) => r.message!)
  const view = useMemo(() => {
    if (!res) return [] as Value[][]
    let rows = res.rows
    const f = filter.trim().toLowerCase()
    if (f) rows = rows.filter((r) => r.some((v) => v !== null && String(v).toLowerCase().includes(f)))
    if (sort) rows = sortIndex(rows, sort[0], sort[1]).map((i) => rows[i])
    return rows
  }, [res, filter, sort])
  const pages = Math.max(1, Math.ceil(view.length / PAGE))
  const loc = out.error && out.pos !== undefined ? locate(s.sql, out.pos) : null
  const insert = (t: string) => set({ sql: s.sql.replace(/\s*$/, '') + (s.sql.trim() ? ' ' : '') + t })
  const size = useMemo(() => JSON.stringify(db).length, [db])

  return (
    <Split wide="right">
      <div>
        <Panel title="Tables" actions={<Btn kind="ghost" onClick={() => { resetDb(); setMsg('Sample tables restored.') }}>Reset samples</Btn>}>
          <FileDrop accept=".csv,.tsv,.txt,text/csv" multiple label="Drop CSV / TSV files → each becomes a table" onFiles={async (fs) => { for (const f of fs) addCsv(f.name, await f.text()) }} />
          {msg && <p className="muted" style={{ fontSize: 13 }}>{msg}</p>}
          {tables.map((t) => (
            <details key={t.name} style={{ borderTop: '1px solid var(--line)', padding: '6px 0' }}>
              <summary style={{ cursor: 'pointer' }}>
                <b>{t.name}</b> <span className="muted">· {t.rows.length} rows · {t.cols.length} cols</span>
              </summary>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '6px 0' }}>
                {t.cols.map((c) => (
                  <button key={c.name} type="button" className="k-btn ghost" style={{ padding: '2px 6px', fontSize: 12 }} onClick={() => insert(c.name)} title="Insert into query">
                    {c.name} <span className="muted">{c.type.toLowerCase()}</span>
                  </button>
                ))}
              </div>
              <Row>
                <Btn onClick={() => { const q = `SELECT * FROM ${t.name} LIMIT 50;`; set({ sql: q }); go(q) }}>Preview</Btn>
                <Btn onClick={() => download(`${t.name}.csv`, toCsv(csvOf({ columns: t.cols.map((c) => c.name), rows: t.rows })), 'text/csv')}>⬇ CSV</Btn>
                <Btn kind="danger" onClick={() => { const rest = { ...db.tables }; delete rest[t.name.toLowerCase()]; setDb({ tables: rest }) }}>Drop</Btn>
              </Row>
            </details>
          ))}
          {!tables.length && <Note tone="warn">No tables. Drop a CSV or reset the samples.</Note>}
          {size > 3_000_000 && <Note tone="warn">Data is {num(size / 1e6, 1)} MB, likely too big to be remembered after reload (browser storage limit). Queries still work now.</Note>}
          <details style={{ marginTop: 8 }}>
            <summary style={{ cursor: 'pointer' }}>Paste CSV instead</summary>
            <Txt label="Table name" value={pasteName} onChange={setPasteName} />
            <textarea className="k-area mono" rows={5} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'sku,qty\nA1,4\nB2,7'} />
            <Btn kind="primary" disabled={!paste.trim()} onClick={() => { addCsv(pasteName || 'pasted', paste); setPaste('') }}>Create table</Btn>
          </details>
        </Panel>
        <Panel title="History" actions={<Btn kind="ghost" onClick={() => set({ history: s.history.filter((h) => h.star) })}>Clear</Btn>}>
          {!s.history.length && <p className="muted">Queries you run are kept here (this browser only). ☆ pins one.</p>}
          <div style={{ maxHeight: 320, overflow: 'auto' }}>
            {s.history.map((h) => (
              <div key={h.sql} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', borderTop: '1px solid var(--line)', padding: '6px 0' }}>
                <button type="button" className="k-btn ghost" style={{ padding: '0 4px' }} title="Pin" onClick={() => set({ history: s.history.map((x) => (x.sql === h.sql ? { ...x, star: !x.star } : x)) })}>{h.star ? '★' : '☆'}</button>
                <button type="button" onClick={() => set({ sql: h.sql })} style={{ all: 'unset', cursor: 'pointer', flex: 1, minWidth: 0 }} title="Load into editor">
                  <code style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 12 }}>{h.sql.replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim()}</code>
                  <span className="muted" style={{ fontSize: 11 }}>{new Date(h.at).toLocaleString()} · {h.ok ? `${h.rows} rows · ${h.ms} ms` : 'error'}</span>
                </button>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div>
        <Panel title="Query" actions={<><Btn kind="primary" onClick={() => go()}>▶ Run</Btn><CopyButton text={s.sql} /></>}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            {EXAMPLES.map(([n, q]) => (
              <Btn key={n} kind="ghost" onClick={() => { set({ sql: q }); go(q) }}>{n}</Btn>
            ))}
          </div>
          <textarea
            className="k-area mono"
            rows={12}
            value={s.sql}
            spellCheck={false}
            aria-label="SQL"
            onChange={(e) => set({ sql: e.target.value })}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); go() }
              if (e.key === 'Tab') { e.preventDefault(); const t = e.currentTarget, a = t.selectionStart; set({ sql: s.sql.slice(0, a) + '  ' + s.sql.slice(t.selectionEnd) }); requestAnimationFrame(() => t.setSelectionRange(a + 2, a + 2)) }
            }}
          />
          <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>Ctrl/⌘ + Enter runs · several statements separated by “;” run in order, the last result is shown.</p>
          {out.error && (
            <Note tone="err">
              <b>{out.error}</b>
              {loc && (
                <pre style={{ margin: '6px 0 0', fontSize: 12, overflow: 'auto' }}>{`${loc.line} | ${loc.text}\n${' '.repeat(String(loc.line).length + 3 + loc.col - 1)}^`}</pre>
              )}
            </Note>
          )}
          {messages.length > 0 && <Note tone="ok">{messages.join(' · ')}</Note>}
        </Panel>

        {res && !out.error && (
          <>
            <Stats>
              <Stat label="Rows" value={num(res.rows.length, 0)} sub={filter ? `${view.length} match filter` : undefined} />
              <Stat label="Columns" value={res.columns.length} />
              <Stat label="Time" value={`${num(out.ms, 1)} ms`} sub={`${out.results.length} statement${out.results.length > 1 ? 's' : ''}`} />
            </Stats>
            <Panel
              title="Result"
              actions={
                <>
                  <Btn onClick={() => download('result.csv', toCsv(csvOf({ columns: res.columns, rows: view })), 'text/csv')}>⬇ CSV</Btn>
                  <Btn onClick={() => download('result.json', JSON.stringify(view.map((r) => Object.fromEntries(res.columns.map((c, i) => [c, r[i]]))), null, 2), 'application/json')}>⬇ JSON</Btn>
                  <CopyButton label="Markdown" text={() => toMarkdown(res.columns, view)} />
                </>
              }
            >
              <Row>
                <input className="k-text" style={{ flex: 1, minWidth: 160 }} placeholder="Filter shown rows…" value={filter} onChange={(e) => { setFilter(e.target.value); setPage(0) }} aria-label="Filter rows" />
                {pages > 1 && (
                  <span>
                    <Btn kind="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>‹</Btn> {page + 1} / {pages} <Btn kind="ghost" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>›</Btn>
                  </span>
                )}
              </Row>
              <div className="k-table-wrap" style={{ maxHeight: 460, overflow: 'auto' }}>
                <table className="k-table">
                  <thead>
                    <tr>
                      <th className="muted">#</th>
                      {res.columns.map((c, i) => (
                        <th key={i} style={{ cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => setSort(sort?.[0] === i ? (sort[1] === 1 ? [i, -1] : null) : [i, 1])} title="Sort (click again to reverse, third click clears)">
                          {c} {sort?.[0] === i ? (sort[1] === 1 ? '▲' : '▼') : ''}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {view.slice(page * PAGE, page * PAGE + PAGE).map((r, i) => (
                      <tr key={i}>
                        <td className="muted">{page * PAGE + i + 1}</td>
                        {r.map((v, j) => (
                          <td key={j} style={typeof v === 'number' ? { textAlign: 'right', fontVariantNumeric: 'tabular-nums' } : undefined}>{cell(v)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!view.length && <p className="muted">No rows.</p>}
              </div>
            </Panel>
          </>
        )}
        <Panel title="What this engine supports">
          <Note>
            A small SQL engine written in JavaScript that runs entirely in your browser: a <b>SQLite-like subset</b>, not real SQLite. No window functions, CTEs (WITH), UNION or indexes; “/” is always real division; values are numbers, text or NULL. Uploaded data never leaves your device.
          </Note>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13 }}>
            {SUPPORTED.map((x) => <li key={x}><code>{x}</code></li>)}
          </ul>
        </Panel>
      </div>
    </Split>
  )
}
