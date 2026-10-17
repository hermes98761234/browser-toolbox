import { useEffect, useRef, useState } from 'react'
import { Btn, Check, download, Note, Num, Panel, Row, Seg, Split, Stat, Stats, Txt, useToolState } from '../kit'
import { fitView, fmtDist, metresPerPx, niceScale, tiles, toScreen, type LL, type View } from './lib/dog-walk-tracker'
import { bearing, compass, haversine, meterIcs, meterLeft, walkMinutes } from './lib/parking-spot-saver'

interface Spot { lat: number; lon: number; acc: number; at: number; level: string; note: string; photo: string; demo?: boolean }
interface State { spot: Spot | null; meterEnd: number | null; warn: number; imperial: boolean; tiles: boolean; history: Spot[] }

const DEMO_CAR: LL = [40.7484, -73.9857]
const DEMO_ME: LL = [40.7509, -73.9881]
const DEF: State = {
  spot: { lat: DEMO_CAR[0], lon: DEMO_CAR[1], acc: 8, at: 0, level: 'Level P2, bay 14', note: 'Blue pillar, next to the elevator', photo: '', demo: true },
  meterEnd: null,
  warn: 10,
  imperial: false,
  tiles: false,
  history: [],
}
const W = 640
const H = 380

function MiniMap({ car, me, osm }: { car: LL; me: LL | null; osm: boolean }) {
  const pts = me ? [car, me] : [car]
  const v: View = fitView(pts, W, H, 70, 17)
  const mpp = metresPerPx(car[0], v.z)
  const scale = niceScale(mpp * 140)
  const grid = scale / mpp
  const [cx, cy] = toScreen(car, v)
  const m = me && toScreen(me, v)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block', borderRadius: 10, border: '1px solid var(--line)', background: osm ? '#e5e7eb' : 'color-mix(in srgb, #0ea5e9 7%, var(--panel))' }}>
      {osm
        ? tiles(v).map((t) => <image key={`${t.x}-${t.y}`} href={`https://tile.openstreetmap.org/${t.z}/${t.x}/${t.y}.png`} x={t.sx} y={t.sy} width={256} height={256} />)
        : [
            ...Array.from({ length: Math.ceil(W / grid) + 1 }, (_, i) => {
              const x = (Math.ceil((v.cx - W / 2) / grid) + i) * grid - v.cx + W / 2
              return <line key={'x' + i} x1={x} x2={x} y1={0} y2={H} stroke="var(--line)" />
            }),
            ...Array.from({ length: Math.ceil(H / grid) + 1 }, (_, i) => {
              const y = (Math.ceil((v.cy - H / 2) / grid) + i) * grid - v.cy + H / 2
              return <line key={'y' + i} x1={0} x2={W} y1={y} y2={y} stroke="var(--line)" />
            }),
          ]}
      {m && <line x1={m[0]} y1={m[1]} x2={cx} y2={cy} stroke="#6366f1" strokeWidth={4} strokeDasharray="10 8" strokeLinecap="round" />}
      <g transform={`translate(${cx} ${cy})`}>
        <path d="M0 0 C-14 -18 -18 -26 -18 -34 A18 18 0 1 1 18 -34 C18 -26 14 -18 0 0 Z" fill="#ef4444" stroke="#fff" strokeWidth={3} />
        <text y={-32} fontSize={20} textAnchor="middle" dominantBaseline="central">🚗</text>
      </g>
      {m && (
        <g transform={`translate(${m[0]} ${m[1]})`}>
          <circle r={18} fill="#3b82f6" opacity={0.2} />
          <circle r={8} fill="#3b82f6" stroke="#fff" strokeWidth={3} />
        </g>
      )}
      <g transform={`translate(18 ${H - 20})`}>
        <rect x={-8} y={-22} width={grid + 16} height={32} rx={6} fill="var(--panel)" opacity={0.85} />
        <path d={`M0 0 H${grid} M0 -6 V0 M${grid} -6 V0`} stroke="var(--fg)" strokeWidth={2} fill="none" />
        <text x={grid / 2} y={-8} fontSize={12} textAnchor="middle" fill="var(--fg)">{scale >= 1000 ? `${scale / 1000} km` : `${scale} m`}</text>
      </g>
      <g transform={`translate(${W - 30} 32)`}>
        <circle r={18} fill="var(--panel)" opacity={0.85} />
        <path d="M0 -12 L5 3 L0 0 L-5 3 Z" fill="#ef4444" />
        <text y={14} fontSize={10} textAnchor="middle" fontWeight={700} fill="var(--fg)">N</text>
      </g>
      {osm && <text x={W - 6} y={H - 6} fontSize={10} textAnchor="end" fill="#334155">© OpenStreetMap contributors</text>}
    </svg>
  )
}

