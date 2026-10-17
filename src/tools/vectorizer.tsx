import { useEffect, useMemo, useRef, useState } from 'react'
import { Bar, Btn, Check, CopyButton, download, FileDrop, Note, num, Panel, Row, Seg, Slider, Split, Stat, Stats, useToolState } from '../kit'
import { DEFAULTS, toSvg, type Options, type Result } from './lib/vectorizer'

interface State extends Options {
  maxSize: number
  view: 'side' | 'svg' | 'outline'
}
const DEF: State = { ...DEFAULTS, maxSize: 640, view: 'side' }

type Sample = 'badge' | 'icon' | 'mascot'

/** Draws a demo raster logo (anti-aliased flat shapes, like a typical PNG logo). */
function drawSample(kind: Sample): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 420
  c.height = 300
  const g = c.getContext('2d')!
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, 420, 300)
  if (kind === 'badge') {
    g.fillStyle = '#1e3a8a'
    g.beginPath(); g.roundRect(30, 40, 360, 220, 46); g.fill()
    g.fillStyle = '#facc15'
    g.beginPath()
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 30 : 70
      g.lineTo(115 + r * Math.cos(a), 150 + r * Math.sin(a))
    }
    g.fill()
    g.fillStyle = '#ffffff'
    g.font = 'bold 64px Georgia, serif'
    g.fillText('Toolbox', 190, 140)
    g.fillStyle = '#f97316'
    g.beginPath(); g.ellipse(270, 196, 85, 18, 0, 0, Math.PI * 2); g.fill()
    g.fillStyle = '#1e3a8a'
    g.font = 'bold 22px sans-serif'
    g.fillText('SINCE 2024', 208, 204)
  } else if (kind === 'icon') {
    g.fillStyle = '#10b981'
    g.beginPath(); g.arc(210, 150, 120, 0, Math.PI * 2); g.fill()
    g.fillStyle = '#ffffff'
    g.beginPath(); g.arc(210, 150, 82, 0, Math.PI * 2); g.fill()
    g.fillStyle = '#0f172a'
    g.beginPath(); g.moveTo(170, 100); g.lineTo(270, 150); g.lineTo(170, 200); g.closePath(); g.fill()
    g.strokeStyle = '#10b981'
    g.lineWidth = 14
    g.lineCap = 'round'
    g.beginPath(); g.moveTo(330, 60); g.quadraticCurveTo(390, 150, 330, 240); g.stroke()
  } else {
    g.fillStyle = '#fde68a'
    g.beginPath(); g.arc(210, 160, 110, 0, Math.PI * 2); g.fill()
    g.fillStyle = '#92400e'
    for (const x of [130, 290]) { g.beginPath(); g.arc(x, 70, 40, 0, Math.PI * 2); g.fill() }
    g.fillStyle = '#fde68a'
    g.beginPath(); g.arc(210, 160, 108, 0, Math.PI * 2); g.fill()
    g.fillStyle = '#0f172a'
    for (const x of [170, 250]) { g.beginPath(); g.ellipse(x, 140, 13, 20, 0, 0, Math.PI * 2); g.fill() }
    g.fillStyle = '#ef4444'
    g.beginPath(); g.arc(210, 195, 40, 0, Math.PI); g.fill()
    g.fillStyle = '#f472b6'
    for (const x of [140, 280]) { g.beginPath(); g.ellipse(x, 185, 20, 12, 0, 0, Math.PI * 2); g.fill() }
  }
  return c
}

