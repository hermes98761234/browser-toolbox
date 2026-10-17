import { useEffect, useRef, useState } from 'react'
import { Btn, CsvButton, Note, Num, Panel, Row, Seg, Split, Stat, Stats, Table, Bar, useToolState } from '../kit'
import { Cascade, REFS, TAU, makeDemo, msToDb, nioshMinutes, timeWeight, weightingSOS, type Weighting } from './lib/sound-level-meter'

type Src = 'demo' | 'mic'
interface State { weighting: Weighting; speed: 'fast' | 'slow'; offset: number; calibrated: boolean; refLevel: number }
const DEF: State = { weighting: 'A', speed: 'fast', offset: 100, calibrated: false, refLevel: 94 }
const HIST = 60 // seconds kept in the history graph
interface Snap { L: number; dbfs: number; leq: number; max: number; min: number; peak: number; secs: number }
const EMPTY: Snap = { L: NaN, dbfs: NaN, leq: NaN, max: NaN, min: NaN, peak: NaN, secs: 0 }

interface Engine {
  src: Src
  fs: number
  ms: number
  leqSum: number
  leqT: number
  max: number
  min: number
  peak: number
  hist: [number, number][]
  t: number
  demo?: (n: number) => Float32Array
  cascade?: Cascade
  ctx?: AudioContext
  stream?: MediaStream
  an?: AnalyserNode
  buf?: Float32Array<ArrayBuffer>
  srcNode?: MediaStreamAudioSourceNode
  chain?: AudioNode[]
}

const fmt1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '—')

function Gauge({ value, unit }: { value: number; unit: string }) {
  const lo = 20, hi = 120
  const ang = (v: number) => Math.PI * (1 - (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo))
  const pt = (v: number, r: number) => [100 + r * Math.cos(ang(v)), 100 - r * Math.sin(ang(v))]
  const arc = (a: number, b: number, col: string) => {
    const [x0, y0] = pt(a, 80), [x1, y1] = pt(b, 80)
    return <path d={`M${x0},${y0} A80,80 0 0 1 ${x1},${y1}`} stroke={col} strokeWidth={14} fill="none" />
  }
  const [nx, ny] = pt(Number.isFinite(value) ? value : lo, 62)
  return (
    <svg viewBox="-16 -4 232 154" style={{ width: '100%', maxWidth: 420, display: 'block', margin: '0 auto' }} role="img" aria-label={`Level ${fmt1(value)} ${unit}`}>
      {arc(20, 70, '#10b981')}
      {arc(70, 85, '#f59e0b')}
      {arc(85, 120, '#ef4444')}
      {[20, 40, 60, 80, 100, 120].map((v) => {
        const [x, y] = pt(v, 100)
        return <text key={v} x={x} y={y + 3} fontSize={8} textAnchor="middle" fill="var(--muted)">{v}</text>
      })}
      <line x1={100} y1={100} x2={nx} y2={ny} stroke="var(--fg)" strokeWidth={3} strokeLinecap="round" />
      <circle cx={100} cy={100} r={5} fill="var(--fg)" />
      <text x={100} y={132} textAnchor="middle" fontSize={24} fontWeight={800} fill="var(--fg)">{fmt1(value)}</text>
      <text x={100} y={148} textAnchor="middle" fontSize={9} fill="var(--muted)">{unit}</text>
    </svg>
  )
}

