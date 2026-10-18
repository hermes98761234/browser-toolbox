import { useEffect, useRef, useState } from 'react'
import { Btn, Check, FileDrop, Note, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, useToolState } from '../kit'
import { bandLevels, demoMix, fmtBand, fmtDb, hold, Meter, NOMINAL, pinkNoise, RTA_CAL, smooth, type Hold, type Readout, type Weighting } from './lib/audio-spectrum-analyzer'

type Src = 'demo' | 'pink' | 'tone' | 'file' | 'mic'
const DEF = { src: 'demo' as Src, weighting: 'Z' as Weighting, speed: 'fast' as 'fast' | 'slow', target: -14, monitor: true, volume: 0.6 }
const FS = 48000
const TARGETS: [number, string][] = [[-14, 'Streaming (−14 LUFS)'], [-16, 'Podcast / Apple (−16 LUFS)'], [-23, 'EBU R128 broadcast (−23 LUFS)'], [-24, 'ATSC A/85 (−24 LKFS)'], [-18, 'Calibration (−18 LUFS)']]

const TAP = `class T extends AudioWorkletProcessor{constructor(){super();this.n=0;this.L=new Float32Array(2048);this.R=new Float32Array(2048)}
process(ins){const i=ins[0];if(i&&i.length){const l=i[0],r=i[1]||i[0];this.L.set(l,this.n);this.R.set(r,this.n);this.n+=l.length;if(this.n>=2048){this.port.postMessage([this.L.slice(0,this.n),this.R.slice(0,this.n)]);this.n=0}}return true}}
registerProcessor('bt-meter-tap',T)`

function makeSignal(src: Src): [Float32Array, Float32Array] | null {
  if (src === 'demo') return demoMix(FS, 8)
  if (src === 'pink') {
    const p = pinkNoise(FS * 10, -20, 11)
    return [p, p]
  }
  if (src === 'tone') {
    const A = 10 ** (-18 / 20)
    const t = Float32Array.from({ length: FS }, (_, i) => A * Math.sin((2 * Math.PI * 1000 * i) / FS))
    return [t, t]
  }
  return null
}

function setupCanvas(cv: HTMLCanvasElement | null): CanvasRenderingContext2D | null {
  if (!cv) return null
  const dpr = Math.min(2, devicePixelRatio || 1)
  const w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr)
  if (cv.width !== w || cv.height !== h) {
    cv.width = w
    cv.height = h
  }
  const g = cv.getContext('2d')
  g?.setTransform(dpr, 0, 0, dpr, 0, 0)
  return g
}

const levelColor = (db: number) => (db > -6 ? '#ef4444' : db > -18 ? '#f59e0b' : '#22c55e')

