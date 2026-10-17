import { useEffect, useRef, useState } from 'react'
import { Btn, CopyButton, download, Note, Num, Panel, Row, Select, shareLink, Slider, Split, Stat, Stats, useToolState } from '../kit'
import { encodeWav } from './lib/audio-trimmer'
import { decode, encode, events, PRESETS, resize, stepDur, stepTime, TRACKS } from './lib/drum-pattern-sequencer'

interface State { p: string; steps: number; bpm: number; swing: number; vol: number[]; mute: boolean[]; master: number; bars: number }

const DEF: State = { p: PRESETS['Funky breakbeat'].p, steps: 16, bpm: 100, swing: 56, vol: [0.9, 0.8, 0.7, 0.55, 0.5, 0.75, 0.7, 0.6], mute: TRACKS.map(() => false), master: 0.8, bars: 4 }
const COLORS = ['#ef4444', '#f59e0b', '#ec4899', '#10b981', '#14b8a6', '#6366f1', '#8b5cf6', '#0ea5e9']

// ---------- synthesis ----------
const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>()
function noise(ctx: BaseAudioContext) {
  let b = noiseCache.get(ctx)
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const d = b.getChannelData(0)
    let seed = 12345
    for (let i = 0; i < d.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      d[i] = (seed / 0x7fffffff) * 2 - 1
    }
    noiseCache.set(ctx, b)
  }
  return b
}

function env(ctx: BaseAudioContext, out: AudioNode, t: number, peak: number, decay: number, attack = 0.001) {
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
  g.connect(out)
  return g
}

function noiseSrc(ctx: BaseAudioContext, t: number, dur: number) {
  const n = ctx.createBufferSource()
  n.buffer = noise(ctx)
  n.start(t, Math.random() * 0.5)
  n.stop(t + dur)
  return n
}

function filt(ctx: BaseAudioContext, type: BiquadFilterType, f: number, q = 0.7) {
  const b = ctx.createBiquadFilter()
  b.type = type
  b.frequency.value = f
  b.Q.value = q
  return b
}

/** Plays one drum voice at time t. Returns the node to choke (open hat) if any. */
function voice(ctx: BaseAudioContext, out: AudioNode, track: number, t: number, v: number): GainNode | null {
  switch (track) {
    case 0: { // kick: pitch-swept sine + click
      const o = ctx.createOscillator()
      o.frequency.setValueAtTime(160, t)
      o.frequency.exponentialRampToValueAtTime(48, t + 0.11)
      o.connect(env(ctx, out, t, v * 1.2, 0.42))
      o.start(t)
      o.stop(t + 0.5)
      noiseSrc(ctx, t, 0.01).connect(filt(ctx, 'highpass', 2000)).connect(env(ctx, out, t, v * 0.25, 0.008))
      return null
    }
    case 1: { // snare: body tone + bright noise
      const o = ctx.createOscillator()
      o.type = 'triangle'
      o.frequency.setValueAtTime(220, t)
      o.frequency.exponentialRampToValueAtTime(160, t + 0.08)
      o.connect(env(ctx, out, t, v * 0.55, 0.12))
      o.start(t)
      o.stop(t + 0.2)
      noiseSrc(ctx, t, 0.3).connect(filt(ctx, 'highpass', 1200)).connect(env(ctx, out, t, v * 0.7, 0.2))
      return null
    }
    case 2: { // clap: three quick bursts then a tail
      const bp = filt(ctx, 'bandpass', 1400, 1.2)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t)
      for (const k of [0, 0.011, 0.022]) {
        g.gain.setValueAtTime(v * 0.9, t + k)
        g.gain.exponentialRampToValueAtTime(0.05, t + k + 0.009)
      }
      g.gain.setValueAtTime(v * 0.7, t + 0.031)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25)
      noiseSrc(ctx, t, 0.3).connect(bp).connect(g).connect(out)
      return null
    }
    case 3:
    case 4: { // hats: square-wave metal cluster + noise through a high-pass
      const open = track === 4
      const dec = open ? 0.38 : 0.05
      const hp = filt(ctx, 'highpass', 7000)
      const g = env(ctx, out, t, v * (open ? 0.35 : 0.4), dec)
      hp.connect(g)
      for (const f of [205.3, 369.6, 304.4, 522.7, 800, 540]) {
        const o = ctx.createOscillator()
        o.type = 'square'
        o.frequency.value = f * 1.7
        const og = ctx.createGain()
        og.gain.value = 0.18
        o.connect(og).connect(hp)
        o.start(t)
        o.stop(t + dec + 0.05)
      }
      noiseSrc(ctx, t, dec + 0.05).connect(hp)
      return open ? g : null
    }
    case 5:
    case 6: { // toms
      const f0 = track === 5 ? 110 : 180
      const o = ctx.createOscillator()
      o.frequency.setValueAtTime(f0 * 1.6, t)
      o.frequency.exponentialRampToValueAtTime(f0, t + 0.08)
      o.connect(env(ctx, out, t, v * 0.9, 0.32))
      o.start(t)
      o.stop(t + 0.4)
      return null
    }
    default: { // rim shot
      const o = ctx.createOscillator()
      o.type = 'square'
      o.frequency.value = 1700
      o.connect(filt(ctx, 'bandpass', 1900, 3)).connect(env(ctx, out, t, v * 0.6, 0.03))
      o.start(t)
      o.stop(t + 0.05)
      return null
    }
  }
}

