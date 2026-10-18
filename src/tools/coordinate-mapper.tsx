import { useEffect, useMemo, useRef, useState } from 'react'
import { Area, Btn, Check, color, CopyButton, download, FileDrop, Legend, Note, num, Panel, PALETTE, Row, Select, Slider, Split, Stat, Stats, Table, toCsv, useToolState } from '../kit'
import { parseCsv } from './lib/chart-builder'
import { bbox, colorOf, colorScale, detect, gridCluster, rampCss, toGeoJSON, toPoints, type Pick } from './lib/coordinate-mapper'
import { fitView, project, tiles, toScreen, type View } from './lib/dog-walk-tracker'

const SAMPLE = `Office,Country,Team,Latitude,Longitude,Staff
London HQ,United Kingdom,Sales,51.5074,-0.1278,240
Manchester,United Kingdom,Support,53.4808,-2.2426,45
Edinburgh,United Kingdom,Engineering,55.9533,-3.1883,38
Dublin,Ireland,Support,53.3498,-6.2603,72
Paris,France,Sales,48°51'24"N,2°21'08"E,130
Lyon,France,Ops,45.7640,4.8357,22
Amsterdam,Netherlands,Engineering,52.3676,4.9041,96
Rotterdam,Netherlands,Ops,51.9244,4.4777,31
Brussels,Belgium,Sales,50.8503,4.3517,27
Berlin,Germany,Engineering,52.5200,13.4050,160
Hamburg,Germany,Sales,53.5511,9.9937,41
Frankfurt,Germany,Ops,50.1109,8.6821,35
Munich,Germany,Engineering,48.1351,11.5820,88
Zurich,Switzerland,Engineering,47.3769,8.5417,54
Vienna,Austria,Support,48.2082,16.3738,33
Prague,Czechia,Engineering,50.0755,14.4378,61
Warsaw,Poland,Engineering,52.2297,21.0122,74
Kraków,Poland,Support,50.0647,19.9450,48
Kyiv,Ukraine,Engineering,50°27'00"N,30°31'24"E,120
Lviv,Ukraine,Engineering,49.8397,24.0297,66
Budapest,Hungary,Support,47.4979,19.0402,29
Copenhagen,Denmark,Sales,55.6761,12.5683,25
Stockholm,Sweden,Engineering,59.3293,18.0686,57
Oslo,Norway,Sales,59.9139,10.7522,18
Helsinki,Finland,Engineering,60.1699,24.9384,30
Madrid,Spain,Sales,40.4168,-3.7038,64
Barcelona,Spain,Engineering,41.3874,2.1686,83
Lisbon,Portugal,Support,38.7223,-9.1393,52
Porto,Portugal,Engineering,41.1579,-8.6291,23
Milan,Italy,Sales,45.4642,9.1900,47
Rome,Italy,Ops,41.9028,12.4964,19
Athens,Greece,Support,37.9838,23.7275,21
Istanbul,Türkiye,Sales,41.0082,28.9784,36
New York,United States,Sales,40°42'46"N,74°00'22"W,150
Boston,United States,Engineering,42.3601,-71.0589,44
Toronto,Canada,Support,43.6532,-79.3832,39
São Paulo,Brazil,Sales,-23.5505,-46.6333,28
Cape Town,South Africa,Support,-33.9249,18.4241,17
Singapore,Singapore,Ops,1.3521,103.8198,34
Tokyo,Japan,Sales,35.6762,139.6503,26
Sydney,Australia,Support,33°52'08"S,151°12'33"E,31
Remote team,—,Engineering,n/a,n/a,58`

const DEF = { csv: SAMPLE, latCol: -2, lonCol: -2, combCol: -2, labelCol: 0, colorCol: 2, swap: false, cluster: true, cell: 56, tiles: true, labels: false, size: 7 }
const W = 820, H = 520