export default function AudioSpectrumAnalyzer() {
  const [s, set, reset] = useToolState('audio-spectrum-analyzer', DEF)
  const [r, setR] = useState<Readout>(Meter.empty())
  const [live, setLive] = useState(false)
  const [err, setErr] = useState('')
  const [fileName, setFileName] = useState('')
  const meter = useRef(new Meter(FS))
  const fileSig = useRef<[Float32Array, Float32Array] | null>(null)
  const ctxRef = useRef<{ ctx: AudioContext; stop: () => void; mon: GainNode } | null>(null)
  const rtaCv = useRef<HTMLCanvasElement>(null)
  const meterCv = useRef<HTMLCanvasElement>(null)
  const gonioCv = useRef<HTMLCanvasElement>(null)
  const histCv = useRef<HTMLCanvasElement>(null)
  const opts = useRef(s)
  useEffect(() => {
    opts.current = s
  })

  // Silent preview: feeds the generated or loaded signal straight into the meter in real time.
  useEffect(() => {
    if (live) return
    const sig = s.src === 'file' ? fileSig.current : s.src === 'mic' ? null : makeSignal(s.src)
    meter.current = new Meter(FS)
    if (!sig) return
    let pos = 0
    let last = performance.now()
    const id = setInterval(() => {
      const now = performance.now()
      const n = Math.min(FS, Math.round(((now - last) / 1000) * FS))
      last = now
      const L = new Float32Array(n), R = new Float32Array(n)
      for (let i = 0; i < n; i++) {
        L[i] = sig[0][pos]
        R[i] = sig[1][pos]
        pos = (pos + 1) % sig[0].length
      }
      meter.current.push(L, R)
    }, 40)
    return () => clearInterval(id)
  }, [s.src, live, fileName])

  // Readouts at 10 Hz.
  useEffect(() => {
    const id = setInterval(() => setR({ ...meter.current.r, peak: [...meter.current.r.peak], truePeak: [...meter.current.r.truePeak], rms: [...meter.current.r.rms] }), 100)
    return () => clearInterval(id)
  }, [])

  // Drawing loop.
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const disp = new Array<number>(31).fill(-120)
    const peaks: Hold[] = new Array(31).fill(0).map(() => ({ v: -Infinity, t: 0 }))
    const mHold: Hold[] = [{ v: -Infinity, t: 0 }, { v: -Infinity, t: 0 }]
    let frame = 0
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const now = performance.now()
      const dt = (now - last) / 1000
      last = now
      const m = meter.current
      const o = opts.current
      const sec = now / 1000
      frame++
      // RTA
      const g = setupCanvas(rtaCv.current)
      if (g && frame % 2 === 0) {
        const W = rtaCv.current!.clientWidth, H = rtaCv.current!.clientHeight
        const size = m.fs > 60000 ? 32768 : 16384
        const lv = bandLevels(m.spectrum(size), m.fs, size, o.weighting).map((v) => v + RTA_CAL)
        const fast = o.speed === 'fast'
        for (let i = 0; i < 31; i++) {
          disp[i] = smooth(disp[i], lv[i], dt * 2, fast ? 0.03 : 0.3, fast ? 0.25 : 1.2)
          peaks[i] = hold(peaks[i], disp[i], sec, 2, 10)
        }
        g.fillStyle = '#0b1020'
        g.fillRect(0, 0, W, H)
        const L = 34, B = 20, top = 8, lo = -90, hi = 0
        const y = (db: number) => top + ((hi - Math.max(lo, Math.min(hi, db))) / (hi - lo)) * (H - top - B)
        g.font = '10px system-ui, sans-serif'
        g.fillStyle = '#94a3b8'
        g.strokeStyle = '#1e293b'
        g.lineWidth = 1
        for (let d = lo; d <= hi; d += 10) {
          g.beginPath()
          g.moveTo(L, y(d))
          g.lineTo(W, y(d))
          g.stroke()
          g.fillText(String(d), 4, y(d) + 3)
        }
        const bw = (W - L) / 31
        for (let i = 0; i < 31; i++) {
          const x = L + i * bw + 1.5
          const grd = g.createLinearGradient(0, y(hi), 0, y(lo))
          grd.addColorStop(0, '#ef4444')
          grd.addColorStop(0.18, '#f59e0b')
          grd.addColorStop(0.4, '#22c55e')
          grd.addColorStop(1, '#0e7490')
          g.fillStyle = grd
          g.fillRect(x, y(disp[i]), bw - 3, y(lo) - y(disp[i]))
          if (Number.isFinite(peaks[i].v)) {
            g.fillStyle = '#e2e8f0'
            g.fillRect(x, y(peaks[i].v) - 1, bw - 3, 2)
          }
          if (i % (W < 520 ? 3 : 1) === 0 || i === 30) {
            g.fillStyle = '#94a3b8'
            g.textAlign = 'center'
            g.fillText(fmtBand(NOMINAL[i]), x + bw / 2 - 1.5, H - 6)
            g.textAlign = 'left'
          }
        }
        g.fillStyle = '#64748b'
        g.fillText(`dB RMS · ${o.weighting}-weighted`, L + 6, top + 12)
      }
      // Stereo meters
      const mg = setupCanvas(meterCv.current)
      if (mg) {
        const W = meterCv.current!.clientWidth, H = meterCv.current!.clientHeight
        mg.fillStyle = '#0b1020'
        mg.fillRect(0, 0, W, H)
        const lo = -60, hi = 3, top = 10, bot = 22
        const y = (db: number) => top + ((hi - Math.max(lo, Math.min(hi, db))) / (hi - lo)) * (H - top - bot)
        mg.font = '10px system-ui, sans-serif'
        for (const d of [0, -6, -12, -18, -24, -30, -40, -50, -60]) {
          mg.fillStyle = '#64748b'
          mg.fillText(String(d), 4, y(d) + 3)
          mg.fillStyle = '#1e293b'
          mg.fillRect(28, y(d), W - 28, 1)
        }
        const bw = (W - 40) / 2
        for (let c = 0; c < 2; c++) {
          const x = 34 + c * (bw + 4)
          mHold[c] = hold(mHold[c], m.r.truePeak[c], sec, 2.5, 15)
          const rmsV = m.r.rms[c], pk = m.r.peak[c]
          mg.fillStyle = '#16233d'
          mg.fillRect(x, y(hi), bw, y(lo) - y(hi))
          mg.fillStyle = levelColor(rmsV)
          mg.fillRect(x, y(rmsV), bw, y(lo) - y(rmsV))
          mg.fillStyle = 'rgba(226,232,240,0.85)'
          mg.fillRect(x, y(pk) - 1, bw, 3)
          if (Number.isFinite(mHold[c].v)) {
            mg.fillStyle = mHold[c].v > -1 ? '#ef4444' : '#fde68a'
            mg.fillRect(x, y(mHold[c].v) - 1, bw, 2)
          }
          mg.fillStyle = '#94a3b8'
          mg.textAlign = 'center'
          mg.fillText(c ? 'R' : 'L', x + bw / 2, H - 6)
          mg.textAlign = 'left'
        }
        mg.fillStyle = '#ef4444'
        mg.fillRect(34, y(0), W - 40, 1)
      }
      // Goniometer
      const gg = setupCanvas(gonioCv.current)
      if (gg) {
        const W = gonioCv.current!.clientWidth, H = gonioCv.current!.clientHeight
        gg.fillStyle = 'rgba(11,16,32,0.35)'
        gg.fillRect(0, 0, W, H)
        gg.strokeStyle = '#1e293b'
        gg.beginPath()
        gg.moveTo(W / 2, 0); gg.lineTo(W / 2, H); gg.moveTo(0, H / 2); gg.lineTo(W, H / 2)
        gg.moveTo(0, 0); gg.lineTo(W, H); gg.moveTo(W, 0); gg.lineTo(0, H)
        gg.stroke()
        const N = m.ring[0].length
        const k = (Math.min(W, H) / 2) * 0.9
        // auto-gain so quiet material is still visible
        const amp = Math.max(1e-4, 10 ** (Math.max(m.r.rms[0], m.r.rms[1]) / 20) * 2.5)
        gg.fillStyle = '#34d399'
        for (let i = 1; i <= 1536; i++) {
          const j = (m.pos - i + N) % N
          const l = m.ring[0][j] / amp, rr = m.ring[1][j] / amp
          const px = W / 2 + ((rr - l) / Math.SQRT2) * k * 0.7
          const py = H / 2 - ((l + rr) / Math.SQRT2) * k * 0.7
          gg.fillRect(px, py, 1.4, 1.4)
        }
        gg.fillStyle = '#64748b'
        gg.font = '10px system-ui, sans-serif'
        gg.fillText('M', W / 2 + 4, 12)
        gg.fillText('L', 6, 12)
        gg.fillText('R', W - 14, 12)
        gg.fillText('S', W - 12, H / 2 - 4)
      }
      // Loudness history
      const hg = setupCanvas(histCv.current)
      if (hg && frame % 3 === 0) {
        const W = histCv.current!.clientWidth, H = histCv.current!.clientHeight
        hg.fillStyle = '#0b1020'
        hg.fillRect(0, 0, W, H)
        const lo = -48, hi = -6, L = 30
        const y = (v: number) => 6 + ((hi - Math.max(lo, Math.min(hi, v))) / (hi - lo)) * (H - 12)
        hg.font = '10px system-ui, sans-serif'
        for (let d = -42; d <= -6; d += 6) {
          hg.fillStyle = '#1e293b'
          hg.fillRect(L, y(d), W - L, 1)
          hg.fillStyle = '#64748b'
          hg.fillText(String(d), 2, y(d) + 3)
        }
        hg.strokeStyle = '#a78bfa'
        hg.setLineDash([5, 4])
        hg.beginPath()
        hg.moveTo(L, y(o.target))
        hg.lineTo(W, y(o.target))
        hg.stroke()
        hg.setLineDash([])
        const hs = m.history
        const x = (i: number) => W - (hs.length - 1 - i) * ((W - L) / 600)
        for (const [key, col, lw] of [['m', '#38bdf8', 1], ['s', '#fbbf24', 2.2]] as const) {
          hg.strokeStyle = col
          hg.lineWidth = lw
          hg.beginPath()
          let pen = false
          hs.forEach((p, i) => {
            const v = p[key]
            if (!Number.isFinite(v)) {
              pen = false
              return
            }
            if (pen) hg.lineTo(x(i), y(v))
            else hg.moveTo(x(i), y(v))
            pen = true
          })
          hg.stroke()
        }
        hg.lineWidth = 1
      }
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])

  const stop = () => {
    ctxRef.current?.stop()
    ctxRef.current = null
    setLive(false)
  }
  useEffect(() => () => ctxRef.current?.stop(), [])

  const start = async () => {
    setErr('')
    stop()
    try {
      const ctx = new AudioContext()
      const url = URL.createObjectURL(new Blob([TAP], { type: 'text/javascript' }))
      await ctx.audioWorklet.addModule(url)
      URL.revokeObjectURL(url)
      const tap = new AudioWorkletNode(ctx, 'bt-meter-tap', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] })
      const m = new Meter(ctx.sampleRate)
      meter.current = m
      tap.port.onmessage = (e: MessageEvent<[Float32Array, Float32Array]>) => m.push(e.data[0], e.data[1])
      const up = new GainNode(ctx, { channelCount: 2, channelCountMode: 'explicit', channelInterpretation: 'speakers' })
      const mon = new GainNode(ctx, { gain: opts.current.monitor ? opts.current.volume : 0 })
      const mute = new GainNode(ctx, { gain: 0 })
      up.connect(tap)
      tap.connect(mute).connect(ctx.destination)
      up.connect(mon).connect(ctx.destination)
      let stopSrc = () => {}
      if (s.src === 'mic') {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser has no microphone access (needs HTTPS).')
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
        ctx.createMediaStreamSource(stream).connect(up)
        stopSrc = () => stream.getTracks().forEach((t) => t.stop())
      } else {
        const sig = s.src === 'file' ? fileSig.current : makeSignal(s.src)
        if (!sig) throw new Error('Choose an audio file first.')
        const buf = new AudioBuffer({ length: sig[0].length, numberOfChannels: 2, sampleRate: FS })
        buf.copyToChannel(sig[0] as Float32Array<ArrayBuffer>, 0)
        buf.copyToChannel(sig[1] as Float32Array<ArrayBuffer>, 1)
        const node = new AudioBufferSourceNode(ctx, { buffer: buf, loop: true })
        node.connect(up)
        node.start()
        stopSrc = () => node.stop()
      }
      await ctx.resume()
      ctxRef.current = {
        ctx,
        mon,
        stop: () => {
          stopSrc()
          void ctx.close()
        },
      }
      setLive(true)
    } catch (e) {
      setErr((e as Error).message || 'Could not start audio')
    }
  }

  useEffect(() => {
    const c = ctxRef.current
    if (c) c.mon.gain.setTargetAtTime(s.monitor ? s.volume : 0, c.ctx.currentTime, 0.05)
  }, [s.monitor, s.volume])

  const loadFile = async (f: File) => {
    setErr('')
    try {
      const ac = new OfflineAudioContext(2, 1, FS)
      const b = await ac.decodeAudioData(await f.arrayBuffer())
      const L = b.getChannelData(0).slice()
      const R = b.numberOfChannels > 1 ? b.getChannelData(1).slice() : L
      fileSig.current = [L, R]
      setFileName(f.name)
      stop()
      set({ src: 'file' })
    } catch {
      setErr('Could not decode that file. Try WAV, MP3, AAC/M4A, OGG or FLAC.')
    }
  }

  const pick = (src: Src) => {
    stop()
    set({ src, monitor: src === 'mic' ? false : s.monitor })
  }

  const dev = r.integrated - s.target
  const tpMax = r.truePeakMax
  return (
    <Split wide="right">
      <div>
        <Panel title="Signal">
          <Seg value={s.src} onChange={pick} options={[['demo', 'Demo mix'], ['pink', 'Pink noise'], ['tone', '1 kHz'], ['file', 'File'], ['mic', 'Mic']]} />
          <p className="muted" style={{ fontSize: 13 }}>
            {s.src === 'demo' && 'A synthetic stereo groove (kick, bass, pads, hats) so you can see the meters move without a microphone.'}
            {s.src === 'pink' && 'Reference pink noise at −20 dBFS RMS (Voss–McCartney): equal energy per octave, so the RTA should read flat. Use it to tune speakers or check a room.'}
            {s.src === 'tone' && 'Calibration tone: 1 kHz sine at −18 dBFS peak in both channels. A correct meter reads −18.0 LUFS, −18 dBTP and −21 dB RMS.'}
            {s.src === 'file' && (fileName ? `Looping “${fileName}”.` : 'Choose an audio file to meter it.')}
            {s.src === 'mic' && 'Live input from your microphone or audio interface (echo cancellation, noise suppression and AGC are switched off).'}
          </p>
          {s.src === 'file' && <FileDrop accept="audio/*" label={fileName ? `🎵 ${fileName} — drop another` : 'Drop an audio file or click to choose'} onFiles={([f]) => void loadFile(f)} />}
          <Row>
            {live ? <Btn kind="danger" onClick={stop}>■ Stop</Btn> : <Btn kind="primary" onClick={() => void start()}>{s.src === 'mic' ? '🎙 Start microphone' : '▶ Play & meter'}</Btn>}
            <Btn kind="ghost" onClick={() => meter.current.resetStats()}>↺ Reset I / LRA / max</Btn>
          </Row>
          {!live && s.src !== 'mic' && <p className="muted" style={{ fontSize: 13 }}>Silent preview: the meters already run on the signal. Press Play to hear it.</p>}
          <Check label="Monitor through speakers" value={s.monitor} onChange={(monitor) => set({ monitor })} />
          {s.monitor && <Slider label="Monitor volume" value={s.volume} min={0} max={1} step={0.01} onChange={(volume) => set({ volume })} show={(v) => `${Math.round(v * 100)}`} unit="%" />}
          {s.src === 'mic' && s.monitor && <Note tone="warn">Monitoring a microphone through speakers causes feedback — use headphones.</Note>}
          {err && <Note tone="err">{err}</Note>}
        </Panel>
        <Panel title="Settings" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <div className="k-label">RTA weighting</div>
          <Seg value={s.weighting} onChange={(weighting) => set({ weighting })} options={[['Z', 'Z (flat)'], ['A', 'A'], ['C', 'C']]} />
          <div className="k-label" style={{ marginTop: 8 }}>RTA response</div>
          <Seg value={s.speed} onChange={(speed) => set({ speed })} options={[['fast', 'Fast'], ['slow', 'Slow']]} />
          <Select label="Loudness target" value={s.target} onChange={(target) => set({ target })} options={TARGETS} />
        </Panel>
        <Panel title="Phase & stereo">
          <canvas ref={gonioCv} style={{ width: '100%', maxWidth: 300, margin: '0 auto', aspectRatio: '1 / 1', display: 'block', borderRadius: 8, background: '#0b1020' }} />
          <div style={{ marginTop: 10 }}>
            <Row wrap={false}>
              <span className="muted" style={{ fontSize: 12 }}>−1</span>
              <div style={{ flex: 1, position: 'relative', height: 14, borderRadius: 7, background: 'linear-gradient(90deg,#ef4444,#f59e0b 40%,#22c55e 60%,#22c55e)' }}>
                <div style={{ position: 'absolute', top: -3, width: 4, height: 20, borderRadius: 2, background: 'var(--fg, #111)', left: `calc(${((r.correlation + 1) / 2) * 100}% - 2px)`, boxShadow: '0 0 0 2px var(--panel)' }} />
              </div>
              <span className="muted" style={{ fontSize: 12 }}>+1</span>
            </Row>
            <p style={{ fontSize: 13, margin: '6px 0 0' }}>
              Correlation <b>{r.correlation.toFixed(2)}</b> — {r.correlation > 0.9 ? 'near mono' : r.correlation > 0.3 ? 'healthy stereo' : r.correlation > -0.1 ? 'very wide: check mono compatibility' : 'out of phase! Will cancel in mono'}
            </p>
          </div>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Momentary (400 ms)" value={`${fmtDb(r.momentary)} LUFS`} sub={`max ${fmtDb(r.maxMomentary)}`} />
          <Stat label="Short-term (3 s)" value={`${fmtDb(r.shortTerm)} LUFS`} />
          <Stat label="Integrated" value={`${fmtDb(r.integrated)} LUFS`} tone={Number.isFinite(dev) ? (Math.abs(dev) <= 1 ? 'good' : 'bad') : 'accent'} sub={Number.isFinite(dev) ? `${fmtDb(dev)} LU vs target · LRA ${r.lra.toFixed(1)} LU` : 'gated, since reset'} />
          <Stat label="True peak max" value={`${fmtDb(tpMax)} dBTP`} tone={tpMax > -1 ? 'bad' : 'good'} sub={tpMax > -1 ? 'over −1 dBTP: will clip after encoding' : 'safe below −1 dBTP'} />
        </Stats>
        <Panel title="1/3-octave RTA" actions={<span className="muted" style={{ fontSize: 13 }}>{live ? '● live' : '○ silent preview'} · {Math.round(r.seconds)} s</span>}>
          <canvas ref={rtaCv} style={{ width: '100%', height: 280, display: 'block', borderRadius: 8 }} />
        </Panel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ flex: '1 1 170px' }}><Panel title="Levels">
            <canvas ref={meterCv} style={{ width: '100%', height: 250, display: 'block', borderRadius: 8 }} />
            <div style={{ fontSize: 12, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
              <div>Peak L/R <b>{fmtDb(r.peak[0])} / {fmtDb(r.peak[1])}</b></div>
              <div>True pk <b>{fmtDb(r.truePeak[0])} / {fmtDb(r.truePeak[1])}</b></div>
              <div>RMS <b>{fmtDb(r.rms[0])} / {fmtDb(r.rms[1])}</b></div>
            </div>
          </Panel></div>
          <div style={{ flex: '3 1 300px' }}><Panel title="Loudness history (60 s)">
            <canvas ref={histCv} style={{ width: '100%', height: 250, display: 'block', borderRadius: 8 }} />
            <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
              <span style={{ color: '#38bdf8' }}>━</span> momentary · <span style={{ color: '#fbbf24' }}>━</span> short-term · <span style={{ color: '#a78bfa' }}>┅</span> target {s.target} LUFS
            </p>
          </Panel></div>
        </div>
        <Note>
          Meters follow ITU-R BS.1770 / EBU R128: K-weighted loudness with 400 ms momentary and 3 s short-term windows, two-stage gated integrated loudness, LRA, and 4× oversampled true peak. Level bars show 300 ms RMS (colour), sample peak (white) and a held true peak (yellow, red above −1 dBTP). Everything is computed in your browser; no audio leaves the page.
        </Note>
      </div>
    </Split>
  )
}
