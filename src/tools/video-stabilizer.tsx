import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Check, download, FileDrop, LineChart, Note, num, Panel, pct, Row, Seg, Slider, Split, Stat, Stats, useToolState } from '../kit'
import { accumulate, estimateMotion, gaussSmooth, jitter, lineFit, requiredZoom, sampleAt, toGray, type Motion } from './lib/video-stabilizer'

type Path = 'smooth' | 'pan'
type Crop = 'auto' | 'none'
const DEF = { smooth: 0.8, path: 'smooth' as Path, rotation: true, crop: 'auto' as Crop, maxZoom: 1.25 }

interface Src { url: string; name: string; size: number; truth?: [number, number, number][] }
interface Analysis { t: number[]; ms: Motion[]; scale: number; vw: number; vh: number; dur: number }
type RVFCVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number
  captureStream?: () => MediaStream
  mozCaptureStream?: () => MediaStream
}

const SUPPORTED = typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement !== 'undefined' && !!HTMLCanvasElement.prototype.captureStream
const AW = 192 // analysis width in pixels

function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  return ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9', 'video/webm', 'video/mp4'].find((m) => MediaRecorder.isTypeSupported(m)) ?? ''
}

/** A detailed static landscape (larger than the frame) so the shaky camera has texture to track. */
function world(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 900
  c.height = 520
  const g = c.getContext('2d')!
  let seed = 3
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const sky = g.createLinearGradient(0, 0, 0, 300)
  sky.addColorStop(0, '#3b82f6')
  sky.addColorStop(1, '#bae6fd')
  g.fillStyle = sky
  g.fillRect(0, 0, 900, 520)
  for (let i = 0; i < 9; i++) {
    g.fillStyle = 'rgba(255,255,255,0.85)'
    const x = rnd() * 900, y = 30 + rnd() * 120
    for (let k = 0; k < 5; k++) {
      g.beginPath()
      g.ellipse(x + k * 18, y + (k % 2) * 6, 26, 14, 0, 0, Math.PI * 2)
      g.fill()
    }
  }
  g.fillStyle = '#facc15'
  g.beginPath()
  g.arc(760, 80, 34, 0, Math.PI * 2)
  g.fill()
  ;[['#64748b', 230, 140], ['#475569', 270, 90]].forEach(([col, base, amp]) => {
    g.fillStyle = col as string
    g.beginPath()
    g.moveTo(0, 520)
    for (let x = 0; x <= 900; x += 30) g.lineTo(x, (base as number) + Math.sin(x / 70 + (amp as number)) * 30 - rnd() * (amp as number) * 0.6)
    g.lineTo(900, 520)
    g.fill()
  })
  g.fillStyle = '#4d7c0f'
  g.fillRect(0, 330, 900, 190)
  for (let i = 0; i < 2500; i++) {
    g.fillStyle = `hsl(${80 + rnd() * 40} 50% ${20 + rnd() * 30}%)`
    g.fillRect(rnd() * 900, 330 + rnd() * 190, 3, 3)
  }
  g.fillStyle = '#a8a29e'
  g.beginPath()
  g.moveTo(380, 520); g.lineTo(440, 330); g.lineTo(470, 330); g.lineTo(600, 520)
  g.fill()
  for (let h = 0; h < 6; h++) {
    const x = 60 + h * 140 + rnd() * 30, w = 70 + rnd() * 30, y = 300 - rnd() * 40
    g.fillStyle = ['#ef4444', '#f59e0b', '#e2e8f0', '#0ea5e9', '#a855f7', '#f97316'][h]
    g.fillRect(x, y, w, 345 - y)
    g.fillStyle = '#7f1d1d'
    g.beginPath(); g.moveTo(x - 8, y); g.lineTo(x + w / 2, y - 34); g.lineTo(x + w + 8, y); g.fill()
    g.fillStyle = '#1e293b'
    for (let r = 0; r < 2; r++) for (let k = 0; k < 3; k++) g.fillRect(x + 8 + k * (w - 16) / 3, y + 10 + r * 22, 12, 12)
    g.fillStyle = '#14532d'
    g.beginPath(); g.arc(x + w + 22, 320, 18, 0, Math.PI * 2); g.fill()
  }
  g.fillStyle = '#0f172a'
  g.font = 'bold 30px system-ui, sans-serif'
  g.fillText('SHAKY CAM DEMO', 300, 440)
  return c
}

