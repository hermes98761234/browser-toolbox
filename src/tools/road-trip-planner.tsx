import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Check, CsvButton, download, money, Note, Num, num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { fitZoom, lat2y, lon2x, type Pt } from './lib/route-stop-optimizer'
import { clock, dur, estimateLegs, parseOsrm, pathKm, pointAlong, simulate, summary, type Ev, type Leg } from './lib/road-trip-planner'

interface StopRow { id: string; name: string; coord: string; stayMin: number; night: boolean; manualKm: number }
const R = (name: string, coord: string, stayMin = 0, night = false): StopRow => ({ id: uid(), name, coord, stayMin, night, manualKm: 0 })
const SAMPLE: StopRow[] = [
  R('Munich', '48.1374, 11.5755'), R('Salzburg old town', '47.8095, 13.0550', 150), R('Hallstatt', '47.5622, 13.6493', 0, true),
  R('Graz', '47.0707, 15.4395', 120), R('Ljubljana', '46.0569, 14.5058', 0, true), R('Lake Bled', '46.3683, 14.1146', 180), R('Venice (Tronchetto)', '45.4380, 12.3190'),
]
const PRESETS: Record<string, { breakEveryH: number; breakMin: number; maxDayH: number }> = {
  Relaxed: { breakEveryH: 2, breakMin: 20, maxDayH: 6 },
  Standard: { breakEveryH: 2, breakMin: 15, maxDayH: 8 },
  'EU driver rules': { breakEveryH: 4.5, breakMin: 45, maxDayH: 9 },
  'Push on': { breakEveryH: 3, breakMin: 15, maxDayH: 10 },
}
const DEF = {
  stops: SAMPLE,
  route: null as { sig: string; legs: Leg[]; path: Pt[] } | null,
  factor: 1.3, kmh: 75,
  start: '08:30', end: '20:00', breakEveryH: 2, breakMin: 15, maxDayH: 8, fuelMin: 15,
  tankL: 45, l100: 6.8, reserve: 15, price: 1.75, cur: '€', imperial: false, tiles: true,
}
const MI = 1.609344, GAL = 3.785411784
const parseCoord = (c: string): Pt | null => {
  const m = /(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)/.exec(c)
  if (!m) return null
  const lat = +m[1], lon = +m[2]
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null
}
const toMin = (hm: string) => {
  const [h, m] = hm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}
const ICON: Partial<Record<Ev['kind'], string>> = { start: '🚗', break: '☕', fuel: '⛽', overnight: '🛏️', arrive: '📍', stay: '📸', end: '🏁' }

