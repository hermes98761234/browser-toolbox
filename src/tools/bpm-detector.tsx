import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Check, FileDrop, LineChart, Note, Num, Panel, Ring, Row, Select, Split, Stat, Stats, Table, num, pct, useToolState } from '../kit'
import { beatPhase, detectBpm, drumLoop, tapTempo } from './lib/bpm-detector'

const SR = 22050
type Style = 'four' | 'break' | 'dnb'
interface State { range: string; prior: boolean; clicks: boolean; style: Style; demoBpm: number }
const DEF: State = { range: '60-200', prior: true, clicks: true, style: 'four', demoBpm: 124 }
const RANGES: [string, string][] = [['50-100', '50–100 (slow)'], ['60-200', '60–200 (any)'], ['70-140', '70–140'], ['85-170', '85–170 (dance)'], ['120-200', '120–200 (fast)']]
const STYLES: [Style, string][] = [['four', 'House (four-on-the-floor)'], ['break', 'Breakbeat / hip-hop'], ['dnb', 'Drum & bass']]

interface Track { name: string; mono: Float32Array; buffer: AudioBuffer | null; duration: number }
type Result = ReturnType<typeof detectBpm>

let ctxSingleton: AudioContext | null = null
const audioCtx = () => (ctxSingleton ??= new AudioContext())

async function decode(file: File): Promise<Track> {
  const ac = audioCtx()
  const buf = await ac.decodeAudioData(await file.arrayBuffer())
  const len = Math.ceil(buf.duration * SR)
  const off = new OfflineAudioContext(1, len, SR) // resample + downmix to mono
  const src = off.createBufferSource()
  src.buffer = buf
  src.connect(off.destination)
  src.start()
  const r = await off.startRendering()
  return { name: file.name, mono: r.getChannelData(0), buffer: buf, duration: buf.duration }
}

function Envelope({ r, bpm, offset }: { r: Result; bpm: number; offset: number }) {
  const secs = Math.min(12, r.env.length / r.fps)
  const n = Math.floor(secs * r.fps)
  let max = 0
  for (let i = 0; i < n; i++) max = Math.max(max, r.env[i])
  const W = 1000, H = 140
  let d = 'M0,' + H
  for (let i = 0; i < n; i++) d += `L${((i / n) * W).toFixed(1)},${(H - (r.env[i] / (max || 1)) * (H - 8)).toFixed(1)}`
  const beats: number[] = []
  for (let t = offset; t < secs; t += 60 / bpm) beats.push(t)
  return (
    <svg viewBox={`0 0 ${W} ${H + 18}`} preserveAspectRatio="none" style={{ width: '100%', height: 170, display: 'block' }} role="img" aria-label="Onset strength with beat grid">
      {beats.map((t, i) => <line key={i} x1={(t / secs) * W} x2={(t / secs) * W} y1={0} y2={H} stroke={i % 4 === 0 ? 'var(--accent)' : 'var(--muted)'} strokeWidth={i % 4 === 0 ? 2 : 1} opacity={0.6} vectorEffect="non-scaling-stroke" strokeDasharray={i % 4 === 0 ? undefined : '3 3'} />)}
      <path d={d + `L${W},${H}Z`} fill="var(--accent2)" opacity={0.35} />
      <path d={d} fill="none" stroke="var(--accent2)" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
      {Array.from({ length: Math.floor(secs) + 1 }, (_, s) => <text key={s} x={(s / secs) * W + 2} y={H + 14} fontSize={11} fill="var(--muted)">{s}s</text>)}
    </svg>
  )
}