export default function CoordinateMapper() {
  const [s, set, reset] = useToolState('coordinate-mapper', DEF)
  const table = useMemo(() => parseCsv(s.csv), [s.csv])
  const header = useMemo(() => table[0] ?? [], [table])
  const rows = useMemo(() => table.slice(1), [table])
  const auto = useMemo(() => detect(header, rows), [header, rows])
  // -2 = automatic
  const pick: Pick = s.latCol === -2 && s.lonCol === -2 && s.combCol === -2 ? auto : { lat: s.latCol === -2 ? auto.lat : s.latCol, lon: s.lonCol === -2 ? auto.lon : s.lonCol, combined: s.combCol === -2 ? -1 : s.combCol }
  const { pts, bad } = useMemo(() => toPoints(rows, pick, s.swap), [rows, pick.lat, pick.lon, pick.combined, s.swap]) // eslint-disable-line react-hooks/exhaustive-deps
  const scale = useMemo(() => colorScale(rows, s.colorCol), [rows, s.colorCol])
  const fit = () => fitView(pts.map((p) => [p.lat, p.lon]), W, H, 50, 16)
  const [view, setView] = useState<View | null>(null)
  const [fitKey, setFitKey] = useState('')
  const key = `${pts.length}:${pick.lat}:${pick.lon}:${pick.combined}:${s.swap}:${s.csv.length}`
  if (key !== fitKey) {
    setFitKey(key)
    setView(null)
  }
  const v = view ?? fit()
  const [sel, setSel] = useState<number | null>(null)
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const clusters = useMemo(() => (s.cluster ? gridCluster(pts, v.z, s.cell) : pts.map((_, i) => ({ ...pts[i], x: 0, y: 0, members: [i] }))), [pts, v.z, s.cell, s.cluster])
  const colOf = (i: number) => colorOf(scale, rows[pts[i].row]?.[s.colorCol], PALETTE)
  const toVB = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H]
  }
  const zoomAt = (mx: number, my: number, dz: number) => {
    const z = Math.max(1, Math.min(18, v.z + dz))
    const k = 2 ** (z - v.z)
    const wx = v.cx + (mx - W / 2), wy = v.cy + (my - H / 2)
    setView({ ...v, z, cx: wx * k - (mx - W / 2), cy: wy * k - (my - H / 2) })
  }
  const wheel = useRef<(e: WheelEvent) => void>(() => {})
  useEffect(() => {
    wheel.current = (e: WheelEvent) => {
      e.preventDefault()
      const [mx, my] = toVB(e)
      zoomAt(mx, my, e.deltaY < 0 ? 1 : -1)
    }
  })
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const h = (e: WheelEvent) => wheel.current(e)
    el.addEventListener('wheel', h, { passive: false })
    return () => el.removeEventListener('wheel', h)
  }, [])
  const opts = (none: string) => [[-1, none] as [number, string], ...header.map((h, i) => [i, h || `Column ${i + 1}`] as [number, string])]
  const selRow = sel !== null ? rows[sel] : null
  const geo = () => toGeoJSON(header, rows, pts, pick.combined >= 0 ? [] : [pick.lat, pick.lon])
  const legendItems: [string, string][] = scale.kind === 'cat' ? scale.values.map((val, i) => [val, color(i)]) : []

  return (
    <Split wide="right">
      <div>
        <Panel title="Data" actions={<><Btn kind="ghost" onClick={() => set({ csv: SAMPLE, latCol: -2, lonCol: -2, combCol: -2, labelCol: 0, colorCol: 2 })}>Sample</Btn><Btn kind="ghost" onClick={reset}>Reset</Btn></>}>
          <FileDrop accept=".csv,.tsv,.txt,text/csv" label="Drop a CSV / TSV file or click to choose" onFiles={async ([f]) => set({ csv: await f.text(), latCol: -2, lonCol: -2, combCol: -2, labelCol: 0, colorCol: -1 })} />
          <Area value={s.csv} onChange={(csv) => set({ csv })} rows={7} mono placeholder="name,lat,lon…" />
          <p className="muted" style={{ fontSize: 13 }}>First row = headers. Decimal degrees, DMS (48°51'24"N), DDM (33°52.1'S), comma decimals or one “lat, lon” column all work.</p>
        </Panel>
        <Panel title="Columns">
          <Note tone={pick.combined >= 0 || (pick.lat >= 0 && pick.lon >= 0) ? 'ok' : 'warn'}>
            {pick.combined >= 0 ? `Coordinates read from “${header[pick.combined]}”.` : pick.lat >= 0 && pick.lon >= 0 ? `Latitude: “${header[pick.lat]}” · Longitude: “${header[pick.lon]}”.` : 'No coordinate columns found — pick them below.'}
          </Note>
          <Row>
            <Select label="Latitude" value={s.latCol} onChange={(latCol) => set({ latCol, combCol: -2 })} options={[[-2, `Auto (${auto.lat >= 0 ? header[auto.lat] : '—'})`], ...opts('—')]} />
            <Select label="Longitude" value={s.lonCol} onChange={(lonCol) => set({ lonCol, combCol: -2 })} options={[[-2, `Auto (${auto.lon >= 0 ? header[auto.lon] : '—'})`], ...opts('—')]} />
          </Row>
          <Select label="…or one combined “lat, lon” column" value={s.combCol} onChange={(combCol) => set({ combCol })} options={[[-2, auto.combined >= 0 ? `Auto (${header[auto.combined]})` : 'Not used'], ...opts('—').slice(1)]} />
          <Check label="Swap latitude/longitude" value={s.swap} onChange={(swap) => set({ swap })} />
          <Row>
            <Select label="Label" value={s.labelCol} onChange={(labelCol) => set({ labelCol })} options={opts('None')} />
            <Select label="Colour by" value={s.colorCol} onChange={(colorCol) => set({ colorCol })} options={opts('Single colour')} />
          </Row>
        </Panel>
        <Panel title="Map">
          <Check label="Cluster nearby markers" value={s.cluster} onChange={(cluster) => set({ cluster })} />
          {s.cluster && <Slider label="Cluster cell" value={s.cell} min={24} max={140} step={4} unit=" px" onChange={(cell) => set({ cell })} />}
          <Slider label="Marker size" value={s.size} min={3} max={14} onChange={(size) => set({ size })} />
          <Check label="Show labels" value={s.labels} onChange={(labels) => set({ labels })} />
          <Check label="OpenStreetMap tiles (loads map images from openstreetmap.org)" value={s.tiles} onChange={(t) => set({ tiles: t })} />
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Rows" value={num(rows.length, 0)} />
          <Stat label="Plotted" value={num(pts.length, 0)} tone="accent" />
          <Stat label="Unreadable" value={bad.length} tone={bad.length ? 'bad' : 'good'} />
          <Stat label={s.cluster ? 'Clusters' : 'Markers'} value={clusters.length} sub={`zoom ${v.z}`} />
        </Stats>
        <Panel
          title="Map"
          actions={
            <>
              <Btn onClick={() => zoomAt(W / 2, H / 2, 1)} title="Zoom in">＋</Btn>
              <Btn onClick={() => zoomAt(W / 2, H / 2, -1)} title="Zoom out">－</Btn>
              <Btn onClick={() => setView(null)}>Fit</Btn>
            </>
          }
        >
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            style={{ width: '100%', display: 'block', borderRadius: 10, border: '1px solid var(--line)', background: s.tiles ? '#dbe7ef' : 'color-mix(in srgb, #0ea5e9 8%, var(--panel))', touchAction: 'none', cursor: 'grab', userSelect: 'none' }}
            onPointerDown={(e) => {
              drag.current = { x: e.clientX, y: e.clientY, cx: v.cx, cy: v.cy, moved: false }
              e.currentTarget.setPointerCapture(e.pointerId)
            }}
            onPointerMove={(e) => {
              const d = drag.current
              if (!d) return
              const r = svgRef.current!.getBoundingClientRect()
              const dx = ((e.clientX - d.x) / r.width) * W, dy = ((e.clientY - d.y) / r.height) * H
              if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true
              if (d.moved) setView({ ...v, cx: d.cx - dx, cy: d.cy - dy })
            }}
            onPointerUp={() => setTimeout(() => (drag.current = null))}
          >
            {s.tiles && tiles({ ...v, w: W, h: H }).map((t) => <image key={`${t.z}/${t.x}/${t.y}/${t.sx}`} href={`https://tile.openstreetmap.org/${t.z}/${t.x}/${t.y}.png`} x={t.sx} y={t.sy} width={256} height={256} />)}
            {!s.tiles &&
              [-60, -30, 0, 30, 60].map((lat) => {
                const [, y] = toScreen([lat, 0], { ...v, w: W, h: H })
                return <line key={lat} x1={0} x2={W} y1={y} y2={y} stroke="var(--line)" strokeDasharray="4 6" />
              })}
            {clusters.map((c, ci) => {
              const n = c.members.length
              const [x, y] = toScreen([c.lat, c.lon], { ...v, w: W, h: H })
              if (x < -40 || y < -40 || x > W + 40 || y > H + 40) return null
              if (n === 1) {
                const i = c.members[0]
                const on = sel === pts[i].row
                return (
                  <g key={ci} transform={`translate(${x} ${y})`} style={{ cursor: 'pointer' }} onClick={() => !drag.current?.moved && setSel(pts[i].row)}>
                    <circle r={on ? s.size + 4 : s.size} fill={colOf(i)} stroke="#fff" strokeWidth={2} />
                    {s.labels && s.labelCol >= 0 && <text x={s.size + 4} y={4} fontSize={12} fontWeight={600} fill="#0f172a" stroke="#fff" strokeWidth={3} paintOrder="stroke">{rows[pts[i].row]?.[s.labelCol]}</text>}
                    <title>{rows[pts[i].row]?.[s.labelCol >= 0 ? s.labelCol : 0]}</title>
                  </g>
                )
              }
              const counts = new Map<string, number>()
              c.members.forEach((i) => counts.set(colOf(i), (counts.get(colOf(i)) ?? 0) + 1))
              const r = 12 + Math.sqrt(n) * 4
              let a0 = -Math.PI / 2
              return (
                <g key={ci} transform={`translate(${x} ${y})`} style={{ cursor: 'zoom-in' }} onClick={() => {
                  if (drag.current?.moved) return
                  const z = Math.min(18, v.z + 2)
                  const [wx, wy] = project([c.lat, c.lon], z)
                  setView({ ...v, z, cx: wx, cy: wy })
                }}>
                  <circle r={r + 3} fill="#fff" opacity={0.85} />
                  {[...counts.entries()].map(([col, k]) => {
                    const a1 = a0 + (k / n) * Math.PI * 2
                    const large = a1 - a0 > Math.PI ? 1 : 0
                    const d = k === n ? `M0 ${-r}A${r} ${r} 0 1 1 -0.01 ${-r}Z` : `M0 0L${r * Math.cos(a0)} ${r * Math.sin(a0)}A${r} ${r} 0 ${large} 1 ${r * Math.cos(a1)} ${r * Math.sin(a1)}Z`
                    a0 = a1
                    return <path key={col} d={d} fill={col} />
                  })}
                  <circle r={r * 0.58} fill="#fff" />
                  <text textAnchor="middle" y={4} fontSize={12} fontWeight={700} fill="#0f172a">{n}</text>
                  <title>{`${n} points — click to zoom in`}</title>
                </g>
              )
            })}
            {s.tiles && <text x={W - 6} y={H - 6} fontSize={11} textAnchor="end" fill="#334155">© OpenStreetMap contributors</text>}
          </svg>
          {scale.kind === 'cat' && <Legend items={legendItems} />}
          {scale.kind === 'num' && (
            <Row wrap={false}>
              <span className="muted" style={{ fontSize: 12 }}>{num(scale.min)}</span>
              <span style={{ flex: 1, height: 10, borderRadius: 5, background: rampCss }} />
              <span className="muted" style={{ fontSize: 12 }}>{num(scale.max)}</span>
            </Row>
          )}
          <p className="muted" style={{ fontSize: 12 }}>Drag to pan, scroll or ＋/－ to zoom, click a cluster to zoom into it, click a marker for its row.</p>
          {selRow && (
            <div style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 10 }}>
              <Row>
                <b style={{ flex: 1 }}>{selRow[s.labelCol >= 0 ? s.labelCol : 0]}</b>
                <Btn kind="ghost" onClick={() => setSel(null)}>✕</Btn>
              </Row>
              <Table head={['Field', 'Value']} rows={header.map((h, i) => [h, selRow[i] ?? ''])} />
            </div>
          )}
        </Panel>
        <Panel
          title="Export"
          actions={
            <>
              <Btn kind="primary" disabled={!pts.length} onClick={() => download('points.geojson', geo(), 'application/geo+json')}>⬇ GeoJSON</Btn>
              <Btn disabled={!pts.length} onClick={() => download('points-decimal.csv', toCsv([[...header, 'lat_dd', 'lon_dd'], ...pts.map((p) => [...rows[p.row], p.lat.toFixed(6), p.lon.toFixed(6)])]), 'text/csv')}>⬇ CSV (decimal)</Btn>
              <CopyButton text={geo} label="Copy GeoJSON" />
            </>
          }
        >
          {(() => {
            const b = bbox(pts)
            return b ? <p className="muted" style={{ margin: 0 }}>Bounding box: {b.s.toFixed(4)}, {b.w.toFixed(4)} → {b.n.toFixed(4)}, {b.e.toFixed(4)} (S, W → N, E)</p> : <p className="muted">Nothing plotted yet.</p>
          })()}
          {bad.length > 0 && (
            <>
              <Note tone="warn">{bad.length} row{bad.length === 1 ? '' : 's'} could not be placed (empty, out-of-range or 0,0 coordinates).</Note>
              <Table head={['Row', ...header.slice(0, 5)]} rows={bad.map((i) => [i + 2, ...rows[i].slice(0, 5)])} max={10} />
            </>
          )}
        </Panel>
      </div>
    </Split>
  )
}