function TripMap({ stops, path, marks, tiles }: { stops: (Pt & { label: string })[]; path: Pt[]; marks: (Pt & { icon: string; title: string })[]; tiles: boolean }) {
  const host = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(640)
  const H = 400
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
    const all = [...stops, ...path]
    const z = fitZoom(all, W, H)
    const xs = all.map((p) => lon2x(p.lon, z)), ys = all.map((p) => lat2y(p.lat, z))
    return all.length ? { z, cx: (Math.min(...xs) + Math.max(...xs)) / 2, cy: (Math.min(...ys) + Math.max(...ys)) / 2 } : { z: 2, cx: 512, cy: 512 }
  }, [stops, path, W])
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
  const imgs: React.ReactNode[] = []
  if (tiles) {
    const n = 2 ** v.z
    const x0 = Math.floor((v.cx - W / 2) / 256), x1 = Math.floor((v.cx + W / 2) / 256)
    const y0 = Math.max(0, Math.floor((v.cy - H / 2) / 256)), y1 = Math.min(n - 1, Math.floor((v.cy + H / 2) / 256))
    for (let tx = x0; tx <= x1; tx++)
      for (let ty = y0; ty <= y1; ty++) {
        const wx = ((tx % n) + n) % n
        imgs.push(<img key={`${v.z}/${tx}/${ty}`} src={`https://tile.openstreetmap.org/${v.z}/${wx}/${ty}.png`} alt="" draggable={false} style={{ position: 'absolute', left: tx * 256 - v.cx + W / 2, top: ty * 256 - v.cy + H / 2, width: 256, height: 256, filter: 'saturate(0.7)' }} />)
      }
  }
  const line = path.map((p) => `${X(p.lon).toFixed(1)},${Y(p.lat).toFixed(1)}`).join(' ')
  return (
    <div ref={host} style={{ position: 'relative', height: H, overflow: 'hidden', borderRadius: 10, background: 'var(--panel2, #e2e8f0)', touchAction: 'none', cursor: 'grab', userSelect: 'none' }}
      onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, cx: v.cx, cy: v.cy }; e.currentTarget.setPointerCapture(e.pointerId) }}
      onPointerMove={(e) => { const d = drag.current; if (d) setView({ z: v.z, cx: d.cx - (e.clientX - d.x), cy: d.cy - (e.clientY - d.y) }) }}
      onPointerUp={() => (drag.current = null)}
      onWheel={(e) => zoomBy(e.deltaY < 0 ? 1 : -1)}>
      {imgs}
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
        <polyline points={line} fill="none" stroke="#fff" strokeWidth={7} strokeLinejoin="round" opacity={0.85} />
        <polyline points={line} fill="none" stroke="#2563eb" strokeWidth={3.5} strokeLinejoin="round" />
        {marks.map((m, i) => (
          <g key={i} transform={`translate(${X(m.lon)},${Y(m.lat)})`}>
            <title>{m.title}</title>
            <circle r={10} fill="#fff" stroke="#334155" strokeWidth={1.5} />
            <text textAnchor="middle" dy={4.5} fontSize={12}>{m.icon}</text>
          </g>
        ))}
        {stops.map((p, k) => (
          <g key={k} transform={`translate(${X(p.lon)},${Y(p.lat)})`}>
            <title>{p.label}</title>
            <circle r={11} fill={k === 0 ? '#16a34a' : k === stops.length - 1 ? '#dc2626' : '#4f46e5'} stroke="#fff" strokeWidth={2.5} />
            <text textAnchor="middle" dy={4} fontSize={11} fontWeight={700} fill="#fff">{k + 1}</text>
            <text x={14} dy={4} fontSize={11} fontWeight={700} fill="#0f172a" stroke="#fff" strokeWidth={3} paintOrder="stroke">{p.label}</text>
          </g>
        ))}
      </svg>
      <div style={{ position: 'absolute', right: 8, top: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <button type="button" className="k-btn" onClick={() => zoomBy(1)} aria-label="Zoom in">+</button>
        <button type="button" className="k-btn" onClick={() => zoomBy(-1)} aria-label="Zoom out">−</button>
        <button type="button" className="k-btn" onClick={() => setView(null)} title="Fit route">⤢</button>
      </div>
      {tiles && <div style={{ position: 'absolute', right: 0, bottom: 0, fontSize: 10, background: 'rgba(255,255,255,.8)', color: '#333', padding: '1px 5px' }}>© OpenStreetMap contributors</div>}
    </div>
  )
}

