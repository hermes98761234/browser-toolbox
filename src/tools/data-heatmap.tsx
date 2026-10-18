import { useMemo, useRef, useState } from 'react'
import { Area, Btn, Check, CsvButton, download, FileDrop, Note, Num, Panel, Row, Select, Slider, Split, Stat, Stats, Txt, useToolState } from '../kit'
import { DIVERGING, inkFor, MAPS, normalise, order, parseMatrix, ramp, scaler, total, transpose, type Norm, type Order, type ScaleKind } from './lib/data-heatmap'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
function trafficCsv() {
  const head = ',' + Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}h`).join(',')
  const rows = DAYS.map((d, i) => {
    const we = i >= 5
    return d + ',' + Array.from({ length: 24 }, (_, h) => {
      const work = we ? 0.55 * Math.exp(-((h - 14) ** 2) / 18) : Math.exp(-((h - 10.5) ** 2) / 6) + 0.8 * Math.exp(-((h - 15) ** 2) / 8)
      const night = 0.06 + 0.25 * Math.exp(-((h - 21) ** 2) / 4)
      return Math.round(1000 * (work + night) * (1 + 0.08 * Math.sin(i * 3.1 + h * 1.7)))
    }).join(',')
  })
  return [head, ...rows].join('\n')
}
interface State {
  text: string; map: string; reverse: boolean; scale: ScaleKind; norm: Norm; mid: number; auto: boolean; lo: number; hi: number
  rowOrder: Order; colOrder: Order; values: boolean; decimals: number; cell: number; gap: number; flip: boolean; margins: boolean; title: string
}
const SAMPLES: [string, string, Partial<State>][] = [
  ['Website visits · weekday × hour', trafficCsv(), { map: 'magma', reverse: false, scale: 'linear', norm: 'none', mid: 0, rowOrder: 'original', colOrder: 'original', values: false, cell: 24, auto: true }],
  ['Correlation matrix', `,Price,Rating,Reviews,Returns,Discount,Delivery days
Price,1,0.42,-0.18,0.31,-0.55,0.12
Rating,0.42,1,0.63,-0.71,-0.08,-0.39
Reviews,-0.18,0.63,1,-0.44,0.21,-0.27
Returns,0.31,-0.71,-0.44,1,0.05,0.48
Discount,-0.55,-0.08,0.21,0.05,1,-0.06
Delivery days,0.12,-0.39,-0.27,0.48,-0.06,1`, { map: 'red-blue', reverse: true, scale: 'linear', norm: 'none', mid: 0, rowOrder: 'cluster', colOrder: 'cluster', values: true, decimals: 2, auto: false, lo: -1, hi: 1, cell: 52 }],
  ['Sales by region × month (k$)', `,Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec
