import { useMemo, useState, type DragEvent, type ReactNode } from 'react'
import { BarChart, Btn, Check, CsvButton, FileDrop, Note, num, Panel, pct, Row, Seg, Split, Stat, Stats, Table, useToolState, Area, download, toCsv } from '../kit'
import { ADDITIVE, AGG_LABEL, AGGS, aggregate, cellKey, display, keyOf, parseCsv, pivot, sampleCsv, valuesAt, type Agg, type Show } from './lib/pivot-table-builder'

type Zone = 'rows' | 'cols' | 'values' | 'filters'
interface S {
  csv: string | null
  rows: string[]
  cols: string[]
  values: { field: string; agg: Agg }[]
  filters: string[]
  excluded: Record<string, string[]>
  show: Show
  heat: boolean
  sort: 'label' | 'desc' | 'asc'
}

const DEF: S = {
  csv: null,
  rows: ['Region', 'Category'],
  cols: ['Channel'],
  values: [{ field: 'Revenue', agg: 'sum' }, { field: 'Revenue', agg: 'median' }],
  filters: ['Month'],
  excluded: {},
  show: 'value',
  heat: true,
  sort: 'label',
}
const ZONES: [Zone, string, string][] = [['rows', 'Rows', '↕'], ['cols', 'Columns', '↔'], ['values', 'Values', 'Σ'], ['filters', 'Filters', '⧩']]
const MAX_ROWS = 400

function Chip({ children, onDrag, onRemove, extra }: { children: ReactNode; onDrag?: (e: DragEvent) => void; onRemove?: () => void; extra?: ReactNode }) {
  return (
    <span draggable={!!onDrag} onDragStart={onDrag} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 8, background: 'var(--panel2)', border: '1px solid var(--line)', cursor: onDrag ? 'grab' : undefined, fontSize: 13 }}>
      {children}
      {extra}
      {onRemove && <button type="button" onClick={onRemove} aria-label="Remove" style={{ border: 0, background: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 0 }}>✕</button>}
    </span>
  )
}