export default function RoadTripPlanner() {
  const [s, set, reset] = useToolState('road-trip-planner', DEF)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const stop = useRef(false)
  const imp = s.imperial
  const dist = (km: number, d = 0) => (imp ? `${num(km / MI, d)} mi` : `${num(km, d)} km`)
  const pts = s.stops.map((r) => parseCoord(r.coord))
  const allPts = pts.every(Boolean) && pts.length >= 2
  const sig = pts.map((p) => (p ? `${p.lat.toFixed(5)},${p.lon.toFixed(5)}` : '?')).join(';')
  const osrm = s.route && s.route.sig === sig ? s.route : null

  const legs: (Leg & { src: string })[] = s.stops.slice(1).map((r, i) => {
    if (r.manualKm > 0) return { km: r.manualKm, hours: r.manualKm / s.kmh, src: 'manual' }
    if (osrm) return { ...osrm.legs[i], src: 'road' }
    const a = pts[i], b = pts[i + 1]
    if (a && b) return { ...estimateLegs([a, b], s.factor, s.kmh)[0], src: 'estimate' }
    return { km: 0, hours: 0, src: 'missing' }
  })
  const usableKm = (s.tankL / Math.max(0.1, s.l100)) * 100 * (1 - s.reserve / 100)
  const rules = { dayStart: toMin(s.start), dayEnd: toMin(s.end), maxDayH: s.maxDayH, breakEveryH: s.breakEveryH, breakMin: s.breakMin, rangeKm: usableKm, fuelMin: s.fuelMin }
  const ev = simulate(legs, s.stops.map((r) => ({ name: r.name, stayMin: r.stayMin, night: r.night })), rules)
  const sm = summary(ev)
  const fuelL = (sm.km * s.l100) / 100
  const path: Pt[] = osrm?.path.length ? osrm.path : (pts.filter(Boolean) as Pt[])
  const scale = sm.km > 0 ? pathKm(path) / sm.km : 1
  const marks = ev.filter((e) => e.kind === 'fuel' || e.kind === 'break' || (e.kind === 'overnight' && !e.label.startsWith('Overnight in'))).map((e) => ({ ...pointAlong(path, e.km * scale), icon: ICON[e.kind] ?? '•', title: `${e.label} · day ${Math.floor(e.t / 1440) + 1} ${clock(e.t)}` }))

  const editStop = (id: string, p: Partial<StopRow>) => set({ stops: s.stops.map((r) => (r.id === id ? { ...r, ...p } : r)) })
  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= s.stops.length) return
    const a = [...s.stops]
    ;[a[i], a[j]] = [a[j], a[i]]
    set({ stops: a })
  }

  const geocode = async () => {
    stop.current = false
    const list = [...s.stops]
    for (let i = 0; i < list.length; i++) {
      if (stop.current) break
      if (parseCoord(list[i].coord) || !list[i].name.trim()) continue
      setBusy(`Looking up “${list[i].name}” on nominatim.openstreetmap.org…`)
      try {
        const j = (await (await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(list[i].name)}`)).json()) as { lat: string; lon: string }[]
        if (j[0]) list[i] = { ...list[i], coord: `${(+j[0].lat).toFixed(5)}, ${(+j[0].lon).toFixed(5)}` }
        else setMsg(`No match for “${list[i].name}”. Enter coordinates by hand.`)
      } catch {
        setMsg('Geocoding failed (offline?). Type coordinates as “lat, lon”.')
        break
      }
      set({ stops: [...list] })
      await new Promise((r) => setTimeout(r, 1100)) // Nominatim usage policy: max 1 request per second
    }
    setBusy('')
  }
  const route = async () => {
    if (!allPts) return
    setBusy('Asking router.project-osrm.org for road distances…')
    setMsg('')
    try {
      const coords = (pts as Pt[]).map((p) => `${p.lon},${p.lat}`).join(';')
      const r = parseOsrm(await (await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=simplified&geometries=geojson`)).json())
      if (r) set({ route: { sig, legs: r.legs, path: r.path } })
      else setMsg('The router found no road route between these points. Using straight-line estimates.')
    } catch {
      setMsg('Routing server unreachable — using straight-line distance × road factor instead.')
    }
    setBusy('')
  }

  const days: { day: number; rows: Ev[] }[] = []
  for (const e of ev) {
    if (e.kind === 'drive') continue
    const day = Math.floor(e.t / 1440) + 1
    if (!days.length || days.at(-1)!.day !== day) days.push({ day, rows: [] })
    days.at(-1)!.rows.push(e)
  }
  const driveBetween = (a: Ev, b: Ev | undefined) => (b ? ev.filter((x) => x.kind === 'drive' && x.t >= a.t && x.t < b.t).reduce((s2, x) => s2 + x.km, 0) : 0)
  const gpx = () => {
    const wpts = s.stops.map((r, i) => (pts[i] ? `<wpt lat="${pts[i]!.lat}" lon="${pts[i]!.lon}"><name>${r.name.replace(/[<&]/g, '')}</name></wpt>` : '')).join('\n')
    const trk = path.map((p) => `<trkpt lat="${p.lat}" lon="${p.lon}"/>`).join('')
    download('road-trip.gpx', `<?xml version="1.0"?>\n<gpx version="1.1" creator="Browser Toolbox" xmlns="http://www.topografix.com/GPX/1/1">\n${wpts}\n<trk><name>Road trip</name><trkseg>${trk}</trkseg></trk>\n</gpx>`, 'application/gpx+xml')
  }
  const gmaps = allPts ? `https://www.google.com/maps/dir/${(pts as Pt[]).slice(0, 10).map((p) => `${p.lat},${p.lon}`).join('/')}` : ''

  return (
    <Split wide="right">
      <div>
        <Panel title="Stops" actions={<Btn kind="ghost" onClick={reset}>Sample</Btn>}>
          {s.stops.map((r, i) => (
            <div key={r.id} style={{ borderBottom: '1px solid var(--line)', paddingBottom: 6, marginBottom: 6 }}>
              <Row>
                <b style={{ width: 22 }}>{i + 1}</b>
                <input className="k-text" style={{ flex: 2, minWidth: 120 }} value={r.name} onChange={(e) => editStop(r.id, { name: e.target.value })} placeholder="Place name" aria-label="Place name" />
                <input className="k-text" style={{ flex: 1.4, minWidth: 120, borderColor: r.coord && !pts[i] ? '#ef4444' : undefined }} value={r.coord} onChange={(e) => editStop(r.id, { coord: e.target.value })} placeholder="lat, lon" aria-label="Coordinates" />
              </Row>
              <Row>
                {i > 0 && <label className="muted" style={{ fontSize: 12 }}>leg {imp ? 'mi' : 'km'} <input type="number" min={0} value={r.manualKm ? Math.round((imp ? r.manualKm / MI : r.manualKm) * 10) / 10 : ''} placeholder="auto" onChange={(e) => editStop(r.id, { manualKm: Math.max(0, +e.target.value * (imp ? MI : 1)) })} style={{ width: 64 }} /></label>}
                {i > 0 && i < s.stops.length - 1 && <>
                  <label className="muted" style={{ fontSize: 12 }}>stay min <input type="number" min={0} value={r.stayMin} disabled={r.night} onChange={(e) => editStop(r.id, { stayMin: Math.max(0, +e.target.value) })} style={{ width: 56 }} /></label>
                  <Check label="overnight" value={r.night} onChange={(night) => editStop(r.id, { night })} />
                </>}
                <span style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                  <Btn kind="ghost" disabled={!i} onClick={() => move(i, -1)}>↑</Btn>
                  <Btn kind="ghost" disabled={i === s.stops.length - 1} onClick={() => move(i, 1)}>↓</Btn>
                  <Btn kind="ghost" disabled={s.stops.length <= 2} onClick={() => set({ stops: s.stops.filter((x) => x.id !== r.id) })}>✕</Btn>
                </span>
              </Row>
            </div>
          ))}
          <Btn onClick={() => set({ stops: [...s.stops, R('', '')] })}>＋ Add stop</Btn>
        </Panel>
        <Panel title="Distances & routing">
          <Note>Coordinates you type stay in your browser. The two buttons below are the only network requests: <b>Look up places</b> sends place names to OpenStreetMap Nominatim; <b>Road route</b> sends the coordinates to the public OSRM demo server (router.project-osrm.org). Without them, distances are straight-line × road factor, or the leg distance you type.</Note>
          <Row>
            <Btn disabled={!!busy || s.stops.every((r) => parseCoord(r.coord))} onClick={() => void geocode()}>🔎 Look up places</Btn>
            <Btn kind="primary" disabled={!!busy || !allPts} onClick={() => void route()}>🛣️ Road route (OSRM)</Btn>
            {busy && <Btn kind="ghost" onClick={() => { stop.current = true; setBusy('') }}>Stop</Btn>}
          </Row>
          {busy && <Note>{busy}</Note>}
          {msg && <Note tone="warn">{msg}</Note>}
          <Row>
            <Num label="Road factor (no route)" value={s.factor} onChange={(factor) => set({ factor })} min={1} max={3} step={0.05} hint="road km ÷ straight km, ≈1.2–1.4" />
            <Num label="Average speed" value={Math.round((imp ? s.kmh / MI : s.kmh) * 10) / 10} onChange={(v) => set({ kmh: Math.max(5, v * (imp ? MI : 1)) })} unit={imp ? 'mph' : 'km/h'} min={5} />
          </Row>
          <Check label="Show OpenStreetMap tiles" value={s.tiles} onChange={(tiles) => set({ tiles })} />
        </Panel>
        <Panel title="Driving rules">
          <Row>{Object.entries(PRESETS).map(([k, p]) => <Btn key={k} kind={s.breakEveryH === p.breakEveryH && s.breakMin === p.breakMin && s.maxDayH === p.maxDayH ? 'primary' : 'ghost'} onClick={() => set(p)}>{k}</Btn>)}</Row>
          <Row>
            <Num label="Break every" value={s.breakEveryH} onChange={(breakEveryH) => set({ breakEveryH: Math.max(0.5, breakEveryH) })} unit="h" min={0.5} step={0.5} />
            <Num label="Break length" value={s.breakMin} onChange={(breakMin) => set({ breakMin })} unit="min" min={0} />
            <Num label="Max driving / day" value={s.maxDayH} onChange={(maxDayH) => set({ maxDayH: Math.max(1, maxDayH) })} unit="h" min={1} step={0.5} />
          </Row>
          <Row>
            <Txt label="Set off at" type="time" value={s.start} onChange={(start) => set({ start })} />
            <Txt label="Stop driving by" type="time" value={s.end} onChange={(end) => set({ end })} />
          </Row>
        </Panel>
        <Panel title="Vehicle & fuel">
          <Seg value={imp ? 'imp' : 'met'} onChange={(v) => set({ imperial: v === 'imp' })} options={[['met', 'km · L'], ['imp', 'miles · US gal']]} />
          <Row>
            <Num label="Tank" value={Math.round((imp ? s.tankL / GAL : s.tankL) * 10) / 10} onChange={(v) => set({ tankL: Math.max(1, v * (imp ? GAL : 1)) })} unit={imp ? 'gal' : 'L'} min={1} />
            <Num label={imp ? 'Fuel economy' : 'Consumption'} value={Math.round((imp ? 235.215 / s.l100 : s.l100) * 10) / 10} onChange={(v) => v > 0 && set({ l100: imp ? 235.215 / v : v })} unit={imp ? 'mpg' : 'L/100 km'} min={0.1} />
          </Row>
          <Row>
            <Num label="Keep in reserve" value={s.reserve} onChange={(reserve) => set({ reserve: Math.max(0, Math.min(60, reserve)) })} unit="%" min={0} max={60} />
            <Num label="Fuel price" value={Math.round((imp ? s.price * GAL : s.price) * 100) / 100} onChange={(v) => set({ price: Math.max(0, v / (imp ? GAL : 1)) })} unit={`${s.cur}/${imp ? 'gal' : 'L'}`} min={0} step={0.01} />
          </Row>
          <Row>
            <Num label="Fuel stop takes" value={s.fuelMin} onChange={(fuelMin) => set({ fuelMin })} unit="min" min={0} />
            <Select label="Currency" value={s.cur} onChange={(cur) => set({ cur })} options={['€', '$', '£', '₴', 'zł', 'CHF ', 'kr ']} />
          </Row>
          <p className="k-hint">Usable range between fills: <b>{dist(usableKm)}</b> (full tank minus {s.reserve}% reserve). The plan assumes you start with a full tank.</p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Distance" value={dist(sm.km)} sub={osrm ? 'road route (OSRM)' : legs.some((l) => l.src === 'manual') ? 'incl. manual legs' : 'estimated'} />
          <Stat label="Driving time" value={dur(sm.driveMin)} sub={`${sm.breaks} breaks`} />
          <Stat label="Trip length" value={`${sm.days} day${sm.days === 1 ? '' : 's'}`} sub={`${sm.nights} night${sm.nights === 1 ? '' : 's'} · arrive ${clock(ev.at(-1)?.t ?? 0)}`} tone="accent" />
          <Stat label="Fuel" value={money(fuelL * s.price, s.cur, 0)} sub={`${imp ? `${num(fuelL / GAL, 1)} gal` : `${num(fuelL, 1)} L`} · ${sm.fuel} fuel stop${sm.fuel === 1 ? '' : 's'}`} />
        </Stats>
        <Panel title="Map" actions={gmaps ? <a className="k-btn" href={gmaps} target="_blank" rel="noreferrer">Google Maps ↗</a> : undefined}>
          {path.length ? <TripMap stops={s.stops.map((r, i) => (pts[i] ? { ...pts[i]!, label: r.name } : null)).filter((x): x is Pt & { label: string } => !!x)} path={path} marks={marks} tiles={s.tiles} /> : <div className="k-chart empty">Add coordinates or look up places to see the map.</div>}
          <p className="k-hint">{osrm ? 'Blue line = road route from OSRM.' : 'Blue line = straight lines between stops (press “Road route” for real roads).'} ☕ break · ⛽ fuel · 🛏️ overnight on the road.</p>
          {legs.some((l) => l.src === 'missing') && <Note tone="warn">Some stops have no coordinates and no manual distance — those legs count as 0 km.</Note>}
        </Panel>
        <Panel title="Itinerary" actions={<>
          <CsvButton name="road-trip.csv" rows={() => [['Day', 'Time', 'Event', 'Duration min', `Odometer ${imp ? 'mi' : 'km'}`], ...ev.filter((e) => e.kind !== 'drive').map((e) => [Math.floor(e.t / 1440) + 1, clock(e.t), e.label, Math.round(e.dur), Math.round(imp ? e.km / MI : e.km)])]} />
          <Btn onClick={gpx}>⬇ GPX</Btn>
          <Btn onClick={() => window.print()}>🖨</Btn>
        </>}>
          {days.map((d) => (
            <div key={d.day} style={{ marginBottom: 10 }}>
              <h4 style={{ margin: '6px 0' }}>Day {d.day}</h4>
              <Table head={['Time', '', 'What', 'Then drive']} rows={d.rows.map((e) => {
                const i = ev.indexOf(e)
                const nextStop = ev.slice(i + 1).find((x) => x.kind !== 'drive')
                const k = driveBetween(e, nextStop)
                return [clock(e.t), ICON[e.kind] ?? '', <span key="l">{e.label}{e.dur > 0 && e.kind !== 'overnight' ? <span className="muted"> · {dur(e.dur)}</span> : ''}<span className="muted"> · {dist(e.km)}</span></span>, k > 0.05 ? dist(k) : '']
              })} />
            </div>
          ))}
        </Panel>
        <Panel title="Legs">
          <Table head={['Leg', 'Distance', 'Drive time', 'Source']} rows={legs.map((l, i) => [`${s.stops[i].name} → ${s.stops[i + 1].name}`, dist(l.km), dur(l.hours * 60), l.src])} />
        </Panel>
      </div>
    </Split>
  )
}
