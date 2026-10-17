import { useMemo, useRef, type ReactNode } from 'react'
import { Area, Btn, Check, CopyButton, download, FileDrop, Note, Num, Panel, Row, Select, Split, Table, Txt, useToolState } from '../kit'
import { arcPath, niceScale, parseCsv, short, toNumber, toTable } from './lib/chart-builder'

type Kind = 'bar' | 'stacked' | 'hbar' | 'line' | 'area' | 'pie' | 'donut' | 'scatter'
interface State {
  csv: string; kind: Kind; labelCol: number; series: number[]; title: string; subtitle: string; xLabel: string; yLabel: string
  legend: 'top' | 'right' | 'none'; values: boolean; grid: boolean; zero: boolean; trend: boolean; palette: string; bg: 'white' | 'transparent' | 'dark'; w: number; h: number
}

const SAMPLES: Record<string, Partial<State>> = {
  'Monthly revenue (bars)': { kind: 'bar', labelCol: 0, series: [], title: 'Revenue by product line', subtitle: 'Thousands of USD, 2026', xLabel: '', yLabel: 'k$', csv: 'Month,Hardware,Software,Services\nJan,42,31,18\nFeb,38,34,19\nMar,45,36,22\nApr,51,39,21\nMay,49,44,25\nJun,56,47,27\nJul,58,52,26\nAug,54,55,30\nSep,61,58,31\nOct,66,63,33\nNov,72,66,35\nDec,80,71,40' },
  'Browser market share (pie)': { kind: 'donut', labelCol: 0, series: [], title: 'Browser market share', subtitle: 'Share of page views, %', xLabel: '', yLabel: '', csv: 'Browser,Share\nChrome,65.4\nSafari,18.6\nEdge,5.3\nFirefox,2.8\nSamsung Internet,2.4\nOther,5.5' },
  'Average high temperature (lines)': { kind: 'line', labelCol: 0, series: [], title: 'Average daily high', subtitle: '°C by month', xLabel: '', yLabel: '°C', csv: 'Month;Kyiv;Lisbon;Oslo\nJan;-1;15;0\nFeb;0;16;1\nMar;6;19;5\nApr;14;20;10\nMay;21;22;16\nJun;24;26;20\nJul;26;28;22\nAug;25;28;21\nSep;19;27;16\nOct;12;23;9\nNov;5;19;4\nDec;0;16;1' },
  'Height vs weight (scatter)': { kind: 'scatter', labelCol: 0, series: [1], title: 'Height vs weight', subtitle: '15 adults', xLabel: 'Height, cm', yLabel: 'Weight, kg', trend: true, zero: false, csv: 'Height cm,Weight kg\n158,54\n162,59\n165,57\n168,66\n170,64\n172,70\n174,68\n175,77\n177,74\n179,80\n181,79\n183,86\n185,83\n188,92\n191,95' },
}
const PALETTES: Record<string, string[]> = {
  Vivid: ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#a855f7', '#14b8a6', '#f97316', '#ec4899', '#84cc16'],
  Ocean: ['#0c4a6e', '#0369a1', '#0284c7', '#38bdf8', '#7dd3fc', '#155e75', '#0891b2', '#22d3ee', '#a5f3fc', '#164e63'],
  Warm: ['#9a3412', '#ea580c', '#f59e0b', '#facc15', '#dc2626', '#be185d', '#f97316', '#fbbf24', '#b45309', '#fb7185'],
  'Colour-blind safe': ['#0072b2', '#e69f00', '#009e73', '#cc79a7', '#56b4e9', '#d55e00', '#f0e442', '#000000'],
  Mono: ['#1e293b', '#475569', '#64748b', '#94a3b8', '#cbd5e1', '#334155', '#0f172a', '#e2e8f0'],
}
const DEF: State = { ...(SAMPLES['Monthly revenue (bars)'] as State), legend: 'top', values: false, grid: true, zero: true, trend: true, palette: 'Vivid', bg: 'white', w: 800, h: 460 }
const KINDS: [Kind, string][] = [['bar', 'Bar'], ['stacked', 'Stacked bar'], ['hbar', 'Horizontal bar'], ['line', 'Line'], ['area', 'Area'], ['pie', 'Pie'], ['donut', 'Donut'], ['scatter', 'Scatter (XY)']]
const FONT = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'

