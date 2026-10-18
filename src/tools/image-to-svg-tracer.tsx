import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Check, CopyButton, download, FileDrop, Note, num, Panel, Row, Seg, Slider, Split, Stat, Stats, useToolState } from '../kit'
import { fmtBytes } from './lib/image-compressor'
import type { Options, Output, ThresholdMode } from './lib/image-to-svg-tracer'

type Sample = 'sketch' | 'signature' | 'logo'
interface S {
  sample: Sample; maxSize: number
  mode2: 'outline' | 'centerline'
  mode: ThresholdMode; level: number; window: number; sensitivity: number; blur: number; invert: boolean; speckle: number
  cornerAngle: number; smoothness: number; tolerance: number
  minSpur: number; error: number; smoothing: number; widthMode: 'auto' | 'fixed'; width: number
  color: string; background: boolean; view: 'svg' | 'bitmap' | 'overlay' | 'original'
}
const DEF: S = {
  sample: 'sketch', maxSize: 900, mode2: 'outline',
  mode: 'adaptive', level: 128, window: 12, sensitivity: 18, blur: 1, invert: false, speckle: 12,
  cornerAngle: 60, smoothness: 1.5, tolerance: 0.8,
  minSpur: 8, error: 1.2, smoothing: 2, widthMode: 'auto', width: 2.5,
  color: '#1f2937', background: false, view: 'svg',
}
const PRESETS: Record<Sample, Partial<S>> = {
  sketch: { mode2: 'outline', mode: 'adaptive', blur: 1, speckle: 12, cornerAngle: 70, smoothness: 1.5 },
  signature: { mode2: 'centerline', mode: 'otsu', blur: 1, speckle: 10, smoothing: 2, error: 1.2, color: '#1e3a8a' },
  logo: { mode2: 'outline', mode: 'otsu', blur: 0, speckle: 4, cornerAngle: 55, smoothness: 1.5, color: '#111827' },
}

function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
}

