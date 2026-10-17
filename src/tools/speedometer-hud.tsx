import { useEffect, useRef, useState } from 'react'
import { Btn, Check, LineChart, Note, Num, Panel, Row, Seg, Slider, Split, Stat, Stats, useToolState } from '../kit'
import { addFix, compass, emptyTrip, FACTOR, LABEL, type Fix, type Trip, type Unit } from './lib/speedometer-hud'

const COLORS = { green: '#22c55e', cyan: '#22d3ee', amber: '#fbbf24', white: '#f8fafc' }
type Col = keyof typeof COLORS
const DEF = { unit: 'kmh' as Unit, mirror: false, color: 'green' as Col, limit: 50, alert: true, decimals: false, smooth: 0.5, wake: true }

type WakeLock = { release(): Promise<void>; addEventListener(t: 'release', f: () => void): void }
const wakeApi = (navigator as unknown as { wakeLock?: { request(t: 'screen'): Promise<WakeLock> } }).wakeLock

/** Synthetic drive: city stop-and-go, then a faster road. Returns speed in m/s for second t. */
const demoSpeed = (t: number) => {
  const c = t % 150
  const base = c < 10 ? c * 1.4 : c < 40 ? 13.5 + Math.sin(c / 4) * 1.2 : c < 48 ? 13.5 - (c - 40) * 1.7 : c < 55 ? 0 : c < 70 ? (c - 55) * 1.6 : c < 120 ? 24 + Math.sin(c / 6) * 2 : Math.max(0, 24 - (c - 120) * 0.9)
  return Math.max(0, base + Math.sin(t * 1.7) * 0.25)
}