/** Builds the per-track gain chain and returns a play(track, t, vel) function with hat choke. */
function rig(ctx: BaseAudioContext, s: State) {
  const master = ctx.createGain()
  master.gain.value = s.master
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -10
  comp.ratio.value = 4
  master.connect(comp).connect(ctx.destination)
  const buses = TRACKS.map((_, i) => {
    const g = ctx.createGain()
    g.gain.value = s.vol[i] ?? 0.7
    g.connect(master)
    return g
  })
  let openHat: GainNode | null = null
  return {
    master,
    buses,
    play(track: number, t: number, vel: number) {
      if (track === 3 && openHat) {
        openHat.gain.cancelScheduledValues(t)
        openHat.gain.setTargetAtTime(0.0001, t, 0.01)
        openHat = null
      }
      const g = voice(ctx, buses[track], track, t, vel)
      if (g) openHat = g
    },
  }
}

export default function DrumPatternSequencer() {
  const [s, set, reset] = useToolState('drum-pattern-sequencer', DEF)
  const pattern = decode(s.p, TRACKS.length, s.steps)
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(-1)
  const [rendering, setRendering] = useState(false)
  const sRef = useRef(s)
  useEffect(() => {
    sRef.current = s
  })
  const audio = useRef<{ ctx: AudioContext; r: ReturnType<typeof rig>; timer: number; raf: number } | null>(null)

  const stop = () => {
    const a = audio.current
    if (!a) return
    clearInterval(a.timer)
    cancelAnimationFrame(a.raf)
    void a.ctx.close()
    audio.current = null
    setPlaying(false)
    setPos(-1)
  }

  const start = () => {
    if (audio.current) return
    const ctx = new AudioContext({ latencyHint: 'interactive' })
    void ctx.resume()
    const r = rig(ctx, sRef.current)
    let step = 0
    let barStart = ctx.currentTime + 0.06
    const queue: { step: number; t: number }[] = []
    const schedule = () => {
      const st = sRef.current
      const pat = decode(st.p, TRACKS.length, st.steps)
      // lookahead: schedule every step that starts within the next 120 ms
      while (true) {
        const t = barStart + stepTime(step, st.bpm, st.swing)
        if (t > ctx.currentTime + 0.12) break
        pat.forEach((row, tr) => {
          if (row[step] && !st.mute[tr]) r.play(tr, Math.max(t, ctx.currentTime), row[step] === 2 ? 1 : 0.7)
        })
        queue.push({ step, t })
        step++
        if (step >= st.steps) {
          step = 0
          barStart += st.steps * stepDur(st.bpm)
        }
      }
    }
    const draw = () => {
      while (queue.length > 1 && queue[1].t <= ctx.currentTime) queue.shift()
      if (queue.length && queue[0].t <= ctx.currentTime) setPos(queue[0].step)
      if (audio.current) audio.current.raf = requestAnimationFrame(draw)
    }
    schedule()
    audio.current = { ctx, r, timer: window.setInterval(schedule, 25), raf: requestAnimationFrame(draw) }
    setPlaying(true)
  }

  // live mixer changes while playing
  useEffect(() => {
    const a = audio.current
    if (!a) return
    a.r.master.gain.setTargetAtTime(s.master, a.ctx.currentTime, 0.02)
    a.r.buses.forEach((b, i) => b.gain.setTargetAtTime(s.vol[i] ?? 0.7, a.ctx.currentTime, 0.02))
  }, [s.master, s.vol])

  useEffect(() => () => stop(), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || (e.target as HTMLElement).closest('input, textarea, select, button')) return
      e.preventDefault()
      if (audio.current) stop()
      else start()
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })

  const setCell = (tr: number, st: number) => {
    const p = pattern.map((r) => [...r])
    p[tr][st] = (p[tr][st] + 1) % 3
    set({ p: encode(p) })
  }
  const audition = (tr: number) => {
    const ctx = audio.current?.ctx ?? new AudioContext()
    const r = audio.current?.r ?? rig(ctx, s)
    r.play(tr, ctx.currentTime + 0.01, 1)
    if (!audio.current) setTimeout(() => void ctx.close(), 800)
  }

  const exportWav = async () => {
    setRendering(true)
    try {
      const rate = 44100
      const bar = s.steps * stepDur(s.bpm)
      const len = bar * s.bars + 0.6
      const ctx = new OfflineAudioContext(2, Math.ceil(len * rate), rate)
      const r = rig(ctx, s)
      for (const h of events(pattern, s.bpm, s.swing, s.bars, s.mute)) r.play(h.track, h.t + 0.001, h.vel)
      const buf = await ctx.startRendering()
      const wav = encodeWav([buf.getChannelData(0), buf.getChannelData(1)], rate)
      download(`drums-${s.bpm}bpm.wav`, new Blob([wav as BlobPart], { type: 'audio/wav' }), 'audio/wav')
    } finally {
      setRendering(false)
    }
  }

  const hits = pattern.reduce((a, r, i) => a + (s.mute[i] ? 0 : r.filter(Boolean).length), 0)
  const barSec = s.steps * stepDur(s.bpm)
  const presetName = Object.entries(PRESETS).find(([, v]) => v.p === s.p)?.[0] ?? ''

  return (
    <Split wide="right">
      <div>
        <Panel title="Transport" actions={<Btn kind="ghost" onClick={() => { stop(); reset() }}>Reset</Btn>}>
          <Row>
            <Btn kind="primary" onClick={() => (playing ? stop() : start())}>{playing ? '■ Stop' : '▶ Play'}</Btn>
            <span className="muted" style={{ fontSize: 13, alignSelf: 'center' }}>Space bar toggles playback</span>
          </Row>
          <Slider label="Tempo" value={s.bpm} onChange={(bpm) => set({ bpm })} min={50} max={200} unit=" BPM" show={(v) => String(v)} />
          <Slider label="Swing" value={s.swing} onChange={(swing) => set({ swing })} min={50} max={75} step={1} unit="%" show={(v) => String(v)} />
          <p className="muted" style={{ fontSize: 12.5, margin: '-4px 0 8px' }}>50 % = straight 16ths, ~58 % = light groove, 67 % = triplet shuffle.</p>
          <Slider label="Master volume" value={s.master} onChange={(master) => set({ master })} min={0} max={1} step={0.01} show={(v) => `${Math.round(v * 100)}%`} />
          <Row>
            <Select label="Steps" value={s.steps} onChange={(steps) => set({ steps, p: encode(resize(pattern, steps)) })} options={[[8, '8'], [12, '12 (triplets)'], [16, '16'], [24, '24'], [32, '32 (2 bars)']]} />
            <Select label="Preset" value={presetName} onChange={(k) => k && set({ p: PRESETS[k].p, bpm: PRESETS[k].bpm, swing: PRESETS[k].swing, steps: 16 })} options={[['', '— choose —'], ...Object.keys(PRESETS).map((k) => [k, k] as [string, string])]} />
          </Row>
          <Row>
            <Btn onClick={() => set({ p: encode(pattern.map((r) => r.map(() => 0))) })}>Clear</Btn>
            <Btn onClick={() => {
              const dens = [0.25, 0.12, 0.06, 0.55, 0.06, 0.06, 0.06, 0.08]
              set({ p: encode(pattern.map((r, tr) => r.map((_, i) => (tr === 0 && i % 8 === 0) || (tr === 1 && i % 8 === 4) ? 2 : Math.random() < dens[tr] ? 1 : 0))) })
            }}>🎲 Random groove</Btn>
          </Row>
        </Panel>
        <Panel title="Export">
          <Num label="Bars to render" value={s.bars} onChange={(bars) => set({ bars: Math.min(64, Math.max(1, Math.round(bars))) })} min={1} max={64} />
          <Row>
            <Btn kind="primary" disabled={rendering} onClick={() => void exportWav()}>{rendering ? 'Rendering…' : '⬇ WAV (44.1 kHz stereo)'}</Btn>
            <CopyButton label="Share link" text={() => shareLink(s)} />
          </Row>
          <Note>The WAV is rendered offline (faster than real time) with the same synthesized kit, swing and mixer you hear.</Note>
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Tempo" value={`${s.bpm} BPM`} sub={`${(60000 / s.bpm / 4).toFixed(0)} ms per 16th`} />
          <Stat label="Pattern length" value={`${barSec.toFixed(2)} s`} sub={`${s.steps} steps`} />
          <Stat label="Hits per loop" value={hits} tone="accent" />
          <Stat label="Export length" value={`${(barSec * s.bars).toFixed(1)} s`} sub={`${s.bars} loops`} />
        </Stats>
        <Panel title="Step grid">
          <div style={{ overflowX: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: `130px 34px repeat(${s.steps}, minmax(22px, 1fr))`, gap: 4, minWidth: 180 + s.steps * 26, alignItems: 'center' }}>
              {TRACKS.map((name, tr) => [
                <button key={`n${tr}`} type="button" className="k-btn ghost" style={{ justifyContent: 'flex-start', padding: '2px 6px', fontWeight: 700, color: COLORS[tr], opacity: s.mute[tr] ? 0.45 : 1 }} onClick={() => audition(tr)} title="Click to audition">
                  {name}
                </button>,
                <button key={`m${tr}`} type="button" className="k-btn ghost" title={s.mute[tr] ? 'Unmute' : 'Mute'} style={{ padding: '2px 4px', fontWeight: 800, color: s.mute[tr] ? 'var(--err)' : 'var(--muted)' }} onClick={() => set({ mute: s.mute.map((m, i) => (i === tr ? !m : m)) })}>
                  M
                </button>,
                ...pattern[tr].map((v, st) => {
                  const group = Math.floor(st / (s.steps % 3 === 0 && s.steps % 4 !== 0 ? 3 : 4)) % 2
                  return (
                    <button
                      key={`${tr}-${st}`}
                      type="button"
                      aria-label={`${name} step ${st + 1}: ${v === 2 ? 'accent' : v ? 'on' : 'off'}`}
                      onClick={() => setCell(tr, st)}
                      style={{
                        height: 30,
                        borderRadius: 6,
                        cursor: 'pointer',
                        border: `2px solid ${st === pos ? 'var(--fg)' : 'transparent'}`,
                        background: v ? COLORS[tr] : group ? 'var(--line)' : 'color-mix(in srgb, var(--line) 55%, transparent)',
                        opacity: v === 1 ? 0.62 : 1,
                        boxShadow: v === 2 ? `0 0 0 2px ${COLORS[tr]} inset, 0 0 8px ${COLORS[tr]}` : undefined,
                      }}
                    />
                  )
                }),
              ])}
              <span />
              <span />
              {Array.from({ length: s.steps }, (_, i) => (
                <span key={i} className="muted" style={{ textAlign: 'center', fontSize: 11, fontWeight: i === pos ? 800 : 400 }}>
                  {i + 1}
                </span>
              ))}
            </div>
          </div>
          <p className="muted" style={{ fontSize: 12.5 }}>Click a cell to cycle off → on → <b>accent</b>. Click a drum name to hear it. M mutes a track. Open hat is choked by the closed hat, like a real kit.</p>
        </Panel>
        <Panel title="Mixer">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0 16px' }}>
            {TRACKS.map((name, i) => (
              <Slider key={name} label={name} value={s.vol[i] ?? 0.7} onChange={(v) => set({ vol: s.vol.map((x, j) => (j === i ? v : x)) })} min={0} max={1} step={0.01} show={(v) => `${Math.round(v * 100)}%`} />
            ))}
          </div>
        </Panel>
      </div>
    </Split>
  )
}