export default function BpmDetector() {
  const [s, set] = useToolState('bpm-detector', DEF)
  const [track, setTrack] = useState<Track | null>(null)
  const [res, setRes] = useState<Result | null>(null)
  const [chosen, setChosen] = useState<number | null>(null)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [playing, setPlaying] = useState(false)
  const [flash, setFlash] = useState(-1)
  const [taps, setTaps] = useState<number[]>([])
  const play = useRef<{ stop: () => void } | null>(null)
  const [lo, hi] = s.range.split('-').map(Number)

  const analyse = useCallback((t: Track) => {
    setBusy('Analysing…')
    setTimeout(() => {
      const r = detectBpm(t.mono, SR, lo, hi, s.prior)
      setRes(r)
      setChosen(null)
      setBusy('')
    }, 30)
  }, [lo, hi, s.prior])

  const makeDemo = useCallback(() => {
    const mono = drumLoop(s.demoBpm, 16, SR, s.style)
    const t: Track = { name: `Demo loop · ${STYLES.find((x) => x[0] === s.style)?.[1]} · ${s.demoBpm} BPM`, mono, buffer: null, duration: mono.length / SR }
    setTrack(t)
    analyse(t)
  }, [s.demoBpm, s.style, analyse])

  // first screen: analyse a generated demo loop
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    makeDemo()
  }, [makeDemo])

  const onFile = async (f: File) => {
    setErr('')
    stop()
    setBusy('Decoding…')
    try {
      const t = await decode(f)
      setTrack(t)
      analyse(t)
    } catch {
      setBusy('')
      setErr('Could not decode this file. Try MP3, WAV, OGG, M4A or FLAC.')
    }
  }

  const bpm = chosen ?? res?.bpm ?? 0
  const offset = useMemo(() => (res && bpm ? (chosen ? beatPhase(res.env, res.fps, bpm) : res.offset) : 0), [res, bpm, chosen])

  function stop() {
    play.current?.stop()
    play.current = null
    setPlaying(false)
    setFlash(-1)
  }
  const start = () => {
    if (!track || !bpm) return
    stop()
    const ac = audioCtx()
    void ac.resume()
    let buf = track.buffer
    if (!buf) {
      buf = ac.createBuffer(1, track.mono.length, SR)
      buf.copyToChannel(track.mono as Float32Array<ArrayBuffer>, 0)
    }
    const src = ac.createBufferSource()
    src.buffer = buf
    src.connect(ac.destination)
    const t0 = ac.currentTime + 0.1
    src.start(t0)
    const nodes: AudioScheduledSourceNode[] = [src]
    if (s.clicks) {
      for (let t = offset, k = 0; t < track.duration && k < 4000; t += 60 / bpm, k++) {
        const o = ac.createOscillator(), g = ac.createGain()
        o.frequency.value = k % 4 === 0 ? 1760 : 1320
        g.gain.setValueAtTime(0.0001, t0 + t)
        g.gain.exponentialRampToValueAtTime(0.35, t0 + t + 0.002)
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + t + 0.05)
        o.connect(g).connect(ac.destination)
        o.start(t0 + t)
        o.stop(t0 + t + 0.06)
        nodes.push(o)
      }
    }
    let raf = 0
    const tick = () => {
      const t = ac.currentTime - t0 - offset
      setFlash(t >= 0 ? Math.floor(t / (60 / bpm)) : -1)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    src.onended = () => stop()
    play.current = { stop: () => { cancelAnimationFrame(raf); src.onended = null; for (const n of nodes) { try { n.stop() } catch { /* not started */ } } } }
    setPlaying(true)
  }
  useEffect(() => () => play.current?.stop(), [])

  const tap = useCallback(() => {
    const now = performance.now()
    setTaps((t) => (t.length && now - t[t.length - 1] > 2500 ? [now] : [...t.slice(-15), now]))
  }, [])
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.key === 't' || e.key === 'T') && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) tap()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [tap])
  const tapRes = tapTempo(taps)

  const delays = useMemo(() => {
    if (!bpm) return []
    const q = 60000 / bpm
    return [['1/1 (bar)', 4], ['1/2', 2], ['1/4 (beat)', 1], ['1/8', 0.5], ['1/16', 0.25]].map(([n, f]) => [n as string, `${num(q * (f as number), 1)} ms`, `${num(q * (f as number) * 1.5, 1)} ms`, `${num((q * (f as number) * 2) / 3, 1)} ms`])
  }, [bpm])

  return (
    <Split>
      <div>
        <Panel title="Audio">
          <FileDrop accept="audio/*" onFiles={(f) => void onFile(f[0])} label="Drop a song or loop (MP3, WAV, OGG, M4A…) — analysed locally" />
          <Row>
            <Select label="Demo loop" value={s.style} onChange={(style) => set({ style })} options={STYLES} />
            <Num label="Demo tempo" value={s.demoBpm} onChange={(demoBpm) => set({ demoBpm: Math.max(50, Math.min(220, demoBpm)) })} unit="BPM" min={50} max={220} />
          </Row>
          <Btn onClick={makeDemo}>🥁 Generate & analyse demo</Btn>
          {err && <Note tone="err">{err}</Note>}
          {track && <p className="muted" style={{ fontSize: 13 }}>Loaded: <b>{track.name}</b> · {num(track.duration, 1)} s</p>}
        </Panel>
        <Panel title="Detection settings">
          <Row>
            <Select label="Tempo range" value={s.range} onChange={(range) => set({ range })} options={RANGES} />
          </Row>
          <Check label="Prefer tempos near 120 BPM (resolves half/double ambiguity)" value={s.prior} onChange={(prior) => set({ prior })} />
          <Btn kind="primary" disabled={!track || !!busy} onClick={() => track && analyse(track)}>Re-analyse</Btn>
          <Note>Spectral flux finds note onsets; autocorrelation with a comb filter (beats also repeat at 2×, 3×, 4× the period) picks the tempo, refined over long lags for sub-0.1 BPM precision. Half or double time is a matter of feel — use the ×2 / ÷2 buttons.</Note>
        </Panel>
        <Panel title="Tap tempo">
          <button type="button" onClick={tap} className="k-btn primary" style={{ width: '100%', height: 110, fontSize: 22 }} aria-label="Tap">
            {tapRes ? `${num(tapRes.bpm, 1)} BPM` : 'Tap here (or press T)'}
          </button>
          <Row>
            <span className="muted">{taps.length} taps{tapRes ? ` · jitter ±${num(tapRes.sd, 0)} ms` : ''}{tapRes && bpm ? ` · ${num(tapRes.bpm - bpm, 1)} vs detected` : ''}</span>
            <Btn kind="ghost" onClick={() => setTaps([])}>Reset</Btn>
          </Row>
          {tapRes && <Btn onClick={() => setChosen(tapRes.bpm)}>Use tapped tempo for the click</Btn>}
        </Panel>
      </div>
      <div>
        {busy && <Note>{busy}</Note>}
        {res && (
          <>
            <Stats>
              <Stat label="Tempo" value={<span style={{ fontSize: 34 }}>{num(bpm, 1)} <small>BPM</small></span>} tone="accent" sub={chosen ? `detected ${num(res.bpm, 1)}` : `beat every ${num(60000 / (bpm || 1), 0)} ms`} />
              <div className="k-stat" style={{ alignItems: 'center' }}>
                <span className="k-stat-label">Confidence</span>
                <Ring value={res.confidence} size={84} color={res.confidence > 0.6 ? 'var(--ok)' : res.confidence > 0.35 ? 'var(--warn)' : 'var(--err)'} />
              </div>
              <Stat label="Half / double" value={`${num(bpm / 2, 1)} · ${num(bpm * 2, 1)}`} sub={<Row><Btn kind="ghost" onClick={() => setChosen(bpm / 2)}>÷2</Btn><Btn kind="ghost" onClick={() => setChosen(bpm * 2)}>×2</Btn>{chosen && <Btn kind="ghost" onClick={() => setChosen(null)}>↺</Btn>}</Row>} />
            </Stats>
            <Panel title="Listen with a beat click" actions={<Check label="Click on beats" value={s.clicks} onChange={(clicks) => set({ clicks })} />}>
              <Row>
                {playing ? <Btn kind="danger" onClick={stop}>■ Stop</Btn> : <Btn kind="primary" onClick={start}>▶ Play {s.clicks ? 'with click' : ''}</Btn>}
                <div style={{ display: 'flex', gap: 8 }} aria-hidden>
                  {[0, 1, 2, 3].map((i) => <span key={i} style={{ width: 26, height: 26, borderRadius: 13, background: playing && flash >= 0 && flash % 4 === i ? (i === 0 ? 'var(--accent)' : 'var(--accent2)') : 'var(--line)', transition: 'background 60ms' }} />)}
                </div>
              </Row>
              <p className="muted" style={{ fontSize: 13 }}>If the click drifts away from the music, the tempo is off; if it lands between beats, try ÷2 or ×2.</p>
              <Envelope r={res} bpm={bpm} offset={offset} />
            </Panel>
            <Panel title="Tempo candidates">
              <Row>
                {res.candidates.map((c) => (
                  <Btn key={c.bpm} kind={Math.abs(c.bpm - bpm) < 0.6 ? 'primary' : 'normal'} onClick={() => setChosen(c.bpm)}>{num(c.bpm, 1)} <small className="muted">({pct(c.score, 0)})</small></Btn>
                ))}
              </Row>
              <LineChart series={[{ name: 'Comb-filtered autocorrelation', points: res.curve, area: true }]} xLabel="BPM" fx={(v) => num(v, 0)} fy={(v) => pct(v, 0)} height={200} markers={[{ x: bpm, label: `${num(bpm, 1)}` }]} />
            </Panel>
            <Panel title="Delay & reverb times">
              <Table head={['Note', 'Straight', 'Dotted', 'Triplet']} rows={delays} />
            </Panel>
          </>
        )}
      </div>
    </Split>
  )
}