export default function SoundLevelMeter() {
  const [s, set, reset] = useToolState('sound-level-meter', DEF)
  const [src, setSrc] = useState<Src>('demo')
  const [snap, setSnap] = useState<Snap>(EMPTY)
  const [err, setErr] = useState('')
  const eng = useRef<Engine | null>(null)
  const cv = useRef<HTMLCanvasElement>(null)
  const sRef = useRef(s)
  useEffect(() => {
    sRef.current = s
  })
  const unit = `dB${s.weighting === 'Z' ? 'Z' : `(${s.weighting})`}`

  const resetStats = () => {
    const e = eng.current
    if (!e) return
    Object.assign(e, { leqSum: 0, leqT: 0, max: -Infinity, min: Infinity, peak: -Infinity, hist: [], t: 0 })
  }

  const buildMicChain = (e: Engine, w: Weighting) => {
    if (!e.ctx || !e.srcNode || !e.an) return
    e.srcNode.disconnect()
    e.chain?.forEach((n) => n.disconnect())
    e.chain = weightingSOS(w, e.ctx.sampleRate).map(([b0, b1, b2, a1, a2]) => e.ctx!.createIIRFilter([b0, b1, b2], [1, a1, a2]))
    let node: AudioNode = e.srcNode
    for (const f of e.chain) node = node.connect(f)
    node.connect(e.an)
  }

  const stopMic = (e: Engine | null) => {
    e?.stream?.getTracks().forEach((t) => t.stop())
    void e?.ctx?.close()
  }

  const startDemo = () => {
    stopMic(eng.current)
    const fs = 48000
    eng.current = { src: 'demo', fs, ms: 0, leqSum: 0, leqT: 0, max: -Infinity, min: Infinity, peak: -Infinity, hist: [], t: 0, demo: makeDemo(fs), cascade: new Cascade(weightingSOS(sRef.current.weighting, fs)) }
    setSrc('demo')
    setErr('')
  }

  const startMic = async () => {
    setErr('')
    if (!navigator.mediaDevices?.getUserMedia) return setErr('Microphone access is not available here (it needs HTTPS and a browser with getUserMedia).')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
      stopMic(eng.current)
      const ctx = new AudioContext()
      await ctx.resume()
      const an = ctx.createAnalyser()
      an.fftSize = 4096
      const e: Engine = { src: 'mic', fs: ctx.sampleRate, ms: 0, leqSum: 0, leqT: 0, max: -Infinity, min: Infinity, peak: -Infinity, hist: [], t: 0, ctx, stream, an, buf: new Float32Array(an.fftSize), srcNode: ctx.createMediaStreamSource(stream) }
      buildMicChain(e, sRef.current.weighting)
      eng.current = e
      setSrc('mic')
    } catch (x) {
      setErr(`Could not open the microphone: ${(x as Error).message}. Showing the demo signal instead.`)
      startDemo()
    }
  }

  // Rebuild the weighting filter when it changes.
  useEffect(() => {
    const e = eng.current
    if (!e) return
    if (e.src === 'demo') e.cascade = new Cascade(weightingSOS(s.weighting, e.fs))
    else buildMicChain(e, s.weighting)
    resetStats()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.weighting])

  // Measurement loop
  useEffect(() => {
    startDemo()
    let raf = 0, last = performance.now(), acc = 0
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const e = eng.current
      if (!e || dt <= 0) return
      let block = { ms: 0, peak: 0 }
      if (e.src === 'demo' && e.demo && e.cascade) block = e.cascade.process(e.demo(Math.max(1, Math.round(dt * e.fs))))
      else if (e.an && e.buf) {
        e.an.getFloatTimeDomainData(e.buf)
        let sum = 0, pk = 0
        for (const v of e.buf) {
          sum += v * v
          if (Math.abs(v) > pk) pk = Math.abs(v)
        }
        block = { ms: sum / e.buf.length, peak: pk }
      }
      const o = sRef.current
      e.ms = e.t === 0 ? block.ms : timeWeight(e.ms, block.ms, dt, TAU[o.speed])
      e.t += dt
      e.leqSum += block.ms * dt
      e.leqT += dt
      const L = msToDb(e.ms)
      if (e.t > 0.5) {
        e.max = Math.max(e.max, L)
        e.min = Math.min(e.min, L)
      }
      e.peak = Math.max(e.peak, block.peak > 0 ? 20 * Math.log10(block.peak) : -200)
      acc += dt
      if (acc >= 0.1) {
        acc = 0
        e.hist.push([e.t, L + o.offset])
        while (e.hist.length && e.hist[0][0] < e.t - HIST) e.hist.shift()
        setSnap({ L: L + o.offset, dbfs: L, leq: msToDb(e.leqSum / (e.leqT || 1)) + o.offset, max: e.max + o.offset, min: e.min + o.offset, peak: e.peak + o.offset, secs: e.t })
        drawHist(e.hist, e.t)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      stopMic(eng.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const drawHist = (h: [number, number][], tNow: number) => {
    const c = cv.current
    const g = c?.getContext('2d')
    if (!c || !g) return
    const W = (c.width = c.clientWidth * devicePixelRatio), H = (c.height = 200 * devicePixelRatio)
    const css = getComputedStyle(c)
    const k = devicePixelRatio, L = 34 * k, lo = 20, hi = 120
    const y = (v: number) => H - 14 * k - ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * (H - 24 * k)
    const x = (t: number) => L + ((t - (tNow - HIST)) / HIST) * (W - L - 6 * k)
    g.clearRect(0, 0, W, H)
    g.font = `${10 * k}px system-ui`
    g.fillStyle = css.getPropertyValue('--muted') || '#888'
    for (let v = 20; v <= 120; v += 20) {
      g.strokeStyle = css.getPropertyValue('--line') || '#ccc'
      g.beginPath()
      g.moveTo(L, y(v))
      g.lineTo(W, y(v))
      g.stroke()
      g.fillText(String(v), 4 * k, y(v) + 4 * k)
    }
    g.fillText(`last ${HIST} s`, L + 4 * k, H - 2 * k)
    g.fillStyle = 'rgba(239,68,68,.12)'
    g.fillRect(L, y(120), W - L, y(85) - y(120))
    g.lineWidth = 2 * k
    g.strokeStyle = '#6366f1'
    g.beginPath()
    h.forEach(([t, v], i) => (i ? g.lineTo(x(t), y(v)) : g.moveTo(x(t), y(v))))
    g.stroke()
  }

  const near = REFS.reduce((b, r) => (Math.abs(r[0] - snap.L) < Math.abs(b[0] - snap.L) ? r : b), REFS[0])
  const tone = snap.L >= 85 ? 'bad' : snap.L >= 70 ? 'accent' : 'good'
  const mins = nioshMinutes(snap.leq)

  return (
    <Split>
      <div>
        <Panel title="Source">
          <Row>
            <Btn kind={src === 'mic' ? 'primary' : 'normal'} onClick={() => void startMic()}>🎤 {src === 'mic' ? 'Microphone on' : 'Use microphone'}</Btn>
            <Btn kind={src === 'demo' ? 'primary' : 'normal'} onClick={startDemo}>🏙 Demo street signal</Btn>
          </Row>
          {err && <Note tone="err">{err}</Note>}
          <p className="muted" style={{ fontSize: 13 }}>
            {src === 'mic' ? 'Listening with echo cancellation, noise suppression and auto-gain turned off (if the browser allows). Audio never leaves your device.' : 'A synthetic street scene (traffic swells every ~9 s, voices, a 1 kHz beep every 15 s) runs through the same weighting and averaging code.'}
          </p>
        </Panel>
        <Panel title="Meter settings" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <div className="k-label">Frequency weighting</div>
          <Seg value={s.weighting} onChange={(weighting) => set({ weighting })} options={[['A', 'A (hearing)'], ['C', 'C (loud/bass)'], ['Z', 'Z (flat)']]} label="Weighting" />
          <div style={{ height: 10 }} />
          <div className="k-label">Time weighting</div>
          <Seg value={s.speed} onChange={(speed) => set({ speed })} options={[['fast', 'Fast 125 ms'], ['slow', 'Slow 1 s']]} label="Time weighting" />
          <div style={{ height: 10 }} />
          <Num label="Calibration offset" value={s.offset} onChange={(offset) => set({ offset })} unit="dB" min={0} max={200} hint="Added to dBFS. Phone and laptop mics typically need 90–120 dB." />
        </Panel>
        <Panel title="Calibrate against a reference">
          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Play a known level (a 94 dB calibrator, or read a real meter next to the mic), wait for the reading to settle on Slow, then press Set.</p>
          <Row>
            <Num label="Reference level" value={s.refLevel} onChange={(refLevel) => set({ refLevel })} unit="dB" min={0} max={160} />
            <div style={{ alignSelf: 'end', paddingBottom: 6 }}>
              <Btn kind="primary" disabled={!Number.isFinite(snap.dbfs)} onClick={() => set({ offset: Math.round((s.refLevel - snap.dbfs) * 10) / 10, calibrated: true })}>Set offset</Btn>
            </div>
          </Row>
        </Panel>
      </div>
      <div>
        <Panel title="Sound level" actions={<Btn onClick={resetStats}>Reset min/max/Leq</Btn>}>
          <Gauge value={snap.L} unit={`${unit} · ${s.speed === 'fast' ? 'Fast' : 'Slow'}`} />
          <p style={{ textAlign: 'center', margin: '4px 0 0' }}>≈ {near[1]}</p>
          {!s.calibrated && <Note tone="warn">Uncalibrated estimate. Microphones and browsers differ by ±10 dB or more, so treat the numbers as relative until you calibrate. Not a certified sound level meter.</Note>}
        </Panel>
        <Stats>
          <Stat label={`Leq (${Math.round(snap.secs)} s)`} value={fmt1(snap.leq)} sub="energy average" tone={tone} />
          <Stat label="Max" value={fmt1(snap.max)} sub="time-weighted hold" />
          <Stat label="Min" value={fmt1(snap.min)} sub="time-weighted" />
          <Stat label="Peak" value={fmt1(snap.peak)} sub="sample peak, weighted" />
        </Stats>
        <Panel title="History" actions={<CsvButton name="sound-levels.csv" rows={() => [['seconds', unit], ...(eng.current?.hist ?? []).map(([t, v]) => [t.toFixed(1), v.toFixed(1)])]} />}>
          <canvas ref={cv} style={{ width: '100%', height: 200, display: 'block' }} />
          {s.weighting === 'A' && Number.isFinite(mins) && (
            <p className="muted" style={{ fontSize: 13 }}>
              At this Leq, the NIOSH limit (85 dBA for 8 h, 3 dB exchange) allows about <b>{mins >= 1440 ? 'unlimited daily' : mins >= 60 ? `${(mins / 60).toFixed(1)} h` : `${Math.max(0, mins).toFixed(1)} min`}</b> of exposure per day.
            </p>
          )}
        </Panel>
        <Panel title="Typical levels">
          <Table head={['dB', 'Example', '']} rows={REFS.map(([d, n]) => [<b key="d" style={{ color: n === near[1] ? 'var(--accent)' : undefined }}>{d}</b>, n === near[1] ? <b key="n">{n} ◀</b> : n, <div key="b" style={{ minWidth: 80 }}><Bar value={d} max={130} color={d >= 85 ? 'var(--err)' : d >= 70 ? 'var(--warn)' : 'var(--ok)'} /></div>])} />
        </Panel>
      </div>
    </Split>
  )
}
