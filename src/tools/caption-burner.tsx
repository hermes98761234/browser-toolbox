import { useEffect, useMemo, useRef, useState } from 'react'
import { Area, Bar, Btn, Check, download, FileDrop, Note, Panel, pct, Row, Seg, Select, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { activeCues, blockTop, containerOf, coverage, wrap, type Pos } from './lib/caption-burner'
import { fmtBytes } from './lib/image-compressor'
import { clock, parseSubs } from './lib/subtitle-editor'

const DEMO_SRT = `1
00:00:00,400 --> 00:00:02,300
Welcome to the caption burner demo.

2
00:00:02,500 --> 00:00:04,600
Every line is drawn straight
into the video frames.

3
00:00:04,800 --> 00:00:06,600
<i>Change the font, outline and box</i>

4
00:00:06,700 --> 00:00:07,900
…then press Burn captions.
`

const FONTS: [string, string][] = [
  ['system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', 'System sans'],
  ['Arial, Helvetica, sans-serif', 'Arial / Helvetica'],
  ['Verdana, Geneva, sans-serif', 'Verdana (wide)'],
  ['Georgia, "Times New Roman", serif', 'Georgia (serif)'],
  ['Impact, "Arial Black", sans-serif', 'Impact (meme)'],
  ['ui-monospace, Menlo, Consolas, monospace', 'Monospace'],
]
const CODECS = ['video/mp4;codecs=avc1.42E01F,mp4a.40.2', 'video/mp4;codecs=avc1.42E01F', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
const hasRecorder = typeof window !== 'undefined' && 'MediaRecorder' in window
const supported = (t: string) => hasRecorder && MediaRecorder.isTypeSupported(t)

interface Style {
  font: string; size: number; bold: boolean; caps: boolean; color: string; outline: number; outlineColor: string
  box: boolean; boxColor: string; boxAlpha: number; shadow: boolean; pos: Pos; safe: number; maxW: number; lineH: number
}
const PRESETS: [string, Partial<Style>][] = [
  ['Classic outline', { font: FONTS[1][0], color: '#ffffff', outline: 14, outlineColor: '#000000', box: false, bold: true, caps: false, shadow: true, size: 5.2 }],
  ['Boxed', { font: FONTS[0][0], color: '#ffffff', outline: 0, box: true, boxColor: '#000000', boxAlpha: 0.72, bold: false, caps: false, shadow: false, size: 4.8 }],
  ['Yellow DVD', { font: FONTS[2][0], color: '#ffe14d', outline: 10, outlineColor: '#000000', box: false, bold: true, caps: false, shadow: false, size: 5 }],
  ['Social bold', { font: FONTS[4][0], color: '#ffffff', outline: 18, outlineColor: '#000000', box: false, bold: false, caps: true, shadow: true, size: 7.5, pos: 'middle' }],
]
const DEF = {
  srt: DEMO_SRT, offset: 0, codec: '', height: 0,
  style: { font: FONTS[1][0], size: 5.2, bold: true, caps: false, color: '#ffffff', outline: 14, outlineColor: '#000000', box: false, boxColor: '#000000', boxAlpha: 0.72, shadow: true, pos: 'bottom', safe: 7, maxW: 86, lineH: 1.25 } as Style,
}

/** Draws the visible cues on a W×H context (transparent where there is no text). */
function drawCaptions(g: CanvasRenderingContext2D, W: number, H: number, texts: string[], st: Style) {
  if (!texts.length) return
  const fs = (st.size / 100) * H
  g.font = `${st.bold ? 700 : 500} ${fs}px ${st.font}`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.lineJoin = 'round'
  const lines = texts.flatMap((t) => wrap(st.caps ? t.toUpperCase() : t, (st.maxW / 100) * W, (s) => g.measureText(s).width))
  const lh = fs * st.lineH
  let y = blockTop(lines.length, lh, H, st.pos, st.safe)
  for (const l of lines) {
    const w = g.measureText(l).width
    if (st.box) {
      g.globalAlpha = st.boxAlpha
      g.fillStyle = st.boxColor
      g.beginPath()
      g.roundRect(W / 2 - w / 2 - fs * 0.35, y - lh / 2, w + fs * 0.7, lh, fs * 0.12)
      g.fill()
      g.globalAlpha = 1
    }
    if (st.shadow) {
      g.shadowColor = 'rgba(0,0,0,.75)'
      g.shadowBlur = fs * 0.18
      g.shadowOffsetY = fs * 0.05
    }
    if (st.outline > 0) {
      g.strokeStyle = st.outlineColor
      g.lineWidth = (st.outline / 100) * fs * 2
      g.strokeText(l, W / 2, y)
      g.shadowColor = 'transparent'
    }
    g.fillStyle = st.color
    g.fillText(l, W / 2, y)
    g.shadowColor = 'transparent'
    g.shadowBlur = 0
    g.shadowOffsetY = 0
    y += lh
  }
}

async function makeDemo(): Promise<Blob> {
  const c = document.createElement('canvas')
  c.width = 960
  c.height = 540
  const g = c.getContext('2d')!
  const stream = c.captureStream(30)
  const mime = ['video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find(supported) ?? ''
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 4_000_000 } : undefined)
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  const done = new Promise<void>((r) => (rec.onstop = () => r()))
  const t0 = performance.now()
  rec.start(250)
  await new Promise<void>((resolve) => {
    const frame = () => {
      const t = (performance.now() - t0) / 1000
      const gr = g.createLinearGradient(0, 0, 0, 540)
      gr.addColorStop(0, '#1e3a8a')
      gr.addColorStop(1, '#0f766e')
      g.fillStyle = gr
      g.fillRect(0, 0, 960, 540)
      g.fillStyle = '#facc15'
      g.beginPath()
      g.arc(160 + t * 80, 140 + Math.sin(t * 2) * 30, 50, 0, 7)
      g.fill()
      g.fillStyle = '#064e3b'
      g.beginPath()
      g.moveTo(0, 540)
      for (let x = 0; x <= 960; x += 20) g.lineTo(x, 380 + Math.sin(x / 70 + t) * 25)
      g.lineTo(960, 540)
      g.fill()
      g.fillStyle = 'rgba(255,255,255,.85)'
      g.font = '24px ui-monospace, monospace'
      g.fillText(`demo · ${t.toFixed(1)} s`, 24, 40)
      if (t < 8.2) requestAnimationFrame(frame)
      else resolve()
    }
    frame()
  })
  rec.stop()
  await done
  stream.getTracks().forEach((t) => t.stop())
  return new Blob(chunks, { type: mime.split(';')[0] || 'video/webm' })
}

interface Src { name: string; url: string; size: number; w: number; h: number; dur: number }
interface Out { url: string; blob: Blob; ext: string; label: string; secs: number }

export default function CaptionBurner() {
  const [s, set] = useToolState('caption-burner', DEF)
  const st = s.style
  const setSt = (p: Partial<Style>) => set({ style: { ...st, ...p } })
  const [src, setSrc] = useState<Src | null>(null)
  const [busy, setBusy] = useState('')
  const [prog, setProg] = useState<number | null>(null)
  const [out, setOut] = useState<Out | null>(null)
  const [err, setErr] = useState('')
  const [guides, setGuides] = useState(true)
  const vid = useRef<HTMLVideoElement>(null)
  const ov = useRef<HTMLCanvasElement>(null)
  const stop = useRef<() => void>(() => {})

  const cues = useMemo(() => parseSubs(s.srt), [s.srt])
  const codecs = useMemo(() => CODECS.filter(supported), [])
  const codec = s.codec && supported(s.codec) ? s.codec : (codecs[0] ?? '')

  const load = (blob: Blob, name: string) => {
    setOut(null)
    setErr('')
    const url = URL.createObjectURL(blob)
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.onloadedmetadata = () => {
      const fin = (dur: number) => setSrc({ name, url, size: blob.size, w: v.videoWidth, h: v.videoHeight, dur })
      // MediaRecorder WebM files report Infinity until seeked to the end.
      if (Number.isFinite(v.duration)) fin(v.duration)
      else {
        v.ontimeupdate = () => { v.ontimeupdate = null; fin(v.duration); v.currentTime = 0 }
        v.currentTime = 1e9
      }
    }
    v.onerror = () => setErr('This browser cannot decode that video. Try MP4 (H.264) or WebM.')
    v.src = url
  }
  const demo = async () => {
    if (!hasRecorder) return setErr('MediaRecorder is not available, so the demo clip cannot be generated.')
    setBusy('Recording an 8-second demo clip…')
    try {
      load(await makeDemo(), 'demo-clip.webm')
      set({ srt: DEMO_SRT, offset: 0 })
    } catch (e) {
      setErr(`Demo failed: ${(e as Error).message}`)
    }
    setBusy('')
  }
  useEffect(() => {
    void demo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Live overlay preview
  useEffect(() => {
    const v = vid.current, c = ov.current
    if (!v || !c || !src) return
    c.width = src.w
    c.height = src.h
    const g = c.getContext('2d')!
    let raf = 0
    const paint = () => {
      g.clearRect(0, 0, src.w, src.h)
      if (guides) {
        const m = (st.safe / 100) * src.h, mx = ((100 - st.maxW) / 200) * src.w
        g.setLineDash([8, 6])
        g.strokeStyle = 'rgba(250,204,21,.8)'
        g.lineWidth = Math.max(1, src.h / 360)
        g.strokeRect(mx, m, src.w - 2 * mx, src.h - 2 * m)
        g.setLineDash([])
      }
      const vis = activeCues(cues, v.currentTime, s.offset)
      const texts = vis.length || !v.paused ? vis.map((x) => x.text) : v.currentTime < 0.05 && cues[0] ? [cues[0].text] : []
      drawCaptions(g, src.w, src.h, texts, st)
      raf = requestAnimationFrame(paint)
    }
    paint()
    return () => cancelAnimationFrame(raf)
  }, [src, cues, st, s.offset, guides])

  const burn = async () => {
    if (!src || !codec) return
    setErr('')
    setOut(null)
    const H = s.height && s.height < src.h ? s.height : src.h
    const W = Math.round((src.w * H) / src.h / 2) * 2
    const v = document.createElement('video')
    v.src = src.url
    v.playsInline = true
    await new Promise((r) => (v.onloadeddata = r))
    let ac: AudioContext | null = null
    let tracks: MediaStreamTrack[] = []
    try {
      ac = new AudioContext()
      await Promise.race([ac.resume(), new Promise((r) => setTimeout(r, 400))])
      if (ac.state !== 'running') throw new Error('suspended')
      const dest = ac.createMediaStreamDestination()
      ac.createMediaElementSource(v).connect(dest)
      tracks = dest.stream.getAudioTracks()
    } catch {
      void ac?.close()
      ac = null
    }
    v.muted = !tracks.length
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    const g = c.getContext('2d')!
    const stream = c.captureStream(30)
    tracks.forEach((t) => stream.addTrack(t))
    const mime = tracks.length ? codec : codec.replace(/,(opus|mp4a[^"]*)/, '')
    let rec: MediaRecorder
    try {
      rec = new MediaRecorder(stream, { mimeType: supported(mime) ? mime : codec, videoBitsPerSecond: Math.round(W * H * 30 * 0.12), audioBitsPerSecond: 128_000 })
    } catch (e) {
      setErr(`Encoder could not start: ${(e as Error).message}`)
      return
    }
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    const finished = new Promise<void>((r) => (rec.onstop = () => r()))
    let cancelled = false
    const started = performance.now()
    const end = () => {
      v.pause()
      if (rec.state === 'recording') rec.stop()
    }
    const frame = () => {
      g.drawImage(v, 0, 0, W, H)
      drawCaptions(g, W, H, activeCues(cues, v.currentTime, s.offset).map((x) => x.text), st)
      setProg(Math.min(1, v.currentTime / (src.dur || 1)))
      if (v.ended || v.currentTime >= src.dur) return end()
      if ('requestVideoFrameCallback' in v) v.requestVideoFrameCallback(frame)
      else requestAnimationFrame(frame)
    }
    stop.current = () => {
      cancelled = true
      end()
    }
    v.onended = end
    setProg(0)
    try {
      await v.play()
    } catch (e) {
      setProg(null)
      setErr(`Playback failed: ${(e as Error).message}`)
      return
    }
    rec.start(500)
    frame()
    await finished
    stream.getTracks().forEach((t) => t.stop())
    void ac?.close()
    setProg(null)
    if (cancelled) return
    const blob = new Blob(chunks, { type: codec.split(';')[0] })
    if (!blob.size) return setErr('The encoder produced no data. Try another output format.')
    const { ext, label } = containerOf(codec)
    setOut({ url: URL.createObjectURL(blob), blob, ext, label: label + (tracks.length ? ' + audio' : ' (silent: audio could not be captured)'), secs: (performance.now() - started) / 1000 })
  }

  const snapshot = () => {
    const v = vid.current
    if (!v || !src) return
    const c = document.createElement('canvas')
    c.width = src.w
    c.height = src.h
    const g = c.getContext('2d')!
    g.drawImage(v, 0, 0)
    drawCaptions(g, src.w, src.h, activeCues(cues, v.currentTime, s.offset).map((x) => x.text), st)
    c.toBlob((b) => b && download(`caption-frame-${v.currentTime.toFixed(1)}s.png`, b, 'image/png'), 'image/png')
  }

  const cov = coverage(cues, src?.dur ?? 0)
  const busyBurn = prog !== null
  const outOfRange = src ? cues.filter((c) => c.start + s.offset >= src.dur).length : 0

  return (
    <Split wide="right">
      <div>
        <Panel title="1 · Video">
          <FileDrop accept="video/*" onFiles={(f) => load(f[0], f[0].name)} label={src ? `${src.name} — drop to replace` : 'Drop a video (MP4, WebM, MOV…)'} />
          <Row><Btn onClick={() => void demo()} disabled={!!busy || busyBurn}>Generate demo clip</Btn></Row>
          {busy && <Note>{busy}</Note>}
          {src && <p className="muted" style={{ fontSize: 13 }}>{src.w} × {src.h} · {clock(src.dur)} · {fmtBytes(src.size)}</p>}
        </Panel>
        <Panel title="2 · Subtitles (SRT or WebVTT)">
          <FileDrop accept=".srt,.vtt,text/vtt,text/plain" onFiles={async (f) => set({ srt: await f[0].text() })} label="Drop .srt / .vtt" />
          <Area value={s.srt} onChange={(srt) => set({ srt })} rows={8} mono />
          <Slider label="Sync offset" value={s.offset} onChange={(offset) => set({ offset })} min={-5} max={5} step={0.1} unit=" s" show={(v) => (v > 0 ? '+' : '') + v.toFixed(1)} />
          {!cues.length ? <Note tone="err">No cues found. Each cue needs a timing line like 00:00:01,000 --&gt; 00:00:03,000.</Note> : <p className="muted" style={{ fontSize: 13 }}>{cov.count} cues · {cov.spoken.toFixed(1)} s of text{src ? ` · ${pct(cov.share, 0)} of the clip` : ''}</p>}
          {outOfRange > 0 && <Note tone="warn">{outOfRange} cue(s) start after the end of the video.</Note>}
        </Panel>
        <Panel title="3 · Style">
          <Row>{PRESETS.map(([n, p]) => <Btn key={n} onClick={() => setSt(p)}>{n}</Btn>)}</Row>
          <Select label="Font" value={st.font} onChange={(font) => setSt({ font })} options={FONTS} />
          <Row>
            <Slider label="Size" value={st.size} onChange={(size) => setSt({ size })} min={2.5} max={12} step={0.1} unit="% of height" show={(v) => v.toFixed(1)} />
            <label className="k-field"><span className="k-label">Text</span><input type="color" value={st.color} onChange={(e) => setSt({ color: e.target.value })} /></label>
          </Row>
          <Row>
            <Check label="Bold" value={st.bold} onChange={(bold) => setSt({ bold })} />
            <Check label="UPPERCASE" value={st.caps} onChange={(caps) => setSt({ caps })} />
            <Check label="Drop shadow" value={st.shadow} onChange={(shadow) => setSt({ shadow })} />
          </Row>
          <Row>
            <Slider label="Outline" value={st.outline} onChange={(outline) => setSt({ outline })} min={0} max={30} unit="%" show={String} />
            <label className="k-field"><span className="k-label">Outline colour</span><input type="color" value={st.outlineColor} onChange={(e) => setSt({ outlineColor: e.target.value })} /></label>
          </Row>
          <Check label="Background box" value={st.box} onChange={(box) => setSt({ box })} />
          {st.box && (
            <Row>
              <Slider label="Box opacity" value={st.boxAlpha} onChange={(boxAlpha) => setSt({ boxAlpha })} min={0.1} max={1} step={0.05} show={(v) => pct(v, 0)} />
              <label className="k-field"><span className="k-label">Box colour</span><input type="color" value={st.boxColor} onChange={(e) => setSt({ boxColor: e.target.value })} /></label>
            </Row>
          )}
          <Seg value={st.pos} onChange={(pos) => setSt({ pos })} options={[['top', 'Top'], ['middle', 'Middle'], ['bottom', 'Bottom']]} />
          <Slider label="Safe-area margin" value={st.safe} onChange={(safe) => setSt({ safe })} min={0} max={25} step={0.5} unit="%" show={(v) => v.toFixed(1)} />
          <Slider label="Max line width" value={st.maxW} onChange={(maxW) => setSt({ maxW })} min={40} max={100} unit="%" show={String} />
          <Slider label="Line height" value={st.lineH} onChange={(lineH) => setSt({ lineH })} min={1} max={1.8} step={0.05} show={(v) => v.toFixed(2)} />
        </Panel>
      </div>
      <div>
        <Panel title="Preview" actions={<><Check label="Safe-area guides" value={guides} onChange={setGuides} /><Btn onClick={snapshot} disabled={!src}>⬇ Frame PNG</Btn></>}>
          {src ? (
            <div style={{ position: 'relative', background: '#000', borderRadius: 8, overflow: 'hidden', lineHeight: 0 }}>
              <video ref={vid} src={src.url} controls playsInline style={{ width: '100%', display: 'block', maxHeight: '60vh' }} />
              <canvas ref={ov} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', objectFit: 'contain', maxHeight: '60vh' }} />
            </div>
          ) : <div className="k-chart empty">Load a video or generate the demo clip</div>}
          <p className="muted" style={{ fontSize: 13 }}>The overlay uses exactly the same drawing code as the burned output. Yellow dashes show the safe area (hidden in the export).</p>
        </Panel>
        <Panel title="4 · Burn">
          <Row>
            <Select label="Output format" value={codec} onChange={(c) => set({ codec: c })} options={codecs.length ? codecs.map((c) => [c, containerOf(c).label + (c.includes(',') ? ' + audio' : '') + ` (${c.split(';')[0]})`] as const) : [['', 'No encoder available']]} />
            <Select label="Resolution" value={s.height} onChange={(height) => set({ height })} options={[[0, 'Original'], [1080, '1080p'], [720, '720p'], [480, '480p']]} />
          </Row>
          <Row>
            {!busyBurn ? <Btn kind="primary" onClick={() => void burn()} disabled={!src || !codec || !cues.length}>🔥 Burn captions</Btn> : <Btn kind="danger" onClick={() => stop.current()}>Cancel</Btn>}
          </Row>
          {busyBurn && <div style={{ marginTop: 8 }}><Bar value={prog ?? 0} /> <span className="muted">{pct(prog ?? 0, 0)} — encoding runs in real time while the clip plays (keep this tab visible).</span></div>}
          {err && <Note tone="err">{err}</Note>}
          {out && (
            <>
              <Stats>
                <Stat label="Output" value={fmtBytes(out.blob.size)} sub={out.label} tone="good" />
                <Stat label="Encode time" value={`${out.secs.toFixed(1)} s`} />
              </Stats>
              <video src={out.url} controls playsInline style={{ width: '100%', borderRadius: 8, background: '#000' }} />
              <Btn kind="primary" onClick={() => download(`${(src?.name ?? 'video').replace(/\.[^.]+$/, '')}-captioned.${out.ext}`, out.blob, out.blob.type)}>⬇ Download .{out.ext}</Btn>
            </>
          )}
        </Panel>
        <Panel title="What your browser can export">
          <Table head={['Format', 'Supported here']} rows={CODECS.map((c) => [<code key="c" style={{ fontSize: 12 }}>{c}</code>, supported(c) ? <b key="y" style={{ color: 'var(--ok)' }}>✓ yes</b> : <span key="n" className="muted">✗ no</span>])} />
          <Note>
            Encoding uses the browser's built-in MediaRecorder: Chrome/Edge 126+ and Safari can write <b>MP4 (H.264)</b>; Firefox writes <b>WebM</b> only. WebM from MediaRecorder has no duration index, so some editors show the length only after a re-mux. Audio is kept when the browser allows capturing it; otherwise the result is silent and the app says so. Nothing is uploaded.
          </Note>
        </Panel>
      </div>
    </Split>
  )
}
