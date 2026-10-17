import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Area, Btn, Check, CopyButton, download, FileDrop, Note, num, Panel, Row, Select, Split, Stat, Stats, toCsv, Txt, useToolState } from '../kit'
import { detectDelimiter, inferType, isMissing, parseCsv, toNumber, type ColType } from './lib/csv-profiler'
import { colWidth, makeFilter, sortRows } from './lib/csv-viewer'

interface Opts {
  delim: 'auto' | ',' | ';' | '\t' | '|'
  header: boolean
}
interface Data {
  name: string
  bytes: number
  text: string
}

const DEF: Opts = { delim: 'auto', header: true }
const ROW_H = 30
const VIEW_H = 480
const NUM_W = 56

function sampleCsv(): string {
  let seed = 42
  const rnd = () => {
    // mulberry32: small, fast, good enough for sample data
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)]
  const products: [string, string, number][] = [
    ['Wireless mouse', 'Accessories', 24.99], ['Mechanical keyboard', 'Accessories', 89], ['27" monitor', 'Displays', 249], ['USB-C hub', 'Accessories', 39.5],
    ['Laptop stand', 'Office', 45], ['Noise-cancelling headphones', 'Audio', 199], ['Webcam 1080p', 'Video', 59.9], ['Desk lamp', 'Office', 32], ['Portable SSD 1TB', 'Storage', 109], ['Bluetooth speaker', 'Audio', 74],
  ]
  const names = ['Olivia', 'Liam', 'Emma', 'Noah', 'Ava', 'Mateo', 'Sofia', 'Lucas', 'Mia', 'Ethan', 'Zoe', 'Ivan', 'Anna', 'Yuki', 'Omar', 'Lea']
  const last = ['Smith', 'Kowalski', 'Müller', 'Rossi', 'García', 'Novak', 'Dubois', 'Tanaka', 'Silva', 'Brown', 'Shevchenko']
  const countries = ['USA', 'Germany', 'Poland', 'France', 'Italy', 'Spain', 'Ukraine', 'Japan', 'Brazil', 'Canada', 'UK']
  const status = ['Delivered', 'Delivered', 'Delivered', 'Shipped', 'Processing', 'Returned', 'Cancelled']
  const rows = [['order_id', 'date', 'customer', 'country', 'product', 'category', 'qty', 'unit_price', 'total', 'status', 'rating']]
  const start = Date.UTC(2025, 0, 1)
  for (let i = 0; i < 5000; i++) {
    const [p, c, price] = pick(products)
    const qty = 1 + Math.floor(rnd() ** 2 * 6)
    const st = pick(status)
    const date = new Date(start + Math.floor(rnd() * 365) * 864e5).toISOString().slice(0, 10)
    const rating = st === 'Delivered' && rnd() > 0.3 ? String(Math.min(5, 1 + Math.floor(rnd() * 5.6))) : ''
    rows.push([`SO-${String(10001 + i)}`, date, `${pick(names)} ${pick(last)}`, pick(countries), p, c, String(qty), price.toFixed(2), (qty * price).toFixed(2), st, rating])
  }
  return toCsv(rows)
}

/** Parses big files in a throwaway worker built from the (self-contained) parser source. */
function parseOffThread(text: string, delim: string): Promise<string[][]> {
  if (text.length < 1_000_000 || typeof Worker === 'undefined') return Promise.resolve(parseCsv(text, delim))
  return new Promise((resolve) => {
    let w: Worker
    try {
      const src = `const parse = ${parseCsv.toString()};\nonmessage = (e) => postMessage(parse(e.data[0], e.data[1]))`
      w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })))
    } catch {
      return resolve(parseCsv(text, delim))
    }
    w.onmessage = (e) => {
      resolve(e.data as string[][])
      w.terminate()
    }
    w.onerror = () => {
      w.terminate()
      resolve(parseCsv(text, delim))
    }
    w.postMessage([text, delim])
  })
}

const TYPE_ICON: Record<ColType, string> = { integer: '#', number: '#', boolean: '◐', date: '📅', text: 'Aa', empty: '∅' }

