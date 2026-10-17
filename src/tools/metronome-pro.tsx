import { useEffect, useRef, useState } from 'react'
import { Btn, Check, Note, Num, Panel, Row, Select, Seg, Slider, Split, Stat, Stats, useToolState } from '../kit'
import { barSeconds, barTicks, tapBpm, tempoName, trainerBpm, type Level, type Tick } from './lib/metronome-pro'

type Sound = 'beep' | 'wood' | 'click'
interface State {
  bpm: number
  accents: Level[]
  den: number
  sub: number
  poly: number
  sound: Sound
  volume: number
  trainer: boolean
  target: number
  step: number
  every: number
}

const DEF: State = { bpm: 100, accents: [2, 1, 1, 1], den: 4, sub: 2, poly: 0, sound: 'beep', volume: 0.8, trainer: false, target: 140, step: 4, every: 4 }

const PRESETS: [string, Partial<State>][] = [
  ['Rock 4/4', { accents: [2, 1, 1, 1], den: 4, sub: 2, poly: 0 }],
  ['Waltz 3/4', { accents: [2, 1, 1], den: 4, sub: 1, poly: 0 }],
  ['Jig 6/8', { accents: [2, 0, 0, 1, 0, 0], den: 8, sub: 1, poly: 0 }],
  ['Take Five 5/4', { accents: [2, 1, 1, 2, 1], den: 4, sub: 1, poly: 0 }],
  ['7/8 (2+2+3)', { accents: [2, 1, 2, 1, 2, 1, 1], den: 8, sub: 1, poly: 0 }],
  ['Swing triplets', { accents: [1, 2, 1, 2], den: 4, sub: 3, poly: 0 }],
  ['3 against 4', { accents: [2, 1, 1, 1], den: 4, sub: 1, poly: 3 }],
  ['5 against 4', { accents: [2, 1, 1, 1], den: 4, sub: 1, poly: 5 }],
]

const SUBS: [string, string][] = [['1', '1'], ['2', '2 · eighths'], ['3', '3 · triplets'], ['4', '4 · 16ths'], ['5', '5'], ['6', '6']]

interface Shown { beat: number; sub: number; poly: number; bar: number; bpm: number }