export default function ChartBuilder() {
  const [s, set, reset] = useToolState('chart-builder', DEF)
  const svg = useRef<SVGSVGElement>(null)
  const table = useMemo(() => toTable(parseCsv(s.csv)), [s.csv])
  const numCols = table.headers.map((_, i) => i).filter((i) => table.numeric[i])
  const labelCol = Math.min(s.labelCol, table.headers.length - 1)
  const chosen = (s.series.length ? s.series : numCols).filter((i) => i !== labelCol && table.numeric[i] && i < table.headers.length)
  const pal = PALETTES[s.palette] ?? PALETTES.Vivid
  const dark = s.bg === 'dark'
  const fg = dark ? '#e5e7eb' : '#1f2937', sub = dark ? '#9ca3af' : '#6b7280', gridC = dark ? '#374151' : '#e5e7eb'
  const W = Math.max(240, s.w), H = Math.max(180, s.h)
  const cats = table.rows.map((r) => r[labelCol] ?? '')
  const series = chosen.map((c, k) => ({ name: table.headers[c], color: pal[k % pal.length], vals: table.rows.map((r) => toNumber(r[c])) }))
  const pie = s.kind === 'pie' || s.kind === 'donut'
  const problems: string[] = []
  if (!table.rows.length) problems.push('Paste CSV with a header row and at least one data row.')
  else if (!series.length) problems.push('No numeric columns to plot. Pick at least one series column with numbers.')
  if (s.kind === 'scatter' && !table.numeric[labelCol]) problems.push('Scatter needs a numeric X column: choose it as “Labels / X column”.')
  if (pie && series[0]?.vals.some((v) => v < 0)) problems.push('Pie charts cannot show negative values.')

  // ---- layout ----
  let top = 14
  if (s.title) top += 26
  if (s.subtitle) top += 20
  const legendItems = pie ? cats.map((c, i) => ({ name: c, color: pal[i % pal.length] })) : series.map((x) => ({ name: x.name, color: x.color }))
  const legTop = s.legend === 'top' && legendItems.length > (pie ? 0 : 1)
  if (legTop) top += 26
  const right = s.legend === 'right' ? 150 : 20
  const left = (s.kind === 'hbar' ? Math.min(140, 12 + Math.max(...cats.map((c) => c.length)) * 6.5) : 58) + (s.yLabel ? 16 : 0)
  const longCat = Math.max(0, ...cats.map((c) => c.length))
  const bottom = 30 + (s.xLabel ? 20 : 0)
  const pw = W - left - right, ph0 = H - top - bottom
  const band = (s.kind === 'hbar' ? ph0 : pw) / Math.max(1, cats.length)
  const tilt = s.kind !== 'hbar' && s.kind !== 'scatter' && !pie && longCat * 6.5 > band
  const ph = ph0 - (tilt ? Math.min(60, longCat * 4.5) : 0)

  const body: ReactNode[] = []
  const T = (x: number, y: number, t: string, o: { size?: number; anchor?: 'start' | 'middle' | 'end'; color?: string; weight?: number; rot?: number; key?: string } = {}) => (
    <text key={o.key ?? `${x}-${y}-${t}`} x={x} y={y} fontSize={o.size ?? 11} textAnchor={o.anchor ?? 'middle'} fill={o.color ?? sub} fontWeight={o.weight} transform={o.rot ? `rotate(${o.rot} ${x} ${y})` : undefined}>{t}</text>
  )

  if (!problems.length && !pie) {
    const all = series.flatMap((x) => x.vals).filter(Number.isFinite)
    let lo = Math.min(...all), hi = Math.max(...all)
    if (s.kind === 'stacked') {
      const pos = cats.map((_, i) => series.reduce((a, x) => a + Math.max(0, x.vals[i] || 0), 0))
      const neg = cats.map((_, i) => series.reduce((a, x) => a + Math.min(0, x.vals[i] || 0), 0))
      lo = Math.min(...neg); hi = Math.max(...pos)
    }
    if (s.zero || s.kind.includes('bar') || s.kind === 'stacked' || s.kind === 'area') { lo = Math.min(0, lo); hi = Math.max(0, hi) }
    if (s.values) hi += (hi - lo) * 0.06 // room for value labels
    const sc = niceScale(lo, hi, Math.max(3, Math.round((s.kind === 'hbar' ? pw : ph) / 60)))
    const horiz = s.kind === 'hbar'
    const val = (v: number) => (horiz ? left + ((v - sc.min) / (sc.max - sc.min)) * pw : top + ph - ((v - sc.min) / (sc.max - sc.min)) * ph)
    // X for scatter is numeric
    const xs = s.kind === 'scatter' ? table.rows.map((r) => toNumber(r[labelCol])) : []
    const xsc = s.kind === 'scatter' ? niceScale(Math.min(...xs.filter(Number.isFinite)), Math.max(...xs.filter(Number.isFinite)), Math.max(3, Math.round(pw / 90))) : null
    const xAt = (v: number) => left + ((v - xsc!.min) / (xsc!.max - xsc!.min)) * pw
    sc.ticks.forEach((t) => {
      const p = val(t)
      if (s.grid || t === 0) body.push(horiz ? <line key={`g${t}`} x1={p} x2={p} y1={top} y2={top + ph} stroke={t === 0 ? sub : gridC} /> : <line key={`g${t}`} x1={left} x2={left + pw} y1={p} y2={p} stroke={t === 0 && sc.min < 0 ? sub : gridC} />)
      body.push(horiz ? T(p, top + ph + 16, short(t), { key: `t${t}` }) : T(left - 8, p + 4, short(t), { anchor: 'end', key: `t${t}` }))
    })
    if (xsc) xsc.ticks.forEach((t) => {
      if (s.grid) body.push(<line key={`xg${t}`} x1={xAt(t)} x2={xAt(t)} y1={top} y2={top + ph} stroke={gridC} />)
      body.push(T(xAt(t), top + ph + 16, short(t), { key: `xt${t}` }))
    })
    else cats.forEach((c, i) => {
      const step = Math.ceil(cats.length / Math.max(1, Math.floor((horiz ? ph : pw) / (tilt ? 16 : 40))))
      if (i % step) return
      const mid = (horiz ? top : left) + (i + 0.5) * band
      body.push(horiz ? T(left - 8, mid + 4, c, { anchor: 'end', key: `c${i}` }) : tilt ? T(mid, top + ph + 14, c, { anchor: 'end', rot: -40, key: `c${i}` }) : T(mid, top + ph + 16, c, { key: `c${i}` }))
    })
    const base = val(Math.max(sc.min, Math.min(0, sc.max)))
    if (s.kind === 'bar' || s.kind === 'hbar') {
      const bw = (band * 0.78) / series.length
      series.forEach((x, k) => x.vals.forEach((v, i) => {
        if (!Number.isFinite(v)) return
        const o = i * band + band * 0.11 + k * bw, p = val(v)
        const r = horiz ? { x: Math.min(p, base), y: top + o, width: Math.abs(p - base), height: bw * 0.92 } : { x: left + o, y: Math.min(p, base), width: bw * 0.92, height: Math.abs(p - base) }
        body.push(<rect key={`b${k}-${i}`} {...r} fill={x.color} rx={1.5}><title>{`${x.name} · ${cats[i]}: ${v}`}</title></rect>)
        if (s.values) body.push(horiz ? T(p + (v < 0 ? -4 : 4), top + o + bw * 0.46 + 4, short(v), { anchor: v < 0 ? 'end' : 'start', size: 10, color: fg, key: `v${k}-${i}` }) : T(left + o + bw * 0.46, p + (v < 0 ? 12 : -4), short(v), { size: 10, color: fg, key: `v${k}-${i}` }))
      }))
    }
    if (s.kind === 'stacked') {
      cats.forEach((_, i) => {
        let up = 0, dn = 0
        series.forEach((x, k) => {
          const v = x.vals[i] || 0
          const a = v >= 0 ? up : dn, b = a + v
          if (v >= 0) up = b; else dn = b
          body.push(<rect key={`s${k}-${i}`} x={left + i * band + band * 0.15} y={Math.min(val(a), val(b))} width={band * 0.7} height={Math.abs(val(a) - val(b))} fill={x.color}><title>{`${x.name} · ${cats[i]}: ${v}`}</title></rect>)
        })
        if (s.values) body.push(T(left + (i + 0.5) * band, val(up) - 4, short(up + dn), { size: 10, color: fg, key: `st${i}` }))
      })
    }
    if (s.kind === 'line' || s.kind === 'area') {
      series.forEach((x, k) => {
        const pts = x.vals.map((v, i) => [left + (i + 0.5) * band, val(v)] as [number, number]).filter((p, i) => Number.isFinite(x.vals[i]) && Number.isFinite(p[1]))
        if (!pts.length) return
        const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('')
        if (s.kind === 'area') body.push(<path key={`a${k}`} d={`${d}L${pts[pts.length - 1][0]} ${base}L${pts[0][0]} ${base}Z`} fill={x.color} opacity={0.18} />)
        body.push(<path key={`l${k}`} d={d} fill="none" stroke={x.color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />)
        pts.forEach((p, i) => body.push(<circle key={`p${k}-${i}`} cx={p[0]} cy={p[1]} r={3.2} fill={x.color}><title>{`${x.name} · ${cats[i]}: ${x.vals[i]}`}</title></circle>))
        if (s.values) pts.forEach((p, i) => body.push(T(p[0], p[1] - 8, short(x.vals[i]), { size: 10, color: fg, key: `lv${k}-${i}` })))
      })
    }
    if (s.kind === 'scatter' && xsc) {
      series.forEach((x, k) => {
        const pts = xs.map((xv, i) => [xv, x.vals[i]]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b))
        pts.forEach(([a, b], i) => body.push(<circle key={`sc${k}-${i}`} cx={xAt(a)} cy={val(b)} r={4.5} fill={x.color} opacity={0.85}><title>{`(${a}, ${b})`}</title></circle>))
        if (s.trend && pts.length > 2) {
          const n = pts.length, mx = pts.reduce((q, p) => q + p[0], 0) / n, my = pts.reduce((q, p) => q + p[1], 0) / n
          const sxy = pts.reduce((q, p) => q + (p[0] - mx) * (p[1] - my), 0), sxx = pts.reduce((q, p) => q + (p[0] - mx) ** 2, 0), syy = pts.reduce((q, p) => q + (p[1] - my) ** 2, 0)
          if (sxx > 0) {
            const m = sxy / sxx, b0 = my - m * mx, r2 = syy ? (sxy * sxy) / (sxx * syy) : 1
            body.push(<line key={`tr${k}`} x1={xAt(xsc.min)} x2={xAt(xsc.max)} y1={val(b0 + m * xsc.min)} y2={val(b0 + m * xsc.max)} stroke={x.color} strokeDasharray="6 4" strokeWidth={1.5} clipPath="url(#cb-plot)" />)
            body.push(T(left + 8, top + 14 + k * 14, `y = ${+m.toFixed(3)}x ${b0 < 0 ? '−' : '+'} ${+Math.abs(b0).toFixed(2)} · R² = ${r2.toFixed(3)}`, { anchor: 'start', color: x.color, key: `eq${k}` }))
          }
        }
      })
    }
    body.push(<line key="ax" x1={left} x2={horiz ? left : left + pw} y1={top + ph} y2={top + ph} stroke={sub} />)
  }

  if (!problems.length && pie) {
    const vals = series[0].vals.map((v) => (Number.isFinite(v) ? Math.max(0, v) : 0))
    const total = vals.reduce((a, b) => a + b, 0) || 1
    const aw = W - right - 40, ah = H - top - 16
    const r = Math.max(30, Math.min(aw, ah) / 2 - 4), cx = 20 + aw / 2, cy = top + ah / 2
    let a = 0
    vals.forEach((v, i) => {
      const a1 = a + (v / total) * Math.PI * 2
      body.push(<path key={`pie${i}`} d={arcPath(cx, cy, r, s.kind === 'donut' ? r * 0.58 : 0, a, a1)} fill={pal[i % pal.length]} stroke={dark ? '#111827' : '#fff'} strokeWidth={1.5}><title>{`${cats[i]}: ${v} (${((v / total) * 100).toFixed(1)}%)`}</title></path>)
      const mid = (a + a1) / 2, lr = s.kind === 'donut' ? r * 0.79 : r * 0.66
      if (a1 - a > 0.28) body.push(<text key={`pl${i}`} x={cx + lr * Math.sin(mid)} y={cy - lr * Math.cos(mid) + 4} fontSize={11} textAnchor="middle" fill="#fff" fontWeight={700}>{s.values ? short(v) : `${((v / total) * 100).toFixed(0)}%`}</text>)
      a = a1
    })
    if (s.kind === 'donut') { body.push(T(cx, cy + 2, short(total), { size: 20, color: fg, weight: 700, key: 'tot' })); body.push(T(cx, cy + 20, series[0].name, { key: 'totl' })) }
  }

  const legend: ReactNode[] = []
  if (s.legend !== 'none' && legendItems.length > (pie ? 0 : 1)) {
    if (s.legend === 'right') legendItems.forEach((it, i) => legend.push(<g key={`lg${i}`} transform={`translate(${W - right + 14} ${top + 6 + i * 20})`}><rect width={11} height={11} rx={2} fill={it.color} /><text x={17} y={10} fontSize={12} fill={fg}>{it.name.length > 18 ? it.name.slice(0, 17) + '…' : it.name}</text></g>))
    else {
      let x = left
      legendItems.forEach((it, i) => {
        legend.push(<g key={`lg${i}`} transform={`translate(${x} ${top - 22})`}><rect width={11} height={11} rx={2} fill={it.color} /><text x={16} y={10} fontSize={12} fill={fg}>{it.name}</text></g>)
        x += 30 + it.name.length * 6.6
      })
    }
  }

  const svgText = () => {
    const el = svg.current
    if (!el) return ''
    const c = el.cloneNode(true) as SVGSVGElement
    c.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    c.removeAttribute('style')
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(c)
  }
  const fileBase = (s.title || 'chart').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'chart'
  const png = (scale: number) => {
    const img = new Image()
    const url = URL.createObjectURL(new Blob([svgText()], { type: 'image/svg+xml' }))
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = W * scale
      c.height = H * scale
      const g = c.getContext('2d')!
      g.scale(scale, scale)
      g.drawImage(img, 0, 0, W, H)
      URL.revokeObjectURL(url)
      c.toBlob((b) => b && download(`${fileBase}.png`, b), 'image/png')
    }
    img.src = url
  }
  const load = (f: File) => void f.text().then((csv) => set({ csv, series: [], labelCol: 0 }))
  const toggle = (c: number) => {
    const curr = s.series.length ? s.series : numCols
    set({ series: curr.includes(c) ? curr.filter((x) => x !== c) : [...curr, c].sort((a, b) => a - b) })
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="1 · Data" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Select label="Sample data" value="" onChange={(k) => k && set({ ...SAMPLES[k] })} options={[['', 'Load a sample…'], ...Object.keys(SAMPLES).map((k) => [k, k] as [string, string])]} />
          <Area label="CSV (first row = headers; comma, semicolon or tab)" value={s.csv} onChange={(csv) => set({ csv })} rows={9} mono />
          <FileDrop accept=".csv,.tsv,.txt,text/csv" onFiles={(f) => load(f[0])} label="Drop a CSV file here or click to choose" />
          <p className="muted" style={{ fontSize: 13 }}>{table.rows.length} rows · {table.headers.length} columns · numeric: {numCols.map((i) => table.headers[i]).join(', ') || 'none'}</p>
        </Panel>
        <Panel title="2 · Chart">
          <Select label="Chart type" value={s.kind} onChange={(kind) => set({ kind })} options={KINDS} />
          <Select label={s.kind === 'scatter' ? 'X column (numeric)' : 'Labels / categories column'} value={labelCol} onChange={(labelCol) => set({ labelCol })} options={table.headers.map((h, i) => [i, h] as [number, string])} />
          <div className="k-field"><span className="k-label">{pie ? 'Value column (first ticked is used)' : 'Series'}</span>
            <Row>{numCols.filter((c) => c !== labelCol).map((c) => <Check key={c} label={table.headers[c]} value={chosen.includes(c)} onChange={() => toggle(c)} />)}</Row>
          </div>
          <Txt label="Title" value={s.title} onChange={(title) => set({ title })} />
          <Txt label="Subtitle" value={s.subtitle} onChange={(subtitle) => set({ subtitle })} />
          {!pie && <Row><Txt label="X-axis label" value={s.xLabel} onChange={(xLabel) => set({ xLabel })} /><Txt label="Y-axis label" value={s.yLabel} onChange={(yLabel) => set({ yLabel })} /></Row>}
        </Panel>
        <Panel title="3 · Style">
          <Row>
            <Select label="Palette" value={s.palette} onChange={(palette) => set({ palette })} options={Object.keys(PALETTES)} />
            <Select label="Background" value={s.bg} onChange={(bg) => set({ bg })} options={[['white', 'White'], ['transparent', 'Transparent'], ['dark', 'Dark']]} />
          </Row>
          <Row>
            <Select label="Legend" value={s.legend} onChange={(legend) => set({ legend })} options={[['top', 'Top'], ['right', 'Right'], ['none', 'Hidden']]} />
            <Num label="Width" value={s.w} onChange={(w) => set({ w })} min={240} max={3000} unit="px" />
            <Num label="Height" value={s.h} onChange={(h) => set({ h })} min={180} max={2000} unit="px" />
          </Row>
          <Row>
            <Check label="Value labels" value={s.values} onChange={(values) => set({ values })} />
            {!pie && <Check label="Gridlines" value={s.grid} onChange={(grid) => set({ grid })} />}
            {(s.kind === 'line' || s.kind === 'scatter') && <Check label="Start axis at zero" value={s.zero} onChange={(zero) => set({ zero })} />}
            {s.kind === 'scatter' && <Check label="Trend line + R²" value={s.trend} onChange={(trend) => set({ trend })} />}
          </Row>
        </Panel>
      </div>
      <div>
        <Panel title="Chart" actions={<><Btn kind="primary" onClick={() => png(2)} disabled={problems.length > 0}>⬇ PNG</Btn><Btn onClick={() => download(`${fileBase}.svg`, svgText(), 'image/svg+xml')} disabled={problems.length > 0}>⬇ SVG</Btn><CopyButton text={svgText} label="Copy SVG" /></>}>
          {problems.map((p) => <Note key={p} tone="warn">{p}</Note>)}
          <div style={{ overflowX: 'auto', borderRadius: 8, background: s.bg === 'transparent' ? 'repeating-conic-gradient(#e5e7eb 0 25%, #fff 0 50%) 0 0 / 16px 16px' : undefined }}>
            <svg ref={svg} viewBox={`0 0 ${W} ${H}`} width={W} height={H} fontFamily={FONT} style={{ maxWidth: '100%', height: 'auto', display: 'block' }} role="img" aria-label={s.title || 'Chart'}>
              <defs><clipPath id="cb-plot"><rect x={left} y={top} width={Math.max(0, pw)} height={Math.max(0, ph)} /></clipPath></defs>
              {s.bg !== 'transparent' && <rect width={W} height={H} fill={dark ? '#111827' : '#ffffff'} />}
              {s.title && <text x={left} y={30} fontSize={18} fontWeight={700} fill={fg}>{s.title}</text>}
              {s.subtitle && <text x={left} y={s.title ? 50 : 30} fontSize={12} fill={sub}>{s.subtitle}</text>}
              {!pie && s.yLabel && <text x={14} y={top + ph / 2} fontSize={12} fill={sub} textAnchor="middle" transform={`rotate(-90 14 ${top + ph / 2})`}>{s.yLabel}</text>}
              {!pie && s.xLabel && <text x={left + pw / 2} y={H - 8} fontSize={12} fill={sub} textAnchor="middle">{s.xLabel}</text>}
              {body}
              {legend}
            </svg>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>Hover marks for exact values. PNG exports at 2× ({W * 2}×{H * 2}px) for sharp slides; SVG stays editable in Figma, Illustrator or Inkscape.</p>
        </Panel>
        <Panel title="Data preview">
          <Table head={table.headers} rows={table.rows.map((r) => r.map((c, i) => (table.numeric[i] ? <span key={i} style={{ fontVariantNumeric: 'tabular-nums' }}>{c}</span> : c)))} max={10} />
        </Panel>
      </div>
    </Split>
  )
}
