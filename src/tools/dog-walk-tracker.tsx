import { useEffect, useRef, useState } from 'react'
import { BarChart, Btn, Check, download, JsonButtons, Note, Panel, Row, Seg, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { acceptFix, fitView, fmtDist, fmtPace, loopRoute, metresPerPx, niceScale, pathLength, rng, thin, tiles, toGpx, toScreen, type LL, type View } from './lib/dog-walk-tracker'

type MarkKind = 'poo' | 'pee' | 'water' | 'friend'
interface Mark { k: MarkKind; lat: number; lon: number; t: number }
interface Walk { id: string; start: number; end: number; dist: number; pts: [number, number, number][]; marks: Mark[]; note: string }
interface Active { start: number; pts: [number, number, number, number][]; marks: Mark[]; demo: boolean }
interface State { dog: string; imperial: boolean; tiles: boolean; walks: Walk[]; active: Active | null; sel: string }

const MARKS: Record<MarkKind, [string, string]> = { poo: ['💩', 'Poop'], pee: ['💧', 'Pee'], water: ['🥣', 'Drink'], friend: ['🐕', 'Dog friend'] }
const PARK: LL = [52.358, 4.8686] // demo area

function sampleWalks(): Walk[] {
  const now = Date.now()
  return [5, 3, 2, 1].map((daysAgo, i) => {
    const r = rng(i + 11)
    const route = loopRoute([PARK[0] + (r() - 0.5) * 0.004, PARK[1] + (r() - 0.5) * 0.008], i + 4, 1400 + r() * 1800)
    const start = now - daysAgo * 86_400_000 - (i % 2 ? 3 : 10) * 3_600_000
    const pts = route.map((p, j) => [+p[0].toFixed(5), +p[1].toFixed(5), j * 5] as [number, number, number])
    const at = (f: number) => pts[Math.floor(pts.length * f)]
    return {
      id: `s${i}`,
      start,
      end: start + pts.length * 5000,
      dist: pathLength(route),
      pts,
      marks: [{ k: 'pee', lat: at(0.2)[0], lon: at(0.2)[1], t: start + at(0.2)[2] * 1000 }, { k: 'poo', lat: at(0.55)[0], lon: at(0.55)[1], t: start + at(0.55)[2] * 1000 }],
      note: ['Rainy, short and sweet', 'Met Luna at the pond', 'Long sunny loop', 'Evening stroll'][i],
    } satisfies Walk
  })
}

const DEF: State = { dog: 'Biscuit', imperial: false, tiles: false, walks: sampleWalks(), active: null, sel: 's3' }
const W = 800
const H = 480

function GeoMap({ routes, marks, osm, me }: { routes: { pts: LL[]; color: string }[]; marks: { ll: LL; icon: string }[]; osm: boolean; me?: LL }) {
  const [zoom, setZoom] = useState(0)
  const all = routes.flatMap((r) => r.pts).concat(me ? [me] : [])
  const base = fitView(all.length ? all : [PARK], W, H, 50, 18)
  const zz = Math.max(2, Math.min(19, base.z + zoom))
  const v: View = { ...base, z: zz, cx: base.cx * 2 ** (zz - base.z), cy: base.cy * 2 ** (zz - base.z) }
  const lat = all[0]?.[0] ?? PARK[0]
  const mpp = metresPerPx(lat, v.z)
  const scale = niceScale(mpp * 160)
  const grid = scale / mpp
  const path = (pts: LL[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${toScreen(p, v).map((n) => n.toFixed(1)).join(',')}`).join('')
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block', borderRadius: 10, background: osm ? '#e5e7eb' : 'color-mix(in srgb, #10b981 9%, var(--panel))', border: '1px solid var(--line)' }}>
        {osm
          ? tiles(v).map((t) => <image key={`${t.x}-${t.y}-${t.sx}`} href={`https://tile.openstreetmap.org/${t.z}/${t.x}/${t.y}.png`} x={t.sx} y={t.sy} width={256} height={256} />)
          : [
              ...Array.from({ length: Math.ceil(W / grid) + 1 }, (_, i) => {
                const x = (Math.ceil((v.cx - W / 2) / grid) + i) * grid - v.cx + W / 2
                return <line key={'x' + i} x1={x} x2={x} y1={0} y2={H} stroke="var(--line)" strokeWidth={1} />
              }),
              ...Array.from({ length: Math.ceil(H / grid) + 1 }, (_, i) => {
                const y = (Math.ceil((v.cy - H / 2) / grid) + i) * grid - v.cy + H / 2
                return <line key={'y' + i} y1={y} y2={y} x1={0} x2={W} stroke="var(--line)" strokeWidth={1} />
              }),
            ]}
        {routes.map((r, i) => (
          <g key={i}>
            <path d={path(r.pts)} fill="none" stroke="#fff" strokeOpacity={0.8} strokeWidth={9} strokeLinejoin="round" strokeLinecap="round" />
            <path d={path(r.pts)} fill="none" stroke={r.color} strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" />
          </g>
        ))}
        {routes[0]?.pts.length ? (
          <>
            <circle cx={toScreen(routes[0].pts[0], v)[0]} cy={toScreen(routes[0].pts[0], v)[1]} r={9} fill="#10b981" stroke="#fff" strokeWidth={3} />
            <circle cx={toScreen(routes[0].pts[routes[0].pts.length - 1], v)[0]} cy={toScreen(routes[0].pts[routes[0].pts.length - 1], v)[1]} r={9} fill="#ef4444" stroke="#fff" strokeWidth={3} />
          </>
        ) : null}
        {marks.map((m, i) => {
          const [x, y] = toScreen(m.ll, v)
          return <text key={i} x={x} y={y} fontSize={22} textAnchor="middle" dominantBaseline="central">{m.icon}</text>
        })}
        {me && (
          <g transform={`translate(${toScreen(me, v).join(',')})`}>
            <circle r={16} fill="#3b82f6" opacity={0.25} />
            <text fontSize={24} textAnchor="middle" dominantBaseline="central">🐕</text>
          </g>
        )}
        <g transform={`translate(20 ${H - 24})`}>
          <rect x={-8} y={-22} width={grid + 16} height={34} rx={6} fill="var(--panel)" opacity={0.85} />
          <path d={`M0 0 H${grid} M0 -6 V0 M${grid} -6 V0`} stroke="var(--fg)" strokeWidth={2} fill="none" />
          <text x={grid / 2} y={-8} fontSize={13} textAnchor="middle" fill="var(--fg)">{scale >= 1000 ? `${scale / 1000} km` : `${scale} m`}</text>
        </g>
        <g transform={`translate(${W - 34} 36)`}>
          <circle r={20} fill="var(--panel)" opacity={0.85} />
          <path d="M0 -14 L6 4 L0 0 L-6 4 Z" fill="#ef4444" />
          <text y={15} fontSize={11} textAnchor="middle" fill="var(--fg)" fontWeight={700}>N</text>
        </g>
        {osm && <text x={W - 8} y={H - 6} fontSize={11} textAnchor="end" fill="#334155">© OpenStreetMap contributors</text>}
      </svg>
      <div style={{ position: 'absolute', left: 10, top: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <button type="button" className="k-btn" onClick={() => setZoom(zoom + 1)} aria-label="Zoom in">＋</button>
        <button type="button" className="k-btn" onClick={() => setZoom(zoom - 1)} aria-label="Zoom out">－</button>
        {zoom !== 0 && <button type="button" className="k-btn" onClick={() => setZoom(0)} aria-label="Fit">⤢</button>}
      </div>
    </div>
  )
}

export default function DogWalkTracker() {
  const [s, set] = useToolState('dog-walk-tracker', DEF)
  const [now, setNow] = useState(0)
  const [today] = useState(() => Date.now())
  const [err, setErr] = useState('')
  const [acc, setAcc] = useState<number | null>(null)
  const watch = useRef<number | null>(null)
  const demoRoute = useRef<LL[]>([])
  const a = s.active

  // Clock for the live timer
  useEffect(() => {
    if (!a || a.demo) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [a])

  // Demo playback: one simulated fix (5 s of walking) every 150 ms
  useEffect(() => {
    if (!a?.demo) return
    const id = setInterval(() => {
      set((st) => {
        const act = st.active
        if (!act) return st
        const i = act.pts.length
        const p = demoRoute.current[i]
        if (!p) return st
        const r = rng(i)
        const n = (r() - 0.5) * 0.00004
        return { ...st, active: { ...act, pts: [...act.pts, [p[0] + n, p[1] + n, act.start + i * 5000, 5]] } }
      })
    }, 150)
    return () => clearInterval(id)
  }, [a?.demo, set])

  useEffect(() => () => {
    if (watch.current != null) navigator.geolocation.clearWatch(watch.current)
  }, [])

  const startReal = () => {
    if (!('geolocation' in navigator)) return setErr('Geolocation is not available in this browser. Try the demo walk.')
    setErr('')
    const t = Date.now()
    set({ active: { start: t, pts: [], marks: [], demo: false } })
    setNow(t)
    watch.current = navigator.geolocation.watchPosition(
      (pos) => {
        setAcc(pos.coords.accuracy)
        set((st) => {
          const act = st.active
          if (!act || act.demo) return st
          const last = act.pts[act.pts.length - 1]
          const f = { lat: pos.coords.latitude, lon: pos.coords.longitude, t: pos.timestamp, acc: pos.coords.accuracy }
          if (!acceptFix(last && { lat: last[0], lon: last[1], t: last[2], acc: last[3] }, f)) return st
          return { ...st, active: { ...act, pts: [...act.pts, [+f.lat.toFixed(6), +f.lon.toFixed(6), f.t, Math.round(f.acc)]] } }
        })
      },
      (e) => setErr(e.code === 1 ? 'Location permission denied. Allow location for this site, or try the demo walk.' : `Location error: ${e.message}`),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    )
  }
  const startDemo = () => {
    const seed = Math.floor(Math.random() * 1000)
    demoRoute.current = loopRoute([PARK[0] + 0.002, PARK[1]], seed, 1500 + (seed % 10) * 150, 7)
    set({ active: { start: Date.now(), pts: [], marks: [], demo: true } })
  }
  const finish = (save: boolean) => {
    if (watch.current != null) navigator.geolocation.clearWatch(watch.current)
    watch.current = null
    if (!a) return
    const ll = a.pts.map((p) => [p[0], p[1]] as LL)
    const end = a.demo ? (a.pts[a.pts.length - 1]?.[2] ?? a.start) : Date.now()
    if (save && a.pts.length >= 2) {
      const w: Walk = { id: uid(), start: a.start, end, dist: pathLength(ll), pts: thin(a.pts, 400).map((p) => [p[0], p[1], Math.round((p[2] - a.start) / 1000)]), marks: a.marks, note: a.demo ? 'Demo walk' : '' }
      set({ walks: [...s.walks, w], active: null, sel: w.id })
    } else set({ active: null })
  }
  const mark = (k: MarkKind) => {
    if (!a || !a.pts.length) return
    const p = a.pts[a.pts.length - 1]
    set({ active: { ...a, marks: [...a.marks, { k, lat: p[0], lon: p[1], t: p[2] }] } })
  }

  const liveLL = a ? a.pts.map((p) => [p[0], p[1]] as LL) : []
  const liveDist = pathLength(liveLL)
  const liveSec = a ? ((a.demo ? (a.pts[a.pts.length - 1]?.[2] ?? a.start) : Math.max(now, a.start)) - a.start) / 1000 : 0
  const walks = [...s.walks].sort((x, y) => y.start - x.start)
  const sel = walks.find((w) => w.id === s.sel) ?? walks[0]
  const dur = (sec: number) => `${Math.floor(sec / 3600) ? Math.floor(sec / 3600) + 'h ' : ''}${Math.floor((sec % 3600) / 60)}m ${String(Math.floor(sec % 60)).padStart(2, '0')}s`
  const d = (m: number) => fmtDist(m, s.imperial)
  const dayKey = (t: number) => new Date(t).toDateString()
  const week = Array.from({ length: 7 }, (_, i) => {
    const ref = new Date(today)
    const dd = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - 6 + i)
    const m = s.walks.filter((w) => dayKey(w.start) === dd.toDateString()).reduce((x, w) => x + w.dist, 0)
    return { label: dd.toLocaleDateString('en-US', { weekday: 'short' }), value: +(m / (s.imperial ? 1609.344 : 1000)).toFixed(2) }
  })
  const weekTotal = week.reduce((x, b) => x + b.value, 0)

  return (
    <Split wide="right">
      <div>
        <Panel title={a ? (a.demo ? '🐾 Demo walk in progress' : '🐾 Walk in progress') : 'New walk'}>
          {!a ? (
            <>
              <Txt label="Dog's name" value={s.dog} onChange={(dog) => set({ dog })} />
              <Row>
                <Btn kind="primary" onClick={startReal}>▶ Start walk (GPS)</Btn>
                <Btn onClick={startDemo}>▶ Demo walk</Btn>
              </Row>
              <p className="muted" style={{ fontSize: 13 }}>Keep the screen on during a real walk. Browsers pause GPS for background tabs. The demo replays a simulated walk at 33× speed.</p>
            </>
          ) : (
            <>
              <Stats>
                <Stat label="Distance" value={d(liveDist)} tone="accent" />
                <Stat label="Time" value={dur(liveSec)} />
                <Stat label="Pace" value={fmtPace(liveDist, liveSec, s.imperial)} />
              </Stats>
              {!a.demo && <p className="muted" style={{ fontSize: 13 }}>{a.pts.length} GPS points{acc != null ? ` · accuracy ±${Math.round(acc)} m` : ' · waiting for GPS…'}</p>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, margin: '8px 0' }}>
                {(Object.keys(MARKS) as MarkKind[]).map((k) => (
                  <button key={k} type="button" className="k-btn" onClick={() => mark(k)} disabled={!a.pts.length} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 8 }}>
                    <span style={{ fontSize: 24 }}>{MARKS[k][0]}</span>
                    <span style={{ fontSize: 11 }}>{MARKS[k][1]}</span>
                  </button>
                ))}
              </div>
              <Row>
                <Btn kind="primary" onClick={() => finish(true)}>■ Finish & save</Btn>
                <Btn kind="ghost" onClick={() => finish(false)}>Discard</Btn>
              </Row>
            </>
          )}
          {err && <Note tone="warn">{err}</Note>}
        </Panel>
        <Panel title="This week">
          <BarChart bars={week} height={170} fy={(v) => v.toFixed(1)} />
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>{s.dog || 'Your dog'} walked <b>{weekTotal.toFixed(1)} {s.imperial ? 'mi' : 'km'}</b> in the last 7 days.</p>
        </Panel>
        <Panel title="Settings">
          <Seg value={s.imperial ? 'i' : 'm'} onChange={(x) => set({ imperial: x === 'i' })} options={[['m', 'km'], ['i', 'miles']]} />
          <Check label="Show OpenStreetMap tiles (loads map images from openstreetmap.org)" value={s.tiles} onChange={(t) => set({ tiles: t })} />
          <p className="muted" style={{ fontSize: 13 }}>Without tiles, the map is drawn locally and nothing leaves your browser. Walks are stored on this device only.</p>
          <JsonButtons name="dog-walks.json" data={s} onLoad={(x) => set({ ...x, active: null })} />
        </Panel>
      </div>
      <div>
        <Panel
          title={a ? 'Live route' : sel ? `${new Date(sel.start).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} · ${d(sel.dist)}` : 'Map'}
          actions={!a && sel ? <Btn onClick={() => download(`walk-${new Date(sel.start).toISOString().slice(0, 10)}.gpx`, toGpx(`${s.dog} walk`, sel.pts.map((p) => ({ lat: p[0], lon: p[1], t: sel.start + p[2] * 1000 }))), 'application/gpx+xml')}>⬇ GPX</Btn> : undefined}
        >
          {a ? (
            <GeoMap routes={liveLL.length ? [{ pts: liveLL, color: '#3b82f6' }] : []} marks={a.marks.map((m) => ({ ll: [m.lat, m.lon], icon: MARKS[m.k][0] }))} osm={s.tiles} me={liveLL[liveLL.length - 1]} />
          ) : sel ? (
            <>
              <GeoMap routes={[{ pts: sel.pts.map((p) => [p[0], p[1]] as LL), color: '#f97316' }]} marks={sel.marks.map((m) => ({ ll: [m.lat, m.lon], icon: MARKS[m.k][0] }))} osm={s.tiles} />
              <Row>
                <span className="muted">⏱ {dur((sel.end - sel.start) / 1000)} · {fmtPace(sel.dist, (sel.end - sel.start) / 1000, s.imperial)} · {sel.marks.map((m) => MARKS[m.k][0]).join(' ') || 'no stops marked'}</span>
              </Row>
              <Txt label="Note" value={sel.note} onChange={(note) => set({ walks: s.walks.map((w) => (w.id === sel.id ? { ...w, note } : w)) })} placeholder="Weather, mood, who you met…" />
            </>
          ) : (
            <Note>No walks yet. Start one, or try the demo.</Note>
          )}
        </Panel>
        <Panel title={`Walk history (${walks.length})`}>
          <Table
            head={['Date', 'Distance', 'Time', 'Pace', 'Note', '']}
            rows={walks.map((w) => [
              <a key="d" href="#" onClick={(e) => { e.preventDefault(); set({ sel: w.id }) }} style={{ fontWeight: w.id === sel?.id ? 800 : 500 }}>{new Date(w.start).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</a>,
              d(w.dist),
              dur((w.end - w.start) / 1000),
              fmtPace(w.dist, (w.end - w.start) / 1000, s.imperial),
              <span key="n" className="muted">{w.note}</span>,
              <Btn key="x" kind="ghost" title="Delete walk" onClick={() => set({ walks: s.walks.filter((x) => x.id !== w.id) })}>✕</Btn>,
            ])}
            max={12}
          />
          <p className="muted" style={{ fontSize: 13 }}>Total: {d(s.walks.reduce((x, w) => x + w.dist, 0))} over {s.walks.length} walks. Longest: {d(Math.max(0, ...s.walks.map((w) => w.dist)))}. Distances use the haversine formula on filtered GPS fixes (accuracy ≤ 35 m, no jumps over 12 m/s).</p>
        </Panel>
      </div>
    </Split>
  )
}
