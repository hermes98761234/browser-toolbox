import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Check, download, FileDrop, LineChart, Note, Num, Panel, Row, Seg, Slider, Split, Stat, Stats, useToolState } from '../kit'
import { encodeWav, fmtTime } from './lib/audio-trimmer'
import { demoSignal, denoise, gate, highpass, learnProfile, noiseFloorDb, rmsDb, snrDb, stftPower, type Method } from './lib/noise-reducer'

const DEF = {
  method: 'wiener' as Method, reductionDb: 24, overSub: 1.5, smoothing: 0.5, profile: 'auto' as 'auto' | 'range', p0: 0, p1: 0.8,
  hp: true, hpHz: 80, gateOn: false, gateDb: -45, gateRange: 12, normalize: false,
}

interface Clip { name: string; rate: number; ch: Float32Array[]; clean?: Float32Array }
interface Out { ch: Float32Array[]; profile: Float64Array; n: number; ms: number }

const fftSize = (rate: number) => (rate > 32000 ? 2048 : 1024)

function demo(): Clip {
  const rate = 22050
  const { clean, noisy } = demoSignal(rate, 6)
  return { name: 'demo-noisy-voice.wav', rate, ch: [noisy], clean }
}

function process(c: Clip, s: typeof DEF): Out {
  const t0 = performance.now()
  const n = fftSize(c.rate)
  let prof: Float64Array = new Float64Array(n / 2 + 1)
  const ch = c.ch.map((x, ci) => {
    let y = s.hp ? highpass(x, c.rate, s.hpHz) : x
    const pw = stftPower(y, n, n / 4)
    const range: [number, number] | undefined = s.profile === 'range' ? [Math.floor((s.p0 * c.rate) / (n / 4)), Math.ceil((s.p1 * c.rate) / (n / 4)) + 1] : undefined
    const p = learnProfile(pw, range)
    if (ci === 0) prof = p
    y = denoise(y, p, n, { method: s.method, reductionDb: s.reductionDb, overSub: s.overSub, smoothing: s.smoothing })
    if (s.gateOn) y = gate(y, c.rate, s.gateDb, s.gateRange)
    return y
  })
  if (s.normalize) {
    const pk = ch.reduce((a, x) => x.reduce((b, v) => Math.max(b, Math.abs(v)), a), 0)
    if (pk > 0) for (const x of ch) for (let i = 0; i < x.length; i++) x[i] *= 0.89 / pk
  }
  return { ch, profile: prof, n, ms: performance.now() - t0 }
}

// ---------- drawing ----------

const MAP: [number, number, number][] = [[0, 0, 4], [40, 11, 84], [101, 21, 110], [159, 42, 99], [212, 72, 66], [245, 125, 21], [250, 193, 39], [252, 255, 164]]
function heat(t: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, t)) * (MAP.length - 1)
  const i = Math.min(MAP.length - 2, Math.floor(x)), f = x - i
  return [0, 1, 2].map((k) => MAP[i][k] + (MAP[i + 1][k] - MAP[i][k]) * f) as [number, number, number]
}

function Spectrogram({ x, rate, label }: { x: Float32Array; rate: number; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const n = 512
    const hop = Math.max(64, Math.ceil(x.length / 900 / 64) * 64)
    const pw = stftPower(x, n, hop)
    const maxHz = Math.min(rate / 2, 8000)
    const bins = Math.floor((maxHz / (rate / 2)) * (n / 2))
    const H = 160
    c.width = pw.length
    c.height = H
    const ctx = c.getContext('2d')!
    const img = ctx.createImageData(pw.length, H)
    for (let f = 0; f < pw.length; f++)
      for (let yy = 0; yy < H; yy++) {
        const k = Math.round(((H - 1 - yy) / (H - 1)) * bins)
        const db = 10 * Math.log10(pw[f][k] + 1e-12)
        const [r, g, b] = heat((db + 50) / 75)
        const o = (yy * pw.length + f) * 4
        img.data[o] = r
        img.data[o + 1] = g
        img.data[o + 2] = b
        img.data[o + 3] = 255
      }
    ctx.putImageData(img, 0, 0)
  }, [x, rate])
  return (
    <figure style={{ margin: '0 0 10px' }}>
      <canvas ref={ref} style={{ width: '100%', height: 140, borderRadius: 8, display: 'block', imageRendering: 'auto' }} />
      <figcaption className="muted" style={{ fontSize: 12.5 }}>{label} · 0–{Math.round(Math.min(rate / 2, 8000) / 1000)} kHz</figcaption>
    </figure>
  )
}

