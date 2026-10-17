import { useMemo, useState, type DragEvent, type ReactNode } from 'react'
import { Area, BarChart, Btn, Check, CopyButton, FileDrop, Note, Panel, Row, Seg, Select, Split, Stat, Stats, color, download, num, pct, toCsv, useToolState } from '../kit'
import { detectDelimiter, parseCsv } from './lib/csv-json-converter'
import { AGGS, distinct, isNumericField, pivot, showAs, toGrid, type Agg, type Rec, type ShowAs } from './lib/pivot-table-tool'

type Zone = 'rows' | 'cols' | 'filters'
interface State { csv: string; rows: string[]; cols: string[]; filters: string[]; val: string; agg: Agg; show: ShowAs; view: 'table' | 'heat' | 'bar'; sort: 'key' | 'keyDesc' | 'totalDesc' | 'totalAsc'; totals: boolean; exclude: Record<string, string[]> }

function sample(): string {
  const regions = ['North', 'South', 'East', 'West'], reps = ['Ava', 'Ben', 'Chloe', 'Dmytro', 'Elena', 'Femi', 'Grace', 'Hugo']
  const prods: [string, string, number][] = [['Laptop', 'Hardware', 1150], ['Monitor', 'Hardware', 240], ['Keyboard', 'Accessories', 65], ['Mouse', 'Accessories', 29], ['Headset', 'Accessories', 89], ['Support plan', 'Services', 300], ['Setup', 'Services', 120]]
  const ch = ['Online', 'Retail', 'Partner']
  let r = 11
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647)
  const out = [['Date', 'Quarter', 'Region', 'Rep', 'Channel', 'Category', 'Product', 'Units', 'Unit price', 'Revenue']]
  for (let i = 0; i < 260; i++) {
    const m = 1 + Math.floor(rnd() * 12), d = 1 + Math.floor(rnd() * 28)
    const reg = Math.floor(rnd() * 4)
    const [p, cat, price] = prods[Math.floor(rnd() ** 1.3 * prods.length)]
    const units = 1 + Math.floor(rnd() * (cat === 'Services' ? 4 : 12))
    const pr = Math.round(price * (0.9 + rnd() * 0.2))
    out.push([`2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, `Q${Math.ceil(m / 3)}`, regions[reg], reps[reg * 2 + (rnd() < 0.5 ? 0 : 1)], ch[Math.floor(rnd() * rnd() * 3)], cat, p, String(units), String(pr), String(units * pr)])
  }
  return toCsv(out)
}

const DEF: State = { csv: '', rows: ['Region', 'Rep'], cols: ['Quarter'], filters: ['Channel'], val: 'Revenue', agg: 'sum', show: 'value', view: 'heat', sort: 'key', totals: true, exclude: {} }

function Chip({ name, onDrag, children, tone }: { name: string; onDrag: (e: DragEvent) => void; children?: ReactNode; tone?: string }) {
  return (
    <span draggable onDragStart={onDrag} title="Drag to a zone"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 999, border: '1px solid var(--line)', background: tone ?? 'var(--panel)', fontSize: 13, cursor: 'grab', userSelect: 'none' }}>
      {name}
      {children}
    </span>
  )
}
const mini: React.CSSProperties = { border: 0, background: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '0 2px', fontSize: 12 }

export default function PivotTableTool() {
  const [s, set, reset] = useToolState('pivot-table-tool', DEF)
  const [openFilter, setOpenFilter] = useState('')
  const [over, setOver] = useState('')
  const csv = s.csv || sample()
  const { data, fields, err } = useMemo(() => {
    const t = parseCsv(csv, detectDelimiter(csv))
    if (t.length < 2) return { data: [] as Rec[], fields: [] as string[], err: 'Need a header row and at least one data row.' }
    const head = t[0].map((h, i) => h.trim() || `Column ${i + 1}`)
    return { data: t.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? '']))), fields: head, err: '' }
  }, [csv])
  const valid = (xs: string[]) => xs.filter((f) => fields.includes(f))
  const cfg = { rows: valid(s.rows), cols: valid(s.cols), val: fields.includes(s.val) ? s.val : '', agg: s.agg, exclude: s.exclude }
  const { rows: sr, cols: sc, val: sv, agg: sa, exclude: se } = s
  const p = useMemo(() => pivot(data, { rows: sr.filter((f) => fields.includes(f)), cols: sc.filter((f) => fields.includes(f)), val: fields.includes(sv) ? sv : '', agg: sa, exclude: se }), [data, fields, sr, sc, sv, sa, se])
  const used = new Set([...cfg.rows, ...cfg.cols, ...valid(s.filters), cfg.val])
  const numeric = useMemo(() => new Set(fields.filter((f) => isNumericField(data, f))), [data, fields])

  const place = (f: string, z: Zone | 'val') => {
    const strip = (xs: string[]) => xs.filter((x) => x !== f)
    if (z === 'val') return set({ val: f, agg: numeric.has(f) ? (s.agg === 'count' || s.agg === 'countUnique' ? 'sum' : s.agg) : 'countUnique' })
    set({ rows: z === 'rows' ? [...strip(s.rows), f] : strip(s.rows), cols: z === 'cols' ? [...strip(s.cols), f] : strip(s.cols), filters: z === 'filters' ? [...strip(s.filters), f] : strip(s.filters) })
  }
  const unplace = (f: string) => set({ rows: s.rows.filter((x) => x !== f), cols: s.cols.filter((x) => x !== f), filters: s.filters.filter((x) => x !== f), exclude: { ...s.exclude, [f]: [] }, val: s.val === f ? '' : s.val })
  const shift = (z: Zone, f: string, d: number) => {
    const xs = [...s[z]], i = xs.indexOf(f), j = i + d
    if (j < 0 || j >= xs.length) return
    ;[xs[i], xs[j]] = [xs[j], xs[i]]
    set({ [z]: xs } as Partial<State>)
  }
  const drag = (f: string) => (e: DragEvent) => e.dataTransfer.setData('text/plain', f)
  const drop = (z: Zone | 'val' | 'pool') => ({
    onDragOver: (e: DragEvent) => { e.preventDefault(); setOver(z) },
    onDragLeave: () => setOver(''),
    onDrop: (e: DragEvent) => {
      e.preventDefault()
      setOver('')
      const f = e.dataTransfer.getData('text/plain')
      if (!fields.includes(f)) return
      if (z === 'pool') unplace(f)
      else place(f, z)
    },
  })

  // sorting
  const rowKeys = [...p.rowKeys]
  const tot = (r: string[]) => { const v = p.rowTotal(r); return typeof v === 'number' && Number.isFinite(v) ? v : -Infinity }
  if (s.sort === 'keyDesc') rowKeys.reverse()
  if (s.sort === 'totalDesc') rowKeys.sort((a, b) => tot(b) - tot(a))
  if (s.sort === 'totalAsc') rowKeys.sort((a, b) => tot(a) - tot(b))

  const isPct = s.show !== 'value'
  const fv = (v: number | string) => (typeof v === 'string' ? v : !Number.isFinite(v) ? '' : isPct ? pct(v, 1) : num(v, s.agg === 'avg' || s.agg === 'median' ? 2 : 2))
  const shown = (r: string[], c: string[]) => showAs(p.cell(r, c), s.show, p.rowTotal(r), p.colTotal(c), p.grand)
  let maxCell = 0
  for (const r of rowKeys) for (const c of p.colKeys) { const v = shown(r, c); if (typeof v === 'number' && Number.isFinite(v)) maxCell = Math.max(maxCell, Math.abs(v)) }
  const heat = (v: number | string) => (s.view === 'heat' && typeof v === 'number' && Number.isFinite(v) && maxCell ? `color-mix(in srgb, var(--accent) ${Math.round((Math.abs(v) / maxCell) * 70)}%, transparent)` : undefined)
  const label = (k: string[]) => k.join(' · ') || 'All'
  const grid = () => toGrid({ ...p, rowKeys }, cfg, s.show)
  const zoneBox = (z: string): React.CSSProperties => ({ minHeight: 40, padding: 8, borderRadius: 8, border: `2px dashed ${over === z ? 'var(--accent)' : 'var(--line)'}`, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' })
  const zoneChips = (z: Zone) => valid(s[z]).map((f) => (
    <Chip key={f} name={f} onDrag={drag(f)} tone={z === 'filters' && s.exclude[f]?.length ? 'color-mix(in srgb, var(--warn, #f59e0b) 20%, transparent)' : undefined}>
      {z === 'filters' && <button type="button" style={mini} onClick={() => setOpenFilter(openFilter === f ? '' : f)} title="Choose values">▾</button>}
      {z !== 'filters' && <button type="button" style={mini} onClick={() => shift(z, f, -1)} title="Move left">‹</button>}
      {z !== 'filters' && <button type="button" style={mini} onClick={() => shift(z, f, 1)} title="Move right">›</button>}
      <button type="button" style={mini} onClick={() => unplace(f)} title="Remove">✕</button>
    </Chip>
  ))

  return (
    <Split wide="right">
      <div>
        <Panel title="Data" actions={<><Btn onClick={() => set({ ...DEF, csv: '' })}>Sample sales</Btn><Btn kind="ghost" onClick={reset}>Reset</Btn></>}>
          <FileDrop accept=".csv,.tsv,.txt,text/csv" onFiles={async (f) => set({ csv: await f[0].text(), rows: [], cols: [], filters: [], val: '', exclude: {} })} label="Drop a CSV / TSV file" />
          <Area value={csv} onChange={(v) => set({ csv: v })} rows={5} mono />
          {err ? <Note tone="err">{err}</Note> : <p className="muted" style={{ fontSize: 13, margin: 0 }}>{num(data.length, 0)} rows · {fields.length} fields · delimiter “{detectDelimiter(csv).replace('\t', 'tab')}”</p>}
        </Panel>
        <Panel title="Fields">
          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Drag fields into the zones, or use the quick buttons: R = rows, C = columns, V = value, F = filter.</p>
          <div {...drop('pool')} style={zoneBox('pool')}>
            {fields.filter((f) => !used.has(f)).map((f) => (
              <Chip key={f} name={(numeric.has(f) ? '# ' : 'Aa ') + f} onDrag={drag(f)}>
                {(['rows', 'cols', 'val', 'filters'] as const).map((z) => <button key={z} type="button" style={mini} onClick={() => place(f, z)}>{z === 'val' ? 'V' : z[0].toUpperCase()}</button>)}
              </Chip>
            ))}
            {fields.every((f) => used.has(f)) && <span className="muted">All fields in use</span>}
          </div>
          <h4 style={{ margin: '12px 0 6px' }}>Filters</h4>
          <div {...drop('filters')} style={zoneBox('filters')}>{zoneChips('filters')}</div>
          {openFilter && valid(s.filters).includes(openFilter) && (() => {
            const vals = distinct(data, openFilter), ex = new Set(s.exclude[openFilter] ?? [])
            return (
              <div style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 8, marginTop: 6, maxHeight: 220, overflow: 'auto' }}>
                <Row>
                  <b>{openFilter}</b>
                  <Btn kind="ghost" onClick={() => set({ exclude: { ...s.exclude, [openFilter]: [] } })}>All</Btn>
                  <Btn kind="ghost" onClick={() => set({ exclude: { ...s.exclude, [openFilter]: vals.map((v) => v[0]) } })}>None</Btn>
                </Row>
                {vals.slice(0, 300).map(([v, n]) => (
                  <Check key={v} label={<>{v || '(blank)'} <span className="muted">({n})</span></>} value={!ex.has(v)}
                    onChange={(on) => set({ exclude: { ...s.exclude, [openFilter]: on ? [...ex].filter((x) => x !== v) : [...ex, v] } })} />
                ))}
              </div>
            )
          })()}
          <h4 style={{ margin: '12px 0 6px' }}>Columns</h4>
          <div {...drop('cols')} style={zoneBox('cols')}>{zoneChips('cols')}</div>
          <h4 style={{ margin: '12px 0 6px' }}>Rows</h4>
          <div {...drop('rows')} style={zoneBox('rows')}>{zoneChips('rows')}</div>
          <h4 style={{ margin: '12px 0 6px' }}>Value</h4>
          <div {...drop('val')} style={zoneBox('val')}>
            {cfg.val ? <Chip name={cfg.val} onDrag={drag(cfg.val)}><button type="button" style={mini} onClick={() => set({ val: '' })}>✕</button></Chip> : <span className="muted">Drop a field (empty = count rows)</span>}
          </div>
          <Row>
            <Select label="Aggregate" value={s.agg} onChange={(agg) => set({ agg })} options={AGGS} />
            <Select label="Sort rows" value={s.sort} onChange={(sort) => set({ sort })} options={[['key', 'Label A→Z'], ['keyDesc', 'Label Z→A'], ['totalDesc', 'Total, largest first'], ['totalAsc', 'Total, smallest first']]} />
          </Row>
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Rows used" value={num(p.count, 0)} sub={p.count < data.length ? `${data.length - p.count} filtered out` : 'no filters active'} />
          <Stat label="Groups" value={`${rowKeys.length} × ${p.colKeys.length}`} />
          <Stat label={`${AGGS.find((a) => a[0] === s.agg)?.[1]} of ${cfg.val || 'rows'}`} value={typeof p.grand === 'number' ? num(p.grand, 2) : p.grand} tone="accent" />
        </Stats>
        <Panel title="Pivot" actions={
          <>
            <CopyButton label="Copy for Excel" text={() => grid().map((r) => r.join('\t')).join('\n')} />
            <Btn onClick={() => download('pivot.csv', toCsv(grid()), 'text/csv')}>⬇ CSV</Btn>
          </>
        }>
          <Row>
            <Seg value={s.view} onChange={(view) => set({ view })} options={[['table', 'Table'], ['heat', 'Heatmap'], ['bar', 'Bar chart']]} />
            <Seg value={s.show} onChange={(show) => set({ show })} options={[['value', 'Values'], ['pctTotal', '% of total'], ['pctRow', '% of row'], ['pctCol', '% of column']]} />
            <Check label="Totals" value={s.totals} onChange={(totals) => set({ totals })} />
          </Row>
          {s.view === 'bar' ? (
            <BarChart height={340} fy={(v) => (isPct ? pct(v, 0) : num(v, 0))}
              bars={rowKeys.slice(0, 40).map((r) => ({ label: label(r), value: p.colKeys.length > 1 ? p.colKeys.slice(0, 12).map((c) => { const v = shown(r, c); return typeof v === 'number' && Number.isFinite(v) ? v : 0 }) : (() => { const v = showAs(p.rowTotal(r), s.show, p.rowTotal(r), p.grand, p.grand); return typeof v === 'number' && Number.isFinite(v) ? v : 0 })() }))}
              stacks={p.colKeys.length > 1 ? p.colKeys.slice(0, 12).map((c, i) => ({ name: label(c), color: color(i) })) : undefined} />
          ) : (
            <div className="k-table-wrap" style={{ maxHeight: 560, overflow: 'auto' }}>
              <table className="k-table">
                <thead>
                  <tr>
                    {(cfg.rows.length ? cfg.rows : ['']).map((f) => <th key={f}>{f}</th>)}
                    {p.colKeys.map((c) => <th key={c.join('|')} style={{ textAlign: 'right' }}>{cfg.cols.length ? label(c) : (cfg.val ? `${s.agg} of ${cfg.val}` : 'Count')}</th>)}
                    {s.totals && cfg.cols.length > 0 && <th style={{ textAlign: 'right' }}>Total</th>}
                  </tr>
                </thead>
                <tbody>
                  {rowKeys.map((r, ri) => (
                    <tr key={r.join('|')}>
                      {(r.length ? r : ['All']).map((k, i) => <td key={i} style={{ fontWeight: i === 0 ? 600 : undefined, color: i < r.length - 1 && ri > 0 && rowKeys[ri - 1][i] === k && rowKeys[ri - 1].slice(0, i).join() === r.slice(0, i).join() ? 'transparent' : undefined }}>{k || '(blank)'}</td>)}
                      {p.colKeys.map((c) => { const v = shown(r, c); return <td key={c.join('|')} style={{ textAlign: 'right', background: heat(v), fontVariantNumeric: 'tabular-nums' }}>{fv(v)}</td> })}
                      {s.totals && cfg.cols.length > 0 && <td style={{ textAlign: 'right', fontWeight: 700 }}>{fv(showAs(p.rowTotal(r), s.show, p.rowTotal(r), p.grand, p.grand))}</td>}
                    </tr>
                  ))}
                </tbody>
                {s.totals && cfg.rows.length > 0 && (
                  <tfoot>
                    <tr>
                      <td colSpan={Math.max(1, cfg.rows.length)}>Total</td>
                      {p.colKeys.map((c) => <td key={c.join('|')} style={{ textAlign: 'right' }}>{fv(showAs(p.colTotal(c), s.show, p.grand, p.colTotal(c), p.grand))}</td>)}
                      {cfg.cols.length > 0 && <td style={{ textAlign: 'right' }}>{fv(showAs(p.grand, s.show, p.grand, p.grand, p.grand))}</td>}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
          {(s.agg === 'sum' || s.agg === 'avg') && cfg.val && !numeric.has(cfg.val) && <Note tone="warn">“{cfg.val}” is mostly text — non-numeric values are ignored by {s.agg}. Try Count or Count unique.</Note>}
          {s.show !== 'value' && s.agg !== 'sum' && s.agg !== 'count' && <Note>Percentages are most meaningful for Sum and Count.</Note>}
        </Panel>
      </div>
    </Split>
  )
}