export default function SpeedometerHud() {
  const [s, set] = useToolState('speedometer-hud', DEF)
  const [mode, setMode] = useState<'demo' | 'gps' | 'off'>('demo')
  const [trip, setTrip] = useState<Trip>(emptyTrip)
  const [hist, setHist] = useState<[number, number][]>([])
  const [err, setErr] = useState('')
  const [acc, setAcc] = useState<number | null>(null)
  const [lock, setLock] = useState<WakeLock | null>(null)
  const hud = useRef<HTMLDivElement>(null)
  const t0 = useRef(0)
  const over = useRef(false)
  const smooth = s.smooth

  const push = (f: Fix) => {
    if (!t0.current) t0.current = f.t
    setAcc(f.acc)
    setTrip((tr) => {
      const n = addFix(tr, f, smooth)
      setHist((h) => [...h.slice(-179), [(f.t - t0.current) / 1000, n.speed]])
      return n
    })
  }
  const resetTrip = () => { setTrip(emptyTrip()); setHist([]); t0.current = 0 }

  useEffect(() => {
    if (mode === 'demo') {
      let t = 62, lat = 38.7223, lon = -9.1393
      const tick = () => {
        const v = demoSpeed(t)
        const hd = (t * 0.6) % 360
        lat += (v * Math.cos((hd * Math.PI) / 180)) / 111320
        lon += (v * Math.sin((hd * Math.PI) / 180)) / (111320 * Math.cos((lat * Math.PI) / 180))
        push({ lat, lon, t: Date.now(), speed: v, acc: 4 + Math.random() * 3, heading: hd })
        t++
      }
      tick()
      const id = setInterval(tick, 1000)
      return () => clearInterval(id)
    }
    if (mode === 'gps') {
      if (!('geolocation' in navigator)) return
      const id = navigator.geolocation.watchPosition(
        (p) => { setErr(''); push({ lat: p.coords.latitude, lon: p.coords.longitude, t: p.timestamp, speed: p.coords.speed, acc: p.coords.accuracy, heading: p.coords.heading }) },
        (e) => setErr(e.code === 1 ? 'Location permission denied. Allow location for this site and try again.' : `GPS error: ${e.message}`),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
      )
      return () => navigator.geolocation.clearWatch(id)
    }
  }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the screen on while the HUD runs.
  useEffect(() => {
    if (!s.wake || mode === 'off' || !wakeApi) return
    let l: WakeLock | null = null, dead = false
    const get = () => wakeApi.request('screen').then((x) => { if (dead) { void x.release(); return } l = x; setLock(x); x.addEventListener('release', () => setLock(null)) }).catch(() => setLock(null))
    void get()
    const vis = () => { if (document.visibilityState === 'visible') void get() }
    document.addEventListener('visibilitychange', vis)
    return () => { dead = true; document.removeEventListener('visibilitychange', vis); void l?.release(); setLock(null) }
  }, [s.wake, mode])

  const k = FACTOR[s.unit]
  const v = trip.speed * k
  const isOver = s.limit > 0 && v > s.limit + 0.5
  useEffect(() => {
    if (isOver && !over.current && s.alert && mode !== 'off') {
      try {
        const ctx = new AudioContext(), o = ctx.createOscillator(), g = ctx.createGain()
        o.frequency.value = 880; g.gain.setValueAtTime(0.2, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
        o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.4); setTimeout(() => void ctx.close(), 600)
      } catch { /* no audio */ }
    }
    over.current = isOver
  }, [isOver, s.alert, mode])

  const col = isOver ? '#ef4444' : COLORS[s.color]
  const shown = mode === 'off' && !trip.last ? '--' : s.decimals ? v.toFixed(1) : String(Math.round(v))
  const maxScale = s.unit === 'ms' ? 50 : s.unit === 'kmh' ? 200 : 130
  const frac = Math.min(1, v / maxScale)
  const R = 80, a0 = Math.PI * 0.75, sweep = Math.PI * 1.5
  const pt = (f: number, r = R) => [100 + r * Math.cos(a0 + sweep * f), 100 + r * Math.sin(a0 + sweep * f)]
  const arc = (f: number) => { const [x0, y0] = pt(0), [x1, y1] = pt(f); return `M${x0},${y0}A${R},${R} 0 ${sweep * f > Math.PI ? 1 : 0} 1 ${x1},${y1}` }
  const moving = trip.moving
  const avg = moving > 0 ? (trip.dist / moving) * k : 0
  const distU = s.unit === 'mph' ? trip.dist / 1609.344 : s.unit === 'kn' ? trip.dist / 1852 : trip.dist / 1000
  const distL = s.unit === 'mph' ? 'mi' : s.unit === 'kn' ? 'nmi' : 'km'
  const fmtT = (sec: number) => `${Math.floor(sec / 3600)}:${String(Math.floor(sec / 60) % 60).padStart(2, '0')}:${String(Math.floor(sec) % 60).padStart(2, '0')}`

  return (
    <Split wide="right">
      <div>
        <Panel title="Source">
          <Seg value={mode} onChange={(m) => { resetTrip(); setMode(m) }} options={[['demo', '🎬 Demo drive'], ['gps', '📡 Live GPS'], ['off', '⏸ Off']]} />
          {mode === 'demo' && <Note>Simulated drive so you can try the display. Switch to Live GPS in a vehicle — it needs a phone with GPS and location permission.</Note>}
          {mode === 'gps' && !err && !trip.last && <Note>Waiting for a GPS fix… go outside or near a window.</Note>}
          {mode === 'gps' && !('geolocation' in navigator) && <Note tone="err">Geolocation is not supported by this browser.</Note>}
          {err && <Note tone="err">{err}</Note>}
          {acc !== null && mode !== 'off' && <p className="muted">Accuracy ±{Math.round(acc)} m {acc > 30 && '— weak signal, speed may jump'}</p>}
          <Btn kind="ghost" onClick={resetTrip}>Reset trip</Btn>
        </Panel>
        <Panel title="Display">
          <Seg value={s.unit} onChange={(unit) => set({ unit })} options={[['kmh', 'km/h'], ['mph', 'mph'], ['kn', 'knots'], ['ms', 'm/s']]} />
          <Row>
            {(Object.keys(COLORS) as Col[]).map((c) => <Btn key={c} kind={s.color === c ? 'primary' : 'ghost'} onClick={() => set({ color: c })}><span style={{ color: COLORS[c] }}>●</span> {c}</Btn>)}
          </Row>
          <Check label="Mirror for windshield (HUD) reflection" value={s.mirror} onChange={(mirror) => set({ mirror })} />
          <Check label="Show one decimal" value={s.decimals} onChange={(decimals) => set({ decimals })} />
          <Check label={`Keep screen awake ${wakeApi ? (lock ? '(active)' : '') : '(not supported)'}`} value={s.wake} onChange={(wake) => set({ wake })} />
          <Slider label="Smoothing" min={0.1} max={1} step={0.05} value={s.smooth} onChange={(smooth) => set({ smooth })} show={(x) => (x >= 1 ? 'off' : x.toFixed(2))} />
        </Panel>
        <Panel title="Speed limit alert">
          <Num label={`Limit (${LABEL[s.unit]})`} min={0} max={400} value={s.limit} onChange={(limit) => set({ limit })} />
          <Check label="Beep when over the limit" value={s.alert} onChange={(alert) => set({ alert })} />
          <Row>{(s.unit === 'mph' ? [25, 30, 45, 55, 65, 70] : [30, 50, 80, 100, 120, 130]).map((l) => <Btn key={l} kind={s.limit === l ? 'primary' : 'ghost'} onClick={() => set({ limit: l })}>{l}</Btn>)}</Row>
        </Panel>
      </div>
      <div>
        <Panel title="HUD" actions={<Btn onClick={() => void hud.current?.requestFullscreen?.()}>⛶ Fullscreen</Btn>}>
          <div ref={hud} style={{ background: '#000', borderRadius: 12, padding: '18px 12px', color: col, textAlign: 'center', transform: s.mirror ? 'scaleX(-1)' : undefined, userSelect: 'none', display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 300 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, flexWrap: 'wrap' }}>
              <svg viewBox="0 0 200 175" width={230} role="img" aria-label="Speed gauge">
                <path d={arc(1)} fill="none" stroke="#1f2937" strokeWidth={14} strokeLinecap="round" />
                <path d={arc(Math.max(0.001, frac))} fill="none" stroke={col} strokeWidth={14} strokeLinecap="round" />
                {s.limit > 0 && s.limit < maxScale && (() => { const [x0, y0] = pt(s.limit / maxScale, 64), [x1, y1] = pt(s.limit / maxScale, 94); return <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="#ef4444" strokeWidth={3} /> })()}
                {[0, 0.25, 0.5, 0.75, 1].map((f) => { const [x, y] = pt(f, 58); return <text key={f} x={x} y={y + 4} fill="#6b7280" fontSize={11} textAnchor="middle">{Math.round(f * maxScale)}</text> })}
                <text x={100} y={112} fill={col} fontSize={44} fontWeight={800} textAnchor="middle" fontFamily="ui-monospace, monospace">{shown}</text>
                <text x={100} y={134} fill="#9ca3af" fontSize={13} textAnchor="middle">{LABEL[s.unit]}</text>
              </svg>
              <div style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 800, fontSize: 'clamp(72px, 16vw, 150px)', lineHeight: 1, textShadow: `0 0 18px ${col}66` }}>
                {shown}
                <div style={{ fontSize: 18, color: '#9ca3af', fontWeight: 600 }}>{LABEL[s.unit]} · {trip.heading !== null ? `${compass(trip.heading)} ${Math.round(trip.heading)}°` : '—'}</div>
              </div>
            </div>
            {isOver && <div style={{ fontSize: 22, fontWeight: 800, color: '#ef4444' }}>⚠ OVER {s.limit} {LABEL[s.unit]}</div>}
          </div>
          <p className="muted" style={{ fontSize: 12 }}>For HUD use: turn on mirror, max brightness, fullscreen, and lay the phone under the windshield at night. Never interact with it while driving.</p>
        </Panel>
        <Stats>
          <Stat label="Max speed" value={`${(trip.max * k).toFixed(0)} ${LABEL[s.unit]}`} tone="accent" />
          <Stat label="Average (moving)" value={`${avg.toFixed(0)} ${LABEL[s.unit]}`} />
          <Stat label="Distance" value={`${distU.toFixed(2)} ${distL}`} />
          <Stat label="Moving time" value={fmtT(moving)} />
        </Stats>
        <Panel title="Speed history (last 3 min)">
          <LineChart series={[{ name: 'Speed', points: hist.map(([t, sp]) => [t, sp * k]), area: true, color: COLORS[s.color] }, ...(s.limit > 0 && hist.length ? [{ name: 'Limit', points: [[hist[0][0], s.limit], [hist[hist.length - 1][0], s.limit]] as [number, number][], color: '#ef4444', dashed: true }] : [])]}
            height={180} fx={(x) => `${Math.round(x)}s`} fy={(y) => y.toFixed(0)} yMin={0} />
          <Note>Speed comes from the GPS chip’s Doppler measurement when available (accurate to ~1 km/h), otherwise from distance between fixes. GPS speed is usually closer to the truth than a car’s speedometer, which reads a few percent high.</Note>
        </Panel>
      </div>
    </Split>
  )
}
