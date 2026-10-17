import { useEffect, useRef, useState } from 'react'
import { Btn, Check, download, Note, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, Table, toCsv, useToolState } from '../kit'
import { findPeaks, fmtHz, fToX, heat, makeWindow, noteOf, rmsDb, spectrumDb, xToF, type Peak, type WindowName } from './lib/spectrum-analyzer'

type Source = 'demo' | 'mic' | 'file'
type Demo = 'chord' | 'guitar' | 'dtmf' | 'hum'
const DEF = { source: 'demo' as Source, demo: 'chord' as Demo, n: 8192, win: 'hann' as WindowName, smooth: 0.5, log: true, minDb: -110, hold: true, speed: 2 }
const DEMOS: [Demo, string][] = [['chord', 'A-major chord + sweep'], ['guitar', 'Plucked string (A2)'], ['dtmf', 'Phone keypad (DTMF)'], ['hum', 'Test tone + 50 Hz hum']]
const SR_DEMO = 48000
const DTMF: Record<string, [number, number]> = { 1: [697, 1209], 2: [697, 1336], 3: [697, 1477], 4: [770, 1209], 5: [770, 1336], 6: [770, 1477], 7: [852, 1209], 8: [852, 1336], 9: [852, 1477], 0: [941, 1336] }

/** Synthetic test signals sampled at t seconds. */
function synth(kind: Demo, t: number): number {
  if (kind === 'chord') {
    let v = 0
    // 5.5 Hz vibrato of ±0.4 % on the root: phase = 2πf·(t − d·cos(ωt)/ω)
    const w = 2 * Math.PI * 5.5, vib = t - (0.004 * Math.cos(w * t)) / w
    for (const [f, a] of [[220, 0.22], [277.18, 0.16], [329.63, 0.16]] as const)
      for (let h = 1; h <= 6; h++) v += (a / h ** 1.4) * Math.sin(2 * Math.PI * f * h * (f === 220 ? vib : t))
    const T = 8, tt = t % T
    const f0 = 100, f1 = 12000, k = Math.log(f1 / f0) / T
    v += 0.06 * Math.sin((2 * Math.PI * f0 * (Math.exp(k * tt) - 1)) / k)
    return v + (Math.random() - 0.5) * 6e-4
  }
  if (kind === 'guitar') {
    const tt = t % 2.5
    let v = 0
    for (let h = 1; h <= 16; h++) {
      const f = 110 * h * Math.sqrt(1 + 0.00012 * h * h)
      v += (0.5 / h) * Math.abs(Math.sin((h * Math.PI) / 5)) * Math.exp(-tt * (1.2 + 0.35 * h)) * Math.sin(2 * Math.PI * f * tt)
    }
    return v + (Math.random() - 0.5) * 3e-4
  }
  if (kind === 'dtmf') {
    const seq = '5551234', slot = Math.floor(t / 0.3) % (seq.length + 3)
    const on = t % 0.3 < 0.2 && slot < seq.length
    const pair = DTMF[seq[slot]] ?? [0, 0]
    return (on ? 0.35 * (Math.sin(2 * Math.PI * pair[0] * t) + Math.sin(2 * Math.PI * pair[1] * t)) : 0) + (Math.random() - 0.5) * 2e-3
  }
  let v = 0.25 * Math.sin(2 * Math.PI * 1000 * t)
  for (let h = 1; h <= 9; h += 2) v += (0.05 / h) * Math.sin(2 * Math.PI * 50 * h * t)
  return v + (Math.random() - 0.5) * 0.02
}

const LO = 20