North,42,39,47,51,55,58,61,59,52,49,63,88
South,58,55,60,64,70,77,84,86,74,66,71,95
East,31,30,35,38,41,40,39,37,42,45,52,71
West,66,62,70,72,75,79,81,80,77,74,83,110
Central,24,22,27,29,30,33,35,34,31,30,36,49
Online,80,78,85,88,90,92,95,97,99,104,140,190
Export,15,18,16,21,19,22,25,24,23,26,28,30
Wholesale,51,49,53,50,48,47,45,44,49,52,55,57`, { map: 'blues', reverse: false, scale: 'linear', norm: 'row', mid: 0, rowOrder: 'total', colOrder: 'original', values: true, decimals: 0, cell: 44, auto: true }],
]
const DEF: State = {
  text: SAMPLES[0][1], map: 'magma', reverse: false, scale: 'linear' as ScaleKind, norm: 'none' as Norm, mid: 0, auto: true, lo: 0, hi: 1,
  rowOrder: 'original' as Order, colOrder: 'original' as Order, values: false, decimals: 0, cell: 24, gap: 1, flip: false, margins: true, title: 'Heatmap',
}
const NORM_LABEL: Record<Norm, string> = { none: 'Raw values', row: '% of row total', col: '% of column total', total: '% of grand total', zrow: 'z-score within row', zcol: 'z-score within column' }
const fmtV = (x: number, d: number, pctMode: boolean) => (!Number.isFinite(x) ? '' : pctMode ? `${(x * 100).toFixed(d)}%` : x.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }))

export default function DataHeatmap() {
  const [s, set, reset] = useToolState('data-heatmap', DEF)
  const [hover, setHover] = useState<{ r: number; c: number; x: number; y: number } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const parsed = useMemo(() => parseMatrix(s.text), [s.text])
  const m = useMemo(() => (s.flip ? { rows: parsed.cols, cols: parsed.rows, v: transpose(parsed.v) } : parsed), [parsed, s.flip])
  const nv = useMemo(() => normalise(m.v, s.norm), [m, s.norm])
  const ro = useMemo(() => order(m.rows, nv, s.rowOrder), [m.rows, nv, s.rowOrder])
  const co = useMemo(() => order(m.cols, transpose(nv), s.colOrder), [m.cols, nv, s.colOrder])
  const flat = nv.flat().filter(Number.isFinite)
  const dlo = flat.length ? Math.min(...flat) : 0, dhi = flat.length ? Math.max(...flat) : 1
  const lo = s.auto ? dlo : s.lo, hi = s.auto ? dhi : s.hi
  const div = DIVERGING.includes(s.map) || s.norm === 'zrow' || s.norm === 'zcol'
  const mid = s.norm === 'zrow' || s.norm === 'zcol' ? 0 : s.mid
  const sc = scaler(flat, s.scale, lo, hi, div ? mid : undefined)
  const stops = MAPS[s.map] ?? MAPS.viridis
  const colorOf = (x: number) => (Number.isFinite(x) ? ramp(stops, s.reverse ? 1 - sc(x) : sc(x)) : 'transparent')
  const pctMode = s.norm === 'row' || s.norm === 'col' || s.norm === 'total'

  const nR = ro.length, nC = co.length
  const labW = Math.min(170, 12 + 7 * Math.max(4, ...m.rows.map((r) => r.length)))
  const colLab = Math.min(120, 12 + 6.5 * Math.max(3, ...m.cols.map((c) => c.length)))
  const rot = s.cell < 6.5 * Math.max(...m.cols.map((c) => c.length), 1)
  const top = 34 + (rot ? colLab : 22), mW = s.margins ? 70 : 0
  const W = labW + nC * s.cell + mW + 12, H = top + nR * s.cell + (s.margins ? 64 : 0) + 56
  const rowT = ro.map((i) => total(m.v[i])), colT = co.map((j) => total(m.v.map((r) => r[j])))
  const maxRT = Math.max(...rowT.map(Math.abs), 1e-9), maxCT = Math.max(...colT.map(Math.abs), 1e-9)
  const hv = hover ? { row: m.rows[ro[hover.r]], col: m.cols[co[hover.c]], raw: m.v[ro[hover.r]][co[hover.c]], n: nv[ro[hover.r]][co[hover.c]] } : null
  const peak = (() => {
    let best = { r: '', c: '', v: -Infinity }
    m.v.forEach((r, i) => r.forEach((x, j) => { if (x > best.v) best = { r: m.rows[i], c: m.cols[j], v: x } }))
    return best
  })()

  const svgText = () => {
    const el = svgRef.current
    if (!el) return ''
    const clone = el.cloneNode(true) as SVGSVGElement
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    return clone.outerHTML
  }
  const png = () => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = W * 2
      c.height = H * 2
      const g = c.getContext('2d')!
      g.fillStyle = '#ffffff'
      g.fillRect(0, 0, c.width, c.height)
      g.drawImage(img, 0, 0, c.width, c.height)
      c.toBlob((b) => b && download('heatmap.png', b), 'image/png')
    }
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText())
  }

  const legendW = Math.min(260, Math.max(160, nC * s.cell * 0.6))
  return (
    <Split wide="right">
      <div>
        <Panel title="Data" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            {SAMPLES.map(([n, t, p]) => <Btn key={n} onClick={() => set({ text: t, ...p })}>{n}</Btn>)}
          </Row>
          <Area value={s.text} onChange={(text) => set({ text })} rows={8} mono />
          <FileDrop accept=".csv,.tsv,.txt,text/csv" onFiles={async ([f]) => set({ text: await f.text() })} label="Load CSV / TSV (first row = column labels, first column = row labels)" />
          {m.rows.length === 0 && <Note tone="err">Need a header row and at least one data row.</Note>}
          <Txt label="Title" value={s.title} onChange={(title) => set({ title })} />
        </Panel>
        <Panel title="Colour scale">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 6 }}>
            {Object.keys(MAPS).map((k) => (
              <button key={k} type="button" className={`k-btn ${k === s.map ? 'primary' : ''}`} onClick={() => set({ map: k })} style={{ display: 'grid', gap: 3, padding: 6 }}>
                <span style={{ height: 10, borderRadius: 3, background: `linear-gradient(90deg, ${MAPS[k].join(',')})` }} />
                <span style={{ fontSize: 12 }}>{k}{DIVERGING.includes(k) ? ' ⇄' : ''}</span>
              </button>
            ))}
          </div>
          <Row>
            <Select label="Scale" value={s.scale} onChange={(scale) => set({ scale })} options={[['linear', 'Linear'], ['log', 'Logarithmic'], ['quantile', 'Quantile (rank)']]} />
            <Select label="Values" value={s.norm} onChange={(norm) => set({ norm })} options={Object.entries(NORM_LABEL) as [Norm, string][]} />
          </Row>
          <Check label="Reverse colours" value={s.reverse} onChange={(reverse) => set({ reverse })} />
          <Check label="Automatic domain (min → max)" value={s.auto} onChange={(auto) => set({ auto, lo: dlo, hi: dhi })} />
          {!s.auto && <Row><Num label="Min" value={s.lo} onChange={(lo) => set({ lo })} /><Num label="Max" value={s.hi} onChange={(hi) => set({ hi })} /></Row>}
          {div && s.norm !== 'zrow' && s.norm !== 'zcol' && <Num label="Diverging midpoint" value={s.mid} onChange={(mid) => set({ mid })} />}
          {s.scale === 'log' && lo <= 0 && <Note tone="warn">Log scale needs positive values; zero and negatives get the lowest colour.</Note>}
        </Panel>
        <Panel title="Layout">
          <Row>
            <Select label="Row order" value={s.rowOrder} onChange={(rowOrder) => set({ rowOrder })} options={[['original', 'As in data'], ['total', 'By total ↓'], ['alpha', 'A → Z'], ['cluster', 'Cluster similar']]} />
            <Select label="Column order" value={s.colOrder} onChange={(colOrder) => set({ colOrder })} options={[['original', 'As in data'], ['total', 'By total ↓'], ['alpha', 'A → Z'], ['cluster', 'Cluster similar']]} />
          </Row>
          <Slider label="Cell size" value={s.cell} onChange={(cell) => set({ cell })} min={12} max={70} unit=" px" />
          <Slider label="Gap" value={s.gap} onChange={(gap) => set({ gap })} min={0} max={4} step={0.5} unit=" px" />
          <Check label="Show values in cells" value={s.values} onChange={(values) => set({ values })} />
          {s.values && <Slider label="Decimals" value={s.decimals} onChange={(decimals) => set({ decimals })} min={0} max={3} />}
          <Check label="Row / column total bars" value={s.margins} onChange={(margins) => set({ margins })} />
          <Check label="Swap rows and columns" value={s.flip} onChange={(flip) => set({ flip })} />
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Size" value={`${m.rows.length} × ${m.cols.length}`} sub={`${flat.length} values${m.rows.length * m.cols.length - flat.length ? `, ${m.rows.length * m.cols.length - flat.length} blank` : ''}`} />
          <Stat label="Range" value={`${fmtV(dlo, pctMode ? 1 : Math.abs(dhi) >= 100 ? 0 : 2, pctMode)} → ${fmtV(dhi, pctMode ? 1 : Math.abs(dhi) >= 100 ? 0 : 2, pctMode)}`} sub={NORM_LABEL[s.norm]} />
          <Stat label="Peak (raw)" value={Number.isFinite(peak.v) ? peak.v.toLocaleString('en-US') : '—'} sub={`${peak.r} · ${peak.c}`} tone="accent" />
          <Stat label="Grand total" value={total(m.v.flat()).toLocaleString('en-US', { maximumFractionDigits: 2 })} />
        </Stats>
        <Panel title="Heatmap" actions={<><Btn onClick={() => download('heatmap.svg', svgText(), 'image/svg+xml')}>⬇ SVG</Btn><Btn onClick={png}>⬇ PNG</Btn><CsvButton name="heatmap-values.csv" rows={() => [['', ...co.map((j) => m.cols[j])], ...ro.map((i) => [m.rows[i], ...co.map((j) => nv[i][j])])]} /></>}>
          <div style={{ overflow: 'auto', position: 'relative' }} onMouseLeave={() => setHover(null)}>
            <svg ref={svgRef} width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', fontFamily: 'system-ui, sans-serif' }}>
              <text x={labW} y={20} fontSize={15} fontWeight={700} fill="#64748b">{s.title}</text>
              {co.map((j, c) => (
                <text key={j} fontSize={11} fill="#64748b" transform={rot ? `translate(${labW + c * s.cell + s.cell / 2 + 4},${top - 6}) rotate(-60)` : undefined} x={rot ? 0 : labW + c * s.cell + s.cell / 2} y={rot ? 0 : top - 8} textAnchor={rot ? 'start' : 'middle'}>{m.cols[j]}</text>
              ))}
              {ro.map((i, r) => (
                <g key={i}>
                  <text x={labW - 8} y={top + r * s.cell + s.cell / 2 + 4} fontSize={11} fill="#64748b" textAnchor="end">{m.rows[i]}</text>
                  {co.map((j, c) => {
                    const x = nv[i][j], bg = colorOf(x)
                    return (
                      <g key={j} onMouseEnter={() => setHover({ r, c, x: labW + c * s.cell, y: top + r * s.cell })}>
                        <rect x={labW + c * s.cell + s.gap / 2} y={top + r * s.cell + s.gap / 2} width={Math.max(1, s.cell - s.gap)} height={Math.max(1, s.cell - s.gap)} rx={Math.min(3, s.cell / 8)} fill={Number.isFinite(x) ? bg : 'none'} stroke={Number.isFinite(x) ? 'none' : '#94a3b8'} strokeDasharray="2 2" />
                        {s.values && Number.isFinite(x) && s.cell >= 22 && (
                          <text x={labW + c * s.cell + s.cell / 2} y={top + r * s.cell + s.cell / 2 + 3.5} fontSize={Math.min(11, s.cell / 3.2)} textAnchor="middle" fill={inkFor(bg)}>{fmtV(x, s.decimals, pctMode)}</text>
                        )}
                      </g>
                    )
                  })}
                  {s.margins && <rect x={labW + nC * s.cell + 6} y={top + r * s.cell + s.cell * 0.2} width={Math.max(0, (Math.abs(rowT[r]) / maxRT) * (mW - 10))} height={s.cell * 0.6} rx={2} fill="#94a3b8"><title>{`${m.rows[i]} total: ${rowT[r].toLocaleString('en-US')}`}</title></rect>}
                </g>
              ))}
              {s.margins && co.map((j, c) => {
                const h = (Math.abs(colT[c]) / maxCT) * 52
                return <rect key={j} x={labW + c * s.cell + s.cell * 0.2} y={top + nR * s.cell + 6} width={s.cell * 0.6} height={h} rx={2} fill="#94a3b8"><title>{`${m.cols[j]} total: ${colT[c].toLocaleString('en-US')}`}</title></rect>
              })}
              <defs>
                <linearGradient id="hm-legend">
                  {Array.from({ length: 21 }, (_, k) => <stop key={k} offset={`${k * 5}%`} stopColor={ramp(stops, s.reverse ? 1 - k / 20 : k / 20)} />)}
                </linearGradient>
              </defs>
              <g transform={`translate(${labW},${H - 34})`}>
                <rect width={legendW} height={10} rx={3} fill="url(#hm-legend)" />
                <text y={24} fontSize={10} fill="#64748b">{s.scale === 'quantile' ? 'lowest' : fmtV(lo, 2, pctMode)}</text>
                {div && s.scale === 'linear' && <text x={legendW / 2} y={24} fontSize={10} fill="#64748b" textAnchor="middle">{fmtV(mid, 2, pctMode)}</text>}
                <text x={legendW} y={24} fontSize={10} fill="#64748b" textAnchor="end">{s.scale === 'quantile' ? 'highest' : fmtV(hi, 2, pctMode)}</text>
                <text x={legendW + 10} y={9} fontSize={10} fill="#64748b">{NORM_LABEL[s.norm]}{s.scale !== 'linear' ? ` · ${s.scale}` : ''}</text>
              </g>
            </svg>
            {hover && hv && (
              <div className="k-tip" style={{ left: Math.min(hover.x + s.cell + 6, W - 190), top: hover.y + s.cell / 2, position: 'absolute', pointerEvents: 'none' }}>
                <b>{hv.row}</b> · {hv.col}
                <div>Value: <b>{Number.isFinite(hv.raw) ? hv.raw.toLocaleString('en-US') : 'blank'}</b></div>
                {s.norm !== 'none' && <div>{NORM_LABEL[s.norm]}: <b>{fmtV(hv.n, 2, pctMode)}</b></div>}
              </div>
            )}
          </div>
          <p className="muted" style={{ fontSize: 13 }}>Hover a cell for details. Dashed outlines mark blank cells. “Cluster similar” reorders rows/columns so that similar profiles sit together (nearest-neighbour seriation with 2-opt), which makes blocks and patterns pop out.</p>
        </Panel>
      </div>
    </Split>
  )
}

