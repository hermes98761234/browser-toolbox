import { useEffect, useRef, useState } from 'react'
import { Btn, Check, CsvButton, Note, Num, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, Table, num, uid, useToolState } from '../kit'
import { cadence, demoDepth, grayCentered, meanAbsDiff, RepDetector } from './lib/rep-counter-camera'

type Source = 'demo' | 'camera' | 'sensor'
type Mode = 'pose' | 'motion'
interface Roi { x: number; y: number; w: number; h: number }
interface SetLog { id: string; date: string; exercise: string; reps: number; secs: number; source: Source }

const EXERCISES = ['Squats', 'Push-ups', 'Jumping jacks', 'Lunges', 'Sit-ups', 'Burpees'] as const
const DEF = {
  exercise: 'Squats' as string,
  mode: 'pose' as Mode,
  hi: 0.6,
  lo: 0.3,
  minGap: 0.6,
  sens: 4,
  speak: true,
  target: 15,
  roi: { x: 0.3, y: 0.08, w: 0.4, h: 0.45 } as Roi,
  history: [] as SetLog[],
}
const PW = 160, PH = 120 // processing resolution
const PLOT_SEC = 12

/** Draws a stick figure doing squats or push-ups at depth d (0 = start pose, 1 = bottom). */
function drawDemo(c: HTMLCanvasElement, t: number, pushup: boolean) {
  const g = c.getContext('2d')!
  const W = c.width, H = c.height
  const d = demoDepth(t)
  const bg = g.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#cbd5e1')
  bg.addColorStop(1, '#94a3b8')
  g.fillStyle = bg
  g.fillRect(0, 0, W, H)
  g.fillStyle = '#64748b'
  g.fillRect(0, H * 0.86, W, H * 0.14)
  g.fillStyle = '#e2e8f0'
  g.fillRect(W * 0.06, H * 0.12, W * 0.16, H * 0.3) // window
  g.strokeStyle = '#1e293b'
  g.fillStyle = '#1e293b'
  g.lineWidth = W * 0.035
  g.lineCap = 'round'
  const line = (pts: [number, number][]) => {
    g.beginPath()
    pts.forEach(([x, y], i) => (i ? g.lineTo(x * W, y * H) : g.moveTo(x * W, y * H)))
    g.stroke()
  }
  const head = (x: number, y: number) => {
    g.beginPath()
    g.arc(x * W, y * H, W * 0.05, 0, Math.PI * 2)
    g.fill()
  }
  if (!pushup) {
    const hipY = 0.5 + 0.2 * d, hipX = 0.5 - 0.1 * d
    const kneeX = 0.5 + 0.1 * d, kneeY = 0.68 + 0.04 * d
    const shY = hipY - 0.26 + 0.04 * d, shX = hipX + 0.06 * d
    line([[0.5, 0.86], [kneeX, kneeY], [hipX, hipY], [shX, shY]])
    line([[shX, shY + 0.03], [shX + 0.18 * d + 0.02, shY + 0.12 - 0.05 * d]])
    head(shX + 0.02 * d, shY - 0.09)
  } else {
    const a = 0.32 - 0.24 * d // body angle from floor
    const fx = 0.85, fy = 0.84
    const L = 0.6
    const sx = fx - L * Math.cos(a), sy = fy - L * Math.sin(a) * (W / H)
    line([[fx, fy], [sx, sy]])
    const ex = sx - 0.06 + 0.02 * d, ey = sy + (0.84 - sy) * 0.5
    line([[sx, sy], [ex - 0.03 * d, ey], [sx - 0.02, 0.86]])
    head(sx - 0.07, sy - 0.04)
  }
  // sensor noise so the pipeline sees something camera-like
  const img = g.getImageData(0, 0, W, H)
  for (let i = 0; i < img.data.length; i += 16) {
    const n = (Math.random() - 0.5) * 18
    img.data[i] += n
    img.data[i + 1] += n
    img.data[i + 2] += n
  }
  g.putImageData(img, 0, 0)
}