function drawSpectrum(c: HTMLCanvasElement | null, mx: number | null, avg: Float32Array, hold: Float32Array | null, sr: number, N: number, st: typeof DEF) {
  if (!c) return
  const W = c.clientWidth, H = c.clientHeight, dpr = Math.min(2, devicePixelRatio || 1)
  if (c.width !== Math.round(W * dpr)) [c.width, c.height] = [Math.round(W * dpr), Math.round(H * dpr)]
  const g = c.getContext('2d')!
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  const L = 44, B = 22, T = 8, R = 8
  const hi = sr / 2, lo = st.log ? LO : 0
  const X = (f: number) => L + fToX(Math.max(f, lo || 1e-9), lo || 0, hi, st.log) * (W - L - R)
  const Y = (d: number) => T + ((0 - d) / (0 - st.minDb)) * (H - T - B)
  g.fillStyle = '#0b1020'
  g.fillRect(0, 0, W, H)
  g.font = '11px system-ui, sans-serif'
  g.lineWidth = 1
  for (let d = 0; d >= st.minDb; d -= 10) {
    g.strokeStyle = d % 20 ? '#141c33' : '#1e2a4a'
    g.beginPath(); g.moveTo(L, Y(d)); g.lineTo(W - R, Y(d)); g.stroke()
    if (d % 20 === 0) { g.fillStyle = '#7c8db5'; g.textAlign = 'right'; g.fillText(`${d}`, L - 6, Y(d) + 4) }
  }
  const ticks = st.log ? [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000] : Array.from({ length: 13 }, (_, i) => i * 2000)
  g.textAlign = 'center'
  for (const f of ticks) {
    if (f > hi) continue
    g.strokeStyle = '#1e2a4a'
    g.beginPath(); g.moveTo(X(f), T); g.lineTo(X(f), H - B); g.stroke()
    g.fillStyle = '#7c8db5'
    g.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, X(f), H - 6)
  }
  const path = (arr: Float32Array) => {
    g.beginPath()
    let started = false
    const binHz = sr / N
    // One point per pixel column (max of bins inside) keeps log plots clean at high N.
    for (let px = L; px <= W - R; px++) {
      const f0 = xToF((px - L) / (W - L - R), lo || 0, hi, st.log), f1 = xToF((px + 1 - L) / (W - L - R), lo || 0, hi, st.log)
      let k0 = Math.floor(f0 / binHz), k1 = Math.ceil(f1 / binHz)
      k0 = Math.max(1, Math.min(arr.length - 1, k0)); k1 = Math.max(k0 + 1, Math.min(arr.length, k1))
      let m = -Infinity
      for (let k = k0; k < k1; k++) m = Math.max(m, arr[k])
      if (k1 - k0 === 1 && k0 + 1 < arr.length) {
        const fr = f0 / binHz - k0
        m = arr[k0] + (arr[k0 + 1] - arr[k0]) * Math.max(0, Math.min(1, fr))
      }
      const y = Math.min(H - B, Y(m))
      if (started) g.lineTo(px, y)
      else { g.moveTo(px, y); started = true }
    }
  }
  path(avg)
  g.lineTo(W - R, H - B); g.lineTo(L, H - B); g.closePath()
  const grad = g.createLinearGradient(0, T, 0, H - B)
  grad.addColorStop(0, 'rgba(56,189,248,0.55)')
  grad.addColorStop(1, 'rgba(99,102,241,0.05)')
  g.fillStyle = grad
  g.fill()
  path(avg)
  g.strokeStyle = '#38bdf8'
  g.lineWidth = 1.5
  g.stroke()
  if (hold) {
    path(hold)
    g.strokeStyle = 'rgba(250,204,21,0.7)'
    g.lineWidth = 1
    g.stroke()
  }
  if (mx !== null && mx > L && mx < W - R) {
    const f = xToF((mx - L) / (W - L - R), lo || 0, hi, st.log)
    const k = Math.round(f / (sr / N))
    const d = avg[Math.max(0, Math.min(avg.length - 1, k))]
    g.strokeStyle = 'rgba(255,255,255,0.4)'
    g.beginPath(); g.moveTo(mx, T); g.lineTo(mx, H - B); g.stroke()
    const n = noteOf(f)
    const txt = `${fmtHz(f)} · ${d.toFixed(1)} dB · ${n.name}${n.cents >= 0 ? '+' : ''}${n.cents}¢`
    g.font = '12px system-ui, sans-serif'
    const tw = g.measureText(txt).width + 12
    const bx = Math.min(mx + 8, W - R - tw)
    g.fillStyle = 'rgba(15,23,42,0.9)'
    g.fillRect(bx, T + 4, tw, 20)
    g.fillStyle = '#e2e8f0'
    g.textAlign = 'left'
    g.fillText(txt, bx + 6, T + 18)
  }
}

