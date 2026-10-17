import { useEffect, useMemo, useRef, useState, type PointerEvent as RPE } from 'react'
import { Btn, FileDrop, LineChart, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, Txt, download, num, useToolState } from '../kit'
import { cumDist, demoTrack, fitZoom, lat2y, lon2x, parseGpx, simplify, toGpx, trackStats, x2lon, y2lat, type Track, type TrkPt, type Wpt } from './lib/gpx-track-viewer'

interface State { name: string; points: TrkPt[]; wpts: Wpt[]; colorBy: 'none' | 'ele' | 'speed'; units: 'metric' | 'imperial' }
const demo = demoTrack()
const DEF: State = {
  name: demo.name, points: demo.points, colorBy: 'ele', units: 'metric',
  wpts: [{ lat: 46.0207, lon: 7.7491, name: 'Zermatt station' }, { lat: demo.points[160].lat, lon: demo.points[160].lon, name: 'Lunch spot' }],
}
const H = 440

const ramp = (t: number) => {
  // blue → green → yellow → red
  const c = [[59, 130, 246], [16, 185, 129], [234, 179, 8], [239, 68, 68]]
  const x = Math.max(0, Math.min(0.999, t)) * 3
  const i = Math.floor(x), f = x - i
  return `rgb(${c[i].map((v, k) => Math.round(v + (c[i + 1][k] - v) * f)).join(',')})`
}
const hms = (s: number) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export default function GpxTrackViewer() {
  const [s, set, reset] = useToolState('gpx-track-viewer', DEF)
  const [others, setOthers] = useState<Track[]>([])
  const [err, setErr] = useState('')
  const [sel, setSel] = useState<number | null>(null)
  const [edit, setEdit] = useState(false)
  const [undo, setUndo] = useState<TrkPt[][]>([])
  const [tol, setTol] = useState(5)
  const [w, setW] = useState(800)
  const [view, setView] = useState({ z: 2, lat: 0, lon: 0, fit: true })
  const [drag, setDrag] = useState<{ i: number; lat: number; lon: number } | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const pan = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null)

  const imp = s.units === 'imperial'
  const dist = (m: number) => (imp ? `${num(m / 1609.344, 2)} mi` : m >= 1000 ? `${num(m / 1000, 2)} km` : `${Math.round(m)} m`)
  const elev = (m: number) => (imp ? `${Math.round(m * 3.28084)} ft` : `${Math.round(m)} m`)
  const speed = (ms: number) => (imp ? `${num(ms * 2.23694, 1)} mph` : `${num(ms * 3.6, 1)} km/h`)
  const pace = (ms: number) => {
    if (!ms) return '—'
    const sec = (imp ? 1609.344 : 1000) / ms
    return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')} /${imp ? 'mi' : 'km'}`
  }

  const pts = useMemo(() => (drag ? s.points.map((p, i) => (i === drag.i ? { ...p, lat: drag.lat, lon: drag.lon } : p)) : s.points), [s.points, drag])
  const st = useMemo(() => trackStats(pts), [pts])
  const cd = useMemo(() => cumDist(pts), [pts])

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // While `fit` is set the view is derived from the track and the map width.
  const fitted = useMemo(() => {
    if (!s.points.length) return { z: 2, lat: 0, lon: 0, fit: true }
    const z = fitZoom(s.points, w, H)
    const xs = s.points.map((p) => lon2x(p.lon, z)), ys = s.points.map((p) => lat2y(p.lat, z))
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2
    return { z, lon: x2lon(cx, z), lat: y2lat(cy, z), fit: true }
  }, [s.points, w])
  const v = view.fit ? fitted : view

  const z = v.z
  const cx = lon2x(v.lon, z), cy = lat2y(v.lat, z)
  const ox = cx - w / 2, oy = cy - H / 2
  const sx = (p: { lon: number }) => lon2x(p.lon, z) - ox
  const sy = (p: { lat: number }) => lat2y(p.lat, z) - oy
  const toLL = (x: number, y: number) => ({ lon: x2lon(x + ox, z), lat: y2lat(y + oy, z) })
  const local = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top] as const
  }

  const commit = (next: TrkPt[]) => {
    setView({ ...v, fit: false })
    setUndo((u) => [...u.slice(-19), s.points])
    set({ points: next })
  }
  const load = (t: Track, wpts: Wpt[] = []) => {
    set({ name: t.name, points: t.points, wpts })
    setUndo([])
    setSel(null)
    setView((v) => ({ ...v, fit: true }))
  }
  const onFiles = async (files: File[]) => {
    try {
      const g = parseGpx(await files[0].text())
      if (!g.tracks.length) throw new Error('The file has no tracks or routes.')
      setOthers(g.tracks)
      load(g.tracks[0], g.wpts)
      setErr('')
    } catch (e) {
      setErr((e as Error).message)
    }
  }
  const zoomAt = (dz: number, x = w / 2, y = H / 2) => {
    const nz = Math.max(2, Math.min(19, z + dz))
    if (nz === z) return
    const ll = toLL(x, y)
    const ncx = lon2x(ll.lon, nz) - (x - w / 2), ncy = lat2y(ll.lat, nz) - (y - H / 2)
    setView({ z: nz, lon: x2lon(ncx, nz), lat: y2lat(ncy, nz), fit: false })
  }
  useEffect(() => {
    const el = box.current
    if (!el) return
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      zoomAt(e.deltaY < 0 ? 1 : -1, e.clientX - r.left, e.clientY - r.top)
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  })

  const onDown = (e: RPE<HTMLDivElement>) => {
    const t = e.target as Element
    const [x, y] = local(e)
    const hi = t.getAttribute('data-i')
    if (edit && hi !== null) {
      const i = Number(hi)
      setSel(i)
      setDrag({ i, ...toLL(x, y) })
    } else if (edit && t.getAttribute('data-line') !== null) {
      // insert a point on the nearest segment
      let best = -1, bd = Infinity, bt = 0
      for (let i = 1; i < pts.length; i++) {
        const ax = sx(pts[i - 1]), ay = sy(pts[i - 1]), bx = sx(pts[i]), by = sy(pts[i])
        const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1
        const tt = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2))
        const d = Math.hypot(x - ax - tt * dx, y - ay - tt * dy)
        if (d < bd) [bd, best, bt] = [d, i, tt]
      }
      if (best > 0) {
        const a = pts[best - 1], b = pts[best]
        const np: TrkPt = { ...toLL(x, y) }
        if (a.ele !== undefined && b.ele !== undefined) np.ele = a.ele + (b.ele - a.ele) * bt
        if (a.time !== undefined && b.time !== undefined) np.time = Math.round(a.time + (b.time - a.time) * bt)
        commit([...s.points.slice(0, best), np, ...s.points.slice(best)])
        setSel(best)
      }
      return
    } else {
      pan.current = { x: e.clientX, y: e.clientY, cx, cy }
    }
    ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: RPE<HTMLDivElement>) => {
    if (drag) {
      const [x, y] = local(e)
      setDrag({ i: drag.i, ...toLL(x, y) })
    } else if (pan.current) {
      const p = pan.current
      const ncx = p.cx - (e.clientX - p.x), ncy = p.cy - (e.clientY - p.y)
      setView({ z, lon: x2lon(ncx, z), lat: y2lat(ncy, z), fit: false })
    }
  }
  const onUp = () => {
    if (drag) {
      commit(s.points.map((p, i) => (i === drag.i ? { ...p, lat: drag.lat, lon: drag.lon } : p)))
      setDrag(null)
    }
    pan.current = null
  }

  // tiles
  const n = 2 ** z
  const tiles: { k: string; x: number; y: number; url: string }[] = []
  for (let tx = Math.floor(ox / 256); tx <= Math.floor((ox + w) / 256); tx++)
    for (let ty = Math.max(0, Math.floor(oy / 256)); ty <= Math.min(n - 1, Math.floor((oy + H) / 256)); ty++) {
      const wx = ((tx % n) + n) % n
      tiles.push({ k: `${z}/${tx}/${ty}`, x: tx * 256 - ox, y: ty * 256 - oy, url: `https://tile.openstreetmap.org/${z}/${wx}/${ty}.png` })
    }

  // coloured segments
  const segs = useMemo(() => {
    const out: { i: number; c: string }[] = []
    if (s.colorBy === 'ele' && st.hasEle) {
      const r = st.maxEle - st.minEle || 1
      for (let i = 1; i < pts.length; i++) out.push({ i, c: ramp((((pts[i].ele ?? 0) + (pts[i - 1].ele ?? 0)) / 2 - st.minEle) / r) })
    } else if (s.colorBy === 'speed' && st.hasTime) {
      const sp = pts.map((p, i) => (i ? (cd[i] - cd[i - 1]) / Math.max(1, ((p.time ?? 0) - (pts[i - 1].time ?? 0)) / 1000) : 0))
      const top = [...sp].sort((a, b) => a - b)[Math.floor(sp.length * 0.95)] || 1
      for (let i = 1; i < pts.length; i++) out.push({ i, c: ramp(sp[i] / top) })
    }
    return out
  }, [s.colorBy, pts, st, cd])
  const line = pts.map((p) => `${sx(p).toFixed(1)},${sy(p).toFixed(1)}`).join(' ')
  const handles = edit && pts.length <= 1500
  const sp = sel !== null && sel < pts.length ? pts[sel] : null
  // At low zoom, only draw handles at least 12 px apart (zoom in to reach the rest).
  const shownHandle: boolean[] = []
  if (handles) {
    let lx = -1e9, ly = -1e9
    pts.forEach((p, i) => {
      const x = sx(p), y = sy(p)
      shownHandle[i] = i === 0 || i === pts.length - 1 || Math.hypot(x - lx, y - ly) >= 12
      if (shownHandle[i]) [lx, ly] = [x, y]
    })
  }

  const profile = st.hasEle ? [{ name: 'Elevation', points: pts.map((p, i) => [cd[i] / (imp ? 1609.344 : 1000), imp ? (p.ele ?? 0) * 3.28084 : (p.ele ?? 0)] as [number, number]), area: true, color: '#10b981' }] : []

  return (
    <div>
      <Stats>
        <Stat label="Distance" value={dist(st.distance)} sub={`${pts.length} points`} tone="accent" />
        <Stat label="Elevation" value={st.hasEle ? `+${elev(st.gain)} / −${elev(st.loss)}` : '—'} sub={st.hasEle ? `${elev(st.minEle)} – ${elev(st.maxEle)}` : 'no elevation data'} />
        <Stat label="Time" value={st.hasTime ? hms(st.duration) : '—'} sub={st.hasTime ? `moving ${hms(st.moving)}` : 'no timestamps'} />
        <Stat label="Speed" value={st.hasTime ? speed(st.avgMoving) : '—'} sub={st.hasTime ? `pace ${pace(st.avgMoving)} · max ${speed(st.maxSpeed)}` : ''} />
      </Stats>
      <Panel title={s.name} actions={<>
        <Seg value={s.colorBy} onChange={(colorBy) => set({ colorBy })} options={[['none', 'Plain'], ['ele', 'Elevation'], ['speed', 'Speed']]} />
        <Btn onClick={() => setView((v) => ({ ...v, fit: true }))}>⤢ Fit</Btn>
      </>}>
        <div ref={box} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
          onDoubleClick={(e) => { const [x, y] = local(e); zoomAt(1, x, y) }}
          style={{ position: 'relative', height: H, overflow: 'hidden', borderRadius: 10, background: 'repeating-linear-gradient(45deg, var(--panel2), var(--panel2) 12px, var(--panel) 12px, var(--panel) 24px)', touchAction: 'none', cursor: edit ? 'crosshair' : 'grab', userSelect: 'none' }}>
          {tiles.map((t) => (
            <img key={t.k} src={t.url} alt="" draggable={false} width={256} height={256} onError={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')}
              style={{ position: 'absolute', left: t.x, top: t.y, pointerEvents: 'none' }} />
          ))}
          <svg width={w} height={H} style={{ position: 'absolute', inset: 0 }}>
            <polyline points={line} fill="none" stroke="#fff" strokeWidth={7} strokeLinejoin="round" strokeLinecap="round" opacity={0.85} />
            {segs.length ? segs.map(({ i, c }) => (
              <line key={i} x1={sx(pts[i - 1])} y1={sy(pts[i - 1])} x2={sx(pts[i])} y2={sy(pts[i])} stroke={c} strokeWidth={4} strokeLinecap="round" />
            )) : <polyline points={line} fill="none" stroke="#e11d48" strokeWidth={4} strokeLinejoin="round" />}
            <polyline points={line} data-line="" fill="none" stroke="transparent" strokeWidth={14} style={{ cursor: edit ? 'copy' : undefined }} />
            {handles && pts.map((p, i) => (i === sel || shownHandle[i]) && <circle key={i} data-i={i} cx={sx(p)} cy={sy(p)} r={i === sel ? 7 : 4} fill={i === sel ? '#f59e0b' : '#fff'} stroke="#0f172a" strokeWidth={1.5} style={{ cursor: 'move' }} />)}
            {pts.length > 0 && <>
              <circle cx={sx(pts[0])} cy={sy(pts[0])} r={8} fill="#10b981" stroke="#fff" strokeWidth={2} />
              <circle cx={sx(pts[pts.length - 1])} cy={sy(pts[pts.length - 1])} r={6} fill="#0f172a" stroke="#fff" strokeWidth={2} />
            </>}
            {sp && !handles && <circle cx={sx(sp)} cy={sy(sp)} r={7} fill="#f59e0b" stroke="#fff" strokeWidth={2} />}
            {s.wpts.map((p, i) => (
              <g key={i} transform={`translate(${sx(p)},${sy(p)})`}>
                <path d="M0,0 L-7,-14 A8,8 0 1,1 7,-14 Z" fill="#6366f1" stroke="#fff" strokeWidth={1.5} />
                <text x={10} y={-12} fontSize={12} fontWeight={700} fill="#0f172a" stroke="#fff" strokeWidth={3} paintOrder="stroke">{p.name}</text>
              </g>
            ))}
          </svg>
          <div style={{ position: 'absolute', left: 8, top: 8, display: 'grid', gap: 4 }}>
            <Btn onClick={() => zoomAt(1)} title="Zoom in">+</Btn>
            <Btn onClick={() => zoomAt(-1)} title="Zoom out">−</Btn>
          </div>
          <div style={{ position: 'absolute', right: 0, bottom: 0, fontSize: 11, background: 'rgba(255,255,255,.8)', color: '#0f172a', padding: '1px 6px' }}>
            © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors
          </div>
        </div>
        {s.colorBy !== 'none' && segs.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 12 }} className="muted">
            {s.colorBy === 'ele' ? elev(st.minEle) : 'slow'}
            <span style={{ flex: '0 1 200px', height: 8, borderRadius: 4, background: `linear-gradient(90deg, ${[0, 0.33, 0.66, 1].map(ramp).join(',')})` }} />
            {s.colorBy === 'ele' ? elev(st.maxEle) : 'fast'}
            <span style={{ marginLeft: 'auto' }}>Drag to pan · wheel / double-click to zoom</span>
          </div>
        )}
      </Panel>
      <Split>
        <div>
          <Panel title="Track file" actions={<Btn kind="ghost" onClick={() => { reset(); setOthers([]); setUndo([]); setView((v) => ({ ...v, fit: true })) }}>Demo</Btn>}>
            <FileDrop accept=".gpx,application/gpx+xml" onFiles={onFiles} label="Drop a .gpx file or click to choose" />
            {err && <Note tone="err">{err}</Note>}
            {others.length > 1 && <Select label="Track in file" value={others.findIndex((t) => t.name === s.name)} onChange={(i) => i >= 0 && load(others[i], s.wpts)} options={others.map((t, i) => [i, `${t.name} (${t.points.length} pts)`] as const)} />}
            <Txt label="Track name" value={s.name} onChange={(name) => set({ name })} />
            <Row>
              <Btn kind="primary" onClick={() => download(`${s.name.replace(/[^\w-]+/g, '_') || 'track'}.gpx`, toGpx(s.name, s.points, s.wpts), 'application/gpx+xml')}>⬇ Export GPX</Btn>
              <Seg value={s.units} onChange={(units) => set({ units })} options={[['metric', 'km / m'], ['imperial', 'mi / ft']]} />
            </Row>
            <p className="muted">Files are read locally; nothing is uploaded. Map tiles come from OpenStreetMap (offline: a plain background).</p>
          </Panel>
          <Panel title="Edit track" actions={<Btn kind={edit ? 'primary' : 'normal'} onClick={() => setEdit(!edit)}>{edit ? '✓ Editing' : '✎ Edit points'}</Btn>}>
            {edit && <Note>Drag a point to move it, click the line to insert a point. {pts.length > 1500 && 'Handles are hidden for tracks over 1500 points: simplify first.'}</Note>}
            <Row>
              <Btn disabled={!undo.length} onClick={() => { set({ points: undo[undo.length - 1] }); setUndo(undo.slice(0, -1)) }}>↶ Undo</Btn>
              <Btn onClick={() => commit([...s.points].reverse())}>⇄ Reverse</Btn>
            </Row>
            <Row>
              <Num label="Simplify tolerance" unit="m" min={0} value={tol} onChange={setTol} />
              <Btn onClick={() => commit(simplify(s.points, tol))}>Simplify ({simplify(s.points, tol).length} pts)</Btn>
            </Row>
            {sp && sel !== null ? (
              <>
                <Table head={['Point', 'Lat', 'Lon', 'Elevation', 'Time', 'At']} rows={[[`#${sel + 1}`, sp.lat.toFixed(5), sp.lon.toFixed(5), sp.ele !== undefined ? elev(sp.ele) : '—', sp.time ? new Date(sp.time).toLocaleTimeString() : '—', dist(cd[sel])]]} />
                <Row>
                  <Btn kind="danger" disabled={s.points.length < 3} onClick={() => { commit(s.points.filter((_, i) => i !== sel)); setSel(null) }}>Delete point</Btn>
                  <Btn disabled={sel === 0} onClick={() => { commit(s.points.slice(sel)); setSel(0) }}>Trim before</Btn>
                  <Btn disabled={sel === s.points.length - 1} onClick={() => commit(s.points.slice(0, sel + 1))}>Trim after</Btn>
                  <Btn kind="ghost" onClick={() => setSel(null)}>Deselect</Btn>
                </Row>
              </>
            ) : <p className="muted">Select a point (edit mode) or use the slider below to inspect and trim the track.</p>}
            <label className="k-field"><span className="k-label">Point {sel !== null ? sel + 1 : '–'} of {pts.length}</span>
              <input type="range" min={0} max={Math.max(0, pts.length - 1)} value={sel ?? 0} onChange={(e) => setSel(Number(e.target.value))} />
            </label>
          </Panel>
        </div>
        <div>
          <Panel title="Elevation profile">
            {profile.length ? (
              <LineChart series={profile} height={240} xLabel={imp ? 'Distance (mi)' : 'Distance (km)'} fx={(v) => num(v, 1)} fy={(v) => num(v, 0)}
                yMin={Math.floor((imp ? st.minEle * 3.28084 : st.minEle) / 50) * 50}
                markers={sel !== null && cd[sel] !== undefined ? [{ x: cd[sel] / (imp ? 1609.344 : 1000), label: `#${sel + 1}` }] : []} />
            ) : <Note>This track has no elevation data.</Note>}
          </Panel>
          <Panel title={`Splits per ${imp ? 'mile' : 'km'}`}>
            <Splits pts={pts} cd={cd} unit={imp ? 1609.344 : 1000} pace={pace} elev={elev} />
          </Panel>
        </div>
      </Split>
    </div>
  )
}

function Splits({ pts, cd, unit, pace, elev }: { pts: TrkPt[]; cd: number[]; unit: number; pace: (ms: number) => string; elev: (m: number) => string }) {
  const rows: (string | number)[][] = []
  let start = 0
  for (let i = 1; i < pts.length; i++) {
    if (Math.floor(cd[i] / unit) > Math.floor(cd[start] / unit) || i === pts.length - 1) {
      const d = cd[i] - cd[start]
      const t = pts[i].time !== undefined && pts[start].time !== undefined ? (pts[i].time! - pts[start].time!) / 1000 : 0
      const de = (pts[i].ele ?? 0) - (pts[start].ele ?? 0)
      rows.push([rows.length + 1, (d / unit).toFixed(2), t ? pace(d / t) : '—', `${de >= 0 ? '+' : '−'}${elev(Math.abs(de))}`])
      start = i
    }
  }
  return <Table max={12} head={['#', 'Length', 'Pace', 'Climb']} rows={rows} />
}
