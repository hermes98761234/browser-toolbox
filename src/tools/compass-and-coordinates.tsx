import { useEffect, useRef, useState } from 'react'
import { Btn, CopyButton, Note, Num, Panel, Row, Split, Stat, Stats, Table, Txt, num, useToolState } from '../kit'
import { bearingDistance, cardinal, headingFromAlpha, parseAny, toDdm, toDms, toMgrs, toUtm } from './lib/compass-and-coordinates'

interface Saved { name: string; lat: number; lon: number }
interface State { decl: number; input: string; target: string; saved: Saved[] }
interface Fix { lat: number; lon: number; acc: number; alt: number | null; speed: number | null; time: number }

const DEF: State = {
  decl: 0,
  input: '48°51′29.6″N, 2°17′40.2″E',
  target: '51.4779, -0.0015',
  saved: [{ name: 'Greenwich meridian', lat: 51.4779, lon: -0.0015 }, { name: 'Eiffel Tower', lat: 48.8583, lon: 2.2945 }],
}
const DEMO: Fix = { lat: 50.4501, lon: 30.5234, acc: 8, alt: 179, speed: null, time: Date.now() }

type Src = 'off' | 'absolute' | 'webkit' | 'relative' | 'demo'
type OrientationCtor = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> }

function formats(lat: number, lon: number): [string, string][] {
  const u = toUtm(lat, lon)
  const mg = toMgrs(lat, lon)
  return [
    ['Decimal degrees', `${lat.toFixed(6)}, ${lon.toFixed(6)}`],
    ['DMS', `${toDms(lat, true)} ${toDms(lon, false)}`],
    ['Degrees + decimal minutes', `${toDdm(lat, true)} ${toDdm(lon, false)}`],
    ['UTM', `${u.zone}${u.band || u.hemi} ${u.easting.toFixed(0)}mE ${u.northing.toFixed(0)}mN`],
    ['MGRS', mg || 'n/a (polar region)'],
    ['Geo URI', `geo:${lat.toFixed(6)},${lon.toFixed(6)}`],
  ]
}

function Dial({ heading, target }: { heading: number | null; target: number | null }) {
  const h = heading ?? 0
  const ticks = Array.from({ length: 72 }, (_, i) => i * 5)
  return (
    <svg viewBox="-120 -120 240 240" style={{ width: '100%', maxWidth: 340, display: 'block', margin: '0 auto' }} role="img" aria-label={`Heading ${Math.round(h)} degrees`}>
      <circle r={116} fill="var(--panel2)" stroke="var(--line)" strokeWidth={2} />
      <g transform={`rotate(${-h})`} style={{ transition: 'transform 0.15s linear' }}>
        {ticks.map((t) => (
          <line key={t} x1={0} y1={-108} x2={0} y2={t % 30 === 0 ? -94 : -101} stroke={t === 0 ? '#ef4444' : 'var(--muted)'} strokeWidth={t % 30 === 0 ? 2 : 1} transform={`rotate(${t})`} />
        ))}
        {['N', 'E', 'S', 'W'].map((c, i) => (
          <text key={c} x={0} y={-76} transform={`rotate(${i * 90})`} textAnchor="middle" dominantBaseline="middle" fontSize={18} fontWeight={800} fill={c === 'N' ? '#ef4444' : 'var(--fg)'}>{c}</text>
        ))}
        {[30, 60, 120, 150, 210, 240, 300, 330].map((d) => (
          <text key={d} x={0} y={-82} transform={`rotate(${d})`} textAnchor="middle" dominantBaseline="middle" fontSize={9} fill="var(--muted)">{d}</text>
        ))}
        {target !== null && <path d="M0,-118 L-7,-104 L7,-104 Z" fill="var(--accent)" transform={`rotate(${target})`} />}
      </g>
      <path d="M0,-62 L9,0 L0,8 L-9,0 Z" fill="#ef4444" />
      <path d="M0,62 L9,0 L0,-8 L-9,0 Z" fill="var(--muted)" opacity={0.6} />
      <circle r={5} fill="var(--fg)" />
      <path d="M0,-119 L-6,-128 L6,-128 Z" fill="var(--fg)" transform="translate(0,6)" />
    </svg>
  )
}