function drawColumn(c: HTMLCanvasElement | null, avg: Float32Array, sr: number, N: number, st: typeof DEF) {
  if (!c) return
  const W = Math.round(c.clientWidth), H = Math.round(c.clientHeight)
  if (c.width !== W || c.height !== H) [c.width, c.height] = [W, H]
  const g = c.getContext('2d')!
  const sp = st.speed
  g.drawImage(c, -sp, 0)
  const img = g.createImageData(sp, H)
  const hi = sr / 2, lo = st.log ? LO : 0, binHz = sr / N
  for (let y = 0; y < H; y++) {
    const fTop = xToF(1 - y / H, lo || 0, hi, st.log), fBot = xToF(1 - (y + 1) / H, lo || 0, hi, st.log)
    const k0 = Math.max(1, Math.floor(fBot / binHz)), k1 = Math.min(avg.length, Math.max(k0 + 1, Math.ceil(fTop / binHz)))
    let m = -Infinity
    for (let k = k0; k < k1; k++) m = Math.max(m, avg[k])
    const [r, gg, b] = heat((m - st.minDb) / -st.minDb)
    for (let x = 0; x < sp; x++) {
      const i = 4 * (y * sp + x)
      img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = 255
    }
  }
  g.putImageData(img, W - sp, 0)
}