async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const k = Math.min(1, 640 / Math.max(img.width, img.height))
    const c = document.createElement('canvas')
    c.width = Math.round(img.width * k)
    c.height = Math.round(img.height * k)
    c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.7)
  } finally {
    URL.revokeObjectURL(url)
  }
}

function notify(title: string, body: string) {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification(title, { body })
    const ctx = new AudioContext()
    ;[0, 0.3, 0.6].forEach((t) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.frequency.value = 988
      g.gain.setValueAtTime(0.2, ctx.currentTime + t)
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.25)
      o.connect(g).connect(ctx.destination)
      o.start(ctx.currentTime + t)
      o.stop(ctx.currentTime + t + 0.26)
    })
  } catch {
    /* ignore */
  }
}

export default function ParkingSpotSaver() {
  const [s, set] = useToolState('parking-spot-saver', DEF)
  const [now, setNow] = useState(0)
  const [me, setMe] = useState<LL | null>(s.spot?.demo ? DEMO_ME : null)
  const [heading, setHeading] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [mins, setMins] = useState(60)
  const watch = useRef<number | null>(null)
  const oriOff = useRef<(() => void) | null>(null)
  const warned = useRef<{ end: number; warn: boolean; done: boolean }>({ end: 0, warn: false, done: false })
  const spot = s.spot
  const car: LL | null = spot ? [spot.lat, spot.lon] : null

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    const t = setTimeout(() => setNow(Date.now()), 0)
    return () => {
      clearInterval(id)
      clearTimeout(t)
    }
  }, [])

  // Meter alerts while the page is open
  useEffect(() => {
    if (!s.meterEnd || !now) return
    const w = warned.current
    if (w.end !== s.meterEnd) warned.current = { end: s.meterEnd, warn: false, done: false }
    const left = s.meterEnd - now
    if (!warned.current.warn && left <= s.warn * 60_000 && left > 0) {
      warned.current.warn = true
      notify('🅿 Parking meter', `${s.warn} minutes left. ${spot?.level ?? ''}`)
    }
    if (!warned.current.done && left <= 0) {
      warned.current.done = true
      notify('🅿 Parking meter expired', spot?.level ?? 'Time is up')
    }
  }, [now, s.meterEnd, s.warn, spot?.level])

  useEffect(
    () => () => {
      if (watch.current != null) navigator.geolocation.clearWatch(watch.current)
      oriOff.current?.()
    },
    [],
  )

  const save = () => {
    if (!('geolocation' in navigator)) return setErr('Geolocation is not available here.')
    setBusy(true)
    setErr('')
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setBusy(false)
        const sp: Spot = { lat: p.coords.latitude, lon: p.coords.longitude, acc: Math.round(p.coords.accuracy), at: Date.now(), level: '', note: '', photo: '' }
        set({ spot: sp, history: spot && !spot.demo ? [{ ...spot, photo: '' }, ...s.history].slice(0, 5) : s.history })
        setMe([sp.lat, sp.lon])
      },
      (e) => {
        setBusy(false)
        setErr(e.code === 1 ? 'Location permission denied. Allow location for this site to save your spot.' : `Could not get a location: ${e.message}`)
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    )
  }
  const track = () => {
    if (!('geolocation' in navigator)) return
    if (watch.current != null) navigator.geolocation.clearWatch(watch.current)
    watch.current = navigator.geolocation.watchPosition((p) => setMe([p.coords.latitude, p.coords.longitude]), (e) => setErr(`Location error: ${e.message}`), { enableHighAccuracy: true })
    const onOri = (e: DeviceOrientationEvent) => {
      const w = e as DeviceOrientationEvent & { webkitCompassHeading?: number }
      if (w.webkitCompassHeading != null) setHeading(w.webkitCompassHeading)
      else if (e.absolute && e.alpha != null) setHeading((360 - e.alpha) % 360)
    }
    oriOff.current?.()
    window.addEventListener('deviceorientationabsolute', onOri as EventListener)
    window.addEventListener('deviceorientation', onOri)
    oriOff.current = () => {
      window.removeEventListener('deviceorientationabsolute', onOri as EventListener)
      window.removeEventListener('deviceorientation', onOri)
    }
  }
  const edit = (p: Partial<Spot>) => spot && set({ spot: { ...spot, ...p } })
  const askNotify = async () => {
    if (typeof Notification !== 'undefined') await Notification.requestPermission()
  }

  const dist = car && me ? haversine(me, car) : null
  const brg = car && me ? bearing(me, car) : 0
  const arrow = heading != null ? brg - heading : brg
  const meter = s.meterEnd && now ? meterLeft(s.meterEnd, now) : null
  const d = (m: number) => fmtDist(m, s.imperial)
  const savedAgo = spot && spot.at && now ? Math.max(0, Math.round((now - spot.at) / 60000)) : null

  return (
    <Split wide="right">
      <div>
        <Panel title="Parked here">
          {spot?.demo && <Note>This is a demo spot near the Empire State Building, with a simulated "you" two blocks away. Tap <b>Save my parking spot</b> to use your real location.</Note>}
          <button type="button" className="k-btn primary" style={{ width: '100%', fontSize: 20, padding: 16 }} onClick={save} disabled={busy}>
            {busy ? 'Locating…' : '📍 Save my parking spot'}
          </button>
          {err && <Note tone="warn">{err}</Note>}
          {spot && (
            <>
              <p className="muted" style={{ fontSize: 13 }}>
                {spot.lat.toFixed(5)}, {spot.lon.toFixed(5)} · ±{spot.acc} m{savedAgo != null && !spot.demo ? ` · saved ${savedAgo < 60 ? savedAgo + ' min' : Math.round(savedAgo / 60) + ' h'} ago` : ''}
              </p>
              <Txt label="Level / bay / street" value={spot.level} onChange={(level) => edit({ level })} placeholder="e.g. P2, bay 14" />
              <Txt label="Note" value={spot.note} onChange={(note) => edit({ note })} placeholder="Landmark, exit, colour of the pillar…" />
              <label className="k-btn" style={{ display: 'inline-flex', marginTop: 6 }}>
                📷 {spot.photo ? 'Retake photo' : 'Add a photo'}
                <input type="file" accept="image/*" capture="environment" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) edit({ photo: await shrink(f) }) }} />
              </label>
              {spot.photo && (
                <div style={{ position: 'relative', marginTop: 8 }}>
                  <img src={spot.photo} alt="Parking spot" style={{ width: '100%', borderRadius: 10 }} />
                  <Btn kind="ghost" onClick={() => edit({ photo: '' })}>Remove photo</Btn>
                </div>
              )}
              <Row>
                <a className="k-btn" href={`https://www.openstreetmap.org/?mlat=${spot.lat}&mlon=${spot.lon}#map=18/${spot.lat}/${spot.lon}`} target="_blank" rel="noreferrer">Open in OSM</a>
                <a className="k-btn" href={`geo:${spot.lat},${spot.lon}?q=${spot.lat},${spot.lon}(My car)`}>Open in maps app</a>
                <Btn kind="ghost" onClick={() => set({ spot: null, meterEnd: null })}>Clear</Btn>
              </Row>
            </>
          )}
        </Panel>
        <Panel title="Parking meter">
          {meter ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 52, fontWeight: 800, fontFamily: 'var(--mono)', color: meter.expired ? 'var(--err)' : meter.ms < s.warn * 60_000 ? 'var(--warn)' : 'var(--ok)' }}>{meter.text}</div>
              <p className="muted" style={{ margin: 0 }}>{meter.expired ? 'Expired! Move the car or top up.' : `runs out at ${new Date(s.meterEnd ?? 0).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`}</p>
              {dist != null && !meter.expired && meter.ms < walkMinutes(dist) * 60_000 + 5 * 60_000 && <Note tone="warn">Walking back takes about {Math.ceil(walkMinutes(dist))} min. Leave now!</Note>}
              <Row>
                <Btn onClick={() => set({ meterEnd: (s.meterEnd ?? 0) + 15 * 60_000 })}>+15 min</Btn>
                <Btn onClick={() => download('parking-meter.ics', meterIcs(s.meterEnd ?? 0, s.warn, `${spot?.level ?? ''} ${spot?.note ?? ''}`.trim(), Date.now()), 'text/calendar')}>⬇ Calendar reminder</Btn>
                <Btn kind="ghost" onClick={() => set({ meterEnd: null })}>Stop</Btn>
              </Row>
            </div>
          ) : (
            <>
              <Row>
                {[15, 30, 60, 120, 240].map((m) => <Btn key={m} onClick={() => set({ meterEnd: Date.now() + m * 60_000 })}>{m < 60 ? `${m} min` : `${m / 60} h`}</Btn>)}
              </Row>
              <Row>
                <Num label="Custom" value={mins} onChange={setMins} unit="min" min={1} />
                <div style={{ alignSelf: 'end' }}><Btn kind="primary" onClick={() => set({ meterEnd: Date.now() + Math.max(1, mins) * 60_000 })}>Start</Btn></div>
              </Row>
            </>
          )}
          <Row>
            <Num label="Warn me before" value={s.warn} onChange={(warn) => set({ warn: Math.max(1, warn) })} unit="min" min={1} />
            {typeof Notification !== 'undefined' && Notification.permission !== 'granted' && <div style={{ alignSelf: 'end' }}><Btn kind="ghost" onClick={askNotify}>Allow notifications</Btn></div>}
          </Row>
          <p className="muted" style={{ fontSize: 13 }}>In-page alerts work while this tab is open. The calendar reminder also works if you close the browser.</p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Distance to car" value={dist != null ? d(dist) : '—'} tone="accent" sub={dist != null ? `~${Math.max(1, Math.ceil(walkMinutes(dist)))} min walk` : 'tap "Find my car"'} />
          <Stat
            label="Direction"
            value={
              dist != null ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ display: 'inline-block', transform: `rotate(${arrow}deg)`, transition: 'transform .3s', fontSize: 28 }}>⬆</span>
                  {compass(brg)}
                </span>
              ) : '—'
            }
            sub={dist != null ? `${Math.round(brg)}° ${heading != null ? '(arrow follows your compass)' : 'from north'}` : undefined}
          />
          <Stat label="Meter" value={meter ? meter.text : 'off'} tone={meter?.expired ? 'bad' : meter ? 'good' : undefined} />
        </Stats>
        <Panel
          title="Map"
          actions={
            <>
              {car && <Btn kind="primary" onClick={track}>🧭 Find my car</Btn>}
              <Seg value={s.imperial ? 'i' : 'm'} onChange={(x) => set({ imperial: x === 'i' })} options={[['m', 'm'], ['i', 'ft']]} />
            </>
          }
        >
          {car ? <MiniMap car={car} me={me} osm={s.tiles} /> : <Note>Save a spot to see it on the map.</Note>}
          <Check label="Show OpenStreetMap tiles (loads images from openstreetmap.org)" value={s.tiles} onChange={(t) => set({ tiles: t })} />
          {dist != null && dist < 15 && <Note tone="ok">You're right there. Look around! 🚗</Note>}
        </Panel>
        {s.history.length > 0 && (
          <Panel title="Previous spots">
            {s.history.map((h, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--line)' }}>
                <span style={{ flex: 1 }}>{new Date(h.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · {h.level || `${h.lat.toFixed(4)}, ${h.lon.toFixed(4)}`}</span>
                <Btn kind="ghost" onClick={() => set({ spot: h, history: s.history.filter((_, j) => j !== i) })}>Restore</Btn>
              </div>
            ))}
          </Panel>
        )}
      </div>
    </Split>
  )
}