export default function PivotTableBuilder() {
  const [s, set, reset] = useToolState<S>('pivot-table-builder', DEF)
  const [paste, setPaste] = useState('')
  const [err, setErr] = useState('')
  const [drill, setDrill] = useState<{ title: string; idx: number[] } | null>(null)
  const [over, setOver] = useState<Zone | null>(null)

  const data = useMemo(() => parseCsv(s.csv ?? sampleCsv()), [s.csv])
  const fi = (name: string) => data.cols.indexOf(name)
  const valid = (names: string[]) => names.filter((n) => fi(n) >= 0)
  const rowsF = valid(s.rows), colsF = valid(s.cols), filtersF = valid(s.filters)
  const values = s.values.filter((v) => fi(v.field) >= 0).map((v) => ({ ...v, agg: data.numeric[fi(v.field)] || v.agg === 'count' || v.agg === 'distinct' ? v.agg : ('count' as Agg) }))
  const specValues = values.map((v) => ({ field: fi(v.field), agg: v.agg }))
  const nV = Math.max(1, specValues.length)

  const p = useMemo(() => {
    const filters: Record<number, string[]> = {}
    for (const f of filtersF) filters[fi(f)] = s.excluded[f] ?? []
    return pivot(data, { rows: rowsF.map(fi), cols: colsF.map(fi), values: specValues, filters })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, s.rows, s.cols, s.filters, s.excluded])

  const cellVal = (vi: number, idx: number[] | undefined, rk: string[] | null, ck: string[] | null) => (specValues[vi] ? display(data, p, specValues[vi], idx, s.show, rk, ck) : idx?.length ?? NaN)

  const rowKeys = useMemo(() => {
    if (s.sort === 'label' || !specValues.length) return p.rowKeys
    const tot = new Map(p.rowKeys.map((k) => [keyOf(k), aggregate(specValues[0].agg, valuesAt(data, p.rowIdx.get(keyOf(k)), specValues[0].field))]))
    const dir = s.sort === 'desc' ? -1 : 1
    return [...p.rowKeys].sort((a, b) => dir * ((tot.get(keyOf(a)) ?? 0) - (tot.get(keyOf(b)) ?? 0)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p, s.sort, s.values])

  // heat-map range per value field over body cells
  const ranges = useMemo(() => specValues.map((_, vi) => {
    let lo = Infinity, hi = -Infinity
    for (const rk of rowKeys.slice(0, MAX_ROWS)) for (const ck of p.colKeys) {
      const v = cellVal(vi, p.cells.get(cellKey(rk, ck)), rk, ck)
      if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v) }
    }
    return [lo, hi] as const
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [p, rowKeys, s.show, s.values])

  const fmtV = (vi: number, v: number) => {
    if (!Number.isFinite(v)) return ''
    if (s.show !== 'value') return pct(v, 1)
    const a = specValues[vi]?.agg ?? 'count'
    return a === 'count' || a === 'distinct' ? num(v, 0) : num(v, Math.abs(v) >= 1000 ? 0 : 2)
  }
  const vLabel = (vi: number) => (values[vi] ? `${AGG_LABEL[values[vi].agg]} of ${values[vi].field}` : 'Count')

  const move = (field: string, to: Zone) => {
    const strip = (a: string[]) => a.filter((x) => x !== field)
    if (to === 'values') return set({ values: [...s.values, { field, agg: data.numeric[fi(field)] ? 'sum' : 'count' }] })
    set({ rows: to === 'rows' ? [...strip(s.rows), field] : strip(s.rows), cols: to === 'cols' ? [...strip(s.cols), field] : strip(s.cols), filters: to === 'filters' ? [...strip(s.filters), field] : s.filters })
  }
  const onDrop = (z: Zone) => (e: DragEvent) => {
    e.preventDefault()
    setOver(null)
    const f = e.dataTransfer.getData('text/plain')
    if (fi(f) >= 0) move(f, z)
  }
  const drag = (f: string) => (e: DragEvent) => e.dataTransfer.setData('text/plain', f)

  const loadText = (t: string) => {
    const d = parseCsv(t)
    if (d.cols.length < 2 || !d.rows.length) return setErr('Need a header row and at least one data row.')
    if (t.length > 2_000_000) return setErr('File is larger than 2 MB — trim it first.')
    setErr('')
    const txt = d.cols.filter((_, i) => !d.numeric[i]), nums = d.cols.filter((_, i) => d.numeric[i])
    set({ csv: t, rows: txt.slice(0, 1), cols: [], values: nums.length ? [{ field: nums[0], agg: 'sum' }] : [{ field: d.cols[0], agg: 'count' }], filters: [], excluded: {} })
    setDrill(null)
  }

  const exportRows = () => {
    const head = [...rowsF, ...p.colKeys.flatMap((ck) => specValues.map((_, vi) => `${ck.join(' / ') || 'Value'} · ${vLabel(vi)}`)), ...(colsF.length ? specValues.map((_, vi) => `Total · ${vLabel(vi)}`) : [])]
    const body = rowKeys.map((rk) => [...rk, ...p.colKeys.flatMap((ck) => specValues.map((_, vi) => cellVal(vi, p.cells.get(cellKey(rk, ck)), rk, ck))), ...(colsF.length ? specValues.map((_, vi) => cellVal(vi, p.rowIdx.get(keyOf(rk)), rk, null)) : [])])
    return [head, ...body].map((r) => r.map((c) => (typeof c === 'number' ? (Number.isFinite(c) ? +c.toFixed(6) : '') : c)))
  }

  const heatBg = (vi: number, v: number) => {
    if (!s.heat || !Number.isFinite(v)) return undefined
    const [lo, hi] = ranges[vi] ?? [0, 0]
    const t = hi > lo ? (v - lo) / (hi - lo) : 0.5
    return `color-mix(in srgb, var(--accent) ${Math.round(6 + t * 60)}%, transparent)`
  }
  const td = (vi: number, v: number, idx: number[] | undefined, title: string, total = false, key = '') => (
    <td key={key} onClick={() => idx?.length && setDrill({ title, idx })} title={idx?.length ? `${title}\n${idx.length} source rows — click to drill down` : undefined}
      style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', cursor: idx?.length ? 'pointer' : undefined, background: total ? undefined : heatBg(vi, v), fontWeight: total ? 700 : undefined, whiteSpace: 'nowrap' }}>
      {fmtV(vi, v)}
    </td>
  )

  const chartBars = specValues.length
    ? rowKeys.slice(0, 30).map((rk) => ({ label: rk.join(' · '), value: colsF.length && p.colKeys.length <= 10 && ADDITIVE.includes(specValues[0].agg) ? p.colKeys.map((ck) => aggregate(specValues[0].agg, valuesAt(data, p.cells.get(cellKey(rk, ck)), specValues[0].field)) || 0) : aggregate(specValues[0].agg, valuesAt(data, p.rowIdx.get(keyOf(rk)), specValues[0].field)) || 0 }))
    : []
  const stacked = chartBars.length > 0 && Array.isArray(chartBars[0].value)
  const shareOk = s.show === 'value' || specValues.every((v) => ADDITIVE.includes(v.agg))
  const hdrLevels = colsF.length + (nV > 1 || !colsF.length ? 1 : 0)

  return (
    <div>
      <Split wide="right">
        <div>
          <Panel title="Data" actions={s.csv && <Btn kind="ghost" onClick={() => { set({ ...DEF }); setDrill(null) }}>Use sample</Btn>}>
            <FileDrop accept=".csv,.tsv,.txt,text/csv" onFiles={async (fs) => loadText(await fs[0].text())} label="Drop a CSV / TSV file" />
            <div style={{ marginTop: 8 }}><Area value={paste} onChange={setPaste} rows={3} mono placeholder="…or paste CSV with a header row" /></div>
            {paste.trim() && <Btn kind="primary" onClick={() => { loadText(paste); setPaste('') }}>Load pasted data</Btn>}
            {err && <Note tone="err">{err}</Note>}
            <p className="muted" style={{ fontSize: 13 }}>{s.csv ? 'Your data' : 'Sample: 480 sales order lines'} · {num(data.rows.length, 0)} rows × {data.cols.length} columns</p>
          </Panel>
          <Panel title="Fields" actions={<span className="muted" style={{ fontSize: 12 }}>drag into a zone</span>}>
            <Row>
              {data.cols.map((c, i) => (
                <Chip key={c} onDrag={drag(c)}><span className="muted">{data.numeric[i] ? '#' : 'Aa'}</span>{c}</Chip>
              ))}
            </Row>
          </Panel>
          {ZONES.map(([z, title, icon]) => {
            const items = z === 'rows' ? rowsF : z === 'cols' ? colsF : z === 'filters' ? filtersF : []
            return (
              <div key={z} onDragOver={(e) => { e.preventDefault(); setOver(z) }} onDragLeave={() => setOver(null)} onDrop={onDrop(z)}>
                <Panel title={`${icon} ${title}`} className={over === z ? 'drop-over' : ''}
                  actions={
                    <select className="k-select" value="" aria-label={`Add field to ${title}`} onChange={(e) => e.target.value && move(e.target.value, z)} style={{ width: 'auto', padding: '2px 6px' }}>
                      <option value="">+ add</option>
                      {data.cols.filter((c) => z === 'values' || !items.includes(c)).map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  }>
                  <div style={{ minHeight: 34, border: `2px dashed ${over === z ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 10, padding: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {z !== 'values' && items.map((f, i) => (
                      <Chip key={f} onDrag={drag(f)} onRemove={() => set(z === 'rows' ? { rows: s.rows.filter((x) => x !== f) } : z === 'cols' ? { cols: s.cols.filter((x) => x !== f) } : { filters: s.filters.filter((x) => x !== f) })}
                        extra={i > 0 && z !== 'filters' && <button type="button" title="Move up" style={{ border: 0, background: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 0 }} onClick={() => { const a = [...items]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; set(z === 'rows' ? { rows: a } : { cols: a }) }}>◀</button>}>
                        {f}
                      </Chip>
                    ))}
                    {z === 'values' && values.map((v, i) => (
                      <Chip key={i} onRemove={() => set({ values: s.values.filter((_, j) => j !== i) })}
                        extra={<select value={v.agg} aria-label="Aggregation" onChange={(e) => set({ values: s.values.map((x, j) => (j === i ? { ...x, agg: e.target.value as Agg } : x)) })} style={{ fontSize: 12 }}>
                          {AGGS.filter((a) => data.numeric[fi(v.field)] || a === 'count' || a === 'distinct').map((a) => <option key={a} value={a}>{AGG_LABEL[a]}</option>)}
                        </select>}>
                        {v.field}
                      </Chip>
                    ))}
                    {!(z === 'values' ? values.length : items.length) && <span className="muted" style={{ fontSize: 13 }}>Drop fields here</span>}
                  </div>
                  {z === 'filters' && filtersF.map((f) => {
                    const vals = [...new Set(data.rows.map((r) => r[fi(f)] || '(blank)'))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
                    const ex = s.excluded[f] ?? []
                    return (
                      <details key={f} style={{ marginTop: 8 }} open={vals.length <= 12}>
                        <summary><b>{f}</b> <span className="muted">{vals.length - ex.length}/{vals.length} shown</span></summary>
                        <Row>
                          <Btn kind="ghost" onClick={() => set({ excluded: { ...s.excluded, [f]: [] } })}>All</Btn>
                          <Btn kind="ghost" onClick={() => set({ excluded: { ...s.excluded, [f]: vals } })}>None</Btn>
                        </Row>
                        <div style={{ maxHeight: 160, overflow: 'auto', display: 'flex', flexWrap: 'wrap', gap: '0 12px' }}>
                          {vals.slice(0, 200).map((v) => (
                            <Check key={v} label={v} value={!ex.includes(v)} onChange={(on) => set({ excluded: { ...s.excluded, [f]: on ? ex.filter((x) => x !== v) : [...ex, v] } })} />
                          ))}
                        </div>
                      </details>
                    )
                  })}
                </Panel>
              </div>
            )
          })}
        </div>
        <div>
          <Stats>
            <Stat label="Rows in pivot" value={num(p.all.length, 0)} sub={`of ${num(data.rows.length, 0)} after filters`} />
            <Stat label="Groups" value={`${p.rowKeys.length} × ${p.colKeys.length}`} sub="row × column keys" />
            {specValues[0] && <Stat label={vLabel(0)} value={fmtV(0, aggregate(specValues[0].agg, valuesAt(data, p.all, specValues[0].field)))} sub="grand total" tone="accent" />}
          </Stats>
          <Panel title="Pivot table" actions={<><CsvButton name="pivot.csv" rows={exportRows} /><Btn kind="ghost" onClick={() => { reset(); setDrill(null) }}>Reset</Btn></>}>
            <Row>
              <Seg value={s.show} onChange={(show) => set({ show })} options={[['value', 'Values'], ['row', '% of row'], ['col', '% of column'], ['total', '% of total']]} label="Show" />
              <Seg value={s.sort} onChange={(sort) => set({ sort })} options={[['label', 'A→Z'], ['desc', 'Largest'], ['asc', 'Smallest']]} label="Sort rows" />
              <Check label="Heat map" value={s.heat} onChange={(heat) => set({ heat })} />
            </Row>
            {!shareOk && <Note tone="warn">Shares of row/column/total are only meaningful for Sum and Count; other aggregations show the ratio of the statistic to the group's statistic.</Note>}
            <div className="k-table-wrap" style={{ maxHeight: 560, overflow: 'auto', marginTop: 8 }}>
              <table className="k-table">
                <thead>
                  {Array.from({ length: hdrLevels }, (_, l) => {
                    const isValRow = l === colsF.length
                    const cells: ReactNode[] = []
                    if (isValRow) {
                      for (const ck of p.colKeys) for (let vi = 0; vi < nV; vi++) cells.push(<th key={keyOf(ck) + vi} style={{ textAlign: 'right' }}>{nV > 1 ? vLabel(vi) : vLabel(0)}</th>)
                    } else {
                      let i = 0
                      while (i < p.colKeys.length) {
                        let j = i
                        const pre = keyOf(p.colKeys[i].slice(0, l + 1))
                        while (j < p.colKeys.length && keyOf(p.colKeys[j].slice(0, l + 1)) === pre) j++
                        cells.push(<th key={i} colSpan={(j - i) * nV} style={{ textAlign: 'center', borderBottom: '1px solid var(--line)' }}>{l === 0 && <span className="muted">{colsF[0]}: </span>}{p.colKeys[i][l]}</th>)
                        i = j
                      }
                    }
                    return (
                      <tr key={l}>
                        {l === 0 && <th rowSpan={hdrLevels} colSpan={Math.max(1, rowsF.length)} style={{ verticalAlign: 'bottom' }}>{rowsF.join(' › ') || ' '}</th>}
                        {cells}
                        {colsF.length > 0 && (l === 0 ? <th rowSpan={nV > 1 ? colsF.length : hdrLevels} colSpan={nV} style={{ textAlign: 'right' }}>Total</th> : isValRow && Array.from({ length: nV }, (_, vi) => <th key={'t' + vi} style={{ textAlign: 'right' }}>{vLabel(vi)}</th>))}
                      </tr>
                    )
                  })}
                </thead>
                <tbody>
                  {rowKeys.slice(0, MAX_ROWS).map((rk, ri) => {
                    const prev = rowKeys[ri - 1]
                    return (
                      <tr key={keyOf(rk)}>
                        {rowsF.length ? rk.map((v, i) => <th key={i} scope="row" style={{ fontWeight: i === rk.length - 1 ? 500 : 700, whiteSpace: 'nowrap' }}>{s.sort === 'label' && prev && keyOf(prev.slice(0, i + 1)) === keyOf(rk.slice(0, i + 1)) ? '' : v}</th>) : <th>All</th>}
                        {p.colKeys.flatMap((ck) => specValues.length ? specValues.map((_, vi) => td(vi, cellVal(vi, p.cells.get(cellKey(rk, ck)), rk, ck), p.cells.get(cellKey(rk, ck)), [...rk, ...ck].join(' · '), false, keyOf(ck) + vi)) : [td(0, p.cells.get(cellKey(rk, ck))?.length ?? NaN, p.cells.get(cellKey(rk, ck)), [...rk, ...ck].join(' · '), false, keyOf(ck))])}
                        {colsF.length > 0 && specValues.map((_, vi) => td(vi, cellVal(vi, p.rowIdx.get(keyOf(rk)), rk, null), p.rowIdx.get(keyOf(rk)), rk.join(' · ') + ' (total)', true, 'rt' + vi))}
                      </tr>
                    )
                  })}
                </tbody>
                {rowsF.length > 0 && (
                  <tfoot>
                    <tr>
                      <th colSpan={rowsF.length}>Grand total</th>
                      {p.colKeys.flatMap((ck) => specValues.map((_, vi) => td(vi, cellVal(vi, p.colIdx.get(keyOf(ck)), null, ck), p.colIdx.get(keyOf(ck)), ck.join(' · ') + ' (total)', true, keyOf(ck) + vi)))}
                      {colsF.length > 0 && specValues.map((_, vi) => td(vi, cellVal(vi, p.all, null, null), p.all, 'All rows', true, 'gt' + vi))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            {rowKeys.length > MAX_ROWS && <Note tone="warn">Showing the first {MAX_ROWS} of {rowKeys.length} row groups — export CSV for all.</Note>}
            <p className="muted" style={{ fontSize: 12 }}>Totals are recomputed from the raw rows (so medians, std. dev. and percentiles are exact, not averages of averages). Click any cell to see its source rows.</p>
          </Panel>
          {drill && (
            <Panel title={`Drill-down: ${drill.title || 'All'} (${drill.idx.length} rows)`}
              actions={<><Btn onClick={() => download('drill-down.csv', toCsv([data.cols, ...drill.idx.map((i) => data.rows[i])]), 'text/csv')}>⬇ CSV</Btn><Btn kind="ghost" onClick={() => setDrill(null)}>✕</Btn></>}>
              <Table head={data.cols} rows={drill.idx.map((i) => data.rows[i])} max={100} />
            </Panel>
          )}
          {chartBars.length > 0 && (
            <Panel title={`${vLabel(0)} by ${rowsF.join(' · ') || 'all'}${stacked ? `, stacked by ${colsF.join(' · ')}` : ''}`}>
              <BarChart bars={chartBars} fy={(v) => num(v, 0)} stacks={stacked ? p.colKeys.map((ck) => ({ name: ck.join(' · ') })) : undefined} />
            </Panel>
          )}
        </div>
      </Split>
    </div>
  )
}
