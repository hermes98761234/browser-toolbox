import { useEffect, useRef, useState } from 'react'
import { Btn, Check, CopyButton, CsvButton, download, FileDrop, Note, Num, num, Panel, Row, Seg, Select, shareLink, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { project, ringArea, unproject, worldSize } from './lib/field-area-measurer'
import { parseGpx, simplify } from './lib/gpx-track-viewer'
import { circle, compass, fmtDist, fmtDur, greatCirclePath, legs, linesFromGeoJSON, toGeoJSON, toGpx, UNIT_M, type LonLat, type Method, type Unit } from './lib/map-distance-measurer'

type Mode = 'walk' | 'hike' | 'run' | 'bike' | 'car' | 'boat' | 'plane' | 'custom'
const SPEEDS: Record<Mode, [string, number]> = {
  walk: ['🚶 Walk', 5], hike: ['🥾 Hike (flat)', 4], run: ['🏃 Run', 10], bike: ['🚲 Bike', 18], car: ['🚗 Car (mixed)', 55], boat: ['⛵ Sail (6 kn)', 11.1], plane: ['✈️ Airliner', 830], custom: ['⚙️ Custom', 0],
}
interface Route { id: string; name: string; color: string; pts: LonLat[]; mode: Mode; closed: boolean }
interface Ring { id: string; c: LonLat; r: number }
interface State { center: LonLat; zoom: number; layer: 'osm' | 'sat'; unit: Unit; method: Method; custom: number; routes: Route[]; rings: Ring[]; sel: string; ringR: number }

const COLORS = ['#e11d48', '#2563eb', '#16a34a', '#9333ea', '#ea580c', '#0891b2']
const DEF: State = {
  center: [-0.1040, 51.5060], zoom: 14, layer: 'osm', unit: 'km', method: 'gc', custom: 7, sel: 'r1', ringR: 1000,
  routes: [
    { id: 'r1', name: 'Thames walk', color: COLORS[0], mode: 'walk', closed: false, pts: [[-0.12459, 51.50073], [-0.12280, 51.50630], [-0.12804, 51.50797], [-0.11594, 51.51097], [-0.09843, 51.51383], [-0.08605, 51.50974], [-0.07539, 51.50551]] },
    { id: 'r2', name: 'South Bank ride', color: COLORS[1], mode: 'bike', closed: false, pts: [[-0.11954, 51.50330], [-0.10810, 51.50740], [-0.09535, 51.50760], [-0.08770, 51.50450], [-0.07539, 51.50551]] },
  ],
  rings: [{ id: 'g1', c: [-0.12459, 51.50073], r: 500 }],
}
const TILES = {
  osm: { url: (z: number, x: number, y: number) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`, attr: '© OpenStreetMap contributors' },
  sat: { url: (z: number, x: number, y: number) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`, attr: 'Imagery © Esri, Maxar, Earthstar Geographics' },
}

export default function MapDistanceMeasurer() {
  const [s, set, reset] = useToolState<State>('map-distance-measurer', DEF)
  const [tool, setTool] = useState<'draw' | 'ring'>('draw')
  const [vSel, setVSel] = useState(-1)
  const [size, setSize] = useState({ w: 800, h: 500 })
  const [err, setErr] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const drag = useRef<{ kind: 'pan' | 'vertex'; i: number; x: number; y: number; c: [number, number]; moved: boolean } | null>(null)
  const route = s.routes.find((r) => r.id === s.sel) ?? s.routes[0]
  const z = s.zoom
  const W = worldSize(z)
  const cpx = project(s.center, z)
  const tl: [number, number] = [cpx[0] - size.w / 2, cpx[1] - size.h / 2]
  const wrapX = (x: number) => x - Math.round((x - cpx[0]) / W) * W
  const scr = (p: LonLat): [number, number] => { const q = project(p, z); return [wrapX(q[0]) - tl[0], q[1] - tl[1]] }
  const local = (e: { clientX: number; clientY: number }): [number, number] => { const r = box.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] }
  const at = (lx: number, ly: number): LonLat => { const p = unproject([tl[0] + lx, tl[1] + ly], z); return [((p[0] + 540) % 360) - 180, p[1]] }
  const editR = (p: Partial<Route>) => route && set((st) => ({ ...st, routes: st.routes.map((r) => (r.id === route.id ? { ...r, ...p } : r)) }))

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }))
    ro.observe(el)
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const lx = e.clientX - r.left, ly = e.clientY - r.top
      set((st) => {
        const z2 = Math.max(2, Math.min(19, st.zoom + (e.deltaY < 0 ? 1 : -1)))
        if (z2 === st.zoom) return st
        const c = project(st.center, st.zoom)
        const under = unproject([c[0] - r.width / 2 + lx, c[1] - r.height / 2 + ly], st.zoom)
        const u2 = project(under, z2)
        return { ...st, zoom: z2, center: unproject([u2[0] - lx + r.width / 2, u2[1] - ly + r.height / 2], z2) }
      })
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => { ro.disconnect(); el.removeEventListener('wheel', wheel) }
  }, [set])

  const onDown = (e: React.PointerEvent) => {
    const t = e.target as SVGElement
    const vi = t.dataset?.vi, mi = t.dataset?.mi
    e.currentTarget.setPointerCapture(e.pointerId)
    if (mi !== undefined && route) {
      const i = Number(mi)
      const a = route.pts[i], b = route.pts[(i + 1) % route.pts.length]
      const pts = [...route.pts]
      pts.splice(i + 1, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])
      editR({ pts })
      drag.current = { kind: 'vertex', i: i + 1, x: e.clientX, y: e.clientY, c: cpx, moved: true }
      return
    }
    drag.current = { kind: vi !== undefined ? 'vertex' : 'pan', i: vi !== undefined ? Number(vi) : -1, x: e.clientX, y: e.clientY, c: cpx, moved: false }
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x, dy = e.clientY - d.y
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true
    if (!d.moved) return
    if (d.kind === 'pan') set({ center: unproject([d.c[0] - dx, d.c[1] - dy], z) })
    else { const p = at(...local(e)); editR({ pts: route!.pts.map((q, j) => (j === d.i ? p : q)) }) }
  }
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current
    drag.current = null
    if (!d || d.moved) return
    if (d.kind === 'vertex') { setVSel(d.i); return }
    const p = at(...local(e))
    if (tool === 'draw' && route) { editR({ pts: [...route.pts, p] }); setVSel(-1) }
    else if (tool === 'ring') set({ rings: [...s.rings, { id: uid(), c: p, r: s.ringR }] })
  }

  const fit = (pts: LonLat[]) => {
    if (!pts.length) return
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
    const c: LonLat = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]
    let zz = 18
    while (zz > 2) {
      const a = project([Math.min(...xs), Math.max(...ys)], zz), b = project([Math.max(...xs), Math.min(...ys)], zz)
      if (b[0] - a[0] < size.w * 0.85 && b[1] - a[1] < size.h * 0.85) break
      zz--
    }
    set({ center: c, zoom: zz })
  }

  const importFile = async (f: File) => {
    setErr('')
    const text = await f.text()
    let lines: { name: string; pts: LonLat[] }[] = []
    try {
      if (/<gpx[\s>]/.test(text)) {
        const g = parseGpx(text)
        lines = g.tracks.map((t) => {
          let p = t.points, tol = 2
          while (p.length > 400) p = simplify(t.points, (tol *= 2))
          return { name: t.name, pts: p.map((q) => [q.lon, q.lat] as LonLat) }
        })
        if (!lines.length && g.wpts.length > 1) lines = [{ name: f.name, pts: g.wpts.map((w) => [w.lon, w.lat] as LonLat) }]
      } else lines = linesFromGeoJSON(JSON.parse(text))
    } catch { lines = [] }
    if (!lines.length) return setErr('No lines found (GPX tracks/routes or GeoJSON LineStrings expected).')
    const added: Route[] = lines.map((l, i) => ({ id: uid(), name: l.name || f.name, color: COLORS[(s.routes.length + i) % COLORS.length], pts: l.pts, mode: 'walk', closed: false }))
    set({ routes: [...s.routes, ...added], sel: added[0].id })
    fit(added.flatMap((r) => r.pts))
  }

  // measurements
  const speed = (r: Route) => (r.mode === 'custom' ? s.custom : SPEEDS[r.mode][1])
  const ptsOf = (r: Route) => (r.closed && r.pts.length > 2 ? [...r.pts, r.pts[0]] : r.pts)
  const lg = route ? legs(ptsOf(route), s.method) : []
  const total = lg.at(-1)?.cum ?? 0
  const hours = total / 1000 / Math.max(0.01, speed(route ?? s.routes[0]))
  const area = route && route.closed && route.pts.length > 2 ? ringArea(route.pts) : 0
  const straight = route && route.pts.length > 1 ? legs([route.pts[0], route.pts[route.pts.length - 1]], s.method)[0] : null

  // tiles
  const t0 = [Math.floor(tl[0] / 256), Math.floor(tl[1] / 256)], t1 = [Math.floor((tl[0] + size.w) / 256), Math.floor((tl[1] + size.h) / 256)]
  const n = 2 ** z
  const tiles: [number, number][] = []
  for (let x = t0[0]; x <= t1[0]; x++) for (let y = t0[1]; y <= t1[1]; y++) if (y >= 0 && y < n) tiles.push([x, y])
  const pathD = (pts: LonLat[]) => {
    if (pts.length < 2) return ''
    const dense: LonLat[] = s.method === 'gc' ? pts.slice(1).reduce<LonLat[]>((acc, p, i) => acc.concat(greatCirclePath(pts[i], p, 48).slice(i ? 1 : 0)), []) : pts
    const first = scr(dense[0])
    const off = first[0] - (project(dense[0], z)[0] - tl[0])
    return dense.map((p, i) => { const q = project(p, z); return `${i ? 'L' : 'M'}${(q[0] - tl[0] + off).toFixed(1)},${(q[1] - tl[1]).toFixed(1)}` }).join('')
  }
  const mpp = (156543.03392 * Math.cos((s.center[1] * Math.PI) / 180)) / 2 ** z
  const barM = (() => { const target = mpp * 120; const p = 10 ** Math.floor(Math.log10(target)); return [1, 2, 5, 10].map((k) => k * p).filter((v) => v <= target).pop() ?? p })()
  const unitM = UNIT_M[s.unit]
  const shareState = { center: s.center.map((v) => +v.toFixed(5)), zoom: s.zoom, unit: s.unit, method: s.method, routes: s.routes.map((r) => ({ ...r, pts: r.pts.map((p) => [+p[0].toFixed(5), +p[1].toFixed(5)]) })), rings: s.rings, sel: s.sel }

  return (
    <Split wide="right">
      <div>
        <Panel title="Routes" actions={<Btn onClick={() => { const r: Route = { id: uid(), name: `Route ${s.routes.length + 1}`, color: COLORS[s.routes.length % COLORS.length], pts: [], mode: 'walk', closed: false }; set({ routes: [...s.routes, r], sel: r.id }); setTool('draw') }}>+ Route</Btn>}>
          {s.routes.map((r) => {
            const d = legs(ptsOf(r), s.method).at(-1)?.cum ?? 0
            return (
              <div key={r.id} onClick={() => { set({ sel: r.id }); setVSel(-1) }} style={{ cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center', padding: '6px 8px', borderRadius: 8, border: `1px solid ${r.id === route?.id ? 'var(--accent)' : 'var(--line)'}`, marginBottom: 6 }}>
                <i style={{ width: 14, height: 14, borderRadius: 4, background: r.color }} />
                <b style={{ flex: 1 }}>{r.name}</b>
                <span>{fmtDist(d, s.unit)}</span>
                <span className="muted" style={{ fontSize: 12 }}>{fmtDur(d / 1000 / Math.max(0.01, speed(r)))}</span>
              </div>
            )
          })}
          {route && (
            <>
              <Row>
                <Txt label="Name" value={route.name} onChange={(name) => editR({ name })} />
                <Select label="Travel mode" value={route.mode} onChange={(mode) => editR({ mode })} options={Object.entries(SPEEDS).map(([k, [l, v]]) => [k as Mode, v ? `${l} · ${v} km/h` : l] as [Mode, string])} />
              </Row>
              {route.mode === 'custom' && <Num label="Custom speed" value={s.custom} onChange={(custom) => set({ custom: Math.max(0.1, custom) })} unit="km/h" min={0.1} />}
              <Row>
                <Check label="Closed loop (adds leg back to start, shows area)" value={route.closed} onChange={(closed) => editR({ closed })} />
              </Row>
              <Row>
                <Btn onClick={() => editR({ pts: route.pts.slice(0, -1) })} disabled={!route.pts.length}>↶ Undo point</Btn>
                <Btn onClick={() => editR({ pts: [...route.pts].reverse() })} disabled={route.pts.length < 2}>⇄ Reverse</Btn>
                <Btn kind="ghost" onClick={() => fit(route.pts)} disabled={!route.pts.length}>Fit</Btn>
                <Btn kind="ghost" onClick={() => { set({ routes: s.routes.filter((r) => r.id !== route.id), sel: s.routes.find((r) => r.id !== route.id)?.id ?? '' }) }}>Delete route</Btn>
              </Row>
            </>
          )}
        </Panel>
        <Panel title="Range rings">
          <Row>
            <Num label="Radius" value={+(s.ringR / unitM).toFixed(3)} onChange={(v) => set({ ringR: Math.max(1, v * unitM) })} unit={s.unit} min={0} />
            <Btn kind={tool === 'ring' ? 'primary' : 'normal'} onClick={() => setTool(tool === 'ring' ? 'draw' : 'ring')}>{tool === 'ring' ? '✓ Click map to place' : '◎ Place ring'}</Btn>
          </Row>
          {s.rings.map((g) => (
            <Row key={g.id}>
              <span style={{ flex: 1, fontSize: 13 }}>◎ {fmtDist(g.r, s.unit)} around {g.c[1].toFixed(4)}, {g.c[0].toFixed(4)}</span>
              <Btn kind="ghost" onClick={() => set({ rings: s.rings.map((x) => (x.id === g.id ? { ...x, r: s.ringR } : x)) })}>Set radius</Btn>
              <Btn kind="ghost" onClick={() => set({ rings: s.rings.filter((x) => x.id !== g.id) })}>✕</Btn>
            </Row>
          ))}
          <p className="muted" style={{ fontSize: 12 }}>Rings are true geodesic circles (every edge point is exactly the radius away), so they stretch on the Mercator map at high latitudes.</p>
        </Panel>
        <Panel title="Import / export">
          <FileDrop accept=".gpx,.geojson,.json" onFiles={(f) => void importFile(f[0])} label="Import GPX or GeoJSON" />
          {err && <Note tone="err">{err}</Note>}
          <Row>
            <Btn onClick={() => download('routes.geojson', JSON.stringify(toGeoJSON(s.routes.map((r) => ({ name: r.name, pts: ptsOf(r) })), s.rings, s.method), null, 2), 'application/geo+json')}>⬇ GeoJSON</Btn>
            <Btn onClick={() => download('routes.gpx', toGpx(s.routes.map((r) => ({ name: r.name, pts: ptsOf(r) }))), 'application/gpx+xml')}>⬇ GPX</Btn>
            <CsvButton name="legs.csv" rows={() => [['Leg', 'From lat', 'From lon', 'To lat', 'To lon', `Distance ${s.unit}`, `Cumulative ${s.unit}`, 'Bearing °'], ...lg.map((l, i) => [i + 1, l.from[1], l.from[0], l.to[1], l.to[0], +(l.d / unitM).toFixed(4), +(l.cum / unitM).toFixed(4), +l.brg.toFixed(1)])]} />
            <CopyButton text={() => shareLink(shareState)} label="Share link" />
            <Btn kind="ghost" onClick={reset}>Reset</Btn>
          </Row>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label={`${route?.name ?? 'Route'} length`} value={fmtDist(total, s.unit)} sub={`${lg.length} leg${lg.length === 1 ? '' : 's'} · ${s.method === 'gc' ? 'great circle' : 'rhumb line'}`} tone="accent" />
          <Stat label="Time estimate" value={fmtDur(hours)} sub={`at ${num(speed(route ?? s.routes[0]), 1)} km/h, no elevation`} />
          <Stat label="Straight-line" value={straight ? fmtDist(straight.d, s.unit) : '—'} sub={straight ? `bearing ${num(straight.brg, 0)}° ${compass(straight.brg)}` : 'start → end'} />
          <Stat label={area ? 'Enclosed area' : 'Detour factor'} value={area ? (area > 1e6 ? `${num(area / 1e6, 3)} km²` : `${num(area / 1e4, 2)} ha`) : straight && straight.d > 0 ? `× ${num(total / straight.d, 2)}` : '—'} sub={area ? `${num(area / 4046.86, 1)} acres` : 'route ÷ straight line'} />
        </Stats>
        <Panel title="Map" actions={<>
          <Seg value={s.unit} onChange={(unit) => set({ unit })} options={[['km', 'km'], ['mi', 'mi'], ['nmi', 'nmi']]} />
          <Seg value={s.method} onChange={(method) => set({ method })} options={[['gc', 'Great circle'], ['rhumb', 'Rhumb']]} />
          <Seg value={s.layer} onChange={(layer) => set({ layer })} options={[['osm', 'Map'], ['sat', 'Satellite']]} />
        </>}>
          <div
            ref={box}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={() => (drag.current = null)}
            style={{ position: 'relative', height: 500, overflow: 'hidden', borderRadius: 10, background: '#cbd5e1', touchAction: 'none', cursor: tool === 'ring' ? 'cell' : 'crosshair', userSelect: 'none' }}
          >
            {tiles.map(([x, y]) => (
              <img key={`${s.layer}${z}/${x}/${y}`} alt="" draggable={false} src={TILES[s.layer].url(z, ((x % n) + n) % n, y)} width={256} height={256} style={{ position: 'absolute', left: x * 256 - tl[0], top: y * 256 - tl[1], maxWidth: 'none', pointerEvents: 'none' }} />
            ))}
            <svg width={size.w} height={size.h} style={{ position: 'absolute', inset: 0 }}>
              {s.rings.map((g) => {
                const pts = circle(g.c, g.r, 96).map(scr)
                const c = scr(g.c)
                return (
                  <g key={g.id} style={{ pointerEvents: 'none' }}>
                    <polygon points={pts.map((p) => p.join(',')).join(' ')} fill="rgba(250,204,21,0.12)" stroke="#ca8a04" strokeWidth={2} strokeDasharray="8 5" />
                    <circle cx={c[0]} cy={c[1]} r={4} fill="#ca8a04" />
                    <text x={pts[0][0]} y={pts[0][1] - 6} textAnchor="middle" style={{ fontSize: 12, fontWeight: 700, fill: '#713f12', paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3 }}>{fmtDist(g.r, s.unit)}</text>
                  </g>
                )
              })}
              {s.routes.map((r) => {
                const sel = r.id === route?.id
                const pts = ptsOf(r)
                return (
                  <g key={r.id} opacity={sel ? 1 : 0.65}>
                    {r.closed && r.pts.length > 2 && <polygon points={r.pts.map(scr).map((p) => p.join(',')).join(' ')} fill={r.color} opacity={0.12} style={{ pointerEvents: 'none' }} />}
                    <path d={pathD(pts)} fill="none" stroke="#fff" strokeWidth={sel ? 7 : 5} strokeLinejoin="round" strokeLinecap="round" style={{ pointerEvents: 'none' }} />
                    <path d={pathD(pts)} fill="none" stroke={r.color} strokeWidth={sel ? 4 : 3} strokeLinejoin="round" strokeLinecap="round" style={{ pointerEvents: 'none' }} />
                  </g>
                )
              })}
              {route && lg.map((l, i) => {
                const a = scr(l.from), b = scr(l.to)
                if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 70) return null
                return <text key={`t${i}`} x={(a[0] + b[0]) / 2} y={(a[1] + b[1]) / 2 - 8} textAnchor="middle" style={{ fontSize: 11, fontWeight: 700, fill: route.color, paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3, pointerEvents: 'none' }}>{fmtDist(l.d, s.unit)}</text>
              })}
              {route && route.pts.map((p, i) => {
                if (i === route.pts.length - 1 && !route.closed) return null
                const a = scr(p), b = scr(route.pts[(i + 1) % route.pts.length])
                return <circle key={`m${i}`} data-mi={i} cx={(a[0] + b[0]) / 2} cy={(a[1] + b[1]) / 2} r={5} fill="rgba(255,255,255,0.8)" stroke={route.color} strokeWidth={1.5} style={{ cursor: 'copy' }} />
              })}
              {route && route.pts.map((p, i) => {
                const q = scr(p)
                return <circle key={i} data-vi={i} cx={q[0]} cy={q[1]} r={i === vSel ? 9 : 7} fill={i === 0 ? '#22c55e' : i === route.pts.length - 1 ? '#ef4444' : '#fff'} stroke={i === vSel ? '#facc15' : '#0f172a'} strokeWidth={i === vSel ? 3 : 2} style={{ cursor: 'move' }} />
              })}
            </svg>
            <div style={{ position: 'absolute', right: 10, top: 10, display: 'flex', flexDirection: 'column', gap: 4 }} onPointerDown={(e) => e.stopPropagation()}>
              <Btn onClick={() => set({ zoom: Math.min(19, z + 1) })} title="Zoom in">＋</Btn>
              <Btn onClick={() => set({ zoom: Math.max(2, z - 1) })} title="Zoom out">－</Btn>
            </div>
            {vSel >= 0 && route && vSel < route.pts.length && (
              <div style={{ position: 'absolute', left: 10, top: 10 }} onPointerDown={(e) => e.stopPropagation()}>
                <Btn kind="danger" onClick={() => { editR({ pts: route.pts.filter((_, j) => j !== vSel) }); setVSel(-1) }}>✕ Remove point {vSel + 1}</Btn>
              </div>
            )}
            <div style={{ position: 'absolute', left: 10, bottom: 8, background: '#fffd', color: '#111', fontSize: 11, padding: '2px 6px', borderRadius: 4, pointerEvents: 'none' }}>
              <div style={{ width: barM / mpp, borderBottom: '3px solid #111', borderLeft: '2px solid #111', borderRight: '2px solid #111', height: 6 }} />
              {fmtDist(barM, 'km')}
            </div>
            <span style={{ position: 'absolute', right: 4, bottom: 2, fontSize: 10, background: '#fffc', color: '#333', padding: '0 4px', borderRadius: 4 }}>{TILES[s.layer].attr}</span>
          </div>
          <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>Click to add points to the selected route · drag points to move · drag a small midpoint dot to insert · click a point to remove it · scroll or ± to zoom.</p>
        </Panel>
        <Panel title={`Legs — ${route?.name ?? ''}`}>
          {lg.length ? (
            <Table
              head={['#', 'Distance', 'Cumulative', 'Bearing', 'Time', 'Cum. time']}
              rows={lg.map((l, i) => [i + 1, fmtDist(l.d, s.unit), fmtDist(l.cum, s.unit), `${num(l.brg, 1)}° ${compass(l.brg)}`, fmtDur(l.d / 1000 / Math.max(0.01, speed(route!))), fmtDur(l.cum / 1000 / Math.max(0.01, speed(route!)))])}
              foot={['Σ', fmtDist(total, s.unit), '', '', fmtDur(hours), '']}
              max={60}
            />
          ) : <Note>Click the map to start this route.</Note>}
          <Note>Great circle = shortest path on the globe (bearing changes along the way). Rhumb line = constant compass bearing, straight on this Mercator map, slightly longer. Bearings are true (not magnetic). Times assume steady speed on flat ground.</Note>
        </Panel>
      </div>
    </Split>
  )
}
