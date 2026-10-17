import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, LineChart, Note, Num, Panel, Row, Seg, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { rms, yin } from './lib/chromatic-tuner'
import { classify, demoMidi, midiFreq, midiOf, mpm, noteName, sungNotes, synthFrame, VOICES, type Frame } from './lib/vocal-range-finder'

const DEF = { algo: 'mpm' as 'mpm' | 'yin', a4: 440, gate: -45, hold: 0.3, bestLo: 0, bestHi: 0 }
const LO_KEY = 36, HI_KEY = 88 // C2 … E6
const BLACK = new Set([1, 3, 6, 8, 10])
const SR_DEMO = 44100

function Keyboard({ lo, hi, cur, onPlay }: { lo: number | null; hi: number | null; cur: number | null; onPlay: (m: number) => void }) {
  const whites: number[] = []
  for (let m = LO_KEY; m <= HI_KEY; m++) if (!BLACK.has(m % 12)) whites.push(m)
  const W = 20, KH = 96
  const xOf = (m: number) => {
    const wi = whites.findIndex((w) => w >= m)
    return BLACK.has(m % 12) ? wi * W - 6 : wi * W
  }
  // continuous x for a (possibly fractional) MIDI number, used by the range bars
  const cx = (m: number) => {
    const a = Math.floor(m), f = m - a
    const xa = xOf(a) + (BLACK.has(a % 12) ? 6 : W / 2)
    const b = a + 1
    const xb = xOf(b) + (BLACK.has(b % 12) ? 6 : W / 2)
    return xa + (xb - xa) * f
  }
  const inRange = (m: number) => lo !== null && hi !== null && m >= lo && m <= hi
  const total = whites.length * W
  const rowH = 15, top = KH + 10
  return (
    <svg viewBox={`0 0 ${total + 92} ${top + VOICES.length * rowH + 6}`} style={{ width: '100%', display: 'block' }} role="img" aria-label="Piano keyboard with your vocal range">
      <g transform="translate(90,0)">
        {whites.map((m, i) => (
          <g key={m} onClick={() => onPlay(m)} style={{ cursor: 'pointer' }}>
            <rect x={i * W} y={0} width={W - 1} height={KH} rx={3} fill={m === cur ? '#ef4444' : inRange(m) ? 'var(--accent)' : '#f8fafc'} stroke="#94a3b8" opacity={inRange(m) && m !== cur ? 0.75 : 1} />
            {m % 12 === 0 && <text x={i * W + W / 2} y={KH - 6} textAnchor="middle" fontSize={8} fill={inRange(m) ? '#fff' : '#475569'}>{noteName(m)}</text>}
          </g>
        ))}
        {Array.from({ length: HI_KEY - LO_KEY + 1 }, (_, k) => LO_KEY + k).filter((m) => BLACK.has(m % 12)).map((m) => (
          <rect key={m} x={xOf(m)} y={0} width={12} height={KH * 0.6} rx={2} fill={m === cur ? '#ef4444' : inRange(m) ? '#3730a3' : '#1e293b'} onClick={() => onPlay(m)} style={{ cursor: 'pointer' }} />
        ))}
        {VOICES.map(([name, a, b], i) => (
          <g key={name}>
            <rect x={cx(a)} y={top + i * rowH} width={cx(b) - cx(a)} height={rowH - 4} rx={4} fill={`hsl(${200 + i * 22},70%,55%)`} opacity={0.35} />
            {lo !== null && hi !== null && <rect x={cx(Math.max(a, lo))} y={top + i * rowH} width={Math.max(0, cx(Math.min(b, hi)) - cx(Math.max(a, lo)))} height={rowH - 4} rx={4} fill={`hsl(${200 + i * 22},70%,45%)`} />}
          </g>
        ))}
      </g>
      {VOICES.map(([name], i) => <text key={name} x={84} y={top + i * rowH + 9} textAnchor="end" fontSize={9} fill="var(--muted)">{name}</text>)}
    </svg>
  )
}