export default function CsvViewer() {
  const [o, set] = useToolState('csv-viewer', DEF)
  const [data, setData] = useState<Data | null>(() => {
    const t = sampleCsv()
    return { name: 'sample-orders.csv', bytes: t.length, text: t }
  })
  const [parsed, setParsed] = useState<{ src: Data | null; delim: string; grid: string[][] }>({ src: null, delim: '', grid: [] })
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Record<number, string>>({})
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null)
  const [top, setTop] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [statCol, setStatCol] = useState(0)
  const [paste, setPaste] = useState<string | null>(null)

  const delim = data ? (o.delim === 'auto' ? detectDelimiter(data.text) : o.delim) : ','
  useEffect(() => {
    if (!data) return
    let live = true
    void parseOffThread(data.text, delim).then((g) => {
      if (!live) return
      setParsed({ src: data, delim, grid: g })
      setFilters({})
      setSort(null)
      setPicked(null)
      setTop(0)
    })
    return () => {
      live = false
    }
  }, [data, delim])
  const grid = parsed.grid
  const parsing = !!data && (parsed.src !== data || parsed.delim !== delim)

  const width = grid.reduce((a, r) => Math.max(a, r.length), 0)
  const head = useMemo(() => Array.from({ length: width }, (_, i) => (o.header ? grid[0]?.[i] || `Column ${i + 1}` : `Column ${i + 1}`)), [grid, width, o.header])
  const rows = useMemo(() => (o.header ? grid.slice(1) : grid), [grid, o.header])
  const types = useMemo(() => head.map((_, c) => inferType(rows.slice(0, 2000).map((r) => r[c] ?? ''))), [head, rows])
  const widths = useMemo(() => head.map((h, c) => colWidth(h, rows.slice(0, 300).map((r) => r[c] ?? ''))), [head, rows])

  const view = useMemo(() => {
    const active = Object.entries(filters).filter(([, v]) => v.trim()).map(([c, v]) => [Number(c), makeFilter(v)] as const)
    const q = search.trim().toLowerCase()
    const idx: number[] = []
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      if (active.some(([c, f]) => !f(r[c] ?? ''))) continue
      if (q && !r.some((v) => v.toLowerCase().includes(q))) continue
      idx.push(i)
    }
    return sort ? sortRows(rows, idx, sort.col, types[sort.col], sort.dir) : idx
  }, [rows, filters, search, sort, types])

  const stats = useMemo(() => {
    const c = Math.min(statCol, Math.max(0, width - 1))
    const vals = view.map((i) => rows[i][c] ?? '')
    const present = vals.filter((v) => !isMissing(v))
    const nums = present.map(toNumber).filter(Number.isFinite)
    const freq = new Map<string, number>()
    for (const v of present) freq.set(v, (freq.get(v) ?? 0) + 1)
    const topV = [...freq].sort((a, b) => b[1] - a[1]).slice(0, 6)
    const sum = nums.reduce((a, b) => a + b, 0)
    return { c, total: vals.length, present: present.length, unique: freq.size, nums, sum, min: Math.min(...nums), max: Math.max(...nums), topV }
  }, [view, rows, statCol, width])

  const open = async (f: File) => setData({ name: f.name, bytes: f.size, text: await f.text() })
  const totalW = NUM_W + widths.reduce((a, b) => a + b, 0)
  const first = Math.max(0, Math.floor(top / ROW_H) - 8)
  const last = Math.min(view.length, Math.ceil((top + VIEW_H) / ROW_H) + 8)
  const isNum = (c: number) => types[c] === 'integer' || types[c] === 'number'
  const cell = (w: number, extra: CSSProperties = {}): CSSProperties => ({ width: w, minWidth: w, padding: '0 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderRight: '1px solid var(--line)', ...extra })
  const exportRows = () => [head, ...view.map((i) => head.map((_, c) => rows[i][c] ?? ''))]
  const rec = picked !== null ? rows[picked] : null

  return (
    <div>
      <Panel title="Open CSV" actions={<Btn kind="ghost" onClick={() => setPaste(paste === null ? '' : null)}>{paste === null ? '📋 Paste text' : 'Cancel paste'}</Btn>}>
        {paste !== null ? (
          <>
            <Area value={paste} onChange={setPaste} rows={6} mono placeholder="Paste CSV / TSV here" />
            <Btn kind="primary" disabled={!paste.trim()} onClick={() => (setData({ name: 'pasted.csv', bytes: paste.length, text: paste }), setPaste(null))}>Load pasted text</Btn>
          </>
        ) : (
          <Row>
            <div style={{ flex: '2 1 280px' }}>
              <FileDrop accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" onFiles={(f) => void open(f[0])} label="Drop a CSV / TSV file (large files are fine) or click to choose" />
            </div>
            <div style={{ flex: '1 1 200px' }}>
              <Select label="Delimiter" value={o.delim} onChange={(d) => set({ delim: d })} options={[['auto', `Auto-detect (${delim === '\t' ? 'tab' : delim})`], [',', 'Comma ,'], [';', 'Semicolon ;'], ['\t', 'Tab'], ['|', 'Pipe |']]} />
              <Check label="First row is a header" value={o.header} onChange={(header) => set({ header })} />
              <Btn kind="ghost" onClick={() => { const t = sampleCsv(); setData({ name: 'sample-orders.csv', bytes: t.length, text: t }) }}>Load sample (5,000 orders)</Btn>
            </div>
          </Row>
        )}
      </Panel>

      <div style={{ marginTop: 14 }}>
        <Stats>
          <Stat label="File" value={<span style={{ fontSize: 16 }}>{data?.name ?? '—'}</span>} sub={data ? `${num(data.bytes / 1024, 1)} KB` : ''} />
          <Stat label="Rows" value={num(rows.length, 0)} sub={`${width} columns`} />
          <Stat label="Showing" value={num(view.length, 0)} tone="accent" sub={view.length < rows.length ? 'after filters' : 'all rows'} />
        </Stats>
      </div>

      <Panel
        title={parsing ? 'Parsing…' : 'Data'}
        actions={
          <>
            <div style={{ minWidth: 200 }}>
              <Txt label="" value={search} onChange={setSearch} placeholder="🔍 Search all columns" />
            </div>
            <Btn onClick={() => download((data?.name ?? 'data').replace(/\.\w+$/, '') + '-filtered.csv', toCsv(exportRows()), 'text/csv')}>⬇ CSV (filtered)</Btn>
            <Btn kind="ghost" onClick={() => (setFilters({}), setSearch(''), setSort(null))}>Clear filters</Btn>
          </>
        }
      >
        <div onScroll={(e) => setTop(e.currentTarget.scrollTop)} style={{ height: VIEW_H + 64, overflow: 'auto', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--panel)', fontSize: 13 }}>
          <div style={{ width: totalW, position: 'sticky', top: 0, zIndex: 2, background: 'var(--panel2)', borderBottom: '2px solid var(--line)' }}>
            <div style={{ display: 'flex', height: 32, alignItems: 'center', fontWeight: 700 }}>
              <div style={cell(NUM_W, { color: 'var(--muted)' })}>#</div>
              {head.map((h, c) => (
                <div
                  key={c}
                  onClick={() => (setSort(sort?.col === c ? (sort.dir === 1 ? { col: c, dir: -1 } : null) : { col: c, dir: 1 }), setStatCol(c))}
                  title={`${h} · ${types[c]} · click to sort`}
                  style={cell(widths[c], { cursor: 'pointer', textAlign: isNum(c) ? 'right' : 'left', userSelect: 'none' })}
                >
                  <span className="muted" style={{ fontSize: 11, marginRight: 4 }}>{TYPE_ICON[types[c]]}</span>
                  {h}
                  {sort?.col === c && (sort.dir === 1 ? ' ▲' : ' ▼')}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', height: 30, alignItems: 'center' }}>
              <div style={cell(NUM_W)} />
              {head.map((_, c) => (
                <div key={c} style={cell(widths[c], { padding: '0 3px' })}>
                  <input
                    value={filters[c] ?? ''}
                    onChange={(e) => setFilters({ ...filters, [c]: e.target.value })}
                    placeholder={isNum(c) ? '>10, 5..9' : 'filter'}
                    aria-label={`Filter ${head[c]}`}
                    style={{ width: '100%', height: 24, fontSize: 12, padding: '0 6px', borderRadius: 5, border: '1px solid var(--line)', background: 'var(--panel)', color: 'inherit', boxSizing: 'border-box' }}
                  />
                </div>
              ))}
            </div>
          </div>
          <div style={{ position: 'relative', width: totalW, height: Math.max(view.length * ROW_H, 40) }}>
            {!view.length && !parsing && <div className="muted" style={{ padding: 12 }}>No rows match.</div>}
            {view.slice(first, last).map((ri, k) => {
              const r = rows[ri]
              const n = first + k
              return (
                <div
                  key={ri}
                  onClick={() => setPicked(ri)}
                  style={{ position: 'absolute', top: n * ROW_H, height: ROW_H, display: 'flex', alignItems: 'center', cursor: 'pointer', borderBottom: '1px solid var(--line)', background: picked === ri ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : n % 2 ? 'color-mix(in srgb, var(--line) 35%, transparent)' : undefined }}
                >
                  <div style={cell(NUM_W, { color: 'var(--muted)', fontSize: 11 })}>{ri + 1}</div>
                  {head.map((_, c) => (
                    <div key={c} title={r[c]} style={cell(widths[c], { textAlign: isNum(c) ? 'right' : 'left', fontVariantNumeric: 'tabular-nums' })}>{r[c] ?? ''}</div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
        <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
          Click a header to sort (asc → desc → off). Filters: <code>text</code> contains · <code>=x</code> exact · <code>!x</code> excludes · <code>&gt;100</code> · <code>10..20</code> · <code>2025-03-01..2025-03-31</code> · <code>empty</code> / <code>!empty</code>.
        </p>
      </Panel>

      <div style={{ marginTop: 14 }}>
        <Split>
          <Panel title={`Column summary · ${head[stats.c] ?? ''}`}>
            {width > 0 && <Select label="Column" value={stats.c} onChange={setStatCol} options={head.map((h, i) => [i, h] as const)} />}
            <Row>
              <Stat label="Type" value={types[stats.c] ?? '—'} />
              <Stat label="Filled" value={`${num(stats.present, 0)} / ${num(stats.total, 0)}`} />
              <Stat label="Unique" value={num(stats.unique, 0)} />
            </Row>
            {stats.nums.length > 0 && isNum(stats.c) && (
              <Row>
                <Stat label="Sum" value={num(stats.sum, 2)} />
                <Stat label="Mean" value={num(stats.sum / stats.nums.length, 2)} />
                <Stat label="Min" value={num(stats.min, 2)} />
                <Stat label="Max" value={num(stats.max, 2)} />
              </Row>
            )}
            <div style={{ marginTop: 8 }}>
              {stats.topV.map(([v, n]) => (
                <div key={v} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, margin: '3px 0' }}>
                  <span style={{ flex: '0 0 40%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }} title="Filter by this value" onClick={() => setFilters({ ...filters, [stats.c]: '=' + v })}>{v}</span>
                  <span style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--line)' }}>
                    <span style={{ display: 'block', height: '100%', width: `${(n / (stats.topV[0]?.[1] || 1)) * 100}%`, background: 'var(--accent)', borderRadius: 4 }} />
                  </span>
                  <b style={{ minWidth: 44, textAlign: 'right' }}>{num(n, 0)}</b>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Row details" actions={rec && <CopyButton label="Copy JSON" text={() => JSON.stringify(Object.fromEntries(head.map((h, c) => [h, rec[c] ?? ''])), null, 2)} />}>
            {!rec ? (
              <Note>
                <div style={{ gridColumn: '1 / -1' }}>Click any row in the grid to see all of its fields here.</div>
              </Note>
            ) : (
              <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, auto) 1fr', gap: '4px 12px', margin: 0, fontSize: 14 }}>
                <dt className="muted">Row</dt>
                <dd style={{ margin: 0 }}>{(picked ?? 0) + 1}</dd>
                {head.map((h, c) => (
                  <div key={c} style={{ display: 'contents' }}>
                    <dt className="muted" style={{ overflowWrap: 'anywhere' }}>{h}</dt>
                    <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{rec[c] || <span className="muted">—</span>}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Panel>
        </Split>
      </div>
    </div>
  )
}
