import { useEffect, useRef, useState } from 'react'
import { Btn, Note, num, Panel, Row, Select, Slider, Split, Stat, Stats, useToolState } from '../kit'
import { midiFreq, noteOf, parseNote, rms, yin } from './lib/chromatic-tuner'

/** Info note (block layout; the global `.info` grid class would otherwise split it into columns). */
const Tip = ({ children }: { children: React.ReactNode }) => <div className="k-note info" style={{ display: 'block' }}>{children}</div>

const INSTRUMENTS: Record<string, string[]> = {
  Chromatic: [],
  'Guitar (standard)': ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'],
  'Guitar (drop D)': ['D2', 'A2', 'D3', 'G3', 'B3', 'E4'],
  'Guitar (DADGAD)': ['D2', 'A2', 'D3', 'G3', 'A3', 'D4'],
  'Bass (4-string)': ['E1', 'A1', 'D2', 'G2'],
  'Ukulele (GCEA)': ['G4', 'C4', 'E4', 'A4'],
  Violin: ['G3', 'D4', 'A4', 'E5'],
  Viola: ['C3', 'G3', 'D4', 'A4'],
  Cello: ['C2', 'G2', 'D3', 'A3'],
  'Banjo (open G)': ['G4', 'D3', 'G3', 'B3', 'D4'],
}

const DEF = { a4: 440, instrument: 'Guitar (standard)', gate: 0.01 }
const N = 4096

interface Reading { freq: number; clarity: number; level: number }

function css(name: string, el: Element) {
  return getComputedStyle(el).getPropertyValue(name).trim() || '#888'
}

function drawGauge(c: HTMLCanvasElement, cents: number | null, label: string) {
  const dpr = Math.min(2, devicePixelRatio || 1)
  const W = c.clientWidth, H = c.clientHeight
  c.width = W * dpr
  c.height = H * dpr
  const g = c.getContext('2d')!
  g.scale(dpr, dpr)
  const fg = css('--fg', c), muted = css('--muted', c), ok = css('--ok', c), warn = css('--warn', c), err = css('--err', c), line = css('--line', c)
  const cx = W / 2, cy = H - 30, R = Math.min(W / 2 - 20, H - 50)
  const ang = (ct: number) => -Math.PI / 2 + (ct / 50) * (Math.PI / 2.6)
  // coloured zones
  const zone = (a: number, b: number, col: string) => {
    g.beginPath()
    g.arc(cx, cy, R, ang(a), ang(b))
    g.strokeStyle = col
    g.lineWidth = 14
    g.stroke()
  }
  zone(-50, -15, err)
  zone(-15, -5, warn)
  zone(-5, 5, ok)
  zone(5, 15, warn)
  zone(15, 50, err)
  g.globalAlpha = 1
  g.fillStyle = muted
  g.strokeStyle = muted
  g.font = '12px system-ui, sans-serif'
  g.textAlign = 'center'
  for (let t = -50; t <= 50; t += 5) {
    const a = ang(t)
    const r1 = R - 12, r2 = R - (t % 10 === 0 ? 26 : 20)
    g.lineWidth = t % 10 === 0 ? 2 : 1
    g.beginPath()
    g.moveTo(cx + r1 * Math.cos(a), cy + r1 * Math.sin(a))
    g.lineTo(cx + r2 * Math.cos(a), cy + r2 * Math.sin(a))
    g.stroke()
    if (t % 25 === 0) g.fillText(`${t > 0 ? '+' : ''}${t}`, cx + (R - 40) * Math.cos(a), cy + (R - 40) * Math.sin(a) + 4)
  }
  // needle
  const ct = cents === null ? 0 : Math.max(-50, Math.min(50, cents))
  const a = ang(ct)
  g.strokeStyle = cents === null ? line : Math.abs(ct) <= 5 ? ok : Math.abs(ct) <= 15 ? warn : err
  g.lineWidth = 4
  g.lineCap = 'round'
  g.beginPath()
  g.moveTo(cx, cy)
  g.lineTo(cx + (R - 6) * Math.cos(a), cy + (R - 6) * Math.sin(a))
  g.stroke()
  g.fillStyle = fg
  g.beginPath()
  g.arc(cx, cy, 8, 0, Math.PI * 2)
  g.fill()
  g.font = 'bold 15px system-ui, sans-serif'
  g.fillText(label, cx, H - 6)
}