export default function VocalRangeFinder() {
  const [s, set, reset] = useToolState('vocal-range-finder', DEF)
  const [frames, setFrames] = useState<Frame[]>([])
  const [live, setLive] = useState<{ midi: number; freq: number; clarity: number } | null>(null)
  const [mode, setMode] = useState<'idle' | 'mic' | 'demo'>('idle')
  const [err, setErr] = useState('')
  const stop = useRef<() => void>(() => {})
  const cfg = useRef(s)
  useEffect(() => { cfg.current = s }, [s])
  const audio = useRef<AudioContext | null>(null)

  const process = (buf: Float32Array, sr: number, t: number) => {
    const c = cfg.current
    const level = 20 * Math.log10(rms(buf) || 1e-9)
    let midi: number | null = null
    if (level > c.gate) {
      const p = c.algo === 'mpm' ? mpm(buf, sr, 65, 1400) : yin(buf, sr, 0.12, 65, 1400)
      if (p && p.clarity > 0.85) {
        midi = midiOf(p.freq, c.a4)
        setLive({ midi, freq: p.freq, clarity: p.clarity })
      } else setLive(null)
    } else setLive(null)
    setFrames((old) => [...old.slice(-4000), { t, midi }])
  }

  const startDemo = () => {
    stop.current()
    setErr('')
    setFrames([])
    setMode('demo')
    let t = 0
    const id = setInterval(() => {
      t += 0.05
      const m = demoMidi(t)
      if (t > 11) { stop.current(); return }
      const buf = m === null ? new Float32Array(2048) : synthFrame(midiFreq(m, cfg.current.a4), t, 2048, SR_DEMO, 0.02, Math.round(t * 1000))
      process(buf, SR_DEMO, t)
    }, 50)
    stop.current = () => { clearInterval(id); setMode('idle'); setLive(null); stop.current = () => {} }
  }

  const startMic = async () => {
    stop.current()
    setErr('')
    if (!navigator.mediaDevices?.getUserMedia) return setErr('Microphone access is not available in this browser (it needs HTTPS).')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
      const ctx = new AudioContext()
      const src = ctx.createMediaStreamSource(stream)
      const an = ctx.createAnalyser()
      an.fftSize = 2048
      src.connect(an)
      const buf = new Float32Array(an.fftSize)
      const t0 = ctx.currentTime
      setFrames([])
      setMode('mic')
      const id = setInterval(() => {
        an.getFloatTimeDomainData(buf)
        process(buf, ctx.sampleRate, ctx.currentTime - t0)
      }, 45)
      stop.current = () => {
        clearInterval(id)
        stream.getTracks().forEach((tr) => tr.stop())
        void ctx.close()
        setMode('idle')
        setLive(null)
        stop.current = () => {}
      }
    } catch (e) {
      setErr(`Could not open the microphone: ${(e as Error).message}. Try the demo instead.`)
    }
  }
  useEffect(() => () => stop.current(), [])

  // Demo on first load so the screen is never empty.
  const seeded = useRef(false)
  useEffect(() => {
    if (seeded.current) return
    seeded.current = true
    const fr: Frame[] = []
    for (let t = 0; t <= 11; t += 0.05) {
      const m = demoMidi(t)
      fr.push({ t, midi: m === null ? null : m + 0.1 * Math.sin(t * 34) })
    }
    setFrames(fr)
  }, [])

  const play = (m: number) => {
    const ctx = (audio.current ??= new AudioContext())
    const o = ctx.createOscillator(), g = ctx.createGain()
    o.type = 'triangle'
    o.frequency.value = midiFreq(m, s.a4)
    g.gain.setValueAtTime(0.0001, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.2)
    o.connect(g).connect(ctx.destination)
    o.start()
    o.stop(ctx.currentTime + 1.3)
  }

  const notes = useMemo(() => sungNotes(frames, s.hold), [frames, s.hold])
  const lo = notes.length ? Math.min(...notes.map((n) => n.midi)) : null
  const hi = notes.length ? Math.max(...notes.map((n) => n.midi)) : null
  const ranked = lo !== null && hi !== null ? classify(lo, hi) : []
  const tess = useMemo(() => {
    if (!notes.length) return null
    const v = notes.flatMap((n) => Array(Math.max(1, Math.round(n.dur * 10))).fill(n.midi) as number[]).sort((a, b) => a - b)
    return [v[Math.floor(v.length * 0.2)], v[Math.floor(v.length * 0.8)]]
  }, [notes])

  // Remember the widest range across sessions.
  useEffect(() => {
    if (lo === null || hi === null || mode !== 'mic') return
    if (!s.bestLo || lo < s.bestLo || hi > s.bestHi) set((o) => ({ ...o, bestLo: o.bestLo ? Math.min(o.bestLo, lo) : lo, bestHi: Math.max(o.bestHi, hi) }))
  }, [lo, hi, mode, s.bestLo, s.bestHi, set])

  const trace = frames.filter((f) => f.midi !== null).map((f) => [f.t, f.midi!] as [number, number])
  const t1 = frames.length ? frames[frames.length - 1].t : 1

  return (
    <div>
      <Stats>
        <Stat label="Lowest note" value={lo !== null ? noteName(lo) : '—'} sub={lo !== null ? `${midiFreq(lo, s.a4).toFixed(1)} Hz` : 'sing low and hold'} />
        <Stat label="Highest note" value={hi !== null ? noteName(hi) : '—'} sub={hi !== null ? `${midiFreq(hi, s.a4).toFixed(1)} Hz` : 'sing high and hold'} />
        <Stat label="Range" value={lo !== null && hi !== null ? `${hi - lo} semitones` : '—'} sub={lo !== null && hi !== null ? `${((hi - lo) / 12).toFixed(1)} octaves` : undefined} />
        <Stat label="Closest voice type" value={ranked[0]?.name ?? '—'} sub={ranked[1] ? `also near: ${ranked[1].name}` : undefined} tone="accent" />
      </Stats>
      <Split wide="left">
        <div>
          <Panel title="Your range on the keyboard" actions={<span className="muted" style={{ fontSize: 12 }}>tap a key to hear it</span>}>
            <Keyboard lo={lo} hi={hi} cur={live ? Math.round(live.midi) : null} onPlay={play} />
          </Panel>
          <Panel title="Pitch trace">
            <LineChart series={[{ name: 'Pitch', points: trace, color: 'var(--accent)' }]} height={240} xMin={Math.max(0, t1 - 30)} xMax={Math.max(t1, 1)} yMin={lo !== null ? Math.min(lo - 3, 40) : 40} yMax={hi !== null ? Math.max(hi + 3, 72) : 72} fx={(v) => `${v.toFixed(0)} s`} fy={(v) => noteName(v)} xLabel="time" />
          </Panel>
        </div>
        <div>
          <Panel title="Sing">
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div style={{ fontSize: 56, fontWeight: 800, lineHeight: 1, color: live ? 'var(--accent)' : 'var(--muted)' }}>{live ? noteName(live.midi) : '–'}</div>
              <div className="muted">{live ? `${live.freq.toFixed(1)} Hz · ${((live.midi - Math.round(live.midi)) * 100).toFixed(0)} cents · clarity ${(live.clarity * 100).toFixed(0)}%` : mode === 'idle' ? 'press Start and sing' : 'listening…'}</div>
            </div>
            <Row>
              {mode === 'idle' ? (
                <>
                  <Btn kind="primary" onClick={() => void startMic()}>🎤 Start microphone</Btn>
                  <Btn onClick={startDemo}>▶ Demo singer</Btn>
                </>
              ) : <Btn kind="danger" onClick={() => stop.current()}>■ Stop</Btn>}
              <Btn kind="ghost" onClick={() => setFrames([])}>Clear</Btn>
            </Row>
            {err && <Note tone="err">{err}</Note>}
            <ol style={{ fontSize: 13, paddingLeft: 18, margin: '8px 0' }}>
              <li>Hum a comfortable note, then slide <b>down</b> in steps; hold each note ~½ s.</li>
              <li>Go back to the middle and step <b>up</b> the same way. Don’t push or shout.</li>
              <li>Only notes held steadily count, so short cracks and breaths are ignored.</li>
            </ol>
          </Panel>
          <Panel title="Voice types" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
            <Table
              head={['Type', 'Typical range', 'Match']}
              rows={(ranked.length ? ranked : VOICES.map(([name, a, b]) => ({ name, lo: a, hi: b, score: 0 }))).map((v) => [
                <b key="n">{v.name}</b>, `${noteName(v.lo)}–${noteName(v.hi)}`, ranked.length ? `${Math.max(0, Math.round(v.score * 100))}%` : '—',
              ])}
            />
            {tess && <p style={{ fontSize: 13 }}>Your tessitura (where you sang most): <b>{noteName(tess[0])}–{noteName(tess[1])}</b>.</p>}
            {s.bestLo > 0 && <p className="muted" style={{ fontSize: 12 }}>Best mic session so far: {noteName(s.bestLo)}–{noteName(s.bestHi)}.</p>}
            <p className="muted" style={{ fontSize: 12 }}>Voice type also depends on timbre, passaggi and comfort — range alone is a starting point, not a verdict.</p>
          </Panel>
          <Panel title="Detector">
            <Seg value={s.algo} onChange={(algo) => set({ algo })} options={[['mpm', 'McLeod (MPM)'], ['yin', 'YIN']]} label="Algorithm" />
            <Slider label="Noise gate" value={s.gate} min={-70} max={-20} step={1} unit=" dBFS" onChange={(gate) => set({ gate })} />
            <Row>
              <Num label="Hold to count" value={s.hold} min={0.1} max={2} step={0.05} unit="s" onChange={(hold) => set({ hold })} />
              <Num label="Tuning A4" value={s.a4} min={415} max={466} step={1} unit="Hz" onChange={(a4) => set({ a4 })} />
            </Row>
            <p className="muted" style={{ fontSize: 12 }}>Audio is analysed locally and never recorded or uploaded. Use headphones-free, quiet surroundings for best results.</p>
          </Panel>
        </div>
      </Split>
    </div>
  )
}