/** Records a 6-second handheld-looking clip; returns the blob and the true camera shake. */
async function makeDemo(onP: (p: number) => void): Promise<{ blob: Blob; truth: [number, number, number][] }> {
  const W = 640, H = 360, D = 6
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  const bg = world()
  const stream = c.captureStream(30)
  const rec = new MediaRecorder(stream, { mimeType: pickMime() || undefined, videoBitsPerSecond: 2_500_000 })
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  const done = new Promise<void>((r) => (rec.onstop = () => r()))
  const truth: [number, number, number][] = []
  const ph = [Math.random() * 6, Math.random() * 6, Math.random() * 6]
  const t0 = performance.now()
  const draw = () => {
    const t = (performance.now() - t0) / 1000
    const sx = 9 * Math.sin(2 * Math.PI * 1.9 * t + ph[0]) + 5 * Math.sin(2 * Math.PI * 4.7 * t + ph[1]) + 3 * Math.sin(2 * Math.PI * 9.3 * t)
    const sy = 7 * Math.sin(2 * Math.PI * 2.4 * t + ph[2]) + 4 * Math.sin(2 * Math.PI * 6.1 * t + 1)
    const rot = 0.014 * Math.sin(2 * Math.PI * 1.3 * t + ph[1])
    const pan = 18 * t
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.fillStyle = '#000'
    g.fillRect(0, 0, W, H)
    g.translate(W / 2, H / 2)
    g.rotate(rot)
    g.translate(-W / 2 + sx - pan, -H / 2 + sy)
    g.drawImage(bg, -80, -60)
    // a ball moving on its own: the robust fit should ignore it
    g.fillStyle = '#fde047'
    g.beginPath()
    g.arc(120 + t * 70, 330 - Math.abs(Math.sin(t * 3)) * 90, 16, 0, Math.PI * 2)
    g.fill()
    truth.push([t, sx - pan, sy])
    onP(Math.min(1, t / D))
  }
  draw()
  rec.start(250)
  const timer = setInterval(draw, 1000 / 30)
  await new Promise((r) => setTimeout(r, D * 1000))
  clearInterval(timer)
  rec.stop()
  await done
  stream.getTracks().forEach((t) => t.stop())
  return { blob: new Blob(chunks, { type: rec.mimeType || 'video/webm' }), truth }
}

function realDuration(v: HTMLVideoElement): Promise<number> {
  if (Number.isFinite(v.duration)) return Promise.resolve(v.duration)
  return new Promise((res) => {
    const on = () => {
      if (!Number.isFinite(v.duration)) return
      v.removeEventListener('durationchange', on)
      v.currentTime = 0
      res(v.duration)
    }
    v.addEventListener('durationchange', on)
    v.currentTime = 1e101
  })
}
const seekTo = (v: HTMLVideoElement, t: number) => new Promise<void>((r) => {
  if (Math.abs(v.currentTime - t) < 1e-3 && v.readyState >= 2) return r()
  v.addEventListener('seeked', () => r(), { once: true })
  v.currentTime = t
})