export default function Vectorizer() {
  const [s, set, reset] = useToolState('vectorizer', DEF)
  const [src, setSrc] = useState<{ name: string; canvas: HTMLCanvasElement }>(() => ({ name: 'badge.png', canvas: drawSample('badge') }))
  const [res, setRes] = useState<Result | null>(null)
  const [busy, setBusy] = useState(0)
  const [ms, setMs] = useState(0)
  const [err, setErr] = useState('')
  const [recolor, setRecolor] = useState<Record<number, string>>({})
  const [hidden, setHidden] = useState<Record<number, boolean>>({})
  const worker = useRef<Worker | null>(null)
  const job = useRef(0)
  const orig = useRef<HTMLCanvasElement>(null)

  // working-size pixels
  const work = useMemo(() => {
    const { canvas } = src
    const k = Math.min(1, s.maxSize / Math.max(canvas.width, canvas.height))
    const w = Math.max(1, Math.round(canvas.width * k)), h = Math.max(1, Math.round(canvas.height * k))
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const g = c.getContext('2d', { willReadFrequently: true })!
    g.imageSmoothingQuality = 'high'
    g.drawImage(canvas, 0, 0, w, h)
    return { w, h, data: g.getImageData(0, 0, w, h).data, canvas: c }
  }, [src, s.maxSize])

  useEffect(() => {
    const w = new Worker(new URL('./lib/vectorizer.worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e: MessageEvent<{ id: number; type: string; f?: number; res?: Result; ms?: number; msg?: string }>) => {
      const m = e.data
      if (m.id !== job.current) return
      if (m.type === 'progress') setBusy(Math.max(0.02, m.f ?? 0))
      else if (m.type === 'done' && m.res) {
        setRes(m.res)
        setMs(m.ms ?? 0)
        setBusy(0)
        setRecolor({})
        setHidden({})
      } else if (m.type === 'error') {
        setErr(m.msg ?? 'Tracing failed')
        setBusy(0)
      }
    }
    worker.current = w
    return () => w.terminate()
  }, [])

  const opts: Options = { colors: s.colors, error: s.error, simplify: s.simplify, corner: s.corner, minArea: s.minArea, mode: s.mode, stacked: s.stacked, alpha: s.alpha }
  const key = JSON.stringify(opts)
  useEffect(() => {
    const t = setTimeout(() => {
      if (!worker.current) return
      const id = ++job.current
      setErr('')
      setBusy(0.02)
      const px = new Uint8ClampedArray(work.data)
      worker.current.postMessage({ id, px, w: work.w, h: work.h, o: JSON.parse(key) as Options }, [px.buffer])
    }, 250)
    return () => clearTimeout(t)
  }, [work, key])

  useEffect(() => {
    const c = orig.current
    if (!c) return
    c.width = work.w
    c.height = work.h
    c.getContext('2d')!.drawImage(work.canvas, 0, 0)
  }, [work])

  const finalLayers = useMemo(() => (res ? res.layers.map((l, i) => ({ ...l, color: recolor[i] ?? l.color })).filter((_, i) => !hidden[i]) : []), [res, recolor, hidden])
  const svg = useMemo(() => (res ? toSvg(res.w, res.h, finalLayers) : ''), [res, finalLayers])
  const outlineSvg = useMemo(() => (res ? svg.replace(/<path fill="([^"]+)"/g, '<path fill="none" stroke="$1" stroke-width="0.8" vector-effect="non-scaling-stroke"').replace('<svg ', '<svg style="background:#0f172a" ') : ''), [res, svg])
  const url = useMemo(() => (svg ? URL.createObjectURL(new Blob([s.view === 'outline' ? outlineSvg : svg], { type: 'image/svg+xml' })) : ''), [svg, outlineSvg, s.view])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])

  const load = (f: File) => {
    const img = new Image()
    const u = URL.createObjectURL(f)
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.naturalWidth || 512
      c.height = img.naturalHeight || 512
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(u)
      setSrc({ name: f.name, canvas: c })
    }
    img.onerror = () => { setErr('Could not decode that image.'); URL.revokeObjectURL(u) }
    img.src = u
  }

  const name = src.name.replace(/\.[a-z0-9]+$/i, '')
  const box: React.CSSProperties = { width: '100%', height: 'auto', display: 'block', borderRadius: 8, background: 'repeating-conic-gradient(var(--panel2) 0 25%, transparent 0 50%) 0 0/16px 16px', border: '1px solid var(--line)' }

  return (
    <Split wide="right">
      <div>
        <Panel title="Image">
          <FileDrop accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" onFiles={([f]) => load(f)} label="Drop a PNG/JPG logo or click to choose" />
          <Row>
            {(['badge', 'icon', 'mascot'] as Sample[]).map((k) => (
              <Btn key={k} kind={src.name === `${k}.png` ? 'primary' : 'normal'} onClick={() => setSrc({ name: `${k}.png`, canvas: drawSample(k) })}>Demo: {k}</Btn>
            ))}
          </Row>
          <p className="muted" style={{ fontSize: 13 }}>{src.name} · {src.canvas.width}×{src.canvas.height}px, traced at {work.w}×{work.h}px</p>
        </Panel>
        <Panel title="Tracing" actions={<Btn kind="ghost" onClick={reset}>Defaults</Btn>}>
          <Slider label="Colours" value={s.colors} onChange={(colors) => set({ colors })} min={2} max={16} step={1} show={(v) => String(v)} />
          <Seg label="Output" value={s.mode} onChange={(mode) => set({ mode })} options={[['curves', 'Bézier curves'], ['polygons', 'Polygons']]} />
          {s.mode === 'curves' ? (
            <>
              <Slider label="Curve tolerance" value={s.error} onChange={(error) => set({ error })} min={0.3} max={4} step={0.1} unit=" px" show={(v) => v.toFixed(1)} />
              <Slider label="Corner angle" value={s.corner} onChange={(corner) => set({ corner })} min={25} max={135} step={5} unit="°" show={(v) => String(v)} />
            </>
          ) : (
            <Slider label="Simplify" value={s.simplify} onChange={(simplify) => set({ simplify })} min={0.2} max={4} step={0.1} unit=" px" show={(v) => v.toFixed(1)} />
          )}
          <Slider label="Ignore specks smaller than" value={s.minArea} onChange={(minArea) => set({ minArea })} min={0} max={200} step={1} unit=" px²" show={(v) => String(v)} />
          <Slider label="Working size" value={s.maxSize} onChange={(maxSize) => set({ maxSize })} min={128} max={1200} step={32} unit=" px" show={(v) => String(v)} />
          <Check label="Stack layers (no hairline gaps)" value={s.stacked} onChange={(stacked) => set({ stacked })} />
          <p className="muted" style={{ fontSize: 13 }}>Pipeline (in a Web Worker): k-means colour quantization → 3×3 despeckle → marching-squares contours per colour → corner detection → least-squares cubic Bézier fitting (or Douglas–Peucker polygons).</p>
        </Panel>
        {res && (
          <Panel title="Palette / layers">
            {res.layers.map((l, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
                <input type="checkbox" checked={!hidden[i]} onChange={(e) => setHidden({ ...hidden, [i]: !e.target.checked })} aria-label="Show layer" />
                <input type="color" value={recolor[i] ?? l.color} onChange={(e) => setRecolor({ ...recolor, [i]: e.target.value })} aria-label="Layer colour" style={{ width: 30, height: 24, padding: 0, border: 0, background: 'none' }} />
                <code style={{ fontFamily: 'var(--mono)', fontSize: 12, width: 64 }}>{recolor[i] ?? l.color}</code>
                <span style={{ flex: 1 }}><Bar value={l.area} max={res.layers[0]?.area || 1} color={recolor[i] ?? l.color} /></span>
                <span className="muted" style={{ fontSize: 12, width: 70, textAlign: 'right' }}>{l.paths} paths</span>
              </div>
            ))}
            <p className="muted" style={{ fontSize: 13 }}>Recolour or hide layers before downloading.</p>
          </Panel>
        )}
      </div>
      <div>
        <Stats>
          <Stat label="Layers" value={finalLayers.length} sub={`${res?.layers.reduce((a, l) => a + l.paths, 0) ?? 0} paths`} />
          <Stat label={s.mode === 'curves' ? 'Curve segments' : 'Vertices'} value={num(res?.nodes ?? 0, 0)} />
          <Stat label="SVG size" value={`${num(svg.length / 1024, 1)} KB`} sub={`PNG input ${src.canvas.width}×${src.canvas.height}`} tone="accent" />
          <Stat label="Trace time" value={busy ? `${Math.round(busy * 100)} %` : `${num(ms, 0)} ms`} sub={busy ? 'working…' : 'in Web Worker'} />
        </Stats>
        {err && <Note tone="err">{err}</Note>}
        <Panel
          title="Result"
          actions={
            <>
              <Seg label="View" value={s.view} onChange={(view) => set({ view })} options={[['side', 'Side by side'], ['svg', 'SVG only'], ['outline', 'Outlines']]} />
              <Btn kind="primary" disabled={!svg} onClick={() => download(`${name}.svg`, svg, 'image/svg+xml')}>⬇ SVG</Btn>
              <CopyButton text={svg} label="Copy SVG" />
            </>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: s.view === 'side' ? 'repeat(auto-fit, minmax(240px, 1fr))' : '1fr', gap: 12 }}>
            <div style={{ display: s.view === 'side' ? 'block' : 'none' }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Original raster</div>
              <canvas ref={orig} style={box} />
            </div>
            <div style={{ position: 'relative' }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Vector (SVG){busy ? ' — updating…' : ''}</div>
              {url ? <img src={url} alt="Traced SVG" style={{ ...box, opacity: busy ? 0.6 : 1 }} /> : <div className="k-chart empty" style={{ height: 200 }}>Tracing…</div>}
            </div>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>Tip: logos with few flat colours trace best. Raise “Colours” for illustrations, lower the tolerance for more detail, raise it for smaller files.</p>
        </Panel>
      </div>
    </Split>
  )
}
