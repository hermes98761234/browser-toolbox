import { useEffect, useRef, useState } from 'react'
import { Btn, Note, Panel, Row, Seg, Slider, Split, Stat, Stats, Txt, uid, useToolState } from '../kit'
import { BANDS, brown, bumps, impulses, pink, rng, swells, white } from './lib/focus-soundscape-mixer'

const CH = [
  ['white', '⚪', 'White noise', 'Flat hiss, masks speech best'], ['pink', '🌸', 'Pink noise', 'Softer, like steady rain'], ['brown', '🟤', 'Brown noise', 'Deep rumble, waterfall'],
  ['rain', '🌧️', 'Rain', 'Hiss bed + drops on a roof'], ['wind', '🌬️', 'Wind', 'Slow gusts and whistles'], ['waves', '🌊', 'Ocean waves', 'Swells every 6–11 s'],
  ['cafe', '☕', 'Café murmur', 'Distant voices and cups'], ['fire', '🔥', 'Fireplace', 'Roar, crackles and pops'], ['binaural', '🎧', 'Binaural tone', 'Needs headphones'],
] as const
type Id = (typeof CH)[number][0]
type Levels = Record<Id, number>
const ZERO = Object.fromEntries(CH.map((c) => [c[0], 0])) as Levels
const PRESETS: [string, Partial<Levels>][] = [
  ['Deep focus', { brown: 0.55, rain: 0.25 }], ['Rainy café', { rain: 0.55, cafe: 0.4, brown: 0.15 }], ['Beach', { waves: 0.7, wind: 0.2 }],
  ['Campfire night', { fire: 0.65, wind: 0.25 }], ['Study binaural', { binaural: 0.35, pink: 0.3 }], ['Storm', { rain: 0.8, wind: 0.6, brown: 0.3 }],
]
const DEF = { levels: { ...ZERO, brown: 0.5, rain: 0.35, fire: 0.2 } as Levels, master: 0.7, carrier: 200, beat: 10, timer: 25, mixes: [] as { id: string; name: string; levels: Levels }[] }