function drawSample(kind: Sample): HTMLCanvasElement {
  const c = document.createElement('canvas')
  const g = c.getContext('2d')!
  const r = rng(kind.length * 977)
  if (kind === 'sketch') {
    c.width = 760; c.height = 520
    // paper with uneven lighting, like a phone photo of a sketchbook
    const bg = g.createRadialGradient(220, 140, 40, 380, 260, 640)
    bg.addColorStop(0, '#fbf7ee'); bg.addColorStop(0.6, '#e4ddcd'); bg.addColorStop(1, '#9d9582')
    g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height)
    g.strokeStyle = 'rgba(40,38,46,0.88)'; g.lineCap = 'round'; g.lineJoin = 'round'
    const jit = (pts: [number, number][], wd: number) => {
      g.lineWidth = wd; g.beginPath()
      pts.forEach(([x, y], i) => (i ? g.lineTo(x + (r() - 0.5) * 2, y + (r() - 0.5) * 2) : g.moveTo(x, y)))
      g.stroke()
    }
    const line = (x1: number, y1: number, x2: number, y2: number, wd = 4) => jit(Array.from({ length: 12 }, (_, i) => [x1 + ((x2 - x1) * i) / 11, y1 + ((y2 - y1) * i) / 11] as [number, number]), wd)
    const circ = (cx: number, cy: number, rad: number, wd = 4, a0 = 0, a1 = Math.PI * 2.05) => jit(Array.from({ length: 48 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / 47; return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)] as [number, number] }), wd)
    line(60, 440, 700, 436, 5)
    line(150, 440, 150, 250); line(400, 440, 400, 250); line(150, 250, 400, 250)
    line(130, 262, 275, 140, 5); line(275, 140, 420, 262, 5)
    line(250, 440, 250, 350); line(300, 440, 300, 350); line(250, 350, 300, 350)
    circ(290, 398, 4, 4)
    for (const [x, y] of [[180, 290], [330, 290]]) { line(x, y, x + 45, y); line(x, y + 40, x + 45, y + 40); line(x, y, x, y + 40); line(x + 45, y, x + 45, y + 40); line(x + 22, y, x + 22, y + 40, 3); line(x, y + 20, x + 45, y + 20, 3) }
    line(330, 200, 330, 150); line(360, 225, 360, 150); line(330, 150, 360, 150)
    circ(600, 110, 46, 5)
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; line(600 + 60 * Math.cos(a), 110 + 60 * Math.sin(a), 600 + 82 * Math.cos(a), 110 + 82 * Math.sin(a), 4) }
    line(560, 440, 562, 330, 6); line(585, 440, 583, 330, 6)
    circ(572, 290, 52, 5, Math.PI * 0.62, Math.PI * 2.38)
    for (let k = 0; k < 7; k++) circ(130 + k * 70 + r() * 20, 470 + r() * 15, 3 + r() * 4, 3, 0, Math.PI)
    // graphite smudges and paper noise
    const im = g.getImageData(0, 0, c.width, c.height)
    for (let i = 0; i < im.data.length; i += 4) { const n = (r() - 0.5) * 26; im.data[i] += n; im.data[i + 1] += n; im.data[i + 2] += n }
    g.putImageData(im, 0, 0)
  } else if (kind === 'signature') {
    c.width = 720; c.height = 300
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height)
    g.strokeStyle = '#d4d4d8'; g.lineWidth = 2; g.beginPath(); g.moveTo(40, 230); g.lineTo(680, 230); g.stroke()
    g.strokeStyle = '#1e3a8a'; g.lineCap = 'round'; g.lineJoin = 'round'
    const pen = (f: (t: number) => [number, number], n: number, w0: number, w1: number) => {
      let prev = f(0)
      for (let i = 1; i <= n; i++) {
        const t = i / n, p = f(t)
        g.lineWidth = w0 + (w1 - w0) * Math.sin(Math.PI * t)
        g.beginPath(); g.moveTo(prev[0], prev[1]); g.lineTo(p[0], p[1]); g.stroke()
        prev = p
      }
    }
    // a looping cursive signature built from trochoids
    pen((t) => { const a = t * Math.PI * 9; return [70 + t * 420 + 28 * Math.cos(a + 1.6) * (1 - t * 0.3), 150 - 55 * Math.sin(a) * Math.exp(-t * 0.8) + t * 30] }, 600, 2.5, 6)
    pen((t) => [480 + t * 180, 175 - 70 * Math.sin(Math.PI * t) + 20 * t], 120, 3, 5)
    pen((t) => [90 + t * 520, 212 + 10 * Math.sin(t * 7)], 200, 2, 4.5)
    g.lineWidth = 5; g.beginPath(); g.arc(590, 92, 4, 0, Math.PI * 2); g.stroke()
  } else {
    c.width = 560; c.height = 560
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height)
    g.fillStyle = '#111111'; g.strokeStyle = '#111111'
    // bold coffee-cup icon with steam
    g.lineWidth = 26; g.lineCap = 'round'; g.lineJoin = 'round'
    g.beginPath(); g.moveTo(130, 230); g.lineTo(150, 420); g.quadraticCurveTo(155, 450, 190, 450); g.lineTo(330, 450); g.quadraticCurveTo(365, 450, 370, 420); g.lineTo(390, 230); g.closePath(); g.stroke()
    g.beginPath(); g.arc(405, 315, 48, -Math.PI / 2.2, Math.PI / 2.2); g.stroke()
    g.fillRect(90, 478, 340, 26)
    for (const x of [200, 260, 320]) { g.lineWidth = 18; g.beginPath(); g.moveTo(x, 190); g.bezierCurveTo(x - 30, 160, x + 30, 130, x, 90); g.stroke() }
    g.beginPath(); g.arc(260, 335, 38, 0, Math.PI * 2); g.fill()
    g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(260, 335, 8, 28, 0.5, 0, Math.PI * 2); g.fill()
  }
  return c
}

