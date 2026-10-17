import { useMemo, useState } from 'react'
import { Area, Bar, BarChart, Btn, CsvButton, download, FileDrop, fmt, Note, Panel, pct, Ring, Row, Split, Stat, Stats, Table, useToolState } from '../kit'
import { profileDataset, type ColType, type Profile } from './lib/csv-profiler'
import { correlationMatrix, duplicateRows, issues, missingMap, numericColumns, parseAny, qualityScore, topPairs } from './lib/data-profiler'

// Deterministic sample: 300 web-shop orders with gaps, a typo'd number, a duplicate and an outlier.
function sample(json: boolean): string {
  let seed = 11
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)]
  const countries = ['US', 'US', 'US', 'DE', 'UK', 'FR', 'PL', 'UA', 'CA']
  const cats = ['Books', 'Electronics', 'Home', 'Toys', 'Garden']
  const recs: Record<string, unknown>[] = []
  for (let i = 1; i <= 300; i++) {
    const cat = pick(cats)
    const price = Math.round((cat === 'Electronics' ? 80 + rnd() * 400 : 8 + rnd() * 60) * 100) / 100
    const qty = 1 + Math.floor(rnd() ** 2 * 5)
    const disc = pick([0, 0, 0, 0.05, 0.1, 0.15])
    const d = new Date(Date.UTC(2025, 0, 1) + Math.floor(rnd() * 300) * 86400000).toISOString().slice(0, 10)
    recs.push({
      order_id: 10000 + i,
      date: d,
      customer: { country: pick(countries), age: rnd() < 0.12 ? null : Math.round(19 + rnd() * 50) },
      category: cat,
      quantity: i === 137 ? 250 : qty,
      unit_price: i === 58 ? '49.9O' : price,
      discount: disc,
      total: Math.round(qty * price * (1 - disc) * 100) / 100,
      rating: rnd() < 0.3 ? null : 1 + Math.floor(rnd() ** 0.5 * 5),
      gift_wrap: rnd() < 0.2,
      coupon: rnd() < 0.85 ? null : pick(['SPRING', 'VIP10', 'WELCOME']),
    })
  }
  recs.push({ ...recs[41] })
  if (json) return JSON.stringify(recs, null, 1)
  const head = ['order_id', 'date', 'country', 'age', 'category', 'quantity', 'unit_price', 'discount', 'total', 'rating', 'gift_wrap', 'coupon']
  const rows = recs.map((r) => {
    const c = r.customer as { country: string; age: number | null }
    return [r.order_id, r.date, c.country, c.age, r.category, r.quantity, r.unit_price, r.discount, r.total, r.rating, r.gift_wrap, r.coupon].map((v) => (v === null ? '' : String(v))).join(',')
  })
  return [head.join(','), ...rows].join('\n')
}

const TYPE_COLOR: Record<ColType, string> = { integer: '#0ea5e9', number: '#6366f1', boolean: '#10b981', date: '#f59e0b', text: '#a855f7', empty: '#64748b' }

function Spark({ p }: { p: Profile }) {
  const W = 92, H = 28
  const vals = p.hist?.map((h) => h.n) ?? p.top.slice(0, 8).map((t) => t[1])
  if (!vals.length) return <span className="muted">—</span>
  const mx = Math.max(...vals)
  const bw = W / vals.length
  return (
    <svg width={W} height={H} role="img" aria-label="distribution">
      {vals.map((v, i) => (
        <rect key={i} x={i * bw + 0.5} y={H - (v / mx) * H} width={Math.max(1, bw - 1)} height={(v / mx) * H} rx={1} fill={TYPE_COLOR[p.type]} opacity={p.hist ? 0.9 : 0.65}>
          <title>{p.hist ? `${fmt(p.hist[i].x0, 4)} – ${fmt(p.hist[i].x1, 4)}: ${v}` : `${p.top[i][0]}: ${v}`}</title>
        </rect>
      ))}
    </svg>
  )
}

const corrColor = (r: number) => (!Number.isFinite(r) ? 'transparent' : r >= 0 ? `rgba(99,102,241,${Math.abs(r)})` : `rgba(239,68,68,${Math.abs(r)})`)
const showVal = (p: Profile, v: number | undefined) => (v === undefined || !Number.isFinite(v) ? '—' : p.type === 'date' ? new Date(v).toISOString().slice(0, 10) : fmt(v, 4))