export default function CompassAndCoordinates() {
  const [s, set, reset] = useToolState('compass-and-coordinates', DEF)
  const [src, setSrc] = useState<Src>('off')
  const [raw, setRaw] = useState<number | null>(null)
  const [fix, setFix] = useState<Fix | null>(null)
  const [geoErr, setGeoErr] = useState('')
  const [demo, setDemo] = useState(true)
  const stopRef = useRef<() => void>(() => {})
  const watchRef = useRef<number | null>(null)

  const hasOrientation = typeof window !== 'undefined' && 'DeviceOrientationEvent' in window
  const hasGeo = typeof navigator !== 'undefined' && 'geolocation' in navigator

  // Demo: a gently wandering heading and a fixed sample position.
  useEffect(() => {
    if (!demo) return
    setSrc('demo'); setFix(DEMO)
    let t = 0
    const id = window.setInterval(() => { t += 0.05; setRaw((((Math.sin(t * 0.7) * 70 + t * 12) % 360) + 360) % 360) }, 50)
    return () => window.clearInterval(id)
  }, [demo])

  useEffect(() => () => { stopRef.current(); if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current) }, [])

  const startCompass = async () => {
    setDemo(false)
    stopRef.current()
    const C = window.DeviceOrientationEvent as OrientationCtor
    if (C && typeof C.requestPermission === 'function') {
      try { if ((await C.requestPermission()) !== 'granted') { setSrc('off'); return } } catch { setSrc('off'); return }
    }
    let gotAbs = false
    const screenAngle = () => (screen.orientation?.angle ?? 0)
    const onAbs = (e: DeviceOrientationEvent) => { if (e.alpha === null) return; gotAbs = true; setSrc('absolute'); setRaw(headingFromAlpha(e.alpha, screenAngle())) }
    const onRel = (e: DeviceOrientationEvent) => {
      const w = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading
      if (typeof w === 'number' && w >= 0) { setSrc('webkit'); setRaw((w + screenAngle()) % 360); return }
      if (!gotAbs && e.alpha !== null) { setSrc(e.absolute ? 'absolute' : 'relative'); setRaw(headingFromAlpha(e.alpha, screenAngle())) }
    }
    window.addEventListener('deviceorientationabsolute', onAbs as EventListener)
    window.addEventListener('deviceorientation', onRel)
    stopRef.current = () => { window.removeEventListener('deviceorientationabsolute', onAbs as EventListener); window.removeEventListener('deviceorientation', onRel) }
    setSrc('relative'); setRaw(null)
  }

  const startGps = () => {
    if (!hasGeo) { setGeoErr('Geolocation is not available in this browser.'); return }
    setDemo(false); setGeoErr('')
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current)
    watchRef.current = navigator.geolocation.watchPosition(
      (p) => setFix({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, alt: p.coords.altitude, speed: p.coords.speed, time: p.timestamp }),
      (e) => setGeoErr(e.code === 1 ? 'Location permission denied.' : e.message || 'Could not get a position.'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    )
  }

  // webkitCompassHeading is magnetic; add declination to get true north. Others are reported as-is.
  const heading = raw === null ? null : src === 'webkit' ? (((raw + s.decl) % 360) + 360) % 360 : raw
  const tgt = parseAny(s.target)
  const bd = fix && tgt ? bearingDistance(fix.lat, fix.lon, tgt.lat, tgt.lon) : null
  const conv = parseAny(s.input)
  const turn = bd && heading !== null ? ((bd.bearing - heading + 540) % 360) - 180 : null
  const fmtDist = (m: number) => (m >= 1000 ? `${num(m / 1000, m > 100000 ? 0 : 2)} km` : `${num(m, 0)} m`)
  const srcLabel: Record<Src, string> = { off: 'Not started', absolute: 'Absolute orientation', webkit: 'iOS compass (magnetic)', relative: 'Relative only — not north-referenced', demo: 'Demo (simulated)' }

  return (
    <Split>
      <div>
        <Panel title="Compass" actions={<Row><Btn kind="primary" onClick={() => void startCompass()} disabled={!hasOrientation}>Start compass</Btn><Btn onClick={startGps}>📍 Locate</Btn>{!demo && <Btn kind="ghost" onClick={() => setDemo(true)}>Demo</Btn>}</Row>}>
          <Dial heading={heading} target={bd ? bd.bearing : null} />
          <div style={{ textAlign: 'center', fontSize: 40, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{heading === null ? '—' : `${Math.round(heading)}° ${cardinal(heading)}`}</div>
          <p className="muted" style={{ textAlign: 'center', margin: 0 }}>{srcLabel[src]}</p>
          {src === 'relative' && raw === null && <Note tone="warn">Waiting for sensor data… On a laptop there is usually no compass sensor — use demo mode to explore.</Note>}
          {src === 'relative' && raw !== null && <Note tone="warn">This device only reports relative orientation, so 0° is wherever it started, not north.</Note>}
          {!hasOrientation && <Note tone="warn">This browser has no DeviceOrientation API.</Note>}
          {turn !== null && <Note tone="ok">Target is {fmtDist(bd!.distance)} away — turn {Math.abs(turn) < 3 ? 'none, straight ahead' : `${Math.round(Math.abs(turn))}° ${turn > 0 ? 'right' : 'left'}`}.</Note>}
          <Num label="Magnetic declination (east +)" value={s.decl} onChange={(decl) => set({ decl })} unit="°" min={-180} max={180} hint="Applied to the iOS magnetic heading. Look up your local value (e.g. NOAA calculator)." />
        </Panel>
        <Panel title="Navigate to">
          <Txt label="Target (any format)" value={s.target} onChange={(target) => set({ target })} placeholder="51.4779, -0.0015 or 30U WC 12345 67890" />
          {tgt ? (
            bd ? <Stats><Stat label="Bearing" value={`${num(bd.bearing, 1)}°`} sub={cardinal(bd.bearing)} tone="accent" /><Stat label="Distance" value={fmtDist(bd.distance)} sub="great-circle" /></Stats> : <p className="muted">Get a position first.</p>
          ) : <Note tone="warn">Could not parse the target.</Note>}
        </Panel>
      </div>
      <div>
        <Panel title="Your position" actions={fix ? <CopyButton text={formats(fix.lat, fix.lon).map(([a, b]) => `${a}: ${b}`).join('\n')} label="Copy all" /> : undefined}>
          {geoErr && <Note tone="err">{geoErr}</Note>}
          {fix ? (
            <>
              {fix === DEMO && <Note>Demo position (Kyiv). Press “Locate” to use your real GPS position.</Note>}
              <Table head={['Format', 'Value', '']} rows={formats(fix.lat, fix.lon).map(([k, v]) => [k, <code key="v">{v}</code>, <CopyButton key="c" text={v} />])} />
              <Stats>
                <Stat label="Accuracy" value={`±${num(fix.acc, 0)} m`} tone={fix.acc < 20 ? 'good' : 'bad'} />
                <Stat label="Altitude" value={fix.alt === null ? '—' : `${num(fix.alt, 0)} m`} />
                <Stat label="Speed" value={fix.speed === null ? '—' : `${num(fix.speed * 3.6, 1)} km/h`} />
              </Stats>
              <Row>
                <Btn onClick={() => set({ saved: [...s.saved, { name: `Point ${s.saved.length + 1}`, lat: fix.lat, lon: fix.lon }] })}>★ Save point</Btn>
                <a className="k-btn ghost" href={`https://www.openstreetmap.org/?mlat=${fix.lat}&mlon=${fix.lon}#map=16/${fix.lat}/${fix.lon}`} target="_blank" rel="noreferrer">Open map ↗</a>
              </Row>
            </>
          ) : <p className="muted">Press “Locate” to read your GPS position.</p>}
        </Panel>
        <Panel title="Convert coordinates">
          <Txt label="Paste coordinates" value={s.input} onChange={(input) => set({ input })} placeholder="40.7128, -74.0060 · 40°42′46″N 74°0′22″W · 18T 583960 4507523 · 18TWL8396007523" />
          {conv ? (
            <Table head={['Format', 'Value', '']} rows={formats(conv.lat, conv.lon).map(([k, v]) => [k, <code key="v">{v}</code>, <CopyButton key="c" text={v} />])} />
          ) : <Note tone="warn">Not recognised. Try “lat, lon” in decimal or DMS, a UTM string (zone, band, easting, northing) or an MGRS reference.</Note>}
          <Row><Btn kind="ghost" onClick={() => conv && set({ target: `${conv.lat.toFixed(6)}, ${conv.lon.toFixed(6)}` })} disabled={!conv}>Use as target</Btn></Row>
        </Panel>
        <Panel title="Saved points" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Table
            head={['Name', 'Coordinates', '']}
            rows={s.saved.map((p, i) => [
              <input key="n" className="k-input" value={p.name} onChange={(e) => set({ saved: s.saved.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} aria-label="Name" />,
              <code key="c">{p.lat.toFixed(5)}, {p.lon.toFixed(5)}</code>,
              <Row key="a" wrap={false}>
                <Btn kind="ghost" onClick={() => set({ target: `${p.lat}, ${p.lon}` })} title="Navigate here">🧭</Btn>
                <Btn kind="ghost" onClick={() => set({ saved: s.saved.filter((_, j) => j !== i) })} title="Delete">✕</Btn>
              </Row>,
            ])}
          />
        </Panel>
      </div>
    </Split>
  )
}
