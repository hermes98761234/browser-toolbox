import { useState } from 'react'
import { Btn, CsvButton, download, FileDrop, JsonButtons, Note, num, Panel, Row, Split, Stat, Stats, Table, useToolState } from '../kit'
import { detectDelimiter, parseCsv } from './lib/csv-json-converter'
import { execute, sampleDb, tableFromCsv, type Db, type Result, type Value } from './lib/sql-query-playground'

interface State {
  sql: string
  db: Db
  history: string[]
}

const FIRST = `-- Revenue per customer (shipped and pending orders)
SELECT c.name, c.country,
       count(DISTINCT o.id) AS orders,
       round(sum(p.price * i.qty), 2) AS revenue
FROM customers c
JOIN orders o ON o.customer_id = c.id
JOIN order_items i ON i.order_id = o.id
JOIN products p ON p.id = i.product_id
WHERE o.status <> 'cancelled'
GROUP BY c.name, c.country
ORDER BY revenue DESC
LIMIT 10;`

const EXAMPLES: [string, string][] = [
  ['Top revenue', FIRST],
  ['By category', `SELECT category, count(*) AS products, round(avg(price), 2) AS avg_price, min(price), max(price)
FROM products GROUP BY category ORDER BY avg_price DESC;`],
  ['Monthly sales', `SELECT substr(o.order_date, 1, 7) AS month, count(DISTINCT o.id) AS orders, sum(i.qty) AS items
FROM orders o JOIN order_items i ON i.order_id = o.id
GROUP BY month ORDER BY month;`],
  ['No orders yet', `-- LEFT JOIN finds customers without orders
SELECT c.name, c.city, c.joined
FROM customers c LEFT JOIN orders o ON o.customer_id = c.id
WHERE o.id IS NULL;`],
  ['Subquery', `SELECT name, price FROM products
WHERE price > (SELECT avg(price) FROM products)
ORDER BY price DESC;`],
  ['CASE bands', `SELECT CASE WHEN price < 50 THEN 'budget' WHEN price < 250 THEN 'mid' ELSE 'premium' END AS band,
       count(*) AS n, group_concat(name, ', ') AS items
FROM products GROUP BY band ORDER BY n DESC;`],
  ['Modify data', `UPDATE products SET price = round(price * 0.9, 2) WHERE category = 'Furniture';
INSERT INTO products (name, category, price) VALUES ('Monitor arm', 'Furniture', 79);
SELECT * FROM products WHERE category = 'Furniture';`],
]

const DEF: State = { sql: FIRST, db: sampleDb(), history: [] }

type Run = { results: Result[]; error?: string; ms: number }

function run(db: Db, sql: string): Run & { db?: Db } {
  const t0 = performance.now()
  try {
    const r = execute(db, sql)
    return { results: r.results, db: r.db, ms: performance.now() - t0 }
  } catch (e) {
    return { results: [], error: (e as Error).message, ms: performance.now() - t0 }
  }
}

const cell = (v: Value) => (v === null ? <span className="muted">NULL</span> : typeof v === 'number' ? <span style={{ fontVariantNumeric: 'tabular-nums' }}>{num(v, 6)}</span> : v)
const safeName = (s: string) => (s.replace(/\.[^.]+$/, '').replace(/[^\w]+/g, '_').replace(/^(\d)/, 't_$1').toLowerCase() || 'data')