/** Calls fn for every presented frame (requestVideoFrameCallback, or rAF on older browsers). */
function eachFrame(v: RVFCVideo, fn: (mediaTime: number) => void): () => void {
  let live = true
  if (v.requestVideoFrameCallback) {
    const cb = (_: number, meta: { mediaTime: number }) => {
      if (!live) return
      fn(meta.mediaTime)
      v.requestVideoFrameCallback!(cb)
    }
    v.requestVideoFrameCallback(cb)
  } else {
    let last = -1
    const loop = () => {
      if (!live) return
      if (v.currentTime !== last) fn((last = v.currentTime))
      requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
  }
  return () => (live = false)
}

export default function VideoStabilizer() {
  const [s, set, reset] = useToolState('video-stabilizer', DEF)
  const [src, setSrc] = useState<Src | null>(null)
  const [demoP, setDemoP] = useState(0)
  const [an, setAn] = useState<Analysis | null>(null)
  const [busy, setBusy] = useState<'' | 'analyze' | 'render'>('')
  const [prog, setProg] = useState(0)
  const [out, setOut] = useState<{ url: string; blob: Blob } | null>(null)
  const [err, setErr] = useState('')
  const vid = useRef<RVFCVideo>(null)
  const cv = useRef<HTMLCanvasElement>(null)
  const stopRef = useRef(false)

  useEffect(() => {
    if (!SUPPORTED) return
    let live = true
    void makeDemo((p) => live && setDemoP(p))
      .then(({ blob, truth }) => live && setSrc((cur) => cur ?? { url: URL.createObjectURL(blob), name: 'shaky-demo.webm', size: blob.size, truth }))
      .catch(() => live && setErr('Could not generate the demo clip; open a video file instead.'))
    return () => { live = false }
  }, [])

  // ----- path + corrections -----
  const plan = useMemo(() => {
    if (!an || an.t.length < 2) return null
    const tr = accumulate(an.t, an.ms)
    const fps = (an.t.length - 1) / (an.t[an.t.length - 1] - an.t[0] || 1)
    const sig = s.smooth * fps
    const f = s.path === 'pan' ? lineFit : (v: number[]) => gaussSmooth(v, sig)
    const k = an.scale
    const raw = { x: tr.x.map((v) => v * k), y: tr.y.map((v) => v * k), a: tr.a }
    const sm = { x: f(raw.x), y: f(raw.y), a: f(raw.a) }
    const corr = raw.x.map((_, i) => ({ dx: sm.x[i] - raw.x[i], dy: sm.y[i] - raw.y[i], da: s.rotation ? sm.a[i] - raw.a[i] : 0 }))
    const need = corr.map((c) => requiredZoom(c, an.vw, an.vh)).sort((a, b) => a - b)
    const needMax = need[need.length - 1] ?? 1
    const zoom = s.crop === 'none' ? 1 : Math.min(s.maxZoom, need[Math.floor(need.length * 0.98)] ?? 1)
    const before = Math.hypot(jitter(raw.x), jitter(raw.y))
    const after = Math.hypot(jitter(sm.x), jitter(sm.y))
    const conf = an.ms.reduce((a, m) => a + m.conf, 0) / an.ms.length
    return { raw, sm, corr, zoom, needMax, before, after, fps, conf }
  }, [an, s.smooth, s.path, s.rotation, s.crop, s.maxZoom])

  const corrAt = (t: number) => {
    if (!an || !plan) return { dx: 0, dy: 0, da: 0 }
    return { dx: sampleAt(an.t, plan.corr.map((c) => c.dx), t), dy: sampleAt(an.t, plan.corr.map((c) => c.dy), t), da: sampleAt(an.t, plan.corr.map((c) => c.da), t) }
  }

  const paint = (t: number) => {
    const v = vid.current, c = cv.current
    if (!v || !c || !v.videoWidth) return
    const W = Math.min(1280, v.videoWidth), H = Math.round((W * v.videoHeight) / v.videoWidth / 2) * 2
    if (c.width !== W || c.height !== H) [c.width, c.height] = [W, H]
    const g = c.getContext('2d')!
    const k = W / v.videoWidth
    const cr = corrAt(t)
    const Z = plan?.zoom ?? 1
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.fillStyle = '#000'
    g.fillRect(0, 0, W, H)
    g.translate(W / 2, H / 2)
    g.scale(Z, Z)
    g.translate(cr.dx * k, cr.dy * k)
    g.rotate(cr.da)
    g.drawImage(v, -W / 2, -H / 2, W, H)
  }
  const paintRef = useRef(paint)
  useEffect(() => { paintRef.current = paint })

  // Live side-by-side preview whenever the original plays or seeks.
  useEffect(() => {
    const v = vid.current
    if (!v || !src) return
    const stop = eachFrame(v, (t) => paintRef.current(t))
    const onSeek = () => paintRef.current(v.currentTime)
    v.addEventListener('seeked', onSeek)
    v.addEventListener('loadeddata', onSeek)
    return () => {
      stop()
      v.removeEventListener('seeked', onSeek)
      v.removeEventListener('loadeddata', onSeek)
    }
  }, [src])
  useEffect(() => { if (vid.current && !busy) paintRef.current(vid.current.currentTime) }, [plan, busy])

  const open = (f: File) => {
    if (!f.type.startsWith('video/') && !/\.(mp4|webm|mov|mkv|m4v|ogv)$/i.test(f.name)) return setErr('That does not look like a video file.')
    setErr('')
    setAn(null)
    setOut(null)
    setSrc({ url: URL.createObjectURL(f), name: f.name, size: f.size })
  }

  const analyze = async () => {
    const v = vid.current
    if (!v || busy) return
    setBusy('analyze')
    setErr('')
    setOut(null)
    stopRef.current = false
    try {
      const dur = await realDuration(v)
      v.pause()
      v.muted = true
      await seekTo(v, 0)
      const aw = AW, ah = Math.max(16, Math.round((AW * v.videoHeight) / v.videoWidth / 2) * 2)
      const c = document.createElement('canvas')
      c.width = aw
      c.height = ah
      const g = c.getContext('2d', { willReadFrequently: true })!
      const t: number[] = [], ms: Motion[] = []
      let prev: Float32Array | null = null
      const grab = (mt: number) => {
        if (t.length && mt <= t[t.length - 1]) return
        g.drawImage(v, 0, 0, aw, ah)
        const cur = toGray(g.getImageData(0, 0, aw, ah).data, aw, ah)
        ms.push(prev ? estimateMotion(prev, cur, aw, ah, { rotation: true }) : { dx: 0, dy: 0, da: 0, conf: 1 })
        t.push(mt)
        prev = cur
        setProg(dur ? Math.min(1, mt / dur) : 0)
      }
      grab(0)
      v.playbackRate = 2
      const stop = eachFrame(v, grab)
      await v.play()
      await new Promise<void>((r) => {
        const chk = () => (v.ended || stopRef.current ? r() : setTimeout(chk, 100))
        chk()
      })
      stop()
      v.pause()
      v.playbackRate = 1
      if (t.length < 3) throw new Error('too few frames decoded')
      setAn({ t, ms, scale: v.videoWidth / aw, vw: v.videoWidth, vh: v.videoHeight, dur })
      await seekTo(v, 0)
    } catch (e) {
      setErr(`Analysis failed: ${(e as Error).message}`)
    } finally {
      setBusy('')
      setProg(0)
    }
  }

  const analyzeRef = useRef(analyze)
  useEffect(() => { analyzeRef.current = analyze })

  const render = async () => {
    const v = vid.current, c = cv.current
    if (!v || !c || !plan || busy) return
    setBusy('render')
    stopRef.current = false
    try {
      await seekTo(v, 0)
      paint(0)
      const stream = c.captureStream(30)
      try {
        const vs = v.captureStream?.() ?? v.mozCaptureStream?.()
        vs?.getAudioTracks().forEach((tr) => stream.addTrack(tr))
      } catch { /* no audio */ }
      const rec = new MediaRecorder(stream, { mimeType: pickMime() || undefined, videoBitsPerSecond: 5_000_000 })
      const chunks: Blob[] = []
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
      const done = new Promise<void>((r) => (rec.onstop = () => r()))
      const dur = an?.dur || v.duration
      const onT = () => setProg(dur ? v.currentTime / dur : 0)
      v.addEventListener('timeupdate', onT)
      rec.start(250)
      await v.play()
      await new Promise<void>((r) => {
        const chk = () => (v.ended || stopRef.current ? r() : setTimeout(chk, 100))
        chk()
      })
      v.pause()
      rec.stop()
      await done
      v.removeEventListener('timeupdate', onT)
      stream.getVideoTracks().forEach((t) => t.stop())
      const blob = new Blob(chunks, { type: rec.mimeType || 'video/webm' })
      setOut((o) => {
        if (o) URL.revokeObjectURL(o.url)
        return { url: URL.createObjectURL(blob), blob }
      })
    } catch (e) {
      setErr(`Rendering failed: ${(e as Error).message}`)
    } finally {
      setBusy('')
      setProg(0)
    }
  }

  const series = plan && an ? [
    { name: 'Camera X (raw)', points: an.t.map((t, i): [number, number] => [t, plan.raw.x[i]]), color: '#94a3b8' },
    { name: 'Camera X (smoothed)', points: an.t.map((t, i): [number, number] => [t, plan.sm.x[i]]), color: '#6366f1' },
    { name: 'Camera Y (raw)', points: an.t.map((t, i): [number, number] => [t, plan.raw.y[i]]), color: '#fda4af' },
    { name: 'Camera Y (smoothed)', points: an.t.map((t, i): [number, number] => [t, plan.sm.y[i]]), color: '#ef4444' },
    ...(src?.truth ? [{ name: 'True X (demo)', dashed: true, color: '#10b981', points: src.truth.map(([t, x]): [number, number] => [t, x - src.truth![0][1]]).filter((_, i) => i % 2 === 0) }] : []),
  ] : []

  const reduction = plan ? 1 - plan.after / (plan.before || 1) : 0

  return (
    <Split wide="right">
      <div>
        <Panel title="Source">
          <FileDrop accept="video/*" onFiles={(f) => open(f[0])} label="Drop a shaky video (MP4, WebM, MOV)" />
          {!SUPPORTED && <Note tone="err">This browser cannot record canvas video (MediaRecorder). Try Chrome, Edge or Firefox.</Note>}
          {SUPPORTED && !src && !err && <Note>Generating a 6-second shaky demo clip… {pct(demoP, 0)}</Note>}
          {src && <p className="k-hint">{src.truth ? 'Demo clip: a synthetic handheld shot with a known shake path (green dashed line in the chart).' : <>Loaded <b>{src.name}</b> · {(src.size / 1048576).toFixed(1)} MB</>}</p>}
          {err && <Note tone="err">{err}</Note>}
          <Row>
            <Btn kind="primary" onClick={() => void analyze()} disabled={!src || !!busy}>{busy === 'analyze' ? `Analyzing… ${pct(prog, 0)}` : an ? '↻ Re-analyze motion' : '① Analyze motion'}</Btn>
            {busy && <Btn kind="ghost" onClick={() => (stopRef.current = true)}>Stop</Btn>}
          </Row>
          <p className="k-hint">Everything runs locally: frames are downscaled to {AW} px grayscale, matched block-by-block, and fitted to a translation + rotation model that ignores moving objects.</p>
        </Panel>
        <Panel title="Stabilization" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Seg value={s.path} onChange={(path) => set({ path })} options={[['smooth', 'Smooth handheld'], ['pan', 'Steady pan (tripod-like)']]} />
          {s.path === 'smooth' && <Slider label="Smoothing strength" value={s.smooth} onChange={(smooth) => set({ smooth })} min={0.1} max={3} step={0.1} unit=" s" show={(v) => v.toFixed(1)} />}
          <Check label="Correct rotation (roll)" value={s.rotation} onChange={(rotation) => set({ rotation })} />
          <div style={{ margin: '8px 0' }}>
            <Seg value={s.crop} onChange={(crop) => set({ crop })} options={[['auto', 'Auto zoom to hide edges'], ['none', 'No zoom (black borders)']]} />
          </div>
          {s.crop === 'auto' && <Slider label="Maximum zoom" value={s.maxZoom} onChange={(maxZoom) => set({ maxZoom })} min={1} max={1.6} step={0.01} show={(v) => `${Math.round((v - 1) * 100)}%`} />}
          {plan && s.crop === 'auto' && plan.needMax > s.maxZoom + 0.005 && <Note tone="warn">Full coverage would need {Math.round((plan.needMax - 1) * 100)}% zoom; some frames will show black edges. Increase the limit or the smoothing is too strong.</Note>}
          <Btn kind="primary" onClick={() => void render()} disabled={!plan || !!busy}>{busy === 'render' ? `Rendering… ${pct(prog, 0)}` : '② Render stabilized WebM'}</Btn>
          {out && <Row><Btn onClick={() => download(`${src?.name.replace(/\.\w+$/, '') ?? 'video'}-stabilized.webm`, out.blob, out.blob.type)}>⬇ Download WebM ({(out.blob.size / 1048576).toFixed(1)} MB)</Btn></Row>}
          <p className="k-hint">Rendering plays the clip in real time and records the corrected canvas (audio is kept when the browser allows capturing it).</p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Frames analyzed" value={an ? an.t.length : '—'} sub={plan ? `≈ ${num(plan.fps, 0)} fps sampled` : 'run step ①'} />
          <Stat label="Jitter before" value={plan ? `${num(plan.before, 1)} px` : '—'} sub="RMS frame-to-frame" />
          <Stat label="Jitter after" value={plan ? `${num(plan.after, 2)} px` : '—'} sub={plan ? `${pct(reduction, 0)} less shake` : ''} tone="good" />
          <Stat label="Crop zoom" value={plan ? `${Math.round((plan.zoom - 1) * 100)}%` : '—'} sub={plan ? `tracking confidence ${pct(plan.conf, 0)}` : ''} tone="accent" />
        </Stats>
        <Panel title="Side-by-side preview">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
            <figure style={{ margin: 0 }}>
              <figcaption className="k-label">Original</figcaption>
              {src ? <video ref={vid} src={src.url} controls muted playsInline loop={false} onLoadedMetadata={() => { setAn(null); setOut(null); setTimeout(() => void analyzeRef.current(), 50) }} style={{ width: '100%', borderRadius: 8, background: '#000' }} /> : <div className="k-chart empty" style={{ aspectRatio: '16/9' }}>Waiting for a clip…</div>}
            </figure>
            <figure style={{ margin: 0 }}>
              <figcaption className="k-label">Stabilized {plan ? '' : '(analyze first)'}</figcaption>
              <canvas ref={cv} width={640} height={360} style={{ width: '100%', borderRadius: 8, background: '#000', display: 'block' }} />
            </figure>
          </div>
          <p className="k-hint">Play or scrub the original — the right side shows the corrected frame live.</p>
          {out && (
            <>
              <h4 style={{ margin: '12px 0 6px' }}>Rendered result</h4>
              <video src={out.url} controls playsInline style={{ width: '100%', maxWidth: 640, borderRadius: 8, background: '#000' }} />
            </>
          )}
        </Panel>
        <Panel title="Camera path">
          {series.length ? <LineChart series={series} height={280} xLabel="time (s)" yLabel="px" fx={(v) => v.toFixed(1)} fy={(v) => v.toFixed(0)} /> : <div className="k-chart empty">Analyze the clip to see the estimated camera path.</div>}
          {plan && an && (
            <LineChart series={[{ name: 'Roll (raw)', points: an.t.map((t, i): [number, number] => [t, (plan.raw.a[i] * 180) / Math.PI]), color: '#f59e0b' }, { name: 'Roll (smoothed)', points: an.t.map((t, i): [number, number] => [t, (plan.sm.a[i] * 180) / Math.PI]), color: '#a855f7' }]} height={160} xLabel="time (s)" yLabel="degrees" fx={(v) => v.toFixed(1)} fy={(v) => v.toFixed(2)} />
          )}
          <Note>The smoothed path is what the camera “should” have done; each frame is shifted and rotated by the difference, then zoomed just enough to hide the moving edges.</Note>
        </Panel>
      </div>
    </Split>
  )
}
