import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, download, FileDrop, Note, Panel, Row, Select, Slider, Split, Stat, Stats, useToolState } from '../kit'
import { type Curve, detectSound, encodeWav, fadeGain, fmtTime, normalizeGain, parseTime, peak, peaks, render, rms, toDb } from './lib/audio-trimmer'

interface Clip { name: string; rate: number; channels: Float32Array[]; sample?: boolean }

const DEF = { fadeIn: 0.3, fadeOut: 1.2, curve: 'equal-power' as Curve, gainDb: 0, threshold: -40 }

function demo(): Clip {
  const rate = 44100, dur = 9
  const L = new Float32Array(rate * dur), R = new Float32Array(rate * dur)
  const notes = [261.63, 329.63, 392, 523.25, 392, 329.63, 293.66, 349.23, 440, 587.33, 440, 349.23, 261.63, 329.63, 392, 523.25]
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1
  notes.forEach((f, i) => {
    const t0 = 1.1 + i * 0.4
    const a = Math.round(t0 * rate)
    const pan = 0.5 + 0.4 * Math.sin(i)
    for (let j = 0; j < rate * 1.4 && a + j < L.length; j++) {
      const t = j / rate
      const env = Math.min(1, t / 0.01) * Math.exp(-t * 3.2)
      const v = 0.32 * env * (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(4 * Math.PI * f * t) + 0.12 * Math.sin(6 * Math.PI * f * t))
      L[a + j] += v * (1 - pan) * 1.4
      R[a + j] += v * pan * 1.4
    }
  })
  for (let i = 0; i < L.length; i++) {
    const n = rnd() * 0.002
    L[i] += n
    R[i] += n
  }
  return { name: 'demo-arpeggio.wav', rate, channels: [L, R], sample: true }
}