function Wave({ a, b, rate, region }: { a: Float32Array; b?: Float32Array; rate: number; region?: [number, number] }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const W = (c.width = Math.max(300, c.clientWidth * devicePixelRatio)), H = (c.height = 130 * devicePixelRatio)
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, W, H)
    if (region) {
      ctx.fillStyle = 'rgba(245,158,11,.18)'
      ctx.fillRect((region[0] * rate * W) / a.length, 0, ((region[1] - region[0]) * rate * W) / a.length, H)
    }
    const draw = (x: Float32Array, col: string) => {
      ctx.fillStyle = col
      const per = x.length / W
      for (let i = 0; i < W; i++) {
        let mn = 0, mx = 0
        for (let j = Math.floor(i * per); j < Math.min(x.length, Math.floor((i + 1) * per)); j++) {
          if (x[j] < mn) mn = x[j]
          if (x[j] > mx) mx = x[j]
        }
        ctx.fillRect(i, H / 2 - mx * (H / 2), 1, Math.max(1, (mx - mn) * (H / 2)))
      }
    }
    draw(a, 'rgba(148,163,184,.75)')
    if (b) draw(b, '#6366f1')
  }, [a, b, rate, region])
  return <canvas ref={ref} style={{ width: '100%', height: 130, display: 'block' }} />
}

// ---------- component ----------

