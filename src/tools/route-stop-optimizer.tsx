import { useEffect, useMemo, useRef, useState } from 'react'
import { Area, Btn, Check, CopyButton, CsvButton, Note, Num, num, Panel, pct, Row, Seg, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { fitZoom, haversine, lat2y, lon2x, optimize, parseLine, type Mode } from './lib/route-stop-optimizer'

interface Stop { label: string; lat?: number; lon?: number; note: string; q?: string; fail?: boolean }

const SAMPLE = `Depot · Westpoort warehouse | 52.3925, 4.8530 | load by 07:45
Café De Jaren | 52.3687, 4.8960 | 2 crates
Jordaan florist | 52.3760, 4.8820
Albert Cuyp market stall 41 | 52.3556, 4.8945 | before 10:00
Vondelpark office | 52.3580, 4.8686 | reception, 3rd floor
Oosterpark clinic | 52.3600, 4.9200 | cold chain!
NDSM wharf studio | 52.4010, 4.8920
Zuidas tower B | 52.3380, 4.8730 | loading dock -1
Science Park lab | 52.3545, 4.9555
Haarlemmerdijk bakery | 52.3820, 4.8870
De Pijp bookshop | 52.3530, 4.8990
Amstel hotel | 52.3600, 4.9050 | goods entrance
Sloterdijk office park | 52.3890, 4.8380`

const parseAll = (t: string): Stop[] => t.split('\n').map(parseLine).filter((x): x is NonNullable<ReturnType<typeof parseLine>> => !!x).map((p) => ({ ...p, q: p.lat === undefined ? p.label : undefined }))
const DEF = { text: SAMPLE, stops: parseAll(SAMPLE), mode: 'loop' as Mode, speed: 28, service: 6, start: '08:00', factor: 1.35, tiles: true }
const hm = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(Math.round(min % 60)).padStart(2, '0')}`
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

type Geo = { lat: number; lon: number }

function TileMap({ pts, order, loop, tiles }: { pts: (Geo & { label: string })[]; order: number[]; loop: boolean; tiles: boolean }) {
  const host = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(640)
  const H = 420
  const [view, setView] = useState<{ z: number; cx: number; cy: number } | null>(null)
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null)
  useEffect(() => {
    const el = host.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const fit = useMemo(() => {
    const z = fitZoom(pts, W, H)
    const xs = pts.map((p) => lon2x(p.lon, z)), ys = pts.map((p) => lat2y(p.lat, z))
    return pts.length ? { z, cx: (Math.min(...xs) + Math.max(...xs)) / 2, cy: (Math.min(...ys) + Math.max(...ys)) / 2 } : { z: 2, cx: 512, cy: 512 }
  }, [pts, W])
  const [fitKey, setFitKey] = useState(fit)
  if (fitKey !== fit) {
    setFitKey(fit)
    setView(null)
  }
  const v = view ?? fit
  const zoomBy = (dz: number) => {
    const z = Math.max(2, Math.min(18, v.z + dz))
    const k = 2 ** (z - v.z)
    setView({ z, cx: v.cx * k, cy: v.cy * k })
  }
  const X = (lon: number) => lon2x(lon, v.z) - v.cx + W / 2
  const Y = (lat: number) => lat2y(lat, v.z) - v.cy + H / 2
  const tileImgs: React.ReactNode[] = []
  if (tiles) {
    const n = 2 ** v.z
    const x0 = Math.floor((v.cx - W / 2) / 256), x1 = Math.floor((v.cx + W / 2) / 256)
    const y0 = Math.max(0, Math.floor((v.cy - H / 2) / 256)), y1 = Math.min(n - 1, Math.floor((v.cy + H / 2) / 256))
    for (let tx = x0; tx <= x1; tx++)
      for (let ty = y0; ty <= y1; ty++) {
        const wx = ((tx % n) + n) % n
        tileImgs.push(<img key={`${v.z}/${tx}/${ty}`} src={`https://tile.openstreetmap.org/${v.z}/${wx}/${ty}.png`} alt="" draggable={false} style={{ position: 'absolute', left: tx * 256 - v.cx + W / 2, top: ty * 256 - v.cy + H / 2, width: 256, height: 256, filter: 'saturate(0.7)' }} />)
      }
  }
  const path = order.map((i) => `${X(pts[i].lon).toFixed(1)},${Y(pts[i].lat).toFixed(1)}`)
  if (loop && order.length > 1) path.push(path[0])
  return (
    <div
      ref={host}
      style={{ position: 'relative', height: H, overflow: 'hidden', borderRadius: 10, background: 'repeating-linear-gradient(0deg,var(--panel2),var(--panel2) 39px,var(--line) 40px),var(--panel2)', touchAction: 'none', cursor: 'grab', userSelect: 'none' }}
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, y: e.clientY, cx: v.cx, cy: v.cy }
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (d) setView({ z: v.z, cx: d.cx - (e.clientX - d.x), cy: d.cy - (e.clientY - d.y) })
      }}
      onPointerUp={() => (drag.current = null)}
      onWheel={(e) => zoomBy(e.deltaY < 0 ? 1 : -1)}
    >
      {tileImgs}
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
        <polyline points={path.join(' ')} fill="none" stroke="#fff" strokeWidth={7} strokeLinejoin="round" opacity={0.85} />
        <polyline points={path.join(' ')} fill="none" stroke="#4f46e5" strokeWidth={3.5} strokeLinejoin="round" />
        {order.slice(0, loop ? undefined : -1).map((i, k) => {
          const j = order[(k + 1) % order.length]
          const ax = X(pts[i].lon), ay = Y(pts[i].lat), bx = X(pts[j].lon), by = Y(pts[j].lat)
          const mx = (ax + bx) / 2, my = (ay + by) / 2, a = Math.atan2(by - ay, bx - ax)
          if (Math.hypot(bx - ax, by - ay) < 40) return null
          return <path key={`a${k}`} d={`M${mx + 7 * Math.cos(a)},${my + 7 * Math.sin(a)} L${mx - 6 * Math.cos(a) + 5 * Math.sin(a)},${my - 6 * Math.sin(a) - 5 * Math.cos(a)} L${mx - 6 * Math.cos(a) - 5 * Math.sin(a)},${my - 6 * Math.sin(a) + 5 * Math.cos(a)}Z`} fill="#4f46e5" />
        })}
        {order.map((i, k) => (
          <g key={i} transform={`translate(${X(pts[i].lon)},${Y(pts[i].lat)})`}>
            <title>{`${k === 0 ? 'Start' : k}: ${pts[i].label}`}</title>
            <circle r={k === 0 ? 13 : 11} fill={k === 0 ? '#16a34a' : !loop && k === order.length - 1 ? '#dc2626' : '#4f46e5'} stroke="#fff" strokeWidth={2.5} />
            <text textAnchor="middle" dy={4} fontSize={11} fontWeight={700} fill="#fff">{k === 0 ? '★' : k}</text>
          </g>
        ))}
      </svg>
      <div style={{ position: 'absolute', right: 8, top: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <button type="button" className="k-btn" onClick={() => zoomBy(1)} aria-label="Zoom in">+</button>
        <button type="button" className="k-btn" onClick={() => zoomBy(-1)} aria-label="Zoom out">−</button>
        <button type="button" className="k-btn" onClick={() => setView(null)} title="Fit all stops">⤢</button>
      </div>
      {tiles && <div style={{ position: 'absolute', right: 0, bottom: 0, fontSize: 10, background: 'rgba(255,255,255,.8)', color: '#333', padding: '1px 5px' }}>© OpenStreetMap contributors</div>}
    </div>
  )
}

