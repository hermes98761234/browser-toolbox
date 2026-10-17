import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, CsvButton, FileDrop, Note, Panel, Row, Seg, Slider, Split, Stat, Stats, Table, Btn, num, pct, useToolState } from '../kit'
import { applyOverlay, chanStats, histogram, verdict, type Hist, type Overlay } from './lib/histogram-analyzer'

interface State { overlay: Overlay; view: 'rgb' | 'luma' | 'parade'; log: boolean; shadow: number; highlight: number; zebra: number; animate: boolean }
const DEF: State = { overlay: 'clip', view: 'rgb', log: false, shadow: 2, highlight: 253, zebra: 95, animate: true }
const MAXPX = 900

/** A backlit sunset scene: blown sun and sky, silhouetted hills, a meadow in the midtones. */
function sampleImage(): ImageData {
  const w = 720, h = 460
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const ctx = c.getContext('2d')!
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.62)
  sky.addColorStop(0, '#2b4c8c'); sky.addColorStop(0.55, '#f08a4b'); sky.addColorStop(1, '#ffd38a')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, h)
  const sun = ctx.createRadialGradient(470, 250, 10, 470, 250, 150)
  sun.addColorStop(0, '#ffffff'); sun.addColorStop(0.25, '#fffef0'); sun.addColorStop(0.5, 'rgba(255,230,160,0.6)'); sun.addColorStop(1, 'rgba(255,200,120,0)')
  ctx.fillStyle = sun
  ctx.fillRect(0, 0, w, h)
  const hills = (base: number, amp: number, f: number, col: string) => {
    ctx.beginPath(); ctx.moveTo(0, h)
    for (let x = 0; x <= w; x += 6) ctx.lineTo(x, base - amp * (Math.sin(x * f) * 0.6 + Math.sin(x * f * 2.7 + 1) * 0.4))
    ctx.lineTo(w, h); ctx.closePath(); ctx.fillStyle = col; ctx.fill()
  }
  hills(300, 40, 0.008, '#6b4a6e')
  hills(330, 30, 0.013, '#3a2a40')
  const meadow = ctx.createLinearGradient(0, 340, 0, h)
  meadow.addColorStop(0, '#5f7a33'); meadow.addColorStop(1, '#1d2a10')
  ctx.fillStyle = meadow
  ctx.fillRect(0, 350, w, h - 350)
  hills(360, 18, 0.02, '#4d6a2a')
  ctx.fillStyle = '#020202' // tree silhouettes: crushed blacks
  for (const [x, s] of [[90, 1], [140, 0.7], [600, 1.2], [650, 0.8]] as const) {
    ctx.fillRect(x - 4 * s, 330 - 20 * s, 8 * s, 90 * s)
    ctx.beginPath(); ctx.ellipse(x, 300 - 30 * s, 34 * s, 50 * s, 0, 0, Math.PI * 2); ctx.fill()
  }
  const im = ctx.getImageData(0, 0, w, h)
  for (let i = 0; i < im.data.length; i += 4) { // a little sensor noise
    const n = (Math.random() - 0.5) * 6
    for (let k = 0; k < 3; k++) { const v = im.data[i + k]; if (v > 3 && v < 252) im.data[i + k] = v + n }
  }
  return im
}

function HistChart({ h, view, log, shadow, highlight }: { h: Hist; view: State['view']; log: boolean; shadow: number; highlight: number }) {
  const H = 140
  const tf = (v: number) => (log ? Math.log1p(v) : v)
  const chans: [string, Uint32Array, string][] = view === 'luma' ? [['Luma', h.l, 'var(--fg)']] : [['Red', h.r, '#ef4444'], ['Green', h.g, '#22c55e'], ['Blue', h.b, '#3b82f6']]
  // ignore the extreme bins when scaling so a clipped spike does not flatten everything
  const peak = (a: Uint32Array) => {
    const v = Array.from(a.slice(1, 255), tf).sort((x, y) => x - y)
    return Math.max(1e-9, v[Math.floor(v.length * 0.985)] * 1.15)
  }
  const path = (a: Uint32Array, m: number, y0: number, hh: number) => {
    let d = `M0,${y0 + hh}`
    for (let v = 0; v < 256; v++) d += `L${v},${(y0 + hh - Math.min(1, tf(a[v]) / m) * hh).toFixed(2)}L${v + 1},${(y0 + hh - Math.min(1, tf(a[v]) / m) * hh).toFixed(2)}`
    return d + `L256,${y0 + hh}Z`
  }
  const parade = view === 'parade'
  const rows = parade ? chans.length : 1
  const shared = Math.max(...chans.map(([, a]) => peak(a)))
  return (
    <svg viewBox={`0 0 256 ${H * rows}`} preserveAspectRatio="none" style={{ width: '100%', height: parade ? 300 : 200, display: 'block', background: 'var(--panel2)', borderRadius: 8 }} role="img" aria-label="Histogram">
      <rect x={0} y={0} width={shadow + 1} height={H * rows} fill="#3b82f6" opacity={0.18} />
      <rect x={highlight} y={0} width={256 - highlight} height={H * rows} fill="#ef4444" opacity={0.18} />
      {[64, 128, 192].map((x) => <line key={x} x1={x} x2={x} y1={0} y2={H * rows} stroke="var(--line)" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />)}
      {chans.map(([n, a, c], i) => (
        <path key={n} d={path(a, parade ? peak(a) : shared, parade ? i * H : 0, H - 4)} fill={c} opacity={view === 'luma' ? 0.6 : parade ? 0.8 : 0.5} />
      ))}
    </svg>
  )
}