/** Builds one Web Audio graph per channel, all synthesised (no audio files). */
class Engine {
  ctx = new AudioContext()
  master = this.ctx.createGain()
  analyser = this.ctx.createAnalyser()
  gains = new Map<Id, GainNode>()
  stops: (() => void)[] = []
  osc: OscillatorNode[] = []
  constructor() {
    this.analyser.fftSize = 2048
    this.master.connect(this.analyser).connect(this.ctx.destination)
  }
  buf(sec: number, gen: (n: number, seed: number) => Float32Array) {
    const n = Math.round(sec * this.ctx.sampleRate)
    const b = this.ctx.createBuffer(2, n, this.ctx.sampleRate)
    b.copyToChannel(gen(n, 11) as Float32Array<ArrayBuffer>, 0)
    b.copyToChannel(gen(n, 23) as Float32Array<ArrayBuffer>, 1)
    return b
  }
  src(b: AudioBuffer) {
    const s = this.ctx.createBufferSource()
    s.buffer = b; s.loop = true
    s.start(0, Math.random() * b.duration)
    this.stops.push(() => s.stop())
    return s
  }
  filt(type: BiquadFilterType, f: number, q = 0.7) {
    const x = this.ctx.createBiquadFilter()
    x.type = type; x.frequency.value = f; x.Q.value = q
    return x
  }
  amp(v: number) { const g = this.ctx.createGain(); g.gain.value = v; return g }
  lfo(freq: number, depth: number, target: AudioParam) {
    const o = this.ctx.createOscillator(); o.frequency.value = freq
    o.connect(this.amp(depth)).connect(target); o.start()
    this.stops.push(() => o.stop())
  }
  chain(...n: AudioNode[]) { for (let i = 1; i < n.length; i++) n[i - 1].connect(n[i]); return n[n.length - 1] }
  build(id: Id, out: GainNode, carrier: number, beat: number) {
    const sr = this.ctx.sampleRate, R = (seed: number) => rng(seed)
    if (id === 'white') this.chain(this.src(this.buf(5, (n, s) => white(n, R(s)))), this.amp(0.35), out)
    if (id === 'pink') this.chain(this.src(this.buf(6, (n, s) => pink(n, R(s)))), this.amp(0.9), out)
    if (id === 'brown') this.chain(this.src(this.buf(8, (n, s) => brown(n, R(s)))), this.amp(1.1), out)
    if (id === 'rain') {
      this.chain(this.src(this.buf(7, (n, s) => pink(n, R(s)))), this.filt('highpass', 450), this.filt('lowpass', 7000), this.amp(0.55), out)
      this.chain(this.src(this.buf(9, (n, s) => impulses(n, sr, 260, 4, R(s)))), this.filt('highpass', 2200), this.amp(0.35), out)
      this.chain(this.src(this.buf(11, (n, s) => impulses(n, sr, 22, 28, R(s + 5)))), this.filt('bandpass', 900, 1.2), this.amp(0.7), out)
    }
    if (id === 'wind') {
      const bp = this.filt('bandpass', 420, 1.1), g = this.amp(0.7)
      this.chain(this.src(this.buf(10, (n, s) => brown(n, R(s)))), bp, g, out)
      this.lfo(0.071, 260, bp.frequency); this.lfo(0.113, 0.35, g.gain)
      const wh = this.filt('bandpass', 950, 14)
      this.chain(this.src(this.buf(8, (n, s) => pink(n, R(s)))), wh, this.amp(0.5), out)
      this.lfo(0.047, 320, wh.frequency)
    }
    if (id === 'waves') {
      const env = this.src(this.buf(37, (n, s) => swells(n, sr, R(s))))
      const lp = this.filt('lowpass', 350), g = this.amp(0)
      this.chain(this.src(this.buf(9, (n, s) => { const a = brown(n, R(s)), b = pink(n, R(s + 1)); for (let i = 0; i < n; i++) a[i] = a[i] * 0.8 + b[i] * 0.6; return a })), lp, g, out)
      env.connect(g.gain); env.connect(this.amp(2200)).connect(lp.frequency)
    }
    if (id === 'cafe') {
      for (let v = 0; v < 7; v++) {
        const r = rng(100 + v), g = this.amp(0)
        this.chain(this.src(this.buf(6, (n, s) => pink(n, R(s + v)))), this.filt('bandpass', 350 + r() * 1400, 2.5 + r() * 2), g, this.amp(0.55), out)
        this.src(this.buf(9 + v, (n, s) => bumps(n, sr, 3 + r() * 2.5, 0.4, R(s * 7 + v)))).connect(g.gain)
      }
      this.chain(this.src(this.buf(8, (n, s) => brown(n, R(s)))), this.filt('lowpass', 500), this.amp(0.5), out)
      let t: ReturnType<typeof setTimeout>
      const clink = () => {
        const now = this.ctx.currentTime, f = 2400 + Math.random() * 2200, g = this.amp(0)
        for (const k of [1, 2.76]) { const o = this.ctx.createOscillator(); o.frequency.value = f * k; o.connect(g); o.start(now); o.stop(now + 0.6) }
        g.gain.setValueAtTime(0.05 + Math.random() * 0.05, now); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.5)
        g.connect(out)
        t = setTimeout(clink, 1200 + Math.random() * 5000)
      }
      t = setTimeout(clink, 800)
      this.stops.push(() => clearTimeout(t))
    }
    if (id === 'fire') {
      const g = this.amp(0.8)
      this.chain(this.src(this.buf(9, (n, s) => brown(n, R(s)))), this.filt('lowpass', 260), g, out)
      this.lfo(0.31, 0.25, g.gain)
      this.chain(this.src(this.buf(10, (n, s) => impulses(n, sr, 30, 2, R(s), true))), this.filt('highpass', 1600), this.amp(1.6), out)
      this.chain(this.src(this.buf(13, (n, s) => impulses(n, sr, 3, 14, R(s + 3)))), this.filt('bandpass', 650, 1.5), this.amp(1.4), out)
    }
    if (id === 'binaural') {
      const m = this.ctx.createChannelMerger(2), g = this.amp(0.18)
      ;[carrier, carrier + beat].forEach((f, i) => { const o = this.ctx.createOscillator(); o.frequency.value = f; o.connect(m, 0, i); o.start(); this.osc[i] = o; this.stops.push(() => o.stop()) })
      this.chain(m, g, out)
    }
  }
  start(levels: Levels, master: number, carrier: number, beat: number) {
    this.master.gain.value = master * master
    for (const [id] of CH) {
      const g = this.amp((levels[id] ?? 0) ** 2)
      g.connect(this.master)
      this.gains.set(id, g)
      this.build(id, g, carrier, beat)
    }
  }
  set(levels: Levels, master: number) {
    const t = this.ctx.currentTime
    this.master.gain.setTargetAtTime(master * master, t, 0.08)
    for (const [id, g] of this.gains) g.gain.setTargetAtTime((levels[id] ?? 0) ** 2, t, 0.08)
  }
  tone(carrier: number, beat: number) {
    const t = this.ctx.currentTime
    this.osc[0]?.frequency.setTargetAtTime(carrier, t, 0.1)
    this.osc[1]?.frequency.setTargetAtTime(carrier + beat, t, 0.1)
  }
  close() { this.stops.forEach((f) => { try { f() } catch { /* already stopped */ } }); void this.ctx.close() }
}