export default function AudioTrimmer() {
  const [s, set, reset] = useToolState('audio-trimmer', DEF)
  const [clip, setClip] = useState<Clip>(demo)
  const dur = clip.channels[0].length / clip.rate
  const [sel, setSel] = useState<[number, number]>(() => detectSound(clip.channels, clip.rate, -40, 0.1))
  const [view, setView] = useState<[number, number]>([0, dur])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [pos, setPos] = useState<number | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const drag = useRef<0 | 1 | null>(null)
  const ctx = useRef<AudioContext | null>(null)
  const node = useRef<AudioBufferSourceNode | null>(null)
  const [W, setW] = useState(800)
  const H = 200

  const [a, b] = sel
  const len = Math.max(0, b - a)
  const opts = { start: a, end: b, fadeIn: Math.min(s.fadeIn, len), fadeOut: Math.min(s.fadeOut, len), curve: s.curve, gainDb: s.gainDb }
  const out = useMemo(() => render(clip.channels, clip.rate, opts), [clip, a, b, opts.fadeIn, opts.fadeOut, s.curve, s.gainDb]) // eslint-disable-line react-hooks/exhaustive-deps
  const outPeak = peak(out)

  const audio = () => (ctx.current ??= new AudioContext())

  const open = async (f: File) => {
    setErr('')
    setBusy(true)
    try {
      const buf = await audio().decodeAudioData(await f.arrayBuffer())
      const channels = Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i).slice())
      const c = { name: f.name, rate: buf.sampleRate, channels }
      stop()
      setClip(c)
      setSel([0, buf.duration])
      setView([0, buf.duration])
    } catch {
      setErr('This file could not be decoded. Try MP3, WAV, OGG, M4A/AAC or FLAC.')
    } finally {
      setBusy(false)
    }
  }

  const stop = () => {
    try { node.current?.stop() } catch { /* already stopped */ }
    node.current = null
    setPos(null)
  }
  const play = (whole = false) => {
    stop()
    const ac = audio()
    void ac.resume()
    const data = whole ? clip.channels : out
    if (!data[0].length) return
    const buf = ac.createBuffer(data.length, data[0].length, clip.rate)
    data.forEach((ch, i) => buf.copyToChannel(ch as Float32Array<ArrayBuffer>, i))
    const src = ac.createBufferSource()
    src.buffer = buf
    src.connect(ac.destination)
    const t0 = ac.currentTime, off = whole ? 0 : a
    src.start()
    node.current = src
    src.onended = () => { if (node.current === src) { node.current = null; setPos(null) } }
    const tick = () => {
      if (node.current !== src) return
      setPos(off + (ac.currentTime - t0))
      requestAnimationFrame(tick)
    }
    tick()
  }
  useEffect(() => () => { stop(); void ctx.current?.close() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = canvas.current?.parentElement
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const [v0, v1] = view
  const tx = (t: number) => ((t - v0) / (v1 - v0)) * W
  const pk = useMemo(() => peaks(clip.channels, W, Math.floor(v0 * clip.rate), Math.ceil(v1 * clip.rate)), [clip, W, v0, v1])

  useEffect(() => {
    const c = canvas.current
    if (!c) return
    const dpr = Math.min(2, devicePixelRatio)
    c.width = W * dpr
    c.height = H * dpr
    const g = c.getContext('2d')!
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    const css = getComputedStyle(c)
    const accent = css.getPropertyValue('--accent').trim() || '#6366f1'
    const muted = css.getPropertyValue('--muted').trim() || '#64748b'
    g.clearRect(0, 0, W, H)
    const mid = H / 2
    const xa = tx(a), xb = tx(b)
    g.fillStyle = accent + '22'
    g.fillRect(xa, 0, xb - xa, H)
    pk.forEach(([mn, mx], x) => {
      const t = v0 + ((x + 0.5) / W) * (v1 - v0)
      let k = 1
      const inSel = t >= a && t <= b
      if (inSel) {
        if (opts.fadeIn > 0 && t < a + opts.fadeIn) k = fadeGain((t - a) / opts.fadeIn, s.curve)
        if (opts.fadeOut > 0 && t > b - opts.fadeOut) k *= fadeGain((b - t) / opts.fadeOut, s.curve)
        k *= Math.pow(10, s.gainDb / 20)
      }
      g.fillStyle = inSel ? accent : muted + '88'
      const top = mid - Math.min(1, mx * k) * mid * 0.95, bot = mid - Math.max(-1, mn * k) * mid * 0.95
      g.fillRect(x, top, 1, Math.max(1, bot - top))
    })
    // fade envelopes
    g.strokeStyle = '#f59e0b'
    g.lineWidth = 1.5
    g.beginPath()
    for (let x = Math.max(0, Math.floor(xa)); x <= Math.min(W, Math.ceil(xb)); x += 2) {
      const t = v0 + (x / W) * (v1 - v0)
      let k = 1
      if (opts.fadeIn > 0 && t < a + opts.fadeIn) k = fadeGain((t - a) / opts.fadeIn, s.curve)
      if (opts.fadeOut > 0 && t > b - opts.fadeOut) k *= fadeGain((b - t) / opts.fadeOut, s.curve)
      const y = H - 4 - k * (H - 8)
      if (x === Math.max(0, Math.floor(xa))) g.moveTo(x, y)
      else g.lineTo(x, y)
    }
    g.stroke()
    for (const [x, lbl] of [[xa, '['], [xb, ']']] as const) {
      g.fillStyle = accent
      g.fillRect(x - 1.5, 0, 3, H)
      g.fillRect(lbl === '[' ? x : x - 10, 0, 10, 18)
    }
    if (pos !== null) {
      g.fillStyle = '#ef4444'
      g.fillRect(tx(pos) - 1, 0, 2, H)
    }
    g.fillStyle = muted
    g.font = '11px system-ui, sans-serif'
    const step = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300].find((st) => ((v1 - v0) / st) * 70 < W) ?? 600
    for (let t = Math.ceil(v0 / step) * step; t <= v1; t += step) g.fillText(fmtTime(t, step < 1), tx(t) + 3, H - 4)
  }, [pk, W, a, b, pos, opts.fadeIn, opts.fadeOut, s.curve, s.gainDb, v0, v1]) // eslint-disable-line react-hooks/exhaustive-deps

  const timeAt = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect()
    return Math.max(0, Math.min(dur, v0 + ((e.clientX - r.left) / r.width) * (v1 - v0)))
  }
  const onDown = (e: React.PointerEvent) => {
    const t = timeAt(e)
    drag.current = Math.abs(t - a) < Math.abs(t - b) ? 0 : 1
    canvas.current!.setPointerCapture(e.pointerId)
    onMove(e)
  }
  const onMove = (e: React.PointerEvent) => {
    if (drag.current === null) return
    const t = timeAt(e)
    setSel(drag.current === 0 ? [Math.min(t, b), b] : [a, Math.max(t, a)])
  }

  const timeInput = (label: string, v: number, onSet: (t: number) => void) => (
    <label className="k-field">
      <span className="k-label">{label}</span>
      <input key={v} className="k-text" defaultValue={fmtTime(v)} onBlur={(e) => { const t = parseTime(e.target.value); if (Number.isFinite(t)) onSet(Math.max(0, Math.min(dur, t))); else e.target.value = fmtTime(v) }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
    </label>
  )

  const save = () => download(clip.name.replace(/\.[^.]+$/, '') + '-trimmed.wav', new Blob([encodeWav(out, clip.rate) as BlobPart], { type: 'audio/wav' }))

  return (
    <Split wide="right">
      <div>
        <Panel title="Audio file">
          <FileDrop accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac" onFiles={([f]) => void open(f)} label={busy ? 'Decoding…' : 'Drop an audio file or click to choose'} />
          <Row><Btn kind="ghost" onClick={() => { stop(); const d = demo(); setClip(d); setSel(detectSound(d.channels, d.rate, -40, 0.1)); setView([0, 9]) }}>Load demo clip</Btn></Row>
          <p className="muted" style={{ marginTop: 8 }}>{clip.sample && '🧪 '}<b>{clip.name}</b> · {fmtTime(dur)} · {clip.rate} Hz · {clip.channels.length === 1 ? 'mono' : clip.channels.length === 2 ? 'stereo' : `${clip.channels.length} ch`}</p>
          {err && <Note tone="err">{err}</Note>}
        </Panel>
        <Panel title="Selection">
          <Row>
            {timeInput('Start', a, (t) => setSel([Math.min(t, b), b]))}
            {timeInput('End', b, (t) => setSel([a, Math.max(t, a)]))}
          </Row>
          <Row>
            <Btn onClick={() => setSel(detectSound(clip.channels, clip.rate, s.threshold, 0.05))}>✂ Auto-trim silence</Btn>
            <Btn kind="ghost" onClick={() => setSel([0, dur])}>Select all</Btn>
          </Row>
          <Slider label="Silence threshold" value={s.threshold} onChange={(threshold) => set({ threshold })} min={-70} max={-10} unit=" dB" show={(v) => String(v)} />
        </Panel>
        <Panel title="Fades & level" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Slider label="Fade in" value={s.fadeIn} onChange={(fadeIn) => set({ fadeIn })} min={0} max={Math.min(10, Math.max(0.5, len / 2))} step={0.05} unit=" s" />
          <Slider label="Fade out" value={s.fadeOut} onChange={(fadeOut) => set({ fadeOut })} min={0} max={Math.min(10, Math.max(0.5, len / 2))} step={0.05} unit=" s" />
          <Select label="Fade curve" value={s.curve} onChange={(curve) => set({ curve })} options={[['equal-power', 'Equal power (smooth, musical)'], ['linear', 'Linear'], ['exponential', 'Exponential (fast tail)']]} />
          <Slider label="Gain" value={s.gainDb} onChange={(gainDb) => set({ gainDb })} min={-24} max={24} step={0.1} unit=" dB" show={(v) => (v > 0 ? '+' : '') + v.toFixed(1)} />
          <Btn onClick={() => set({ gainDb: Math.round(normalizeGain(clip.channels, clip.rate, a, b, -1) * 10) / 10 })}>Normalize to −1 dBFS</Btn>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Result length" value={fmtTime(len)} sub={`cut ${fmtTime(dur - len)}`} />
          <Stat label="Peak" value={`${toDb(outPeak).toFixed(1)} dBFS`} tone={outPeak > 1 ? 'bad' : 'good'} sub={outPeak > 1 ? 'clipping!' : 'no clipping'} />
          <Stat label="RMS loudness" value={`${toDb(rms(out)).toFixed(1)} dB`} />
          <Stat label="WAV size" value={`${((out[0].length * out.length * 2 + 44) / 1048576).toFixed(2)} MB`} />
        </Stats>
        <Panel
          title="Waveform"
          actions={
            <>
              <Btn kind="ghost" onClick={() => setView([Math.max(0, a - len * 0.05), Math.min(dur, b + len * 0.05)])} disabled={len <= 0}>Zoom to selection</Btn>
              <Btn kind="ghost" onClick={() => setView([0, dur])}>Fit</Btn>
            </>
          }
        >
          <div style={{ width: '100%' }}>
            <canvas ref={canvas} style={{ width: W, height: H, display: 'block', cursor: 'ew-resize', touchAction: 'none', background: 'var(--bg)', borderRadius: 8 }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => (drag.current = null)} />
          </div>
          <Row>
            {pos === null ? <Btn kind="primary" onClick={() => play()}>▶ Play result</Btn> : <Btn kind="primary" onClick={stop}>■ Stop</Btn>}
            <Btn onClick={() => play(true)}>▶ Play original</Btn>
            <Btn onClick={save} disabled={len <= 0}>⬇ Download WAV</Btn>
          </Row>
          <p className="k-hint">Drag on the waveform to move the nearest edge. The orange line is the fade envelope; the coloured part is what you keep.</p>
        </Panel>
        <Panel title="Tips">
          <Note>
            Use <b>Auto-trim silence</b> to drop dead air, then a short fade-in (10–50 ms) to avoid clicks and a longer equal-power fade-out for music.
            Export is lossless 16-bit WAV, decoded and processed entirely in your browser. To make an MP3, run the WAV through any encoder afterwards.
          </Note>
        </Panel>
      </div>
    </Split>
  )
}