export default function HistogramAnalyzer() {
  const [s, set, reset] = useToolState('histogram-analyzer', DEF)
  const [src, setSrc] = useState<{ name: string; data: ImageData } | null>(() => (typeof document === 'undefined' ? null : { name: 'Sample: backlit sunset', data: sampleImage() }))
  const [err, setErr] = useState('')
  const canvas = useRef<HTMLCanvasElement>(null)
  const [phase, setPhase] = useState(0)

  const load = async (f: File) => {
    setErr('')
    try {
      const bmp = await createImageBitmap(f)
      const k = Math.min(1, MAXPX / Math.max(bmp.width, bmp.height))
      const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k))
      const c = document.createElement('canvas')
      c.width = w; c.height = h
      const ctx = c.getContext('2d')!
      ctx.drawImage(bmp, 0, 0, w, h)
      setSrc({ name: `${f.name} (${bmp.width}×${bmp.height}${k < 1 ? `, analysed at ${w}×${h}` : ''})`, data: ctx.getImageData(0, 0, w, h) })
    } catch {
      setErr('Could not decode that file as an image.')
    }
  }

  const hist = useMemo(() => (src ? histogram(src.data.data) : null), [src])
  const st = useMemo(() => hist && {
    r: chanStats(hist.r, s.shadow, s.highlight), g: chanStats(hist.g, s.shadow, s.highlight), b: chanStats(hist.b, s.shadow, s.highlight), l: chanStats(hist.l, s.shadow, s.highlight),
  }, [hist, s.shadow, s.highlight])

  // clipped pixel share (any channel ≥ highlight / all channels ≤ shadow)
  const clip = useMemo(() => {
    if (!src) return { hi: 0, lo: 0 }
    const d = src.data.data
    let hi = 0, lo = 0, n = 0
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue
      n++
      if (d[i] >= s.highlight || d[i + 1] >= s.highlight || d[i + 2] >= s.highlight) hi++
      else if (d[i] <= s.shadow && d[i + 1] <= s.shadow && d[i + 2] <= s.shadow) lo++
    }
    return { hi: hi / (n || 1), lo: lo / (n || 1) }
  }, [src, s.shadow, s.highlight])

  useEffect(() => {
    if (s.overlay !== 'zebra' || !s.animate) return
    const id = setInterval(() => setPhase((p) => (p + 1) % 8), 90)
    return () => clearInterval(id)
  }, [s.overlay, s.animate])

  useEffect(() => {
    const c = canvas.current
    if (!c || !src) return
    c.width = src.data.width; c.height = src.data.height
    const out = new ImageData(src.data.width, src.data.height)
    applyOverlay(src.data.data, out.data, src.data.width, s.overlay, s.shadow, s.highlight, s.zebra, phase)
    c.getContext('2d')!.putImageData(out, 0, 0)
  }, [src, s.overlay, s.shadow, s.highlight, s.zebra, phase])

  const v = st ? verdict({ ...st.l, high: clip.hi, low: clip.lo }) : null
  const row = (n: string, c: ReturnType<typeof chanStats>) => [n, num(c.mean, 1), c.median, num(c.sd, 1), `${c.min}–${c.max}`, `${c.p1}–${c.p99}`, pct(c.low, 2), pct(c.high, 2)]

  return (
    <Split wide="left">
      <div>
        <Panel title="Preview" actions={<Seg value={s.overlay} onChange={(overlay) => set({ overlay })} options={[['none', 'Original'], ['clip', 'Clipping'], ['zebra', 'Zebra'], ['false', 'False color'], ['luma', 'Luma']]} label="Overlay" />}>
          <canvas ref={canvas} style={{ width: '100%', height: 'auto', borderRadius: 8, display: 'block', background: 'var(--panel2)' }} aria-label="Image preview with overlay" />
          <p className="muted" style={{ fontSize: 13, margin: '6px 0' }}>
            {src?.name}. {s.overlay === 'clip' && 'Red = a channel is blown (≥ highlight limit), blue = all channels crushed (≤ shadow limit).'}
            {s.overlay === 'zebra' && `Stripes mark pixels at or above ${s.zebra}% IRE luma, like a camera's zebra display.`}
            {s.overlay === 'false' && 'Purple/blue = deep shadows, grey = shadows, green ≈ 18% grey (40–50 IRE), pink ≈ skin tones, yellow = bright, red = clipping.'}
            {s.overlay === 'luma' && 'Rec. 709 luminance only: judge tones without colour distracting you.'}
          </p>
          <FileDrop accept="image/*" onFiles={(f) => void load(f[0])} label="Drop a photo (JPG, PNG, WebP…) or click to choose — nothing is uploaded" />
          {err && <Note tone="err">{err}</Note>}
        </Panel>
      </div>
      <div>
        {st && v && (
          <>
            <Stats>
              <Stat label="Mean luma" value={num(st.l.mean, 0)} sub={`${num((st.l.mean / 255) * 100, 0)}% IRE`} />
              <Stat label="Highlights clipped" value={pct(clip.hi, 1)} tone={clip.hi > 0.02 ? 'bad' : 'good'} />
              <Stat label="Shadows crushed" value={pct(clip.lo, 1)} tone={clip.lo > 0.05 ? 'bad' : 'good'} />
              <Stat label="Tonal range (1–99%)" value={`${st.l.p1}–${st.l.p99}`} sub={`${num(Math.log2((st.l.p99 + 1) / (st.l.p1 + 1)), 1)} stops (gamma-encoded)`} />
            </Stats>
            <Note tone={v.tone}>{v.text}</Note>
          </>
        )}
        <Panel title="Histogram" actions={<Row><Seg value={s.view} onChange={(view) => set({ view })} options={[['rgb', 'RGB'], ['luma', 'Luma'], ['parade', 'Parade']]} label="Histogram view" /><Check label="Log" value={s.log} onChange={(log) => set({ log })} /></Row>}>
          {hist ? <HistChart h={hist} view={s.view} log={s.log} shadow={s.shadow} highlight={s.highlight} /> : <p className="muted">Loading…</p>}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }} className="muted"><span>0 · blacks</span><span>shadows</span><span>midtones</span><span>highlights</span><span>whites · 255</span></div>
        </Panel>
        <Panel title="Thresholds" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Slider label="Shadow clip at or below" value={s.shadow} onChange={(shadow) => set({ shadow })} min={0} max={30} />
          <Slider label="Highlight clip at or above" value={s.highlight} onChange={(highlight) => set({ highlight })} min={220} max={255} />
          <Slider label="Zebra level" value={s.zebra} onChange={(zebra) => set({ zebra })} min={50} max={100} unit="% IRE" />
          {s.overlay === 'zebra' && <Check label="Animate zebra stripes" value={s.animate} onChange={(animate) => set({ animate })} />}
        </Panel>
        {st && hist && (
          <Panel title="Channel statistics" actions={<CsvButton name="histogram.csv" rows={() => [['Value', 'Red', 'Green', 'Blue', 'Luma'], ...Array.from({ length: 256 }, (_, i) => [i, hist.r[i], hist.g[i], hist.b[i], hist.l[i]])]} />}>
            <Table head={['Channel', 'Mean', 'Median', 'SD', 'Min–max', '1–99%', 'Shadow clip', 'Highlight clip']} rows={[row('Red', st.r), row('Green', st.g), row('Blue', st.b), row('Luma', st.l)]} />
            <p className="muted" style={{ fontSize: 13 }}>{num(hist.n, 0)} pixels analysed. A single clipped colour channel (often red in sunsets) loses detail even when luma looks fine — check the RGB/Parade view.</p>
          </Panel>
        )}
      </div>
    </Split>
  )
}