export default function DataProfiler() {
  const [s, set] = useToolState('data-profiler', { text: '' })
  const text = s.text || sample(false)
  const [pickd, setSel] = useState<number | null>(null)

  const r = useMemo(() => {
    const { ds, format } = parseAny(text)
    const prof = profileDataset(ds)
    const dups = duplicateRows(ds)
    const num = numericColumns(ds, prof)
    const corr = correlationMatrix(num)
    return { ds, format, prof, dups, num, corr, pairs: topPairs(num, corr), iss: issues(prof, ds.rows.length), score: qualityScore(prof, ds.rows.length, dups), mm: missingMap(ds, 48) }
  }, [text])
  const { ds, prof } = r
  const rows = ds.rows.length
  const cells = rows * prof.length
  const missing = prof.reduce((a, p) => a + p.missing, 0)
  // Default detail: the first numeric column that is not an ID-like running number.
  const sel = pickd ?? Math.max(0, prof.findIndex((p) => p.hist && p.type !== 'date' && p.unique < 0.9 * (p.count - p.missing)))
  const cur = prof[Math.min(sel, prof.length - 1)]

  const exportRows = () => [
    ['column', 'type', 'count', 'missing', 'missing_pct', 'distinct', 'min', 'max', 'mean', 'median', 'std', 'q1', 'q3', 'outliers', 'invalid', 'top_value'],
    ...prof.map((p) => [p.name, p.type, p.count, p.missing, +(p.missing / (p.count || 1) * 100).toFixed(2), p.unique, p.min ?? '', p.max ?? '', p.mean ?? '', p.median ?? '', p.std ?? '', p.q1 ?? '', p.q3 ?? '', p.outliers ?? '', p.invalid, p.top[0]?.[0] ?? '']),
  ]

  return (
    <Split wide="right">
      <div>
        <Panel title="Data" actions={<><Btn kind="ghost" onClick={() => set({ text: sample(false) })}>CSV sample</Btn><Btn kind="ghost" onClick={() => set({ text: sample(true) })}>JSON sample</Btn></>}>
          <FileDrop accept=".csv,.tsv,.txt,.json,.ndjson,.jsonl,text/csv,application/json" onFiles={async ([f]) => set({ text: await f.text() })} label="Drop CSV, TSV, JSON or NDJSON" />
          <div style={{ marginTop: 8 }}>
            <Area value={text.length > 60000 ? text.slice(0, 60000) : text} onChange={(t) => set({ text: t })} rows={8} mono />
          </div>
          <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>
            Detected <b>{r.format.toUpperCase()}</b>
            {r.format !== 'csv' && ' · nested objects flattened to dot.paths'} · types inferred per column (integer, number, boolean, date, text). Missing: empty, NA, null, None, NaN, “-”.
            {text.length > 60000 && ' Large file: editor shows the first 60 000 characters, the profile uses everything.'}
          </p>
        </Panel>
        <Panel title="Data quality">
          <Row wrap={false}>
            <Ring value={r.score / 100} label={`${r.score}`} color={r.score >= 90 ? 'var(--ok)' : r.score >= 70 ? 'var(--warn)' : 'var(--err)'} />
            <div style={{ fontSize: 13.5 }}>
              <div>Completeness <b>{pct(1 - missing / (cells || 1))}</b></div>
              <div>Duplicate rows <b>{r.dups}</b></div>
              <div>Type mismatches <b>{prof.reduce((a, p) => a + p.invalid, 0)}</b></div>
            </div>
          </Row>
          <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 13.5 }}>
            {r.iss.map((i, k) => (
              <li key={k} style={{ color: i.level === 'warn' ? 'var(--warn)' : undefined }}><b>{i.col}</b> {i.text}</li>
            ))}
            {r.dups > 0 && <li style={{ color: 'var(--warn)' }}>{r.dups} row(s) are exact duplicates</li>}
            {!r.iss.length && !r.dups && <li>No issues found 🎉</li>}
          </ul>
        </Panel>
        {r.pairs.length > 0 && (
          <Panel title="Strongest correlations">
            {r.pairs.map(([a, b, v]) => (
              <div key={a + b} style={{ marginBottom: 8, fontSize: 13.5 }}>
                <Row wrap={false}><span style={{ flex: 1 }}>{a} ↔ {b}</span><b style={{ color: v < 0 ? 'var(--err)' : 'var(--accent)' }}>{v.toFixed(2)}</b></Row>
                <Bar value={Math.abs(v)} color={v < 0 ? 'var(--err)' : 'var(--accent)'} />
              </div>
            ))}
          </Panel>
        )}
      </div>
      <div>
        <Stats>
          <Stat label="Rows" value={rows.toLocaleString('en-US')} />
          <Stat label="Columns" value={prof.length} sub={`${r.num.length} numeric`} />
          <Stat label="Missing cells" value={pct(missing / (cells || 1))} sub={`${missing.toLocaleString('en-US')} of ${cells.toLocaleString('en-US')}`} tone={missing ? 'bad' : 'good'} />
          <Stat label="Quality score" value={`${r.score} / 100`} tone="accent" />
        </Stats>
        <Panel
          title="Columns"
          actions={
            <>
              <CsvButton name="profile.csv" rows={exportRows} />
              <Btn onClick={() => download('profile.json', JSON.stringify({ rows, columns: prof, duplicates: r.dups, score: r.score, issues: r.iss }, null, 2), 'application/json')}>⬇ JSON</Btn>
            </>
          }
        >
          <Table
            head={['Column', 'Type', 'Missing', 'Distinct', 'Min', 'Max', 'Mean', 'Distribution']}
            rows={prof.map((p, i) => [
              <button key="n" type="button" className="k-btn ghost" style={{ padding: '2px 6px', fontWeight: i === sel ? 800 : 500, color: i === sel ? 'var(--accent)' : undefined }} onClick={() => setSel(i)}>{p.name}</button>,
              <span key="t" style={{ color: TYPE_COLOR[p.type], fontWeight: 700 }}>{p.type}</span>,
              <div key="m" style={{ minWidth: 64 }}><div>{pct(p.missing / (p.count || 1), 0)}</div><div><Bar value={p.missing} max={p.count || 1} color={p.missing ? 'var(--err)' : 'var(--ok)'} /></div></div>,
              p.unique,
              showVal(p, p.min),
              showVal(p, p.max),
              p.type === 'date' ? '—' : showVal(p, p.mean),
              <Spark key="s" p={p} />,
            ])}
          />
          <p className="muted" style={{ fontSize: 12.5 }}>Click a column name for details. Bars: histogram for numbers and dates, top values for text and booleans.</p>
        </Panel>
        {cur && (
          <Panel title={<>Column “{cur.name}” <span style={{ color: TYPE_COLOR[cur.type] }}>· {cur.type}</span></>}>
            <Stats>
              <Stat label="Present" value={(cur.count - cur.missing).toLocaleString('en-US')} sub={`${cur.missing} missing`} />
              <Stat label="Distinct" value={cur.unique} sub={pct(cur.unique / Math.max(1, cur.count - cur.missing)) + ' of present'} />
              {cur.mean !== undefined ? <Stat label="Median" value={showVal(cur, cur.median)} sub={cur.type === 'date' ? undefined : `σ ${fmt(cur.std ?? NaN, 4)}`} /> : <Stat label="Length" value={cur.minLen !== undefined ? `${cur.minLen}–${cur.maxLen}` : '—'} sub="characters" />}
              {cur.q1 !== undefined && <Stat label="IQR" value={`${showVal(cur, cur.q1)} – ${showVal(cur, cur.q3)}`} sub={cur.outliers ? `${cur.outliers} outliers` : undefined} />}
            </Stats>
            {cur.hist ? (
              <BarChart bars={cur.hist.map((h) => ({ label: cur.type === 'date' ? new Date(h.x0).toISOString().slice(0, 7) : fmt(h.x0, 3), value: h.n, color: TYPE_COLOR[cur.type] }))} height={220} />
            ) : (
              <div>
                {cur.top.map(([v, n]) => (
                  <div key={v} style={{ marginBottom: 6, fontSize: 13.5 }}>
                    <Row wrap={false}><span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v || '(blank)'}</span><b>{n}</b> <span className="muted">{pct(n / Math.max(1, cur.count - cur.missing), 0)}</span></Row>
                    <Bar value={n} max={cur.top[0][1]} color={TYPE_COLOR[cur.type]} />
                  </div>
                ))}
              </div>
            )}
          </Panel>
        )}
        {r.num.length > 1 && (
          <Panel title="Correlation matrix (Pearson r)">
            <div className="k-table-wrap">
              <table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    <th />
                    {r.num.map((c) => <th key={c.name} style={{ padding: 4, writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontWeight: 600 }}>{c.name}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {r.corr.map((row, i) => (
                    <tr key={i}>
                      <th style={{ textAlign: 'right', padding: '2px 6px', fontWeight: 600 }}>{r.num[i].name}</th>
                      {row.map((v, j) => (
                        <td key={j} title={`${r.num[i].name} × ${r.num[j].name}: ${Number.isFinite(v) ? v.toFixed(3) : 'n/a'}`} style={{ width: 44, height: 32, textAlign: 'center', background: corrColor(v), color: Math.abs(v) > 0.55 ? '#fff' : undefined, border: '1px solid var(--line)' }}>
                          {Number.isFinite(v) ? v.toFixed(2) : '–'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}
        <Panel title="Missing-value map">
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${prof.length}, minmax(10px, 1fr))`, gap: 1 }}>
            {prof.map((p) => <div key={p.name} title={p.name} style={{ fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }} className="muted">{p.name}</div>)}
            {r.mm.flatMap((band, b) => band.map((v, c) => <div key={`${b}-${c}`} title={`${prof[c].name}: ${pct(v, 0)} missing in rows ${Math.floor((b * rows) / r.mm.length) + 1}–${Math.floor(((b + 1) * rows) / r.mm.length)}`} style={{ height: 5, background: v ? `rgba(239,68,68,${0.25 + 0.75 * v})` : 'var(--line)' }} />))}
          </div>
          <p className="muted" style={{ fontSize: 12.5 }}>Rows run top to bottom in {r.mm.length} bands; red = missing. Patterns show whether gaps cluster in time or appear together.</p>
        </Panel>
        {rows === 0 && <Note tone="warn">No rows found. Paste CSV with a header row, a JSON array of objects or one JSON object per line.</Note>}
      </div>
    </Split>
  )
}
