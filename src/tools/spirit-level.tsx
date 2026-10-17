import { useEffect, useRef, useState } from 'react'
import { Btn, Check, Note, Panel, Row, Select, Seg, Slider, Split, Stat, Stats, useToolState } from '../kit'
import { UNITS, edgeAngle, formatTilt, smooth, surfaceAngles, twoPointOffset, type Unit } from './lib/spirit-level'

type Mode = 'surface' | 'edge'
type Sensor = 'waiting' | 'permission' | 'live' | 'none' | 'denied'
interface State { mode: Mode; unit: Unit; off: { x: number; y: number; e: number }; tol: number; beep: boolean; damp: number; simB: number; simG: number }
const DEF: State = { mode: 'surface', unit: 'deg', off: { x: 0, y: 0, e: 0 }, tol: 0.2, beep: true, damp: 0.25, simB: -1.4, simG: 2.1 }

type DOE = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> }
const MAXA = 10 // degrees shown at the edge of the vial

function Tube({ value, vertical, tol, len = 280 }: { value: number; vertical?: boolean; tol: number; len?: number }) {
  const th = 44
  const p = Math.max(-1, Math.min(1, value / MAXA)) * (len / 2 - th / 2)
  const ok = Math.abs(value) <= tol
  const w = vertical ? th : len, h = vertical ? len : th
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${value.toFixed(1)} degrees`} style={{ maxWidth: '100%' }}>
      <rect x={1} y={1} width={w - 2} height={h - 2} rx={th / 2} fill="color-mix(in srgb, #84cc16 30%, var(--panel))" stroke="var(--line)" strokeWidth={2} />
      {[-1, 1].map((k) => vertical
        ? <line key={k} x1={4} x2={w - 4} y1={h / 2 + k * th * 0.62} y2={h / 2 + k * th * 0.62} stroke="var(--fg)" strokeWidth={2} />
        : <line key={k} y1={4} y2={h - 4} x1={w / 2 + k * th * 0.62} x2={w / 2 + k * th * 0.62} stroke="var(--fg)" strokeWidth={2} />)}
      <ellipse cx={vertical ? w / 2 : w / 2 + p} cy={vertical ? h / 2 - p : h / 2} rx={vertical ? th / 2 - 6 : th * 0.55} ry={vertical ? th * 0.55 : th / 2 - 6}
        fill={ok ? '#22c55e' : '#fef9c3'} stroke={ok ? '#15803d' : '#a16207'} strokeWidth={1.5} style={{ transition: 'cx .12s linear, cy .12s linear' }} opacity={0.92} />
    </svg>
  )
}

export default function SpiritLevel() {
  const [s, set] = useToolState('spirit-level', DEF)
  const [sensor, setSensor] = useState<Sensor>(() => {
    const D = (window as unknown as { DeviceOrientationEvent?: DOE }).DeviceOrientationEvent
    return !D ? 'none' : typeof D.requestPermission === 'function' ? 'permission' : 'waiting'
  })
  const [demo, setDemo] = useState(true)
  const [raw, setRaw] = useState({ b: 0, g: 0 })
  const [hold, setHold] = useState<null | { x: number; y: number; e: number }>(null)
  const [step1, setStep1] = useState<null | { x: number; y: number; e: number }>(null)
  const last = useRef({ b: 0, g: 0, have: false })
  const filt = useRef({ b: 0, g: 0 })
  const wasLevel = useRef(false)
  const ac = useRef<AudioContext | null>(null)
  const dampRef = useRef(s.damp)
  useEffect(() => {
    dampRef.current = s.damp
  }, [s.damp])

  const listen = () => {
    const h = (e: DeviceOrientationEvent) => {
      if (e.beta === null || e.gamma === null) return
      last.current = { b: e.beta, g: e.gamma, have: true }
    }
    window.addEventListener('deviceorientation', h)
    return () => window.removeEventListener('deviceorientation', h)
  }

  useEffect(() => {
    if (sensor !== 'waiting') return
    const off = listen()
    const to = setTimeout(() => setSensor((x) => (x === 'waiting' ? 'none' : x)), 1500)
    return () => {
      off()
      clearTimeout(to)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // smoothing + render loop for live data
  useEffect(() => {
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (!last.current.have) return
      if (sensor !== 'live') {
        setSensor('live')
        setDemo(false)
      }
      const k = 1 - dampRef.current * 0.95
      filt.current = { b: smooth(filt.current.b, last.current.b, k), g: smooth(filt.current.g, last.current.g, k) }
      setRaw((r) => (Math.abs(r.b - filt.current.b) > 0.01 || Math.abs(r.g - filt.current.g) > 0.01 ? { ...filt.current } : r))
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [sensor])

  const askPermission = async () => {
    const D = DeviceOrientationEvent as DOE
    try {
      const r = await D.requestPermission?.()
      if (r === 'granted') {
        listen()
        setSensor('waiting')
      } else setSensor('denied')
    } catch {
      setSensor('denied')
    }
  }

  const b = demo ? s.simB : raw.b, g = demo ? s.simG : raw.g
  const sa = surfaceAngles(b, g)
  const meas = { x: sa.x, y: sa.y, e: demo ? -s.simG : edgeAngle(b, g) }
  const cur = hold ?? { x: meas.x - s.off.x, y: meas.y - s.off.y, e: meas.e - s.off.e }
  const total = Math.hypot(cur.x, cur.y)
  const level = s.mode === 'surface' ? Math.abs(cur.x) <= s.tol && Math.abs(cur.y) <= s.tol : Math.abs(cur.e) <= s.tol

  useEffect(() => {
    if (level && !wasLevel.current && s.beep && !demo) {
      try {
        const ctx = (ac.current ??= new AudioContext())
        const o = ctx.createOscillator(), gn = ctx.createGain()
        o.frequency.value = 880
        gn.gain.setValueAtTime(0.15, ctx.currentTime)
        gn.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25)
        o.connect(gn).connect(ctx.destination)
        o.start()
        o.stop(ctx.currentTime + 0.3)
      } catch { /* audio blocked */ }
      navigator.vibrate?.(40)
    }
    wasLevel.current = level
  }, [level, s.beep, demo])

  // drag the bubble in demo mode to simulate tilting
  const eye = useRef<SVGSVGElement>(null)
  const drag = (e: React.PointerEvent) => {
    if (!demo || !(e.buttons & 1) || !eye.current) return
    const r = eye.current.getBoundingClientRect()
    const nx = ((e.clientX - r.left) / r.width - 0.5) * 2, ny = ((e.clientY - r.top) / (r.width) - 0.5) * 2
    // bubble goes to the high side: right high ⇒ gamma < 0; top high ⇒ beta > 0
    const v = (n: number) => Math.max(-15, Math.min(15, Math.round(-n * MAXA * (150 / 110) * 10) / 10))
    set({ simG: v(nx), simB: v(ny) })
  }

  const R = 130
  const bx = Math.max(-1, Math.min(1, cur.x / MAXA)), by = Math.max(-1, Math.min(1, cur.y / MAXA))
  const bl = Math.hypot(bx, by) > 1 ? 1 / Math.hypot(bx, by) : 1
  const f = (v: number) => formatTilt(v, s.unit)

  return (
    <Split wide="left">
      <div>
        <Stats>
          {s.mode === 'surface' ? (
            <>
              <Stat label="Left ↔ right" value={f(cur.x)} sub={Math.abs(cur.x) <= s.tol ? 'level' : cur.x > 0 ? 'right side high' : 'left side high'} />
              <Stat label="Front ↔ back" value={f(cur.y)} sub={Math.abs(cur.y) <= s.tol ? 'level' : cur.y > 0 ? 'top edge high' : 'bottom edge high'} />
              <Stat label="Total tilt" value={f(total)} tone={level ? 'good' : 'accent'} sub={level ? '✓ LEVEL' : `tolerance ±${s.tol}°`} />
            </>
          ) : (
            <>
              <Stat label="Edge tilt" value={f(cur.e)} tone={level ? 'good' : 'accent'} sub={level ? '✓ LEVEL' : cur.e > 0 ? 'right end high: raise the left' : 'left end high: raise the right'} />
              <Stat label="Over 1 m" value={`${(Math.tan(Math.abs(cur.e) * Math.PI / 180) * 1000).toFixed(1)} mm`} />
              <Stat label="Over 4 ft" value={`${(Math.tan(Math.abs(cur.e) * Math.PI / 180) * 48).toFixed(2)} in`} />
            </>
          )}
        </Stats>
        <Panel title={s.mode === 'surface' ? 'Bull’s-eye level' : 'Tube level'} actions={<Btn onClick={() => setHold(hold ? null : { ...cur })}>{hold ? '▶ Release' : '⏸ Hold reading'}</Btn>}>
          <div style={{ display: 'grid', placeItems: 'center', gap: 16, padding: '8px 0', userSelect: 'none', touchAction: demo ? 'none' : undefined }}>
            {s.mode === 'surface' ? (
              <>
                <svg ref={eye} width="100%" viewBox="0 0 300 318" style={{ maxWidth: 320, cursor: demo ? 'grab' : undefined }} onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); drag(e) }} onPointerMove={drag} role="img" aria-label="bubble level">
                  <defs>
                    <radialGradient id="sl-liq" cx="50%" cy="45%"><stop offset="0%" stopColor="#d9f99d" /><stop offset="100%" stopColor="#65a30d" /></radialGradient>
                  </defs>
                  <circle cx={150} cy={150} r={R + 10} fill="url(#sl-liq)" stroke="var(--line)" strokeWidth={4} />
                  {[0.25, 0.5, 0.75].map((k) => <circle key={k} cx={150} cy={150} r={R * k} fill="none" stroke="#365314" strokeOpacity={0.35} />)}
                  <line x1={150 - R} x2={150 + R} y1={150} y2={150} stroke="#365314" strokeOpacity={0.3} />
                  <line y1={150 - R} y2={150 + R} x1={150} x2={150} stroke="#365314" strokeOpacity={0.3} />
                  <circle cx={150} cy={150} r={24} fill="none" stroke="#1a2e05" strokeWidth={2.5} />
                  <circle cx={150 + bx * bl * (R - 20)} cy={150 - by * bl * (R - 20)} r={19} fill={level ? '#22c55e' : '#fefce8'} stroke={level ? '#14532d' : '#a16207'} strokeWidth={2} style={{ transition: 'cx .12s linear, cy .12s linear' }} />
                  <text x={150} y={312} textAnchor="middle" fontSize={11} fill="var(--muted)">rim = {MAXA}°</text>
                </svg>
                <Tube value={cur.x} tol={s.tol} />
                <Row><Tube value={cur.y} vertical tol={s.tol} len={180} /></Row>
              </>
            ) : (
              <>
                <Tube value={cur.e} tol={s.tol} len={360} />
                <div style={{ fontSize: 56, fontWeight: 800, color: level ? 'var(--ok)' : 'var(--fg)' }}>{f(cur.e)}</div>
              </>
            )}
            {hold && <Note>Reading held. Tap Release to go live again.</Note>}
          </div>
        </Panel>
        <Note>Tips: remove a bulky case, lay the phone on its back for surfaces (shelves, tables, appliances) and stand it on its long edge for picture frames. For long spans, put a straight board under the phone.</Note>
      </div>
      <div>
        <Panel title="Sensor">
          {sensor === 'live' && <Note tone="ok">Live device orientation. {demo ? 'Demo mode is on.' : 'Lay the phone on the surface or stand it on an edge.'}</Note>}
          {sensor === 'permission' && <><Note>This browser (e.g. iPhone/iPad Safari) asks for permission before reading motion sensors. Until then a simulated tilt is shown.</Note><Btn kind="primary" onClick={askPermission}>Enable motion sensor</Btn></>}
          {sensor === 'denied' && <Note tone="err">Motion access was denied. Allow it in Safari settings (Settings → Safari → Motion & Orientation Access) and reload.</Note>}
          {(sensor === 'none' || sensor === 'waiting') && <Note tone="warn">No tilt sensor detected (desktop browser?). Using a simulated tilt: drag the bubble or use the sliders. Open this page on a phone for a real level.</Note>}
          <Check label="Demo / simulated tilt" value={demo} onChange={(v) => setDemo(v || sensor !== 'live')} />
          {demo && (
            <>
              <Slider label="Simulated front-back tilt (β)" value={s.simB} min={-15} max={15} step={0.1} unit="°" onChange={(simB) => set({ simB })} />
              <Slider label="Simulated left-right tilt (γ)" value={s.simG} min={-15} max={15} step={0.1} unit="°" onChange={(simG) => set({ simG })} />
              {s.mode === 'edge' && <Note>In edge mode the left-right slider simulates the tilt of the phone standing on its long edge.</Note>}
            </>
          )}
        </Panel>
        <Panel title="Settings">
          <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['surface', 'Flat (bull’s-eye)'], ['edge', 'On edge (tube)']]} />
          <Select label="Units" value={s.unit} onChange={(unit) => set({ unit })} options={UNITS} />
          <Slider label="Level tolerance" value={s.tol} min={0.05} max={1} step={0.05} unit="°" onChange={(tol) => set({ tol })} />
          <Slider label="Smoothing" value={s.damp} min={0} max={0.9} step={0.05} show={(v) => (v === 0 ? 'off' : v < 0.4 ? 'low' : v < 0.7 ? 'medium' : 'high')} onChange={(damp) => set({ damp })} />
          <Check label="Beep and vibrate when level" value={s.beep} onChange={(beep) => set({ beep })} />
        </Panel>
        <Panel title="Calibration">
          <p className="muted" style={{ marginTop: 0 }}>Phone sensors are rarely perfectly zeroed. Offsets are saved on this device.</p>
          <Row>
            <Btn onClick={() => set({ off: { ...meas } })}>Set zero here</Btn>
            {!step1 ? <Btn onClick={() => setStep1({ ...meas })}>Two-point: reading 1</Btn> : <Btn kind="primary" onClick={() => { set({ off: { x: twoPointOffset(step1.x, meas.x), y: twoPointOffset(step1.y, meas.y), e: twoPointOffset(step1.e, meas.e) } }); setStep1(null) }}>Rotated 180° — reading 2</Btn>}
            <Btn kind="ghost" onClick={() => { set({ off: { x: 0, y: 0, e: 0 } }); setStep1(null) }}>Clear</Btn>
          </Row>
          {step1 && <Note>Now turn the phone 180° on the same spot (end for end) and tap “reading 2”. The true tilt cancels out and only the sensor error remains.</Note>}
          <p className="muted">Offsets: x {s.off.x.toFixed(2)}°, y {s.off.y.toFixed(2)}°, edge {s.off.e.toFixed(2)}°</p>
        </Panel>
      </div>
    </Split>
  )
}