export default function SqlQueryPlayground() {
  const [s, set, reset] = useToolState('sql-query-playground', DEF)
  const [out, setOut] = useState<Run>(() => run(s.db, s.sql))
  const [open, setOpen] = useState<string | null>(null)

  const go = (sql = s.sql) => {
    const r = run(s.db, sql)
    setOut(r)
    set((st) => ({ ...st, sql, db: r.db ?? st.db, history: r.error ? st.history : [sql, ...st.history.filter((h) => h !== sql)].slice(0, 10) }))
  }
  const tables = Object.values(s.db.tables)
  const last = [...out.results].reverse().find((r) => !r.message)
  const totalRows = tables.reduce((a, t) => a + t.rows.length, 0)

  return (
    <Split wide="right">
      <div>
        <Panel title="Database" actions={<Btn kind="ghost" onClick={() => { reset(); setOut(run(DEF.db, DEF.sql)) }}>Reset sample</Btn>}>
          {tables.length === 0 && <Note>No tables. Import a CSV or run CREATE TABLE.</Note>}
          {tables.map((t) => (
            <div key={t.name} style={{ borderBottom: '1px solid var(--line)', padding: '6px 0' }}>
              <Row wrap={false}>
                <button type="button" className="k-btn ghost" style={{ flex: 1, justifyContent: 'flex-start', padding: '2px 4px' }} onClick={() => setOpen(open === t.name ? null : t.name)}>
                  {open === t.name ? '▾' : '▸'} <b>{t.name}</b> <span className="muted">· {t.rows.length} rows</span>
                </button>
                <Btn kind="ghost" title="Query this table" onClick={() => go(`SELECT * FROM ${/^\w+$/.test(t.name) ? t.name : `"${t.name}"`} LIMIT 100;`)}>▶</Btn>
              </Row>
              {open === t.name && (
                <ul style={{ margin: '4px 0 4px 18px', padding: 0, listStyle: 'none', fontSize: 13 }}>
                  {t.cols.map((c, j) => (
                    <li key={c.name}>
                      <code>{c.name}</code> <span className="muted">{c.type}{t.pk === j ? ' · PK' : ''}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          <p className="muted" style={{ fontSize: 13 }}>{tables.length} tables · {num(totalRows, 0)} rows</p>
          <FileDrop
            accept=".csv,.tsv,text/csv,text/plain"
            multiple
            label="Import CSV files as tables"
            onFiles={async (files) => {
              const db: Db = { tables: { ...s.db.tables } }
              const names: string[] = []
              for (const f of files) {
                const text = await f.text()
                const t = tableFromCsv(safeName(f.name), parseCsv(text, detectDelimiter(text)))
                db.tables[t.name.toLowerCase()] = t
                names.push(t.name)
              }
              const sql = `SELECT * FROM ${names[0]} LIMIT 100;`
              set({ db, sql })
              setOut(run(db, sql))
              setOpen(names[0])
            }}
          />
          <Row>
            <JsonButtons name="database.json" data={s.db} onLoad={(db) => db?.tables && set({ db })} />
          </Row>
        </Panel>
        <Panel title="Examples">
          <Row>
            {EXAMPLES.map(([label, sql]) => (
              <Btn key={label} kind="ghost" onClick={() => go(sql)}>{label}</Btn>
            ))}
          </Row>
        </Panel>
        {s.history.length > 0 && (
          <Panel title="History">
            {s.history.map((h, i) => (
              <button key={i} type="button" className="k-btn ghost" style={{ display: 'block', width: '100%', textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} onClick={() => set({ sql: h })} title={h}>
                {h.replace(/--[^\n]*\n/g, '').replace(/\s+/g, ' ').trim()}
              </button>
            ))}
          </Panel>
        )}
      </div>

      <div>
        <Panel
          title="Query"
          actions={
            <>
              <Btn kind="primary" onClick={() => go()}>▶ Run</Btn>
              <Btn onClick={() => download('query.sql', s.sql, 'application/sql')}>⬇ .sql</Btn>
            </>
          }
        >
          <textarea
            className="k-area mono"
            rows={13}
            value={s.sql}
            spellCheck={false}
            onChange={(e) => set({ sql: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                go()
              }
              if (e.key === 'Tab') {
                e.preventDefault()
                const el = e.currentTarget
                const p = el.selectionStart
                set({ sql: s.sql.slice(0, p) + '  ' + s.sql.slice(el.selectionEnd) })
                requestAnimationFrame(() => el.setSelectionRange(p + 2, p + 2))
              }
            }}
            aria-label="SQL query"
          />
          <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>
            Ctrl/⌘ + Enter runs all statements. Supports SELECT (JOIN, GROUP BY, HAVING, subqueries, CASE), CREATE/DROP TABLE, INSERT, UPDATE, DELETE.
          </p>
        </Panel>
        <Stats>
          <Stat label="Statements" value={out.results.length} />
          <Stat label="Rows returned" value={last ? num(last.rows.length, 0) : '—'} tone="accent" />
          <Stat label="Time" value={`${out.ms.toFixed(1)} ms`} />
        </Stats>
        {out.error && <Note tone="err">{out.error}</Note>}
        {out.results.filter((r) => r.message).map((r, i) => (
          <Note key={i} tone="ok">{r.message}</Note>
        ))}
        {last && (
          <Panel
            title="Results"
            actions={
              <>
                <CsvButton name="results.csv" rows={() => [last.columns, ...last.rows.map((r) => r.map((v) => v ?? ''))]} />
                <Btn onClick={() => download('results.json', JSON.stringify(last.rows.map((r) => Object.fromEntries(last.columns.map((c, i) => [c, r[i]]))), null, 2), 'application/json')}>⬇ JSON</Btn>
              </>
            }
          >
            {last.rows.length ? (
              <Table head={last.columns} rows={last.rows.map((r) => r.map(cell))} max={200} />
            ) : (
              <Note>The query returned no rows.</Note>
            )}
          </Panel>
        )}
      </div>
    </Split>
  )
}