export default function NoiseReducer() {
  const [s, set, reset] = useToolState('noise-reducer', DEF)
  const [clip, setClip] = useState<Clip>(demo)
  const [out, setOut] = useState<Out | null>(null)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [rec, setRec] = useState<MediaRecorder | null>(null)
  const [playing, setPlaying] = useState('')
  const ac = useRef<AudioContext | null>(null)
  const src = useRef<AudioBufferSourceNode | null>(null)

  const dur = clip.ch[0].length / clip.rate
  const auto = dur <= 90

  const run = () => {
    setBusy('Processing…')
    setTimeout(() => {
      try {
        setOut(process(clip, s))
      } catch (e) {
        setErr((e as Error).message)
      }
      setBusy('')
    }, 20)
  }
  useEffect(() => {
    if (!auto) return
    const t = setTimeout(run, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip, s, auto])

  const load = async (buf: ArrayBuffer, name: string) => {
    setErr('')
    setBusy('Decoding…')
    try {
      ac.current ??= new AudioContext()
      const ab = await ac.current.decodeAudioData(buf)
      const ch = Array.from({ length: Math.min(2, ab.numberOfChannels) }, (_, i) => ab.getChannelData(i).slice())
      setOut(null)
      setClip({ name, rate: ab.sampleRate, ch })
    } catch {
      setErr('Could not decode this file. Try WAV, MP3, OGG, M4A or WebM audio.')
    }
    setBusy('')
  }

  const record = async () => {
    if (rec) {
      rec.stop()
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { noiseSuppression: false, echoCancellation: false, autoGainControl: false } })
      const mr = new MediaRecorder(stream)
      const parts: Blob[] = []
      mr.ondataavailable = (e) => parts.push(e.data)
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        setRec(null)
        await load(await new Blob(parts).arrayBuffer(), 'recording.wav')
      }
      mr.start()
      setRec(mr)
    } catch {
      setErr('Microphone access was denied or is not available.')
    }
  }

  const play = (which: 'orig' | 'clean' | 'diff') => {
    src.current?.stop()
    if (playing === which) {
      setPlaying('')
      return
    }
    ac.current ??= new AudioContext()
    const ctx = ac.current
    const chans = which === 'orig' ? clip.ch : which === 'clean' ? out?.ch : out?.ch.map((y, i) => clip.ch[i].map((v, j) => v - y[j]))
    if (!chans) return
    const b = ctx.createBuffer(chans.length, chans[0].length, clip.rate)
    chans.forEach((c, i) => b.copyToChannel(c as Float32Array<ArrayBuffer>, i))
    const n = ctx.createBufferSource()
    n.buffer = b
    n.connect(ctx.destination)
    n.onended = () => setPlaying((p) => (p === which ? '' : p))
    n.start()
    src.current = n
    setPlaying(which)
  }
  useEffect(() => () => src.current?.stop(), [])

  const stats = useMemo(() => {
    if (!out) return null
    const x = clip.ch[0], y = out.ch[0]
    return {
      nf0: noiseFloorDb(x, clip.rate), nf1: noiseFloorDb(y, clip.rate), lv0: rmsDb(x), lv1: rmsDb(y),
      snr: clip.clean ? [snrDb(clip.clean, x), snrDb(clip.clean, y)] : null,
    }
  }, [out, clip])

  const profileSeries = useMemo(() => {
    if (!out) return []
    const hz = clip.rate / out.n
    const pts = (p: Float64Array) => [...p].map((v, k) => [k * hz, 10 * Math.log10(v + 1e-14)] as [number, number]).filter(([f]) => f >= 20 && f <= Math.min(8000, clip.rate / 2))
    const after = learnProfile(stftPower(out.ch[0], out.n, out.n / 4))
    return [
      { name: 'Learned noise profile', points: pts(out.profile), color: '#f59e0b' },
      { name: 'Residual noise after', points: pts(after), color: '#6366f1' },
    ]
  }, [out, clip.rate])

  return (
    <Split>
      <div>
        <Panel title="Audio">
          <FileDrop accept="audio/*,.wav,.mp3,.ogg,.m4a,.webm,.flac" onFiles={async ([f]) => load(await f.arrayBuffer(), f.name)} label="Drop a voice recording or click to choose" />
          <Row>
            <Btn kind={rec ? 'danger' : 'normal'} onClick={record} disabled={typeof MediaRecorder === 'undefined' || !navigator.mediaDevices}>{rec ? '■ Stop recording' : '🎙 Record'}</Btn>
            <Btn onClick={() => { setOut(null); setClip(demo()) }}>Demo: noisy voice</Btn>
          </Row>
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>
            {clip.name} · {fmtTime(dur, false)} · {clip.rate} Hz · {clip.ch.length === 1 ? 'mono' : 'stereo'}
          </p>
          {busy && <Note>{busy}</Note>}
          {err && <Note tone="err">{err}</Note>}
        </Panel>
        <Panel title="Noise profile">
          <Seg value={s.profile} onChange={(profile) => set({ profile })} options={[['auto', 'Auto (quietest 10%)'], ['range', 'Noise-only range']]} />
          {s.profile === 'range' && (
            <Row>
              <Num label="From" value={s.p0} onChange={(p0) => set({ p0 })} unit="s" min={0} max={dur} />
              <Num label="To" value={s.p1} onChange={(p1) => set({ p1 })} unit="s" min={0} max={dur} />
            </Row>
          )}
          <p className="muted" style={{ fontSize: 13 }}>The profile is the average spectrum of a stretch with only background noise. Pick a pause (highlighted on the waveform) for the best result.</p>
        </Panel>
        <Panel title="Reduction" actions={<Btn kind="ghost" onClick={reset}>Defaults</Btn>}>
          <Seg value={s.method} onChange={(method) => set({ method })} options={[['wiener', 'Wiener filter'], ['subtract', 'Spectral subtraction']]} />
          <Slider label="Max reduction" value={s.reductionDb} onChange={(reductionDb) => set({ reductionDb })} min={3} max={40} unit=" dB" />
          <Slider label="Noise over-estimate α" value={s.overSub} onChange={(overSub) => set({ overSub })} min={0.5} max={4} step={0.1} />
          <Slider label="Gain smoothing" value={s.smoothing} onChange={(smoothing) => set({ smoothing })} min={0} max={0.95} step={0.05} />
          <Check label="High-pass filter (zero-phase, 24 dB/oct)" value={s.hp} onChange={(hp) => set({ hp })} />
          {s.hp && <Slider label="Cut-off" value={s.hpHz} onChange={(hpHz) => set({ hpHz })} min={20} max={300} step={5} unit=" Hz" />}
          <Check label="Noise gate after reduction" value={s.gateOn} onChange={(gateOn) => set({ gateOn })} />
          {s.gateOn && (
            <Row>
              <Slider label="Threshold" value={s.gateDb} onChange={(gateDb) => set({ gateDb })} min={-80} max={-10} unit=" dB" />
              <Slider label="Range" value={s.gateRange} onChange={(gateRange) => set({ gateRange })} min={3} max={60} unit=" dB" />
            </Row>
          )}
          <Check label="Normalize output to −1 dBFS" value={s.normalize} onChange={(normalize) => set({ normalize })} />
          {!auto && <Btn kind="primary" onClick={run} disabled={!!busy}>Process</Btn>}
          <Note>
            Classical DSP, not AI: noise is estimated from a profile and removed per frequency band (STFT, {fftSize(clip.rate)}-point Hann frames, 75% overlap). It works best on steady
            noise — hiss, hum, fans, air conditioning — and cannot separate voices from music or chatter like neural models (e.g. RNNoise) can. Too much reduction sounds watery.
          </Note>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Noise floor" value={stats ? `${stats.nf1.toFixed(1)} dB` : '…'} sub={stats ? `was ${stats.nf0.toFixed(1)} dB (−${(stats.nf0 - stats.nf1).toFixed(1)} dB)` : undefined} tone="good" />
          <Stat label="Overall level" value={stats ? `${stats.lv1.toFixed(1)} dB` : '…'} sub={stats ? `was ${stats.lv0.toFixed(1)} dBFS RMS` : undefined} />
          {stats?.snr ? (
            <Stat label="SNR vs. clean demo" value={`${stats.snr[1].toFixed(1)} dB`} sub={`was ${stats.snr[0].toFixed(1)} dB (+${(stats.snr[1] - stats.snr[0]).toFixed(1)})`} tone="accent" />
          ) : (
            <Stat label="Processing time" value={out ? `${Math.round(out.ms)} ms` : '…'} />
          )}
        </Stats>
        <Panel
          title="Listen and compare"
          actions={<Btn kind="primary" disabled={!out} onClick={() => out && download(clip.name.replace(/\.[^.]+$/, '') + '-denoised.wav', new Blob([encodeWav(out.ch, clip.rate) as BlobPart], { type: 'audio/wav' }))}>⬇ WAV</Btn>}
        >
          <Row>
            <Btn kind={playing === 'orig' ? 'primary' : 'normal'} onClick={() => play('orig')}>{playing === 'orig' ? '■' : '▶'} Original</Btn>
            <Btn kind={playing === 'clean' ? 'primary' : 'normal'} disabled={!out} onClick={() => play('clean')}>{playing === 'clean' ? '■' : '▶'} Denoised</Btn>
            <Btn kind={playing === 'diff' ? 'primary' : 'normal'} disabled={!out} onClick={() => play('diff')}>{playing === 'diff' ? '■' : '▶'} Removed noise</Btn>
          </Row>
          <p className="muted" style={{ fontSize: 13, margin: '8px 0 4px' }}>Grey: original · blue: denoised{s.profile === 'range' ? ' · amber: noise-profile range' : ''}</p>
          <Wave a={clip.ch[0]} b={out?.ch[0]} rate={clip.rate} region={s.profile === 'range' ? [s.p0, s.p1] : undefined} />
          <p className="muted" style={{ fontSize: 13 }}>“Removed noise” plays original − denoised: if you can hear words in it, reduce the amount.</p>
        </Panel>
        <Panel title="Spectrograms">
          <Spectrogram x={clip.ch[0]} rate={clip.rate} label="Before" />
          {out && <Spectrogram x={out.ch[0]} rate={clip.rate} label="After" />}
        </Panel>
        <Panel title="Noise spectrum">
          <LineChart series={profileSeries} xLabel="Hz" yLabel="dB (rel.)" fx={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)))} fy={(v) => v.toFixed(0)} height={220} />
        </Panel>
      </div>
    </Split>
  )
}