export default function MetronomePro() {
  const [s, set, reset] = useToolState<State>('metronome-pro', DEF)
  const [running, setRunning] = useState(false)
  const [shown, setShown] = useState<Shown>({ beat: -1, sub: 0, poly: -1, bar: 0, bpm: s.bpm })
  const [taps, setTaps] = useState<number[]>([])
  const cfg = useRef(s)
  const audio = useRef<AudioContext | null>(null)
  const noise = useRef<AudioBuffer | null>(null)

  useEffect(() => {
    cfg.current = s
  }, [s])

  useEffect(() => {
    if (!running) return
    const ctx = (audio.current ??= new AudioContext())
    void ctx.resume()
    if (!noise.current) {
      const b = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate)
      const d = b.getChannelData(0)
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
      noise.current = b
    }
    const play = (t: number, tick: Tick) => {
      const c = cfg.current
      if (tick.level <= 0) return
      const g = ctx.createGain()
      g.connect(ctx.destination)
      const peak = Math.max(0.0002, c.volume * tick.level)
      const hi = tick.layer === 'poly'
      const f = hi ? 2400 : tick.layer === 'sub' ? 800 : tick.level >= 1 ? 1600 : 1000
      const dur = c.sound === 'click' ? 0.02 : 0.06
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(peak, t + 0.002)
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      if (c.sound === 'wood') {
        const src = ctx.createBufferSource()
        src.buffer = noise.current
        const bp = ctx.createBiquadFilter()
        bp.type = 'bandpass'
        bp.frequency.value = f
        bp.Q.value = 12
        src.connect(bp).connect(g)
        g.gain.setValueAtTime(0.0001, t)
        g.gain.exponentialRampToValueAtTime(peak * 4, t + 0.001)
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045)
        src.start(t)
        src.stop(t + 0.05)
      } else {
        const o = ctx.createOscillator()
        o.type = c.sound === 'click' ? 'square' : 'sine'
        o.frequency.value = f
        o.connect(g)
        o.start(t)
        o.stop(t + dur + 0.01)
      }
    }
    const queue: { t: number; tick: Tick; bar: number; bpm: number }[] = []
    let bar = 0
    let barStart = ctx.currentTime + 0.08
    let curBpm = cfg.current.trainer ? trainerBpm(cfg.current.bpm, cfg.current.target, cfg.current.step, cfg.current.every, 0) : cfg.current.bpm
    let barDur = barSeconds(curBpm, cfg.current.accents.length)
    let ticks = barTicks(cfg.current.accents, cfg.current.sub, cfg.current.poly)
    let idx = 0
    const schedule = () => {
      const ahead = document.hidden ? 1.5 : 0.12
      for (;;) {
        if (idx >= ticks.length) {
          barStart += barDur
          bar++
          const c = cfg.current
          curBpm = c.trainer ? trainerBpm(c.bpm, c.target, c.step, c.every, bar) : c.bpm
          barDur = barSeconds(curBpm, c.accents.length)
          ticks = barTicks(c.accents, c.sub, c.poly)
          idx = 0
        }
        const t = barStart + ticks[idx].at * barDur
        if (t > ctx.currentTime + ahead) break
        play(t, ticks[idx])
        queue.push({ t, tick: ticks[idx], bar, bpm: curBpm })
        idx++
      }
    }
    schedule()
    const timer = setInterval(schedule, 25)
    let raf = 0
    const draw = () => {
      raf = requestAnimationFrame(draw)
      let last: (typeof queue)[number] | undefined
      let polyHit = -2
      while (queue.length && queue[0].t <= ctx.currentTime) {
        const q = queue.shift()!
        if (q.tick.layer === 'poly') polyHit = q.tick.beat
        else last = q
      }
      if (last || polyHit > -2) {
        setShown((p) => ({
          beat: last ? last.tick.beat : p.beat,
          sub: last ? (last.tick.layer === 'main' ? 0 : p.sub + 1) : p.sub,
          poly: polyHit > -2 ? polyHit : p.poly,
          bar: last ? last.bar : p.bar,
          bpm: last ? last.bpm : p.bpm,
        }))
      }
    }
    draw()
    return () => {
      clearInterval(timer)
      cancelAnimationFrame(raf)
      setShown((p) => ({ ...p, beat: -1, poly: -1, sub: 0 }))
    }
  }, [running])

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (e.code === 'Space' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT' && tag !== 'BUTTON') {
        e.preventDefault()
        setRunning((r) => !r)
      }
    }
    addEventListener('keydown', key)
    return () => removeEventListener('keydown', key)
  }, [])

  const setBpm = (v: number) => set({ bpm: Math.round(Math.min(300, Math.max(20, v))) })
  const setBeats = (n: number) => {
    const a = Array.from({ length: n }, (_, i) => s.accents[i] ?? (i === 0 ? 2 : 1)) as Level[]
    set({ accents: a })
  }
  const tap = () => {
    const now = performance.now()
    const next = [...taps.filter((t) => now - t < 8000), now]
    setTaps(next)
    const b = tapBpm(next)
    if (b) setBpm(b)
  }
  const liveBpm = running ? shown.bpm : s.bpm
  const beatMs = 60000 / liveBpm

  return (
    <Split>
      <div>
        <Panel title="Tempo">
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{liveBpm}</div>
            <div className="muted">BPM · {tempoName(liveBpm)}</div>
          </div>
          <Slider label="Beats per minute" value={s.bpm} onChange={setBpm} min={20} max={300} />
          <Row>
            {[-10, -1, 1, 10].map((d) => (
              <Btn key={d} onClick={() => setBpm(s.bpm + d)}>{d > 0 ? `+${d}` : `−${-d}`}</Btn>
            ))}
            <Btn onClick={tap} title="Tap 3+ times in rhythm">👆 Tap tempo</Btn>
          </Row>
          <div style={{ marginTop: 12 }}>
            <Btn kind="primary" onClick={() => setRunning((r) => !r)}>{running ? '■ Stop' : '▶ Start'}</Btn>{' '}
            <span className="muted" style={{ fontSize: 13 }}>or press Space</span>
          </div>
        </Panel>
        <Panel title="Meter & subdivision">
          <Row>
            <Num label="Beats per bar" value={s.accents.length} onChange={(n) => n >= 1 && n <= 16 && setBeats(Math.round(n))} min={1} max={16} step={1} />
            <Select label="Beat unit" value={s.den} onChange={(den) => set({ den })} options={[[2, 'half ♩/2'], [4, 'quarter ♩'], [8, 'eighth ♪'], [16, 'sixteenth']]} />
          </Row>
          <div className="k-label" style={{ margin: '8px 0 4px' }}>Clicks per beat</div>
          <Seg value={String(s.sub)} onChange={(v) => set({ sub: Number(v) })} options={SUBS} />
          <Select
            label="Polyrhythm layer (clicks per bar)"
            value={s.poly}
            onChange={(poly) => set({ poly })}
            options={[[0, 'Off'], ...[2, 3, 5, 6, 7, 9].map((n) => [n, `${n} against ${s.accents.length}`] as [number, string])]}
          />
        </Panel>
        <Panel title="Sound">
          <Seg value={s.sound} onChange={(sound) => set({ sound })} options={[['beep', 'Beep'], ['wood', 'Woodblock'], ['click', 'Click']]} />
          <Slider label="Volume" value={s.volume} onChange={(volume) => set({ volume })} min={0.05} max={1} step={0.05} show={(v) => `${Math.round(v * 100)}%`} />
        </Panel>
      </div>
      <div>
        <Panel title={`${s.accents.length}/${s.den}${running ? ` · bar ${shown.bar + 1}` : ''}`} actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', padding: '12px 0' }}>
            {s.accents.map((a, i) => {
              const on = running && shown.beat === i
              return (
                <button
                  key={i}
                  type="button"
                  title="Click: accent → normal → mute"
                  onClick={() => set({ accents: s.accents.map((x, j) => (j === i ? (((x + 2) % 3) as Level) : x)) })}
                  style={{
                    width: 56, height: 56, borderRadius: '50%', cursor: 'pointer', fontWeight: 800, fontSize: 18,
                    border: `3px solid ${a === 0 ? 'var(--line)' : a === 2 ? 'var(--err)' : 'var(--accent)'}`,
                    background: on ? (a === 2 ? 'var(--err)' : a === 1 ? 'var(--accent)' : 'var(--line)') : 'transparent',
                    color: on ? '#fff' : a === 0 ? 'var(--muted)' : 'inherit',
                    transform: on ? 'scale(1.15)' : 'none', transition: 'transform 60ms, background 60ms',
                  }}
                >
                  {a === 0 ? '·' : i + 1}
                </button>
              )
            })}
          </div>
          {s.sub > 1 && (
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
              {Array.from({ length: s.sub }, (_, k) => (
                <span key={k} style={{ width: 14, height: 14, borderRadius: '50%', background: running && shown.beat >= 0 && shown.sub === k ? 'var(--accent)' : 'var(--line)' }} />
              ))}
            </div>
          )}
          {s.poly > 0 && (
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 14 }}>
              {Array.from({ length: s.poly }, (_, k) => (
                <span key={k} style={{ width: 30, height: 30, borderRadius: 6, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, border: '2px solid #f59e0b', background: running && shown.poly === k ? '#f59e0b' : 'transparent' }}>{k + 1}</span>
              ))}
            </div>
          )}
          <p className="muted" style={{ textAlign: 'center', fontSize: 13 }}>Red = accent, blue = normal, grey dot = muted. Click a beat to change it.</p>
        </Panel>
        <Stats>
          <Stat label="Beat length" value={`${Math.round(beatMs)} ms`} />
          <Stat label="Bar length" value={`${(barSeconds(liveBpm, s.accents.length)).toFixed(2)} s`} />
          <Stat label="Clicks per bar" value={s.accents.length * s.sub + s.poly} />
          <Stat label="Bars per minute" value={(liveBpm / s.accents.length).toFixed(1)} />
        </Stats>
        <Panel title="Presets">
          <Row>
            {PRESETS.map(([n, p]) => (
              <Btn key={n} onClick={() => set(p)}>{n}</Btn>
            ))}
          </Row>
        </Panel>
        <Panel title="Tempo trainer">
          <Check label="Speed up gradually while playing" value={s.trainer} onChange={(trainer) => set({ trainer })} />
          {s.trainer && (
            <Row>
              <Num label="Target" value={s.target} onChange={(target) => set({ target })} unit="BPM" min={20} max={300} />
              <Num label="Step" value={s.step} onChange={(step) => set({ step })} unit="BPM" />
              <Num label="Every" value={s.every} onChange={(every) => set({ every: Math.max(1, Math.round(every)) })} unit="bars" min={1} />
            </Row>
          )}
          {s.trainer && (
            <Note>
              From {s.bpm} to {s.target} BPM in {Math.ceil(Math.abs(s.target - s.bpm) / Math.max(1, Math.abs(s.step)))} steps — about{' '}
              {Math.ceil(Math.abs(s.target - s.bpm) / Math.max(1, Math.abs(s.step))) * s.every} bars. Use a negative step to slow down.
            </Note>
          )}
        </Panel>
      </div>
    </Split>
  )
}