export default function FocusSoundscapeMixer() {
  const [s, set] = useToolState('focus-soundscape-mixer', DEF)
  const eng = useRef<Engine | null>(null)
  const [playing, setPlaying] = useState(false)
  const [left, setLeft] = useState(0) // seconds remaining on the timer
  const [name, setName] = useState('My mix')
  const cv = useRef<HTMLCanvasElement>(null)
  const supported = typeof AudioContext !== 'undefined'
  const lv = { ...ZERO, ...s.levels }

  const stop = () => { eng.current?.close(); eng.current = null; setPlaying(false); setLeft(0) }
  const play = () => {
    if (!supported) return
    stop()
    const e = new Engine()
    e.start(lv, s.master, s.carrier, s.beat)
    eng.current = e
    setPlaying(true)
    setLeft(s.timer * 60)
  }
  useEffect(() => { eng.current?.set({ ...ZERO, ...s.levels }, s.master) }, [s.levels, s.master])
  useEffect(() => { eng.current?.tone(s.carrier, s.beat) }, [s.carrier, s.beat])
  useEffect(() => () => eng.current?.close(), [])
  useEffect(() => {
    if (!playing || !s.timer) return
    const t = setInterval(() => setLeft((x) => {
      if (x === 11 && eng.current) eng.current.master.gain.setTargetAtTime(0, eng.current.ctx.currentTime, 3)
      if (x <= 1) { stop(); return 0 }
      return x - 1
    }), 1000)
    return () => clearInterval(t)
  }, [playing, s.timer]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const c = cv.current
    if (!c) return
    const g = c.getContext('2d')!
    let raf = 0
    const data = new Uint8Array(1024)
    const draw = () => {
      const W = (c.width = c.clientWidth * devicePixelRatio), H = (c.height = 140 * devicePixelRatio)
      g.clearRect(0, 0, W, H)
      const a = eng.current?.analyser
      const bars = 64
      if (a) a.getByteFrequencyData(data)
      for (let i = 0; i < bars; i++) {
        // log-spaced bins 20 Hz – 16 kHz
        const f0 = 20 * Math.pow(800, i / bars), f1 = 20 * Math.pow(800, (i + 1) / bars)
        const sr = eng.current?.ctx.sampleRate ?? 48000
        const b0 = Math.floor((f0 / sr) * 2048), b1 = Math.max(b0 + 1, Math.floor((f1 / sr) * 2048))
        let v = 0
        for (let b = b0; b < b1; b++) v = Math.max(v, data[b] ?? 0)
        const h = a ? (v / 255) * H : 3 * devicePixelRatio
        g.fillStyle = `hsl(${200 + (i / bars) * 120}, 70%, 58%)`
        g.fillRect((i * W) / bars + 1, H - h, W / bars - 2, h)
      }
      if (a) raf = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [playing])

  const active = CH.filter(([id]) => lv[id] > 0)
  const band = BANDS.reduce((b, x) => (Math.abs(x[1] - s.beat) < Math.abs(b[1] - s.beat) ? x : b))
  const mm = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`

  return (
    <Split wide="right">
      <div>
        <Panel title="Player">
          {!supported && <Note tone="err">Web Audio is not available in this browser.</Note>}
          <Row>
            {playing ? <Btn kind="danger" onClick={stop}>■ Stop</Btn> : <Btn kind="primary" onClick={play} disabled={!supported}>▶ Play mix</Btn>}
            <Btn kind="ghost" onClick={() => set({ levels: { ...ZERO } })}>Mute all</Btn>
          </Row>
          <Slider label="Master volume" min={0} max={1} step={0.01} value={s.master} onChange={(master) => set({ master })} show={(v) => `${Math.round(v * 100)}%`} />
          <span className="k-label">Timer (fades out at the end)</span>
          <Seg value={String(s.timer)} onChange={(v) => set({ timer: Number(v) })} options={[['0', 'Off'], ['15', '15m'], ['25', '25m'], ['50', '50m'], ['90', '90m']]} />
          {playing && s.timer > 0 && <Note tone="ok">Playing · {mm} left</Note>}
        </Panel>
        <Panel title="Presets">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 6 }}>
            {PRESETS.map(([n, l]) => <Btn key={n} onClick={() => set({ levels: { ...ZERO, ...l } })}>{n}</Btn>)}
          </div>
        </Panel>
        <Panel title="Saved mixes">
          <Row wrap={false}>
            <Txt label="" value={name} onChange={setName} placeholder="Mix name" />
            <Btn kind="primary" disabled={!name.trim() || !active.length} onClick={() => set({ mixes: [...s.mixes.filter((m) => m.name !== name.trim()), { id: uid(), name: name.trim(), levels: lv }] })}>Save</Btn>
          </Row>
          {s.mixes.length === 0 && <p className="muted">Save the current sliders to recall them later.</p>}
          {s.mixes.map((m) => (
            <Row key={m.id} wrap={false}>
              <button type="button" className="k-btn ghost" style={{ flex: 1, textAlign: 'left' }} onClick={() => set({ levels: { ...ZERO, ...m.levels } })}>
                <b>{m.name}</b> <span className="muted">{CH.filter(([id]) => m.levels[id] > 0).map((c) => c[1]).join(' ')}</span>
              </button>
              <Btn kind="ghost" title="Delete" onClick={() => set({ mixes: s.mixes.filter((x) => x.id !== m.id) })}>✕</Btn>
            </Row>
          ))}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Status" value={playing ? 'Playing' : 'Stopped'} tone={playing ? 'good' : undefined} sub={playing && s.timer ? `${mm} left` : undefined} />
          <Stat label="Layers on" value={active.length} sub={active.map((c) => c[1]).join(' ') || 'none'} />
          <Stat label="Binaural beat" value={`${s.beat} Hz`} sub={`${band[0]} · ${band[2]}`} tone="accent" />
        </Stats>
        <Panel title="Spectrum">
          <canvas ref={cv} style={{ width: '100%', height: 140, display: 'block', borderRadius: 8, background: 'color-mix(in srgb, var(--accent) 6%, transparent)' }} />
          {!playing && <p className="muted" style={{ fontSize: 12 }}>Press play to see the live spectrum. Every sound is synthesised in your browser — no audio files, nothing downloaded.</p>}
        </Panel>
        <Panel title="Mixer">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '4px 18px' }}>
            {CH.map(([id, icon, label, hint]) => (
              <div key={id} style={{ opacity: lv[id] > 0 ? 1 : 0.65 }}>
                <Slider label={<span>{icon} {label}</span>} min={0} max={1} step={0.01} value={lv[id]} onChange={(v) => set({ levels: { ...lv, [id]: v } })} show={(v) => `${Math.round(v * 100)}%`} />
                <div className="muted" style={{ fontSize: 12, marginTop: -6 }}>{hint}</div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Binaural tone">
          <Row>
            {BANDS.map(([n, f]) => <Btn key={n} kind={s.beat === f ? 'primary' : 'ghost'} onClick={() => set({ beat: f })}>{n} {f} Hz</Btn>)}
          </Row>
          <Slider label="Beat frequency" min={1} max={45} step={0.5} value={s.beat} onChange={(beat) => set({ beat })} unit=" Hz" />
          <Slider label="Carrier tone" min={100} max={500} step={5} value={s.carrier} onChange={(carrier) => set({ carrier })} unit=" Hz" />
          <Note>Left ear hears {s.carrier} Hz, right ear {s.carrier + s.beat} Hz; your brain perceives a {s.beat} Hz beat. Use headphones and keep the volume low. Evidence for focus effects is modest — pick what feels good.</Note>
        </Panel>
      </div>
    </Split>
  )
}