export default function RouteStopOptimizer() {
  const [s, set, reset] = useToolState('route-stop-optimizer', DEF)
  const [busy, setBusy] = useState('')
  const stopFlag = useRef(false)
  const located = useMemo(() => s.stops.map((st, i) => ({ st, i })).filter((x) => x.st.lat !== undefined && x.st.lon !== undefined), [s.stops])
  const pts = useMemo(() => located.map(({ st }) => ({ lat: st.lat!, lon: st.lon!, label: st.label })), [located])
  const res = useMemo(() => (pts.length >= 2 ? optimize(pts, s.mode) : null), [pts, s.mode])
  const loop = s.mode === 'loop'
  const pending = s.stops.filter((x) => x.lat === undefined && !x.fail).length
  const failed = s.stops.filter((x) => x.fail)

  const legs = useMemo(() => {
    if (!res) return []
    const [h, m] = s.start.split(':').map(Number)
    let t = (h || 0) * 60 + (m || 0), cum = 0
    const seq = loop ? [...res.order, res.order[0]] : res.order
    return seq.map((i, k) => {
      const km = k ? haversine(pts[seq[k - 1]], pts[i]) * s.factor : 0
      cum += km
      t += k ? (km / Math.max(1, s.speed)) * 60 : 0
      const arrive = t
      if (k && k < seq.length - (loop ? 1 : 0)) t += s.service
      return { i, k, km, cum, arrive, st: located[i].st }
    })
  }, [res, pts, s.start, s.speed, s.service, s.factor, loop, located])
  const totalKm = legs.length ? legs[legs.length - 1].cum : 0
  const finish = legs.length ? legs[legs.length - 1].arrive : 0
  const [h0, m0] = s.start.split(':').map(Number)
  const duration = finish - ((h0 || 0) * 60 + (m0 || 0))

  const geocode = async () => {
    stopFlag.current = false
    const list = [...s.stops]
    for (let k = 0; k < list.length; k++) {
      if (stopFlag.current) break
      const st = list[k]
      if (st.lat !== undefined || !st.q) continue
      setBusy(`Looking up “${st.q}” (${k + 1}/${list.length})…`)
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(st.q)}`, { headers: { Accept: 'application/json' } })
        const j = (await r.json()) as { lat: string; lon: string; display_name: string }[]
        list[k] = j[0] ? { ...st, lat: +j[0].lat, lon: +j[0].lon, note: st.note || j[0].display_name.split(',').slice(0, 3).join(',') } : { ...st, fail: true }
      } catch {
        list[k] = { ...st, fail: true }
        setBusy('Geocoding failed — you seem to be offline. Enter coordinates as “Name | lat, lon”.')
        set({ stops: list })
        return
      }
      set({ stops: [...list] })
      await new Promise((r) => setTimeout(r, 1100)) // Nominatim policy: max 1 request per second
    }
    setBusy('')
  }

  const apply = () => {
    const prev = new Map(s.stops.filter((x) => x.lat !== undefined).map((x) => [x.q ?? x.label, x]))
    const stops = parseAll(s.text).map((p) => (p.lat === undefined && prev.has(p.label) ? { ...prev.get(p.label)!, note: p.note || prev.get(p.label)!.note } : p))
    set({ stops })
  }

  const gmaps = res ? `https://www.google.com/maps/dir/${(loop ? [...res.order, res.order[0]] : res.order).map((i) => `${pts[i].lat},${pts[i].lon}`).join('/')}` : ''
  const print = () => {
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<!doctype html><title>Route</title><style>body{font:13px system-ui,sans-serif;margin:14mm}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #ccc;padding:6px 4px;text-align:left}th{font-size:11px;color:#555}.n{font-weight:700;font-size:16px}.c{width:24px;height:18px;border:1.5px solid #333;display:inline-block}</style>
      <h2>Delivery route — ${legs.length - (loop ? 1 : 0)} stops</h2><p>Start ${s.start} · ${totalKm.toFixed(1)} km est. · finish ≈ ${hm(finish)}</p>
      <table><tr><th>#</th><th>Stop</th><th>Notes</th><th>Leg km</th><th>ETA</th><th>Done</th></tr>${legs.map((l) => `<tr><td class="n">${l.k === 0 ? 'S' : loop && l.k === legs.length - 1 ? 'E' : l.k}</td><td>${esc(l.st.label)}<br><small>${l.st.lat!.toFixed(5)}, ${l.st.lon!.toFixed(5)}</small></td><td>${esc(l.st.note)}</td><td>${l.k ? l.km.toFixed(1) : ''}</td><td>${hm(l.arrive)}</td><td><span class="c"></span></td></tr>`).join('')}</table>
      <script>onload=()=>setTimeout(()=>print(),200)</script>`)
    w.document.close()
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="Stops" actions={<Btn kind="ghost" onClick={reset}>Sample</Btn>}>
          <Area value={s.text} onChange={(text) => set({ text })} rows={12} mono placeholder="One stop per line: Name | lat, lon | note — or just an address" />
          <Row>
            <Btn kind="primary" onClick={apply}>Update stops</Btn>
            <Btn onClick={() => void geocode()} disabled={!!busy || !s.stops.some((x) => x.lat === undefined && x.q)}>🔎 Geocode addresses{pending ? ` (${pending})` : ''}</Btn>
            {busy && <Btn kind="ghost" onClick={() => { stopFlag.current = true; setBusy('') }}>Stop</Btn>}
          </Row>
          {busy && <Note>{busy}</Note>}
          {failed.length > 0 && <Note tone="warn">Not found: {failed.map((f) => f.label).join('; ')}. Add coordinates manually (Name | lat, lon).</Note>}
          <p className="k-hint">The first line is the start (depot). Lines with “lat, lon” in decimal degrees are used directly; other lines are looked up with OpenStreetMap Nominatim (one per second) only when you press Geocode.</p>
        </Panel>
        <Panel title="Route options">
          <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['loop', 'Return to start'], ['open', 'End anywhere'], ['fixed-end', 'End at last line']]} />
          <Row>
            <Num label="Average speed" value={s.speed} onChange={(speed) => set({ speed })} unit="km/h" min={1} />
            <Num label="Time per stop" value={s.service} onChange={(service) => set({ service })} unit="min" min={0} />
          </Row>
          <Row>
            <Txt label="Start time" type="time" value={s.start} onChange={(start) => set({ start })} />
            <Num label="Road factor" value={s.factor} onChange={(factor) => set({ factor })} min={1} max={3} step={0.05} hint="road km ÷ straight-line km (city ≈ 1.3–1.4)" />
          </Row>
          <Check label="Show OpenStreetMap tiles" value={s.tiles} onChange={(tiles) => set({ tiles })} />
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Route distance" value={`${num(totalKm, 1)} km`} sub="estimated road distance" tone="accent" />
          <Stat label="Saved vs. list order" value={res ? pct(1 - res.km / res.naiveKm, 0) : '—'} sub={res ? `${num((res.naiveKm - res.km) * s.factor, 1)} km shorter` : ''} tone="good" />
          <Stat label="Total time" value={res ? `${Math.floor(duration / 60)} h ${Math.round(duration % 60)} min` : '—'} sub={res ? `finish ≈ ${hm(finish)}` : ''} />
          <Stat label="Stops" value={Math.max(0, located.length - 1)} sub={pending ? `${pending} need geocoding` : 'all located'} />
        </Stats>
        <Panel title="Map">
          {pts.length ? <TileMap pts={pts} order={res?.order ?? [0]} loop={loop} tiles={s.tiles} /> : <div className="k-chart empty">Add stops with coordinates or geocode addresses.</div>}
          <p className="k-hint">Drag to pan, scroll or use +/− to zoom. ★ = start. Distances are great-circle × road factor; actual roads may differ.</p>
        </Panel>
        <Panel title="Stop list" actions={res && <>
          <Btn kind="primary" onClick={print}>🖨 Print</Btn>
          <a className="k-btn" href={gmaps} target="_blank" rel="noreferrer">Open in Google Maps ↗</a>
          <CopyButton label="Copy" text={() => legs.map((l) => `${l.k === 0 ? 'Start' : l.k}. ${l.st.label}${l.st.note ? ` (${l.st.note})` : ''} — ETA ${hm(l.arrive)}`).join('\n')} />
          <CsvButton name="route.csv" rows={() => [['Seq', 'Stop', 'Lat', 'Lon', 'Note', 'Leg km', 'Cumulative km', 'ETA'], ...legs.map((l) => [l.k, l.st.label, l.st.lat!, l.st.lon!, l.st.note, +l.km.toFixed(2), +l.cum.toFixed(2), hm(l.arrive)])]} />
        </>}>
          <Table
            head={['#', 'Stop', 'Leg', 'Total', 'ETA']}
            rows={legs.map((l) => [
              <b key="n">{l.k === 0 ? '★' : loop && l.k === legs.length - 1 ? '↩' : l.k}</b>,
              <span key="s">{l.st.label}{l.st.note && <><br /><small className="muted">{l.st.note}</small></>}</span>,
              l.k ? `${l.km.toFixed(1)} km` : '',
              `${l.cum.toFixed(1)} km`,
              hm(l.arrive),
            ])}
          />
          {res && <p className="k-hint">Optimized with nearest-neighbour construction, then 2-opt and Or-opt moves until no swap shortens the route (nearest-neighbour alone: {num(res.nnKm * s.factor, 1)} km).</p>}
        </Panel>
      </div>
    </Split>
  )
}
