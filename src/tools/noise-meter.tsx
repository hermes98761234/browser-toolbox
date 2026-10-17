import { useEffect, useRef, useState } from 'react'
import { Btn, Check, LineChart, Note, Panel, Row, Seg, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { bandLevel, leq, REFERENCE, smooth, zone, type Zone } from './lib/noise-meter'

const DEF = { threshold: 65, calib: 100, weighted: true, speed: 'slow' as 'fast' | 'slow', sound: true, hold: 1.5, window: 60 }
const COL: Record<Zone, string> = { quiet: '#10b981', ok: '#f59e0b', loud: '#ef4444' }
const FACE: Record<Zone, [string, string]> = { quiet: ['😊', 'Nice and quiet'], ok: ['😐', 'Getting louder…'], loud: ['🙉', 'Too loud!'] }

interface Live { level: number; hist: [number, number][]; max: number; above: number; total: number; alerts: number; streak: number; leq: number }
const EMPTY: Live = { level: NaN, hist: [], max: -Infinity, above: 0, total: 0, alerts: 0, streak: 0, leq: NaN }

/** Semicircular gauge from 30 to 100 dB. */
function Gauge({ db, threshold }: { db: number; threshold: number }) {
  const lo = 30, hi = 100
  const ang = (v: number) => Math.PI * (1 - (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo))
  const pt = (v: number, r: number) => [150 + r * Math.cos(ang(v)), 150 - r * Math.sin(ang(v))]
  const arc = (a: number, b: number, c: string) => {
    const [x0, y0] = pt(a, 120), [x1, y1] = pt(b, 120)
    return <path d={`M${x0} ${y0}A120 120 0 0 1 ${x1} ${y1}`} fill="none" stroke={c} strokeWidth={22} />
  }
  const [nx, ny] = pt(Number.isFinite(db) ? db : lo, 100)
  return (
    <svg viewBox="0 0 300 175" style={{ width: '100%', maxWidth: 420, display: 'block', margin: '0 auto' }} role="img" aria-label="Noise gauge">
      {arc(lo, threshold - 6, COL.quiet)}
      {arc(threshold - 6, threshold, COL.ok)}
      {arc(threshold, hi, COL.loud)}
      {[30, 40, 50, 60, 70, 80, 90, 100].map((v) => {
        const [x, y] = pt(v, 92)
        return <text key={v} x={x} y={y + 4} textAnchor="middle" fontSize={11} fill="var(--muted)">{v}</text>
      })}
      <line x1={150} y1={150} x2={nx} y2={ny} stroke="var(--fg)" strokeWidth={4} strokeLinecap="round" style={{ transition: 'all .15s' }} />
      <circle cx={150} cy={150} r={9} fill="var(--fg)" />
      <text x={150} y={172} textAnchor="middle" fontSize={11} fill="var(--muted)">dB</text>
    </svg>
  )
}

export default function NoiseMeter() {
  const [s, set, reset] = useToolState('noise-meter', DEF)
  const [mode, setMode] = useState<'demo' | 'mic'>('demo')
  const [err, setErr] = useState('')
  const [live, setLive] = useState<Live>(EMPTY)
  const [big, setBig] = useState(false)
  const cfg = useRef(s)
  useEffect(() => { cfg.current = s }, [s])
  const audio = useRef<{ ctx: AudioContext; stream: MediaStream } | null>(null)
  const beepCtx = useRef<AudioContext | null>(null)

  const beep = () => {
    const AC = window.AudioContext
    if (!AC) return
    const c = beepCtx.current ?? (beepCtx.current = new AC())
    void c.resume()
    ;[880, 660].forEach((f, i) => {
      const o = c.createOscillator(), g = c.createGain()
      o.frequency.value = f
      o.connect(g).connect(c.destination)
      const t = c.currentTime + i * 0.18
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16)
      o.start(t)
      o.stop(t + 0.17)
    })
  }

  useEffect(() => {
    let raf = 0, last = performance.now(), lvl = NaN, overFor = 0, cooled = true, quietSince = performance.now(), lastPush = 0
    const t0 = performance.now()
    const st: Live = { ...EMPTY, hist: [] }
    const samples: number[] = []
    let analyser: AnalyserNode | null = null
    let bins: Float32Array<ArrayBuffer> | null = null
    let rate = 48000
    if (mode === 'mic' && audio.current) {
      analyser = audio.current.ctx.createAnalyser()
      analyser.fftSize = 4096
      analyser.smoothingTimeConstant = 0
      audio.current.ctx.createMediaStreamSource(audio.current.stream).connect(analyser)
      bins = new Float32Array(analyser.frequencyBinCount)
      rate = audio.current.ctx.sampleRate
    }
    // Demo: simulated classroom with calm work, chatter and occasional bursts.
    let walk = 0, burst = 0
    const demo = (t: number) => {
      walk = Math.max(-8, Math.min(6, walk + (Math.random() - 0.5) * 0.8))
      if (burst <= 0 && t > 6 && Math.random() < 0.003) burst = 1.5 + Math.random() * 2
      burst -= 0.016
      return 50 + 6 * Math.sin(t / 9) + walk + (burst > 0 ? 14 : 0) + (Math.random() - 0.5) * 4
    }
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const now = performance.now()
      const dt = (now - last) / 1000
      last = now
      const c = cfg.current
      let inst: number
      if (analyser && bins) {
        analyser.getFloatFrequencyData(bins)
        inst = bandLevel(bins, rate, c.weighted) + c.calib
      } else inst = demo((now - t0) / 1000)
      lvl = smooth(lvl, inst, dt, c.speed === 'fast' ? 0.125 : 1)
      if (lvl >= c.threshold) {
        overFor += dt
        st.above += dt
        if (overFor >= c.hold && cooled) {
          st.alerts++
          cooled = false
          if (c.sound) beep()
        }
      } else {
        overFor = 0
        if (lvl < c.threshold - 3) cooled = true
      }
      if (lvl >= c.threshold - 6) quietSince = now
      st.total += dt
      st.max = Math.max(st.max, lvl)
      st.streak = (now - quietSince) / 1000
      if (now - lastPush > 100) {
        lastPush = now
        const ts = (now - t0) / 1000
        samples.push(lvl)
        st.hist.push([ts, lvl])
        while (st.hist.length && st.hist[0][0] < ts - c.window) {
          st.hist.shift()
        }
        if (samples.length > 36000) samples.shift()
        setLive({ ...st, level: lvl, hist: [...st.hist], leq: leq(samples) })
      }
    }
    loop()
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  const startMic = async () => {
    setErr('')
    if (!navigator.mediaDevices?.getUserMedia) return setErr('This browser cannot access a microphone. The demo keeps running.')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
      const ctx = new AudioContext()
      audio.current = { ctx, stream }
      setMode('mic')
    } catch (e) {
      setErr(`Microphone blocked or unavailable (${(e as Error).name}). Allow access in the address bar, or keep using the demo.`)
    }
  }
  const stopMic = () => {
    audio.current?.stream.getTracks().forEach((t) => t.stop())
    void audio.current?.ctx.close()
    audio.current = null
    setMode('demo')
  }
  useEffect(() => () => {
    audio.current?.stream.getTracks().forEach((t) => t.stop())
    void audio.current?.ctx.close()
  }, [])

  const L = live
  const z = zone(L.level, s.threshold)
  const fmtDb = (v: number) => (Number.isFinite(v) ? v.toFixed(0) : '—')
  const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`
  const x0 = L.hist.length ? L.hist[0][0] : 0

  const display = (
    <div style={{ textAlign: 'center', background: big ? COL[z] : undefined, borderRadius: 12, padding: big ? 24 : 0, transition: 'background .4s' }}>
      <div style={{ fontSize: big ? 140 : 72, lineHeight: 1 }}>{FACE[z][0]}</div>
      <div style={{ fontSize: big ? 96 : 54, fontWeight: 800, color: big ? '#fff' : COL[z], fontVariantNumeric: 'tabular-nums' }}>{fmtDb(L.level)} dB{s.weighted ? 'A' : ''}</div>
      <div style={{ fontSize: big ? 36 : 18, fontWeight: 700, color: big ? '#fff' : undefined }}>{FACE[z][1]}</div>
      {!big && <Gauge db={L.level} threshold={s.threshold} />}
      {big && <div style={{ color: '#fff', marginTop: 12 }}>Quiet streak {mmss(L.streak)} · limit {s.threshold} dB · tap to exit</div>}
    </div>
  )

  return (
    <Split wide="right">
      <div>
        <Panel title="Input">
          {mode === 'demo' ? (
            <>
              <Note>Demo mode: a simulated classroom. Start the microphone to measure your room.</Note>
              <Btn kind="primary" onClick={startMic}>🎤 Use microphone</Btn>
            </>
          ) : (
            <>
              <Note tone="ok">Listening to your microphone. Audio is analysed locally and never recorded.</Note>
              <Btn onClick={stopMic}>Stop microphone</Btn>
            </>
          )}
          {err && <Note tone="err">{err}</Note>}
        </Panel>
        <Panel title="Settings" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Slider label="Noise limit" value={s.threshold} onChange={(threshold) => set({ threshold })} min={40} max={95} unit=" dB" />
          <Slider label="Alert after" value={s.hold} onChange={(hold) => set({ hold })} min={0} max={10} step={0.5} unit=" s above limit" />
          <Check label="Play an alert sound" value={s.sound} onChange={(sound) => set({ sound })} />
          <Row>
            <Seg value={s.speed} onChange={(speed) => set({ speed })} options={[['fast', 'Fast (125 ms)'], ['slow', 'Slow (1 s)']]} label="Response" />
            <Check label="A-weighting (dBA)" value={s.weighted} onChange={(weighted) => set({ weighted })} />
          </Row>
          <Slider label="Calibration offset" value={s.calib} onChange={(calib) => set({ calib })} min={60} max={140} unit=" dB" />
          <p className="muted" style={{ fontSize: 13 }}>Phone and laptop mics are not calibrated. Compare with a sound level meter (or a quiet room ≈ 35 dB) and adjust the offset until the readings match.</p>
        </Panel>
        <Panel title="Typical levels">
          <Table head={['dB', 'Sounds like']} rows={REFERENCE.map(([d, t]) => [<b key="d" style={{ color: COL[zone(d, s.threshold)] }}>{d}</b>, t])} />
        </Panel>
      </div>
      <div>
        <Panel title="Classroom display" actions={<Btn onClick={() => setBig(true)}>⛶ Full screen</Btn>}>
          {big ? (
            <div role="button" tabIndex={0} onClick={() => setBig(false)} onKeyDown={() => setBig(false)} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'var(--bg)', display: 'grid', placeItems: 'center', padding: 16 }}>
              {display}
            </div>
          ) : display}
        </Panel>
        <Stats>
          <Stat label="Average (Leq)" value={`${fmtDb(L.leq)} dB`} />
          <Stat label="Peak" value={`${fmtDb(L.max)} dB`} tone={L.max >= s.threshold ? 'bad' : 'good'} />
          <Stat label="Time over limit" value={L.total ? `${((L.above / L.total) * 100).toFixed(0)}%` : '—'} sub={`${mmss(L.above)} of ${mmss(L.total)}`} />
          <Stat label="Alerts" value={L.alerts} sub={`quiet streak ${mmss(L.streak)}`} tone="accent" />
        </Stats>
        <Panel title={`Last ${s.window} seconds`} actions={<Seg value={String(s.window)} onChange={(w) => set({ window: Number(w) })} options={[['30', '30 s'], ['60', '1 min'], ['300', '5 min']]} />}>
          <LineChart
            series={[
              { name: 'Level', points: L.hist.map(([t, v]) => [t - x0, v]), color: COL[z], area: true },
              { name: 'Limit', points: L.hist.length ? [[0, s.threshold], [L.hist[L.hist.length - 1][0] - x0, s.threshold]] : [], color: '#ef4444', dashed: true },
            ]}
            yMin={30}
            yMax={100}
            height={220}
            fx={(v) => `${v.toFixed(0)}s`}
            fy={(v) => `${v.toFixed(0)}`}
            yLabel="dB"
          />
        </Panel>
      </div>
    </Split>
  )
}