export default function SpectrumAnalyzer() {
  const [s, set, reset] = useToolState('spectrum-analyzer', DEF)
  const [err, setErr] = useState('')
  const [live, setLive] = useState(false)
  const [frozen, setFrozen] = useState(false)
  const [read, setRead] = useState<{ peaks: Peak[]; rms: number; sr: number }>({ peaks: [], rms: -Infinity, sr: SR_DEMO })
  const [fileName, setFileName] = useState('')
  const spec = useRef<HTMLCanvasElement>(null)
  const sgram = useRef<HTMLCanvasElement>(null)
  const audioEl = useRef<HTMLAudioElement>(null)
  const sRef = useRef(s)
  const frozenRef = useRef(frozen)
  useEffect(() => {
    sRef.current = s
    frozenRef.current = frozen
  })
  const io = useRef<{ ctx?: AudioContext; an?: AnalyserNode; mic?: MediaStream; micSrc?: MediaStreamAudioSourceNode; fileSrc?: MediaElementAudioSourceNode }>({})
  const mouse = useRef<number | null>(null)
  const avgRef = useRef<Float32Array | null>(null)

  const ensureCtx = () => {
    const r = io.current
    if (!r.ctx) {
      r.ctx = new AudioContext()
      r.an = r.ctx.createAnalyser()
      r.an.smoothingTimeConstant = 0
    }
    void r.ctx.resume()
    return r
  }
  const stopMic = () => {
    const r = io.current
    r.mic?.getTracks().forEach((t) => t.stop())
    r.micSrc?.disconnect()
    r.mic = undefined
    r.micSrc = undefined
  }

  const startMic = async () => {
    setErr('')
    if (!navigator.mediaDevices?.getUserMedia) return setErr('Microphone access is not available here (needs HTTPS and a supporting browser).')
    try {
      const r = ensureCtx()
      stopMic()
      audioEl.current?.pause()
      r.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
      r.micSrc = r.ctx!.createMediaStreamSource(r.mic)
      r.micSrc.connect(r.an!)
      set({ source: 'mic' })
      setLive(true)
    } catch (e) {
      setErr(`Microphone blocked or unavailable: ${(e as Error).message}. The demo signal keeps running.`)
      set({ source: 'demo' })
    }
  }
  const openFile = (f: File) => {
    const a = audioEl.current
    if (!a) return
    setErr('')
    stopMic()
    const r = ensureCtx()
    if (!r.fileSrc) {
      r.fileSrc = r.ctx!.createMediaElementSource(a)
      r.fileSrc.connect(r.an!)
      r.an!.connect(r.ctx!.destination)
    }
    if (a.src) URL.revokeObjectURL(a.src)
    a.src = URL.createObjectURL(f)
    setFileName(f.name)
    void a.play().catch(() => setErr('Press play on the audio player to start.'))
    set({ source: 'file' })
  }
  const startDemo = () => {
    stopMic()
    audioEl.current?.pause()
    setLive(false)
    set({ source: 'demo' })
  }
  useEffect(() => () => {
    stopMic()
    void io.current.ctx?.close()
  }, [])

  // ----- render loop -----
  useEffect(() => {
    let raf = 0
    let ring = new Float32Array(32768), head = 0, tDemo = 0, last = performance.now(), lastRead = 0
    let hold: Float32Array | null = null
    let winKey = '', win = makeWindow('hann', 8192)
    let buf = new Float32Array(8192)
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const st = sRef.current
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      if (frozenRef.current) return
      const N = st.n
      const r = io.current
      const external = st.source !== 'demo' && r.an && r.ctx
      const sr = external ? r.ctx!.sampleRate : SR_DEMO
      if (buf.length !== N) buf = new Float32Array(N)
      if (winKey !== `${st.win}${N}`) {
        win = makeWindow(st.win, N)
        winKey = `${st.win}${N}`
        hold = null
        avgRef.current = null
      }
      if (external) {
        if (r.an!.fftSize !== N) r.an!.fftSize = N
        r.an!.getFloatTimeDomainData(buf)
      } else {
        if (ring.length < N) ring = new Float32Array(32768)
        const n = Math.min(ring.length, Math.round(dt * SR_DEMO))
        for (let i = 0; i < n; i++) {
          ring[head] = synth(st.demo, tDemo)
          tDemo += 1 / SR_DEMO
          head = (head + 1) % ring.length
        }
        for (let i = 0; i < N; i++) buf[i] = ring[(head - N + i + ring.length * 2) % ring.length]
      }
      const db = spectrumDb(buf, win)
      let avg = avgRef.current
      if (!avg || avg.length !== db.length) avg = avgRef.current = Float32Array.from(db)
      else {
        const a = st.smooth
        for (let k = 0; k < db.length; k++) avg[k] = 10 * Math.log10(a * 10 ** (avg[k] / 10) + (1 - a) * 10 ** (db[k] / 10))
      }
      if (!hold || hold.length !== avg.length) hold = Float32Array.from(avg)
      for (let k = 0; k < avg.length; k++) hold[k] = Math.max(hold[k] - 12 * dt, avg[k])
      drawSpectrum(spec.current, mouse.current, avg, st.hold ? hold : null, sr, N, st)
      drawColumn(sgram.current, avg, sr, N, st)
      if (now - lastRead > 200) {
        lastRead = now
        setRead({ peaks: findPeaks(avg, sr, N, { floor: st.minDb + 25, count: 6 }), rms: rmsDb(buf), sr })
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  const snapshot = () => {
    const a = spec.current, b = sgram.current
    if (!a || !b) return
    const c = document.createElement('canvas')
    c.width = a.width
    c.height = a.height + Math.round((b.height * a.width) / b.width)
    const g = c.getContext('2d')!
    g.drawImage(a, 0, 0)
    g.drawImage(b, 0, a.height, a.width, c.height - a.height)
    c.toBlob((bl) => bl && download('spectrum.png', bl))
  }
  const csv = () => {
    const avg = avgRef.current
    if (!avg) return
    const binHz = read.sr / s.n
    download('spectrum.csv', toCsv([['Frequency (Hz)', 'Level (dBFS)'], ...Array.from(avg, (d, k) => [+(k * binHz).toFixed(2), +d.toFixed(2)])]), 'text/csv')
  }

  const top = read.peaks[0]
  const note = top ? noteOf(top.freq) : null
  const binHz = read.sr / s.n
  return (
    <Split wide="right">
      <div>
        <Panel title="Input">
          <Seg value={s.source} onChange={(v) => (v === 'mic' ? void startMic() : v === 'demo' ? startDemo() : audioEl.current?.click())} options={[['demo', '🎛 Demo'], ['mic', '🎤 Microphone'], ['file', '🎵 Audio file']]} />
          <div style={{ marginTop: 10 }}>
            {s.source === 'demo' && <Select label="Test signal" value={s.demo} onChange={(demo) => set({ demo })} options={DEMOS} />}
            {s.source === 'mic' && <Note tone={live ? 'ok' : 'info'}>{live ? 'Listening to the microphone. Nothing is recorded or sent anywhere.' : 'Click Microphone to grant access.'}</Note>}
          </div>
          <label className="k-btn" style={{ marginTop: 8 }}>
            ⬆ Open audio file
            <input type="file" accept="audio/*,video/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) openFile(f) }} />
          </label>
          <audio ref={audioEl} controls loop style={{ width: '100%', marginTop: 8, display: s.source === 'file' ? 'block' : 'none' }} />
          {fileName && s.source === 'file' && <p className="k-hint">{fileName}</p>}
          {err && <Note tone="err">{err}</Note>}
        </Panel>
        <Panel title="Analysis" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Select label="FFT size" value={s.n} onChange={(n) => set({ n })} options={[1024, 2048, 4096, 8192, 16384, 32768].map((v) => [v, `${v} · ${(read.sr / v).toFixed(1)} Hz bins`] as [number, string])} />
          <Select label="Window" value={s.win} onChange={(win) => set({ win })} options={[['hann', 'Hann (general)'], ['blackman-harris', 'Blackman-Harris (low leakage)'], ['flat-top', 'Flat-top (accurate levels)'], ['hamming', 'Hamming'], ['rect', 'Rectangular']]} />
          <Slider label="Averaging" value={s.smooth} onChange={(smooth) => set({ smooth })} min={0} max={0.95} step={0.05} show={(v) => v.toFixed(2)} />
          <Slider label="Floor" value={s.minDb} onChange={(minDb) => set({ minDb })} min={-140} max={-40} step={10} unit=" dB" show={(v) => String(v)} />
          <Slider label="Spectrogram speed" value={s.speed} onChange={(speed) => set({ speed })} min={1} max={6} step={1} unit=" px/frame" show={(v) => String(v)} />
          <Row>
            <Check label="Log frequency axis" value={s.log} onChange={(log) => set({ log })} />
            <Check label="Peak hold" value={s.hold} onChange={(hold) => set({ hold })} />
          </Row>
          <p className="k-hint">Resolution vs. speed: a {s.n}-point FFT spans {((s.n / read.sr) * 1000).toFixed(0)} ms of audio and separates tones {binHz.toFixed(1)} Hz apart.</p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Peak frequency" value={top ? fmtHz(top.freq) : '—'} sub={top ? `${top.db.toFixed(1)} dBFS` : 'no clear peak'} tone="accent" />
          <Stat label="Nearest note" value={note ? note.name : '—'} sub={note ? `${note.cents >= 0 ? '+' : ''}${note.cents} cents` : ''} />
          <Stat label="Level (RMS)" value={Number.isFinite(read.rms) ? `${read.rms.toFixed(1)} dBFS` : '—'} sub={read.rms > -1 ? 'clipping risk!' : `${(read.sr / 1000).toFixed(1)} kHz sample rate`} tone={read.rms > -1 ? 'bad' : undefined} />
        </Stats>
        <Panel title="Spectrum" actions={<><Btn onClick={() => setFrozen(!frozen)}>{frozen ? '▶ Resume' : '⏸ Freeze'}</Btn><Btn onClick={snapshot}>⬇ PNG</Btn><Btn onClick={csv}>⬇ CSV</Btn></>}>
          <canvas ref={spec} style={{ width: '100%', height: 280, display: 'block', borderRadius: 8, cursor: 'crosshair' }} onMouseMove={(e) => (mouse.current = e.nativeEvent.offsetX)} onMouseLeave={() => (mouse.current = null)} />
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <canvas ref={sgram} style={{ flex: 1, height: 200, display: 'block', borderRadius: 8, background: '#000' }} />
          </div>
          <p className="k-hint">Top: live spectrum (blue) and peak hold (yellow) in dBFS. Bottom: scrolling spectrogram, time runs right-to-left; bright = loud. Hover the spectrum to read any frequency.</p>
        </Panel>
        <Panel title="Strongest peaks">
          <Table
            head={['#', 'Frequency', 'Level', 'Note', 'Cents']}
            rows={read.peaks.map((p, i) => {
              const n = noteOf(p.freq)
              return [i + 1, fmtHz(p.freq), `${p.db.toFixed(1)} dB`, n.name, `${n.cents >= 0 ? '+' : ''}${n.cents}`]
            })}
          />
          <p className="k-hint">Frequencies are refined between FFT bins by parabolic interpolation, so they are far more precise than the {binHz.toFixed(1)} Hz bin width for steady tones.</p>
        </Panel>
      </div>
    </Split>
  )
}