export default function RepCounterCamera() {
  const [s, set] = useToolState('rep-counter-camera', DEF)
  const [source, setSource] = useState<Source>('demo')
  const [running, setRunning] = useState(true)
  const [reps, setReps] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [cad, setCad] = useState(NaN)
  const [phase, setPhase] = useState('')
  const [err, setErr] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const demoRef = useRef<HTMLCanvasElement>(null)
  const plotRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const sRef = useRef(s)
  useEffect(() => {
    sRef.current = s
  }, [s])
  const det = useRef(new RepDetector())
  const [drag, setDrag] = useState<{ x0: number; y0: number } | null>(null)
  const [recal, setRecal] = useState(0)

  const pushup = s.exercise === 'Push-ups'
  const bursts = s.mode === 'motion' ? 2 : 1

  // main processing loop
  useEffect(() => {
    if (!running) return
    const d = det.current
    d.reset()
    d.opts = { ...d.opts, hi: sRef.current.hi, lo: sRef.current.lo, minGapSec: sRef.current.minGap, cycles: source === 'sensor' ? 1 : bursts, minRange: source === 'sensor' ? sRef.current.sens / 4 : sRef.current.sens }
    const proc = document.createElement('canvas')
    proc.width = PW
    proc.height = PH
    const pctx = proc.getContext('2d', { willReadFrequently: true })!
    const plot: { t: number; v: number; rep: boolean }[] = []
    const t0 = performance.now() / 1000
    const calibAt = t0 + (source === 'demo' ? 0.2 : 3)
    let snap: Float32Array | null = null
    let prev: Float32Array | null = null
    let raf = 0
    let lastUi = 0
    let stream: MediaStream | null = null
    let grav = [0, 0, 9.81]
    let cancelled = false

    const onRep = (n: number) => {
      setReps(n)
      setCad(cadence(d.repTimes).perMin)
      const st = sRef.current
      if (st.speak && 'speechSynthesis' in window) {
        speechSynthesis.cancel()
        const msg = n === st.target ? `${n}. Target reached, well done!` : String(n)
        speechSynthesis.speak(new SpeechSynthesisUtterance(msg))
      }
    }
    const feed = (t: number, x: number) => {
      const r = d.push(t, x)
      plot.push({ t, v: r.v, rep: r.counted })
      while (plot.length && plot[0].t < t - PLOT_SEC) plot.shift()
      if (r.counted) onRep(d.reps)
    }
    const onMotion = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity
      if (!a || a.x === null || a.y === null || a.z === null) return
      const v = [a.x, a.y, a.z]
      grav = grav.map((g, i) => g + 0.05 * (v[i] - g)) // low-pass = gravity estimate
      const gn = Math.hypot(...grav) || 1
      const vert = v.reduce((acc, x, i) => acc + (x - grav[i]) * (grav[i] / gn), 0) // vertical linear acceleration
      feed(performance.now() / 1000, vert)
    }

    const drawPlot = (now: number) => {
      const c = plotRef.current
      if (!c) return
      const w = c.clientWidth || 600, h = 140
      if (c.width !== w) c.width = w
      c.height = h
      const g = c.getContext('2d')!
      const css = getComputedStyle(c)
      g.clearRect(0, 0, w, h)
      const y = (v: number) => 8 + (1 - v) * (h - 16)
      const x = (t: number) => w - ((now - t) / PLOT_SEC) * w
      g.fillStyle = css.getPropertyValue('--grid') || '#e8ecf4'
      g.fillRect(0, y(sRef.current.hi), w, y(sRef.current.lo) - y(sRef.current.hi))
      g.strokeStyle = css.getPropertyValue('--muted') || '#888'
      g.setLineDash([4, 4])
      for (const th of [sRef.current.hi, sRef.current.lo]) {
        g.beginPath()
        g.moveTo(0, y(th))
        g.lineTo(w, y(th))
        g.stroke()
      }
      g.setLineDash([])
      g.strokeStyle = css.getPropertyValue('--accent') || '#4f46e5'
      g.lineWidth = 2
      g.beginPath()
      let pen = false
      for (const p of plot) {
        if (!Number.isFinite(p.v)) {
          pen = false
          continue
        }
        if (pen) g.lineTo(x(p.t), y(p.v))
        else g.moveTo(x(p.t), y(p.v))
        pen = true
      }
      g.stroke()
      g.fillStyle = css.getPropertyValue('--ok') || '#059669'
      for (const p of plot) if (p.rep) {
        g.beginPath()
        g.arc(x(p.t), y(Number.isFinite(p.v) ? p.v : 0), 5, 0, Math.PI * 2)
        g.fill()
      }
    }

    const loop = () => {
      raf = requestAnimationFrame(loop)
      const now = performance.now() / 1000
      if (now - lastUi > 0.25) {
        lastUi = now
        setElapsed(now - t0)
      }
      drawPlot(now)
      if (source === 'sensor') return
      let src: CanvasImageSource | null = null
      if (source === 'demo' && demoRef.current) {
        drawDemo(demoRef.current, now - t0, sRef.current.exercise === 'Push-ups')
        src = demoRef.current
      } else if (source === 'camera' && videoRef.current && videoRef.current.readyState >= 2) src = videoRef.current
      if (!src) return
      pctx.save()
      if (source === 'camera') {
        pctx.translate(PW, 0)
        pctx.scale(-1, 1)
      }
      pctx.drawImage(src, 0, 0, PW, PH)
      pctx.restore()
      const r = sRef.current.roi
      const rx = Math.round(r.x * PW), ry = Math.round(r.y * PH)
      const rw = Math.max(4, Math.round(r.w * PW)), rh = Math.max(4, Math.round(r.h * PH))
      const g = grayCentered(pctx.getImageData(rx, ry, rw, rh).data)
      if (now < calibAt) {
        setPhase(`Get into the start position… ${Math.ceil(calibAt - now)}`)
        prev = g
        return
      }
      if (!snap || snap.length !== g.length) {
        snap = g
        setPhase('')
      }
      const x = sRef.current.mode === 'pose' ? meanAbsDiff(g, snap) : prev && prev.length === g.length ? meanAbsDiff(g, prev) * 4 : 0
      prev = g
      feed(now, x)
    }

    const start = async () => {
      setErr('')
      setPhase('')
      setReps(0)
      setCad(NaN)
      if (source === 'camera') {
        if (!navigator.mediaDevices?.getUserMedia) {
          setErr('This browser has no camera API. Try the demo or a phone sensor.')
          return
        }
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false })
          if (cancelled) return stream.getTracks().forEach((t) => t.stop())
          if (videoRef.current) {
            videoRef.current.srcObject = stream
            await videoRef.current.play().catch(() => undefined)
          }
        } catch (e) {
          setErr(`Camera unavailable: ${(e as Error).message}. Allow camera access or use the demo.`)
          return
        }
      }
      if (source === 'sensor') {
        const DM = (window as unknown as { DeviceMotionEvent?: { requestPermission?: () => Promise<string> } }).DeviceMotionEvent
        if (!DM) {
          setErr('No motion sensor API here. Open this page on a phone and keep it in a pocket or arm band.')
          return
        }
        if (DM.requestPermission) {
          const p = await DM.requestPermission().catch(() => 'denied')
          if (p !== 'granted') {
            setErr('Motion sensor permission was denied.')
            return
          }
        }
        window.addEventListener('devicemotion', onMotion)
      }
      if (!cancelled) loop()
    }
    void start()
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      window.removeEventListener('devicemotion', onMotion)
      stream?.getTracks().forEach((t) => t.stop())
      if (videoRef.current) videoRef.current.srcObject = null
    }
  }, [running, source, s.mode, bursts, s.hi, s.lo, s.minGap, s.sens, recal])

  const stop = () => {
    setRunning(false)
    if (det.current.reps > 0)
      set((st) => ({ ...st, history: [{ id: uid(), date: new Date().toISOString().slice(0, 16).replace('T', ' '), exercise: st.exercise, reps: det.current.reps, secs: Math.round(elapsed), source }, ...st.history].slice(0, 200) }))
  }

  const rel = (e: React.PointerEvent) => {
    const r = stageRef.current!.getBoundingClientRect()
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }
  }
  const totals = EXERCISES.map((ex) => ({ ex, n: s.history.filter((h) => h.exercise === ex).reduce((a, h) => a + h.reps, 0) })).filter((x) => x.n > 0)
  const roi = s.roi

  return (
    <Split wide="right">
      <div>
        <Panel title="Source">
          <Seg value={source} onChange={(v) => { setSource(v); setRunning(v === 'demo') }} options={[['demo', '🎬 Demo'], ['camera', '📷 Camera'], ['sensor', '📱 Phone sensor']]} />
          <Select label="Exercise" value={s.exercise} onChange={(exercise) => set({ exercise })} options={EXERCISES} />
          {source !== 'sensor' && (
            <>
              <div className="k-label" style={{ margin: '10px 0 6px' }}>Signal</div>
              <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['pose', 'Pose match'], ['motion', 'Motion energy']]} />
              <p className="muted" style={{ fontSize: 13 }}>
                {s.mode === 'pose'
                  ? 'Compares the region to a snapshot of your start pose: low at the top, high at the bottom. One swing = one rep.'
                  : 'Frame-to-frame motion inside the region. Each rep makes two bursts (down and up), so two bursts = one rep.'}
              </p>
            </>
          )}
          {source === 'sensor' && <Note>Keep the phone in a pocket or on the upper arm. Reps are counted from vertical acceleration (gravity removed by a low-pass filter).</Note>}
          <Row>
            <Btn kind="primary" onClick={() => (running ? stop() : setRunning(true))}>{running ? '■ Stop & save set' : '▶ Start'}</Btn>
            {running && <Btn onClick={() => setRecal((n) => n + 1)}>↺ Recalibrate</Btn>}
          </Row>
        </Panel>
        <Panel title="Detection">
          <Slider label="Upper threshold" value={s.hi} min={0.4} max={0.9} step={0.05} onChange={(hi) => set({ hi: Math.max(hi, s.lo + 0.1) })} />
          <Slider label="Lower threshold" value={s.lo} min={0.05} max={0.5} step={0.05} onChange={(lo) => set({ lo: Math.min(lo, s.hi - 0.1) })} />
          <Slider label="Min time between reps" value={s.minGap} min={0.2} max={3} step={0.1} unit=" s" onChange={(minGap) => set({ minGap })} />
          <Slider label="Noise floor" value={s.sens} min={1} max={15} step={0.5} onChange={(sens) => set({ sens })} />
          <Row>
            <Num label="Target reps" value={s.target} min={1} onChange={(target) => set({ target: Math.max(1, Math.round(target)) })} />
          </Row>
          <Check label="Speak each count aloud" value={s.speak} onChange={(speak) => set({ speak })} />
          <p className="muted" style={{ fontSize: 13 }}>The signal is rescaled to its range over the last 8 s. A rep needs it to rise above the upper line and fall back below the lower one (hysteresis), so small wobbles never count twice.</p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label={s.exercise} value={reps} sub={`target ${s.target}`} tone={reps >= s.target ? 'good' : 'accent'} />
          <Stat label="Pace" value={Number.isFinite(cad) ? `${num(cad, 1)}/min` : '—'} sub={Number.isFinite(cad) ? `${num(60 / cad, 1)} s per rep` : 'needs 2 reps'} />
          <Stat label="Set time" value={`${Math.floor(elapsed / 60)}:${String(Math.floor(elapsed % 60)).padStart(2, '0')}`} />
        </Stats>
        <Panel title={source === 'sensor' ? 'Sensor' : 'View — drag to place the detection region'}>
          {err && <Note tone="err">{err}</Note>}
          {source !== 'sensor' && (
            <div
              ref={stageRef}
              style={{ position: 'relative', width: '100%', aspectRatio: '4 / 3', background: '#0f172a', borderRadius: 10, overflow: 'hidden', touchAction: 'none', cursor: 'crosshair' }}
              onPointerDown={(e) => {
                const p = rel(e)
                ;(e.target as Element).setPointerCapture?.(e.pointerId)
                setDrag({ x0: p.x, y0: p.y })
              }}
              onPointerMove={(e) => {
                if (!drag) return
                const p = rel(e)
                set({ roi: { x: Math.min(drag.x0, p.x), y: Math.min(drag.y0, p.y), w: Math.max(0.05, Math.abs(p.x - drag.x0)), h: Math.max(0.05, Math.abs(p.y - drag.y0)) } })
              }}
              onPointerUp={() => {
                if (drag) setRecal((n) => n + 1)
                setDrag(null)
              }}
            >
              <video ref={videoRef} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)', display: source === 'camera' ? 'block' : 'none' }} />
              <canvas ref={demoRef} width={320} height={240} style={{ width: '100%', height: '100%', display: source === 'demo' ? 'block' : 'none' }} />
              <div style={{ position: 'absolute', left: `${roi.x * 100}%`, top: `${roi.y * 100}%`, width: `${roi.w * 100}%`, height: `${roi.h * 100}%`, border: '3px solid #22d3ee', borderRadius: 6, boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.25)', pointerEvents: 'none' }} />
              <div style={{ position: 'absolute', right: 12, top: 8, fontSize: 64, fontWeight: 800, color: '#fff', textShadow: '0 2px 8px #000' }}>{reps}</div>
              {phase && <div style={{ position: 'absolute', inset: 'auto 0 12px 0', textAlign: 'center', color: '#fff', fontWeight: 700, textShadow: '0 1px 4px #000' }}>{phase}</div>}
              {!running && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#e2e8f0', textAlign: 'center', padding: 16 }}>Press ▶ Start. {source === 'camera' && 'Stand 2–3 m from the camera with your whole movement in view.'}</div>}
            </div>
          )}
          <div style={{ marginTop: 10 }}>
            <span className="k-label">Activity signal (last {PLOT_SEC} s, normalised) — green dots are counted reps</span>
            <canvas ref={plotRef} style={{ width: '100%', height: 140, display: 'block' }} />
          </div>
          <Note>
            Tips: {pushup ? 'film from the side at floor level and box your shoulders and head.' : 'film from the front and box your head and shoulders when standing.'} Even lighting and a still camera give the cleanest signal. Everything runs locally; no video leaves the device.
          </Note>
        </Panel>
        <Panel title="Saved sets" actions={<CsvButton name="reps.csv" rows={() => [['Date', 'Exercise', 'Reps', 'Seconds', 'Source'], ...s.history.map((h) => [h.date, h.exercise, h.reps, h.secs, h.source])]} />}>
          {s.history.length === 0 ? (
            <p className="muted">Stop a set to save it here. Totals per exercise appear once you have some.</p>
          ) : (
            <>
              <Row>{totals.map((t) => <span key={t.ex} className="k-val">{t.ex}: {t.n}</span>)}</Row>
              <Table
                head={['Date', 'Exercise', 'Reps', 'Time', '']}
                rows={s.history.map((h) => [h.date, h.exercise, <b key="r">{h.reps}</b>, `${h.secs} s`, <Btn key="x" kind="ghost" onClick={() => set({ history: s.history.filter((x) => x.id !== h.id) })}>✕</Btn>])}
                max={20}
              />
            </>
          )}
        </Panel>
      </div>
    </Split>
  )
}