function drawHistory(c: HTMLCanvasElement, hist: (number | null)[]) {
  const dpr = Math.min(2, devicePixelRatio || 1)
  const W = c.clientWidth, H = c.clientHeight
  c.width = W * dpr
  c.height = H * dpr
  const g = c.getContext('2d')!
  g.scale(dpr, dpr)
  const y = (ct: number) => H / 2 - (Math.max(-50, Math.min(50, ct)) / 50) * (H / 2 - 4)
  g.fillStyle = css('--ok', c)
  g.globalAlpha = 0.15
  g.fillRect(0, y(5), W, y(-5) - y(5))
  g.globalAlpha = 1
  g.strokeStyle = css('--line', c)
  g.beginPath()
  g.moveTo(0, H / 2)
  g.lineTo(W, H / 2)
  g.stroke()
  g.strokeStyle = css('--accent', c)
  g.lineWidth = 2
  g.beginPath()
  let pen = false
  hist.forEach((v, i) => {
    const x = (i / Math.max(1, hist.length - 1)) * W
    if (v === null) { pen = false; return }
    if (pen) g.lineTo(x, y(v))
    else g.moveTo(x, y(v))
    pen = true
  })
  g.stroke()
}

export default function ChromaticTuner() {
  const [s, set] = useToolState('chromatic-tuner', DEF)
  const [mode, setMode] = useState<'off' | 'mic' | 'demo'>('demo')
  const [reading, setReading] = useState<Reading | null>(null)
  const [error, setError] = useState('')
  const [demoTarget, setDemoTarget] = useState('A2')
  const gauge = useRef<HTMLCanvasElement>(null)
  const histEl = useRef<HTMLCanvasElement>(null)
  const hist = useRef<(number | null)[]>(Array(160).fill(null))
  const smooth = useRef<number | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const strings = INSTRUMENTS[s.instrument] ?? []

  // processing loop (mic or synthetic demo)
  useEffect(() => {
    if (mode === 'off') return
    let raf = 0
    let stop = () => {}
    const buf = new Float32Array(N)
    let analyser: AnalyserNode | null = null
    let sr = 48000
    let frame = 0
    const t0 = performance.now()
    const start = async () => {
      if (mode === 'mic') {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
          const ac = new AudioContext()
          sr = ac.sampleRate
          analyser = ac.createAnalyser()
          analyser.fftSize = N
          ac.createMediaStreamSource(stream).connect(analyser)
          stop = () => { stream.getTracks().forEach((t) => t.stop()); void ac.close() }
        } catch (e) {
          setError(e instanceof Error ? `Microphone unavailable: ${e.message}` : 'Microphone unavailable')
          setMode('off')
          return
        }
      }
      const tick = () => {
        raf = requestAnimationFrame(tick)
        if (++frame % 2) return
        if (analyser) analyser.getFloatTimeDomainData(buf)
        else {
          // synthetic plucked string drifting slowly through ±25 cents around the demo target
          const t = (performance.now() - t0) / 1000
          const f = midiFreq(parseNote(demoTarget), s.a4) * 2 ** ((25 * Math.sin(t * 0.7) * Math.exp(-((t % 12) / 9))) / 1200)
          const amp = 0.25 + 0.2 * Math.cos(t * 0.5)
          for (let i = 0; i < N; i++) {
            const x = (2 * Math.PI * f * i) / sr
            buf[i] = amp * (Math.sin(x) + 0.5 * Math.sin(2 * x) + 0.25 * Math.sin(3 * x)) + (Math.random() - 0.5) * 0.02
          }
        }
        const level = rms(buf)
        const p = level > s.gate ? yin(buf, sr) : null
        let cents: number | null = null
        if (p && p.clarity > 0.8) {
          const n = noteOf(p.freq, s.a4)
          smooth.current = smooth.current === null || Math.abs(smooth.current - p.freq) / p.freq > 0.03 ? p.freq : smooth.current * 0.6 + p.freq * 0.4
          cents = n.cents
          setReading({ freq: smooth.current, clarity: p.clarity, level })
        } else {
          smooth.current = null
          setReading((r) => (r ? { ...r, level, clarity: 0 } : null))
        }
        hist.current = [...hist.current.slice(1), cents]
        if (histEl.current) drawHistory(histEl.current, hist.current)
      }
      tick()
    }
    void start()
    return () => {
      cancelAnimationFrame(raf)
      stop()
    }
  }, [mode, s.a4, s.gate, demoTarget])

  const active = reading && reading.clarity > 0 ? reading : null
  const note = active ? noteOf(active.freq, s.a4) : null
  // nearest string of the chosen instrument
  const nearest = active && strings.length
    ? strings.map((st) => ({ st, c: 1200 * Math.log2(active.freq / midiFreq(parseNote(st), s.a4)) })).sort((a, b) => Math.abs(a.c) - Math.abs(b.c))[0]
    : null
  const cents = nearest && Math.abs(nearest.c) < 300 ? nearest.c : note ? note.cents : null
  const label = cents === null ? 'Play a note…' : Math.abs(cents) <= 5 ? 'In tune ✓' : cents < 0 ? `Flat — tune up ${num(-cents, 0)}¢` : `Sharp — tune down ${num(cents, 0)}¢`

  useEffect(() => {
    if (gauge.current) drawGauge(gauge.current, cents, label)
  }, [cents, label])

  const play = (name: string) => {
    if (mode === 'demo') setDemoTarget(name)
    const ac = ctxRef.current ?? (ctxRef.current = new AudioContext())
    const o = ac.createOscillator()
    const gn = ac.createGain()
    o.type = 'triangle'
    o.frequency.value = midiFreq(parseNote(name), s.a4)
    gn.gain.setValueAtTime(0.0001, ac.currentTime)
    gn.gain.exponentialRampToValueAtTime(0.3, ac.currentTime + 0.02)
    gn.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 2)
    o.connect(gn).connect(ac.destination)
    o.start()
    o.stop(ac.currentTime + 2.05)
  }

  const micOk = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

  return (
    <Split wide="right">
      <div>
        <Panel title="Input">
          <Row>
            <Btn kind={mode === 'mic' ? 'primary' : 'normal'} disabled={!micOk} onClick={() => { setError(''); setMode(mode === 'mic' ? 'off' : 'mic') }}>
              {mode === 'mic' ? '■ Stop microphone' : '🎤 Use microphone'}
            </Btn>
            <Btn kind={mode === 'demo' ? 'primary' : 'normal'} onClick={() => setMode(mode === 'demo' ? 'off' : 'demo')}>
              {mode === 'demo' ? '■ Stop demo' : '▶ Demo signal'}
            </Btn>
          </Row>
          {!micOk && <Note tone="warn">This browser has no microphone access (it needs HTTPS and getUserMedia). The demo signal still works.</Note>}
          {error && <Note tone="err">{error}</Note>}
          {mode === 'demo' && <Tip>Demo: a synthetic string at <b>{demoTarget}</b> drifting in and out of tune. Click a string below to change it.</Tip>}
        </Panel>
        <Panel title="Settings">
          <Select label="Instrument / tuning" value={s.instrument} onChange={(instrument) => set({ instrument })} options={Object.keys(INSTRUMENTS)} />
          <Slider label="Reference A4" value={s.a4} onChange={(a4) => set({ a4 })} min={415} max={466} step={1} unit=" Hz" show={(v) => String(v)} />
          <Row>
            {[415, 432, 440, 442, 443].map((f) => (
              <Btn key={f} kind={s.a4 === f ? 'primary' : 'ghost'} onClick={() => set({ a4: f })}>{f}</Btn>
            ))}
          </Row>
          <Slider label="Noise gate" value={s.gate} onChange={(gate) => set({ gate })} min={0.002} max={0.08} step={0.002} show={(v) => v.toFixed(3)} />
        </Panel>
        {strings.length > 0 && (
          <Panel title="Strings (click for reference tone)">
            <Row>
              {strings.map((st, i) => (
                <Btn key={st + i} kind={nearest?.st === st && Math.abs(nearest.c) < 300 ? 'primary' : 'normal'} onClick={() => play(st)} title={`${num(midiFreq(parseNote(st), s.a4), 2)} Hz`}>
                  {i + 1}: {st}
                </Btn>
              ))}
            </Row>
          </Panel>
        )}
      </div>
      <div>
        <Panel title="Tuner">
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 72, fontWeight: 800, lineHeight: 1, color: cents !== null && Math.abs(cents) <= 5 ? 'var(--ok)' : undefined }}>
              {nearest && Math.abs(nearest.c) < 300 ? nearest.st.replace(/(\d)$/, '') : note ? note.name : '–'}
              <sub style={{ fontSize: 28 }}>{nearest && Math.abs(nearest.c) < 300 ? nearest.st.slice(-1) : note ? note.octave : ''}</sub>
            </div>
            <canvas ref={gauge} style={{ width: '100%', height: 220, display: 'block' }} />
          </div>
        </Panel>
        <Stats>
          <Stat label="Frequency" value={active ? `${num(active.freq, 2)} Hz` : '—'} tone="accent" />
          <Stat label="Target" value={nearest && Math.abs(nearest.c) < 300 ? `${num(midiFreq(parseNote(nearest.st), s.a4), 2)} Hz` : note ? `${num(note.target, 2)} Hz` : '—'} sub={nearest ? `string ${nearest.st}` : note ? `${note.name}${note.octave}` : undefined} />
          <Stat label="Deviation" value={cents === null ? '—' : `${cents > 0 ? '+' : ''}${num(cents, 1)}¢`} tone={cents !== null && Math.abs(cents) <= 5 ? 'good' : cents !== null ? 'bad' : undefined} />
          <Stat label="Signal" value={reading ? `${num(20 * Math.log10(reading.level || 1e-6), 0)} dBFS` : '—'} sub={active ? `clarity ${num(active.clarity * 100, 0)}%` : 'waiting for a clear tone'} />
        </Stats>
        <Panel title="Pitch history (±50 cents)">
          <canvas ref={histEl} style={{ width: '100%', height: 90, display: 'block' }} />
        </Panel>
        <Tip>Pitch is found with the YIN algorithm on 4096-sample windows (down to ~30 Hz, enough for a 5-string bass). 1 cent = 1/100 of a semitone; most ears notice ±5–10¢. Audio is processed locally and never recorded.</Tip>
      </div>
    </Split>
  )
}