function resized(src: HTMLCanvasElement, max: number) {
  const k = Math.min(max / Math.max(src.width, src.height), 4)
  const w = Math.max(1, Math.round(src.width * k)), h = Math.max(1, Math.round(src.height * k))
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.imageSmoothingQuality = 'high'
  g.drawImage(src, 0, 0, w, h)
  return { w, h, data: g.getImageData(0, 0, w, h).data, url: c.toDataURL('image/png') }
}

export default function ImageToSvgTracer() {
  const [s, set, reset] = useToolState('image-to-svg-tracer', DEF)
  const [src, setSrc] = useState<{ name: string; canvas: HTMLCanvasElement }>(() => ({ name: `${s.sample}.png`, canvas: drawSample(s.sample) }))
  const [out, setOut] = useState<Output | null>(null)
  const [ms, setMs] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const worker = useRef<Worker | null>(null)
  const job = useRef(0)
  const bmCanvas = useRef<HTMLCanvasElement>(null)

  const work = useMemo(() => resized(src.canvas, s.maxSize), [src, s.maxSize])

  useEffect(() => {
    const w = new Worker(new URL('./lib/image-to-svg-tracer.worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e: MessageEvent<{ id: number; ok: boolean; res?: Output; ms?: number; msg?: string }>) => {
      if (e.data.id !== job.current) return
      setBusy(false)
      if (e.data.ok && e.data.res) { setOut(e.data.res); setMs(e.data.ms ?? 0) } else setErr(e.data.msg ?? 'Tracing failed')
    }
    worker.current = w
    return () => w.terminate()
  }, [])

  const opts: Options = {
    mode2: s.mode2, mode: s.mode, level: s.level, window: s.window, sensitivity: s.sensitivity, blur: s.blur, invert: s.invert, speckle: s.speckle,
    minArea: s.speckle, cornerAngle: s.cornerAngle, smoothness: s.smoothness, tolerance: s.tolerance,
    minSpur: s.minSpur, error: s.error, smoothing: s.smoothing, widthMode: s.widthMode, width: s.width,
  }
  const key = JSON.stringify([opts, s.color, s.background])
  useEffect(() => {
    const t = setTimeout(() => {
      if (!worker.current) return
      const id = ++job.current
      const [o, color, bg] = JSON.parse(key) as [Options, string, boolean]
      setErr(''); setBusy(true)
      const px = new Uint8ClampedArray(work.data)
      worker.current.postMessage({ id, px, w: work.w, h: work.h, o, st: { color, background: bg ? '#ffffff' : null } }, [px.buffer])
    }, 200)
    return () => clearTimeout(t)
  }, [work, key])

  useEffect(() => {
    const c = bmCanvas.current
    if (!c || !out) return
    c.width = out.w; c.height = out.h
    const g = c.getContext('2d')!
    const im = g.createImageData(out.w, out.h)
    for (let i = 0; i < out.bm.length; i++) { const v = out.bm[i] ? 20 : 255; im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255 }
    g.putImageData(im, 0, 0)
  }, [out, s.view])

  const svgUrl = useMemo(() => (out ? URL.createObjectURL(new Blob([out.svg], { type: 'image/svg+xml' })) : ''), [out])
  const overlayUrl = useMemo(() => (out ? URL.createObjectURL(new Blob([out.svg.replace(/(fill|stroke)="#[0-9a-f]{6}"/gi, '$1="#e11d48"').replace(/<rect[^>]*\/>\n/, '')], { type: 'image/svg+xml' })) : ''), [out])
  useEffect(() => () => { if (svgUrl) URL.revokeObjectURL(svgUrl) }, [svgUrl])
  useEffect(() => () => { if (overlayUrl) URL.revokeObjectURL(overlayUrl) }, [overlayUrl])

  const loadSample = (k: Sample) => { set({ sample: k, ...PRESETS[k] }); setSrc({ name: `${k}.png`, canvas: drawSample(k) }) }
  const onFiles = async ([f]: File[]) => {
    try {
      const bmp = await createImageBitmap(f)
      const c = document.createElement('canvas')
      c.width = bmp.width; c.height = bmp.height
      c.getContext('2d')!.drawImage(bmp, 0, 0)
      setSrc({ name: f.name, canvas: c })
    } catch { setErr('Could not decode this image.') }
  }
  const base = src.name.replace(/\.[^.]+$/, '')
  const svgBytes = out ? new Blob([out.svg]).size : 0

  return (
    <Split wide="right">
      <div>
        <Panel title="Image">
          <FileDrop accept="image/*" onFiles={(f) => void onFiles(f)} label="Drop a scan, photo of a sketch or a signature" />
          <Row>
            <Btn kind={src.name === 'sketch.png' ? 'primary' : 'normal'} onClick={() => loadSample('sketch')}>✏️ Pen sketch</Btn>
            <Btn kind={src.name === 'signature.png' ? 'primary' : 'normal'} onClick={() => loadSample('signature')}>✍️ Signature</Btn>
            <Btn kind={src.name === 'logo.png' ? 'primary' : 'normal'} onClick={() => loadSample('logo')}>☕ Line icon</Btn>
          </Row>
          <Slider label="Working size (long side)" value={s.maxSize} onChange={(maxSize) => set({ maxSize })} min={200} max={2400} step={50} unit=" px" show={(v) => String(v)} />
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>Small scans are upsampled (up to 4×) before thresholding — smoother curves from low-res images.</p>
        </Panel>

        <Panel title="1 · Threshold">
          <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['otsu', 'Auto (Otsu)'], ['manual', 'Manual'], ['adaptive', 'Adaptive']]} />
          {s.mode === 'manual' && <Slider label="Level" value={s.level} onChange={(level) => set({ level })} min={1} max={254} />}
          {s.mode === 'adaptive' && (
            <>
              <Slider label="Window" value={s.window} onChange={(window) => set({ window })} min={2} max={40} unit=" %" show={(v) => String(v)} />
              <Slider label="Sensitivity" value={s.sensitivity} onChange={(sensitivity) => set({ sensitivity })} min={2} max={50} unit=" %" show={(v) => String(v)} />
            </>
          )}
          <Row>
            <Slider label="Pre-blur" value={s.blur} onChange={(blur) => set({ blur })} min={0} max={4} unit=" px" show={(v) => String(v)} />
            <Slider label="Despeckle" value={s.speckle} onChange={(speckle) => set({ speckle })} min={0} max={200} unit=" px²" show={(v) => String(v)} />
          </Row>
          <Check label="Invert (light lines on dark, e.g. chalkboard)" value={s.invert} onChange={(invert) => set({ invert })} />
        </Panel>

        <Panel title="2 · Trace">
          <Seg value={s.mode2} onChange={(mode2) => set({ mode2 })} options={[['outline', '◼ Outline (filled shapes)'], ['centerline', '〰 Centerline (strokes)']]} />
          {s.mode2 === 'outline' ? (
            <>
              <Slider label="Corner angle" value={s.cornerAngle} onChange={(cornerAngle) => set({ cornerAngle })} min={20} max={180} step={5} show={(v) => (v >= 180 ? 'no corners' : `${v}°`)} />
              <Row>
                <Slider label="Smoothing" value={s.smoothness} onChange={(smoothness) => set({ smoothness })} min={0} max={5} step={0.25} unit=" px" />
                <Slider label="Fit tolerance" value={s.tolerance} onChange={(tolerance) => set({ tolerance })} min={0.1} max={3} step={0.1} unit=" px" />
              </Row>
            </>
          ) : (
            <>
              <Row>
                <Slider label="Smoothing" value={s.smoothing} onChange={(smoothing) => set({ smoothing })} min={0} max={8} show={(v) => String(v)} />
                <Slider label="Fit error" value={s.error} onChange={(error) => set({ error })} min={0.3} max={4} step={0.1} unit=" px" />
              </Row>
              <Slider label="Prune spurs shorter than" value={s.minSpur} onChange={(minSpur) => set({ minSpur })} min={0} max={40} unit=" px" show={(v) => String(v)} />
              <Seg value={s.widthMode} onChange={(widthMode) => set({ widthMode })} options={[['auto', 'Stroke width from ink'], ['fixed', 'Fixed width']]} />
              {s.widthMode === 'fixed' && <Slider label="Width" value={s.width} onChange={(width) => set({ width })} min={0.5} max={12} step={0.5} unit=" px" />}
            </>
          )}
        </Panel>

        <Panel title="3 · Style" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            <label className="k-field" style={{ maxWidth: 140 }}>
              <span className="k-label">Ink colour</span>
              <input type="color" value={s.color} onChange={(e) => set({ color: e.target.value })} style={{ width: '100%', height: 36 }} />
            </label>
            <Check label="White background" value={s.background} onChange={(background) => set({ background })} />
          </Row>
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label={s.mode2 === 'outline' ? 'Paths' : 'Strokes'} value={out ? out.paths : '…'} sub={s.mode2 === 'outline' && out ? `${out.corners} corners` : out ? `avg width ${num(out.avgWidth, 1)} px` : ''} />
          <Stat label="Bézier segments" value={out ? out.curves + out.lines : '…'} sub={out && out.lines ? `${out.curves} curves · ${out.lines} lines` : ''} />
          <Stat label="SVG size" value={out ? fmtBytes(svgBytes) : '…'} tone="accent" sub={out ? `${out.w}×${out.h}` : ''} />
          <Stat label="Trace time" value={busy ? '…' : `${num(ms, 0)} ms`} sub={out && Number.isFinite(out.level) ? `threshold ${Math.round(out.level)}` : s.mode === 'adaptive' ? 'adaptive' : ''} />
        </Stats>
        <Panel
          title="Preview"
          actions={
            <>
              <Btn kind="primary" disabled={!out} onClick={() => out && download(`${base}-${s.mode2}.svg`, out.svg, 'image/svg+xml')}>⬇ SVG</Btn>
              <CopyButton text={() => out?.svg ?? ''} label="Copy SVG" />
            </>
          }
        >
          <Seg value={s.view} onChange={(view) => set({ view })} options={[['svg', 'SVG'], ['overlay', 'Overlay'], ['bitmap', 'Bitmap'], ['original', 'Original']]} />
          {err && <Note tone="err">{err}</Note>}
          <div style={{ position: 'relative', marginTop: 10, border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden', background: 'repeating-conic-gradient(#e5e7eb 0% 25%, #fff 0% 50%) 50% / 20px 20px', opacity: busy ? 0.7 : 1, transition: 'opacity .2s' }}>
            {s.view === 'bitmap' ? <canvas ref={bmCanvas} style={{ display: 'block', width: '100%', height: 'auto' }} /> : (
              <>
                {(s.view === 'original' || s.view === 'overlay') && <img src={work.url} alt="original" style={{ display: 'block', width: '100%', opacity: s.view === 'overlay' ? 0.45 : 1 }} />}
                {s.view !== 'original' && out && <img src={s.view === 'overlay' ? overlayUrl : svgUrl} alt="traced SVG" style={{ display: 'block', width: '100%', ...(s.view === 'overlay' ? { position: 'absolute', inset: 0 } : {}) }} />}
              </>
            )}
          </div>
          <p className="muted" style={{ fontSize: 13 }}>
            {s.mode2 === 'outline'
              ? 'Outline mode: marching-squares boundaries (holes included, even-odd fill) → corners where the outline turns more than the corner angle → shrink-free smoothing between corners → least-squares Bézier fitting (straight runs become lines). Best for logos, filled lettering and inked drawings.'
              : 'Centerline mode: Zhang–Suen skeleton → stroke graph split at junctions and end points → spur pruning → least-squares Béziers, stroke width estimated per stroke from the distance transform. Best for pen drawings, handwriting and signatures (plotters, laser cutters, animation).'}
          </p>
        </Panel>
        <Note>
          Tips: use <b>Adaptive</b> for phone photos with shadows; raise <b>Despeckle</b> for paper grain; lower the corner angle for technical drawings, raise it for organic shapes. For multi-colour artwork use the Vectorizer tool instead.
        </Note>
      </div>
    </Split>
  )
}
