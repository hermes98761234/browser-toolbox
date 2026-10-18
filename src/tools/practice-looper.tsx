import { useEffect, useRef, useState } from 'react'
import { Btn, Check, download, FileDrop, Note, Num, Panel, Row, Seg, Slider, Split, Stat, Stats, useToolState } from '../kit'
import { encodeWav } from './lib/audio-trimmer'
import { demoTune, fmtTime, peaks, processAudio } from './lib/practice-looper'

interface Track { name: string; chs: Float32Array[]; sr: number; dur: number }

const DEF = { a: 5, b: 10, tempo: 75, semis: 0, vol: 0.9, view: 'full' as 'full' | 'loop', trainer: false, step: 5, every: 3, target: 100 }
const SR = 44100

export default function PracticeLooper() {
  const [s, set] = useToolState('practice-looper', DEF)
  const [track, setTrack] = useState<Track | null>(null)
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0)
  const [loops, setLoops] = useState(0)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const ctxRef = useRef<AudioContext | null>(null)
  const srcRef = useRef<AudioBufferSourceNode | null>(null)
  const gainRef = useRef<GainNode | null>(null)
  const bufRef = useRef<AudioBuffer | null>(null)
  const startRef = useRef(0)
  const lastLoopRef = useRef(0)
  const sinceStepRef = useRef(0)
  const cv = useRef<HTMLCanvasElement>(null)
  const drag = useRef<null | 'a' | 'b' | 'new'>(null)

  const a = Math.max(0, Math.min(s.a, s.b - 0.1))
  const b = track ? Math.min(track.dur, Math.max(s.b, a + 0.1)) : s.b
  const loopLen = b - a
  const outDur = loopLen / (s.tempo / 100)

  useEffect(() => {
    const chs = demoTune(SR)
    setTrack({ name: 'Demo riff · 96 BPM (A-minor arpeggios)', chs, sr: SR, dur: chs[0].length / SR }) // eslint-disable-line react-hooks/set-state-in-effect
    return () => {
      srcRef.current?.stop()
      void ctxRef.current?.close()
    }
  }, [])

  const render = (ctx: AudioContext, t: Track): AudioBuffer => {
    const i0 = Math.floor(a * t.sr), i1 = Math.floor(b * t.sr)
    const out = processAudio(t.chs.map((c) => c.subarray(i0, i1)), t.sr, s.tempo / 100, s.semis)
    const fade = Math.min(Math.floor(t.sr * 0.006), out[0].length >> 2)
    for (const c of out) for (let i = 0; i < fade; i++) { const g = i / fade; c[i] *= g; c[c.length - 1 - i] *= g }
    const buf = ctx.createBuffer(out.length, out[0].length, t.sr)
    out.forEach((c, k) => buf.copyToChannel(c as Float32Array<ArrayBuffer>, k))
    return buf
  }

  const start = () => {
    if (!track) return
    const ctx = (ctxRef.current ??= new AudioContext())
    void ctx.resume()
    if (!gainRef.current) { gainRef.current = ctx.createGain(); gainRef.current.connect(ctx.destination) }
    gainRef.current.gain.value = s.vol
    setBusy(true)
    setTimeout(() => {
      const buf = render(ctx, track)
      bufRef.current = buf
      srcRef.current?.stop()
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.loop = true
      src.connect(gainRef.current!)
      src.start()
      srcRef.current = src
      startRef.current = ctx.currentTime
      lastLoopRef.current = 0
      setPlaying(true)
      setBusy(false)
    }, 10)
  }
  const stop = () => {
    srcRef.current?.stop()
    srcRef.current = null
    setPlaying(false)
  }

  // re-render when loop settings change while playing
  useEffect(() => {
    if (!playing) return
    const id = setTimeout(start, 250)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a, b, s.tempo, s.semis])
  useEffect(() => { if (gainRef.current) gainRef.current.gain.value = s.vol }, [s.vol])

  // playhead, loop counter and speed trainer
  useEffect(() => {
    if (!playing) return
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const ctx = ctxRef.current, buf = bufRef.current
      if (!ctx || !buf) return
      const el = ctx.currentTime - startRef.current
      const n = Math.floor(el / buf.duration)
      setPos(a + ((el % buf.duration) / buf.duration) * loopLen)
      if (n > lastLoopRef.current) {
        lastLoopRef.current = n
        setLoops((x) => x + 1)
        if (s.trainer && s.tempo < s.target) {
          sinceStepRef.current++
          if (sinceStepRef.current >= s.every) {
            sinceStepRef.current = 0
            set({ tempo: Math.min(s.target, s.tempo + s.step) })
          }
        }
      }
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [playing, a, loopLen, s.trainer, s.tempo, s.target, s.every, s.step, set])

  // waveform
  const v0 = track ? (s.view === 'loop' ? Math.max(0, a - loopLen * 0.15) : 0) : 0
  const v1 = track ? (s.view === 'loop' ? Math.min(track.dur, b + loopLen * 0.15) : track.dur) : 1
  const view: [number, number] = [v0, v1]
  useEffect(() => {
    const c = cv.current
    if (!c || !track) return
    const W = (c.width = Math.max(300, c.clientWidth * devicePixelRatio))
    const H = (c.height = 160 * devicePixelRatio)
    const g = c.getContext('2d')!
    const css = getComputedStyle(c)
    const X = (t: number) => ((t - v0) / (v1 - v0)) * W
    g.clearRect(0, 0, W, H)
    g.fillStyle = css.getPropertyValue('--accent') + '22'
    g.fillRect(X(a), 0, X(b) - X(a), H)
    const mono = track.chs[0]
    const [lo, hi] = peaks(mono, Math.floor(v0 * track.sr), Math.floor(v1 * track.sr), Math.floor(W))
    for (let x = 0; x < W; x++) {
      const t = v0 + (x / W) * (v1 - v0)
      g.fillStyle = t >= a && t <= b ? css.getPropertyValue('--accent') : css.getPropertyValue('--muted')
      g.fillRect(x, H / 2 - hi[x] * H * 0.48, 1, Math.max(1, (hi[x] - lo[x]) * H * 0.48))
    }
    g.fillStyle = css.getPropertyValue('--ok')
    for (const [t, l] of [[a, 'A'], [b, 'B']] as const) {
      g.fillRect(X(t) - devicePixelRatio, 0, 2 * devicePixelRatio, H)
      g.font = `bold ${12 * devicePixelRatio}px system-ui`
      g.fillRect(X(t) - 9 * devicePixelRatio, 0, 18 * devicePixelRatio, 16 * devicePixelRatio)
      g.fillStyle = '#fff'
      g.fillText(l, X(t) - 4 * devicePixelRatio, 12 * devicePixelRatio)
      g.fillStyle = css.getPropertyValue('--ok')
    }
    if (playing) {
      g.fillStyle = css.getPropertyValue('--err')
      g.fillRect(X(pos), 0, 2 * devicePixelRatio, H)
    }
  }, [track, a, b, pos, playing, v0, v1])

  const tAt = (e: React.PointerEvent) => {
    const r = cv.current!.getBoundingClientRect()
    return view[0] + ((e.clientX - r.left) / r.width) * (view[1] - view[0])
  }
  const onDown = (e: React.PointerEvent) => {
    if (!track) return
    const t = tAt(e)
    const px = (view[1] - view[0]) / cv.current!.getBoundingClientRect().width
    ;(e.target as Element).setPointerCapture(e.pointerId)
    if (Math.abs(t - a) < 8 * px) drag.current = 'a'
    else if (Math.abs(t - b) < 8 * px) drag.current = 'b'
    else { drag.current = 'new'; set({ a: +t.toFixed(2), b: +(t + 0.1).toFixed(2) }) }
  }
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current || !track) return
    const t = Math.max(0, Math.min(track.dur, tAt(e)))
    if (drag.current === 'a') set({ a: +Math.min(t, b - 0.1).toFixed(2) })
    else set({ b: +Math.max(t, a + 0.1).toFixed(2) })
  }

  const load = async (f: File) => {
    stop()
    setMsg('Decoding…')
    try {
      const ctx = (ctxRef.current ??= new AudioContext())
      const ab = await ctx.decodeAudioData(await f.arrayBuffer())
      const chs = Array.from({ length: Math.min(2, ab.numberOfChannels) }, (_, i) => ab.getChannelData(i).slice())
      setTrack({ name: f.name, chs, sr: ab.sampleRate, dur: ab.duration })
      set({ a: 0, b: Math.min(ab.duration, 8) })
      setLoops(0)
      setMsg('')
    } catch {
      setMsg('Could not decode that file. Try MP3, WAV, OGG, M4A or FLAC.')
    }
  }
  const exportWav = () => {
    if (!track) return
    const i0 = Math.floor(a * track.sr), i1 = Math.floor(b * track.sr)
    const out = processAudio(track.chs.map((c) => c.subarray(i0, i1)), track.sr, s.tempo / 100, s.semis)
    download(`loop-${fmtTime(a).replace(':', 'm')}-${s.tempo}pct${s.semis ? `-${s.semis > 0 ? '+' : ''}${s.semis}st` : ''}.wav`, new Blob([encodeWav(out, track.sr) as Uint8Array<ArrayBuffer>], { type: 'audio/wav' }), 'audio/wav')
  }
  const nudge = (k: 'a' | 'b', d: number) => set({ [k]: +Math.max(0, Math.min(track?.dur ?? 0, s[k] + d)).toFixed(2) })

  return (
    <Split wide="right">
      <div>
        <Panel title="Song">
          <FileDrop accept="audio/*" onFiles={(f) => void load(f[0])} label="Drop a song (MP3, WAV, OGG, M4A…)" />
          <Btn kind="ghost" onClick={() => { stop(); const chs = demoTune(SR); setTrack({ name: 'Demo riff · 96 BPM (A-minor arpeggios)', chs, sr: SR, dur: chs[0].length / SR }); set({ a: 5, b: 10 }) }}>Load demo riff</Btn>
          {msg && <Note tone="warn">{msg}</Note>}
          {track && <p className="muted" style={{ fontSize: 13 }}>{track.name} · {fmtTime(track.dur)} · {track.sr / 1000} kHz · {track.chs.length === 2 ? 'stereo' : 'mono'}. Audio stays on your device.</p>}
        </Panel>
        <Panel title="Speed & pitch">
          <Slider label="Tempo" value={s.tempo} onChange={(tempo) => set({ tempo })} min={25} max={150} step={1} unit="%" />
          <Row>{[50, 60, 70, 80, 90, 100].map((t) => <Btn key={t} kind={s.tempo === t ? 'primary' : 'normal'} onClick={() => set({ tempo: t })}>{t}%</Btn>)}</Row>
          <Slider label="Transpose" value={s.semis} onChange={(semis) => set({ semis })} min={-12} max={12} step={1} unit=" st" show={(v) => (v > 0 ? `+${v}` : String(v))} />
          <p className="muted" style={{ fontSize: 12.5 }}>Tempo uses time-stretching (WSOLA), so slowing down keeps the original pitch; transpose shifts pitch without changing speed — handy for a capo or a tuned-down guitar.</p>
          <Slider label="Volume" value={s.vol} onChange={(vol) => set({ vol })} min={0} max={1.5} step={0.05} show={(v) => `${Math.round(v * 100)}%`} />
        </Panel>
        <Panel title="Speed trainer">
          <Check label="Raise the tempo automatically" value={s.trainer} onChange={(trainer) => set({ trainer })} />
          <Row>
            <Num label="Step" value={s.step} onChange={(step) => set({ step })} unit="%" min={1} max={25} />
            <Num label="Every" value={s.every} onChange={(every) => set({ every: Math.max(1, Math.round(every)) })} unit="loops" min={1} max={20} />
            <Num label="Up to" value={s.target} onChange={(target) => set({ target })} unit="%" min={25} max={150} />
          </Row>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Loop" value={`${fmtTime(a)} – ${fmtTime(b)}`} sub={`${loopLen.toFixed(2)} s of song`} />
          <Stat label="Tempo" value={`${s.tempo}%`} sub={`loop plays ${outDur.toFixed(2)} s`} tone="accent" />
          <Stat label="Pitch" value={s.semis ? `${s.semis > 0 ? '+' : ''}${s.semis} st` : 'original'} />
          <Stat label="Loops played" value={loops} sub={playing ? 'playing' : 'stopped'} />
        </Stats>
        <Panel title="Waveform" actions={<><Seg value={s.view} onChange={(v) => set({ view: v })} options={[['full', 'Whole song'], ['loop', 'Zoom to loop']]} /></>}>
          <canvas ref={cv} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => (drag.current = null)} style={{ width: '100%', height: 160, display: 'block', borderRadius: 8, background: 'var(--panel)', border: '1px solid var(--line)', cursor: 'crosshair', touchAction: 'none' }} />
          <p className="muted" style={{ fontSize: 12.5, margin: '6px 0' }}>Drag across the waveform to select a section; drag the A / B handles to fine-tune.</p>
          <Row>
            {playing ? <Btn kind="danger" onClick={stop}>■ Stop</Btn> : <Btn kind="primary" disabled={!track || busy} onClick={start}>{busy ? 'Rendering…' : '▶ Play loop'}</Btn>}
            <Btn onClick={() => setLoops(0)}>Reset count</Btn>
            <Btn onClick={exportWav} disabled={!track}>⬇ Loop WAV</Btn>
          </Row>
        </Panel>
        <Panel title="Loop points">
          <Row>
            <Num label="A (start)" value={s.a} onChange={(v) => set({ a: v })} unit="s" min={0} />
            <Btn onClick={() => nudge('a', -0.05)}>−50 ms</Btn>
            <Btn onClick={() => nudge('a', 0.05)}>+50 ms</Btn>
            <Btn disabled={!playing} onClick={() => set({ a: +pos.toFixed(2) })}>A = playhead</Btn>
          </Row>
          <Row>
            <Num label="B (end)" value={s.b} onChange={(v) => set({ b: v })} unit="s" min={0} />
            <Btn onClick={() => nudge('b', -0.05)}>−50 ms</Btn>
            <Btn onClick={() => nudge('b', 0.05)}>+50 ms</Btn>
            <Btn disabled={!playing} onClick={() => set({ b: +pos.toFixed(2) })}>B = playhead</Btn>
          </Row>
          <Row>
            <Btn onClick={() => set({ a: +(a + loopLen).toFixed(2), b: +(b + loopLen).toFixed(2) })} disabled={!track || b + loopLen > (track?.dur ?? 0)}>Next section →</Btn>
            <Btn onClick={() => set({ b: +(a + loopLen * 2).toFixed(2) })} disabled={!track || a + loopLen * 2 > (track?.dur ?? 0)}>Double length</Btn>
            <Btn onClick={() => set({ b: +(a + loopLen / 2).toFixed(2) })}>Halve length</Btn>
          </Row>
        </Panel>
        <Note>Practice tip: start slow enough to play the passage cleanly three times in a row, then let the speed trainer step the tempo up. Cut loop points on beats (the demo is 2.5 s per bar) so the loop sounds seamless.</Note>
      </div>
    </Split>
  )
}
