import { useEffect, useMemo, useRef, useState } from 'react'
import { Area, Btn, Check, download, FileDrop, Note, Num, Panel, Row, Seg, Select, Slider, Split, Txt, uid, useToolState } from '../kit'
import { bounds, crossings, hit, snap, targets, TILE, tileName, tilesOf, wrapText, type Ratio } from './lib/carousel-post-maker'
import { makeZip } from './lib/image-compressor'

type Kind = 'text' | 'image' | 'rect' | 'ellipse'
interface Layer {
  id: string; kind: Kind; name: string; x: number; y: number; w: number; h: number; rot: number; opacity: number
  text: string; font: string; size: number; weight: number; color: string; align: 'left' | 'center' | 'right'; lineH: number
  fill: string; stroke: string; strokeW: number; radius: number; src: string
}
interface Bg { kind: 'solid' | 'linear'; c1: string; c2: string; angle: number }
interface State { n: number; ratio: Ratio; bg: Bg; layers: Layer[]; snap: boolean; guides: boolean; margin: number; prefix: string }

const FONTS: [string, string][] = [['system-ui, sans-serif', 'System sans'], ['Georgia, serif', 'Georgia'], ['"Trebuchet MS", sans-serif', 'Trebuchet'], ['Impact, "Arial Black", sans-serif', 'Impact'], ['"Courier New", monospace', 'Courier']]
const base: Omit<Layer, 'id' | 'kind' | 'name' | 'x' | 'y' | 'w' | 'h'> = { rot: 0, opacity: 1, text: '', font: FONTS[0][0], size: 72, weight: 700, color: '#ffffff', align: 'left', lineH: 1.2, fill: '#ffffff', stroke: '#000000', strokeW: 0, radius: 0, src: '' }
const L = (p: Partial<Layer> & Pick<Layer, 'kind' | 'x' | 'y' | 'w' | 'h'>): Layer => ({ ...base, id: uid(), name: p.kind, ...p })

const DEMO: Layer[] = [
  L({ kind: 'ellipse', name: 'Sun (crosses seam)', x: 760, y: 180, w: 640, h: 640, fill: '#fde68a', opacity: 0.9 }),
  L({ kind: 'text', name: 'Kicker', x: 90, y: 120, w: 700, h: 60, text: 'MORNING ROUTINE', size: 40, weight: 600, color: '#fef3c7' }),
  L({ kind: 'text', name: 'Title', x: 90, y: 200, w: 640, h: 300, text: '5 habits for calmer mornings', size: 104, color: '#ffffff', lineH: 1.05 }),
  L({ kind: 'text', name: 'Swipe hint', x: 90, y: 900, w: 500, h: 60, text: 'Swipe →', size: 44, weight: 500, color: '#fef3c7' }),
  L({ kind: 'rect', name: 'Card 1', x: 1180 + 340, y: 140, w: 600, h: 800, fill: '#ffffff', radius: 36, opacity: 0.95 }),
  L({ kind: 'text', name: 'Tip 1', x: 1180 + 390, y: 200, w: 500, h: 600, text: '1. Wake at the same time\n\n2. Water before coffee\n\n3. Ten minutes of daylight', size: 50, weight: 600, color: '#7c2d12', lineH: 1.25 }),
  L({ kind: 'rect', name: 'Band (crosses seam)', x: 1880, y: 960, w: 560, h: 44, fill: '#fde68a', radius: 22, opacity: 0.9 }),
  L({ kind: 'text', name: 'Tip 4–5', x: 2260, y: 220, w: 760, h: 600, text: '4. Plan one priority\n\n5. Phone stays off\nuntil breakfast', size: 64, weight: 700, color: '#ffffff', lineH: 1.2 }),
  L({ kind: 'text', name: 'CTA', x: 2260, y: 860, w: 760, h: 80, text: 'Save this for tomorrow ✦', size: 48, weight: 600, color: '#fef3c7' }),
]
const DEF: State = { n: 3, ratio: '1:1', bg: { kind: 'linear', c1: '#f97316', c2: '#be185d', angle: 0 }, layers: DEMO, snap: true, guides: true, margin: 60, prefix: 'carousel' }

const measureCtx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null
const fontOf = (l: Layer) => `${l.weight} ${l.size}px ${l.font}`
function textLines(l: Layer): string[] {
  if (!measureCtx) return [l.text]
  measureCtx.font = fontOf(l)
  return wrapText(l.text, l.w, (s) => measureCtx.measureText(s).width)
}
/** Text boxes grow with their content. */
const boxOf = (l: Layer) => (l.kind === 'text' ? { ...l, h: Math.max(l.size * l.lineH, textLines(l).length * l.size * l.lineH) } : l)

const images = new Map<string, HTMLImageElement>()
function img(src: string, onLoad: () => void): HTMLImageElement | null {
  if (!src) return null
  let im = images.get(src)
  if (!im) {
    im = new Image()
    im.onload = onLoad
    im.src = src
    images.set(src, im)
  }
  return im.complete && im.naturalWidth ? im : null
}

function drawScene(g: CanvasRenderingContext2D, s: State, W: number, H: number, redraw: () => void) {
  const { bg } = s
  if (bg.kind === 'solid') g.fillStyle = bg.c1
  else {
    const a = (bg.angle * Math.PI) / 180, cx = W / 2, cy = H / 2, r = (Math.abs(Math.cos(a)) * W + Math.abs(Math.sin(a)) * H) / 2
    const gr = g.createLinearGradient(cx - Math.cos(a) * r, cy - Math.sin(a) * r, cx + Math.cos(a) * r, cy + Math.sin(a) * r)
    gr.addColorStop(0, bg.c1)
    gr.addColorStop(1, bg.c2)
    g.fillStyle = gr
  }
  g.fillRect(0, 0, W, H)
  for (const l0 of s.layers) {
    const l = boxOf(l0)
    g.save()
    g.globalAlpha = l.opacity
    g.translate(l.x + l.w / 2, l.y + l.h / 2)
    g.rotate((l.rot * Math.PI) / 180)
    g.translate(-l.w / 2, -l.h / 2)
    if (l.kind === 'rect' || l.kind === 'ellipse') {
      g.beginPath()
      if (l.kind === 'rect') g.roundRect(0, 0, l.w, l.h, Math.min(l.radius, l.w / 2, l.h / 2))
      else g.ellipse(l.w / 2, l.h / 2, l.w / 2, l.h / 2, 0, 0, Math.PI * 2)
      g.fillStyle = l.fill
      g.fill()
      if (l.strokeW > 0) {
        g.lineWidth = l.strokeW
        g.strokeStyle = l.stroke
        g.stroke()
      }
    } else if (l.kind === 'image') {
      const im = img(l.src, redraw)
      g.beginPath()
      g.roundRect(0, 0, l.w, l.h, Math.min(l.radius, l.w / 2, l.h / 2))
      g.clip()
      if (im) {
        const sc = Math.max(l.w / im.naturalWidth, l.h / im.naturalHeight)
        const sw = l.w / sc, sh = l.h / sc
        g.drawImage(im, (im.naturalWidth - sw) / 2, (im.naturalHeight - sh) / 2, sw, sh, 0, 0, l.w, l.h)
      } else {
        g.fillStyle = '#94a3b855'
        g.fillRect(0, 0, l.w, l.h)
      }
    } else {
      g.font = fontOf(l)
      g.fillStyle = l.color
      g.textBaseline = 'top'
      g.textAlign = l.align
      const x = l.align === 'left' ? 0 : l.align === 'center' ? l.w / 2 : l.w
      textLines(l).forEach((t, i) => g.fillText(t, x, i * l.size * l.lineH + (l.size * (l.lineH - 1)) / 2))
    }
    g.restore()
  }
}

/** Original demo photo: a painted sunrise over hills. */
function demoPhoto(): string {
  const c = document.createElement('canvas')
  c.width = 800
  c.height = 600
  const g = c.getContext('2d')!
  const gr = g.createLinearGradient(0, 0, 0, 600)
  gr.addColorStop(0, '#fed7aa')
  gr.addColorStop(1, '#fb7185')
  g.fillStyle = gr
  g.fillRect(0, 0, 800, 600)
  g.fillStyle = '#fff7ed'
  g.beginPath()
  g.arc(520, 330, 90, 0, 7)
  g.fill()
  ;['#9f1239', '#881337', '#4c0519'].forEach((col, i) => {
    g.fillStyle = col
    g.beginPath()
    g.moveTo(0, 600)
    for (let x = 0; x <= 800; x += 20) g.lineTo(x, 380 + i * 70 + Math.sin(x / (110 - i * 20) + i * 2) * 35)
    g.lineTo(800, 600)
    g.fill()
  })
  return c.toDataURL('image/jpeg', 0.85)
}

export default function CarouselPostMaker() {
  const [s, set, reset] = useToolState<State>('carousel-post-maker', DEF)
  const [sel, setSel] = useState<string | null>(null)
  const [guide, setGuide] = useState<{ gx: number | null; gy: number | null }>({ gx: null, gy: null })
  const [busy, setBusy] = useState(false)
  const [, bump] = useState(0)
  const cv = useRef<HTMLCanvasElement>(null)
  const [tw, th] = TILE[s.ratio]
  const n = Math.max(1, Math.min(10, s.n))
  const W = n * tw, H = th
  const K = Math.min(0.5, 1800 / W) // preview scale
  const layer = s.layers.find((l) => l.id === sel) ?? null
  const redraw = () => bump((x) => x + 1)
  const edit = (id: string, p: Partial<Layer>) => set((st) => ({ ...st, layers: st.layers.map((l) => (l.id === id ? { ...l, ...p } : l)) }))

  const warnings = useMemo(() => s.layers.filter((l) => l.kind === 'text' && crossings(boxOf(l), n, tw).length), [s.layers, n, tw])

  useEffect(() => {
    const c = cv.current
    if (!c) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    c.width = Math.round(W * K * dpr)
    c.height = Math.round(H * K * dpr)
    const g = c.getContext('2d')!
    g.setTransform(K * dpr, 0, 0, K * dpr, 0, 0)
    drawScene(g, s, W, H, redraw)
    if (!s.guides && !sel) return
    const px = 1 / K
    if (s.guides) {
      g.lineWidth = 2 * px
      for (let i = 0; i < n; i++) {
        g.setLineDash([10 * px, 8 * px])
        g.strokeStyle = 'rgba(255,255,255,.75)'
        g.strokeRect(i * tw + s.margin, s.margin, tw - 2 * s.margin, th - 2 * s.margin)
        g.setLineDash([])
        g.fillStyle = 'rgba(0,0,0,.45)'
        g.fillRect(i * tw + 12 * px, 12 * px, 46 * px, 30 * px)
        g.fillStyle = '#fff'
        g.font = `${18 * px}px system-ui`
        g.textBaseline = 'middle'
        g.textAlign = 'center'
        g.fillText(`${i + 1}/${n}`, i * tw + 35 * px, 27 * px)
      }
      for (let i = 1; i < n; i++) {
        g.fillStyle = 'rgba(14,165,233,.18)'
        g.fillRect(i * tw - 24 * px, 0, 48 * px, th)
        g.strokeStyle = '#0ea5e9'
        g.lineWidth = 3 * px
        g.beginPath()
        g.moveTo(i * tw, 0)
        g.lineTo(i * tw, th)
        g.stroke()
      }
      for (const l of warnings) {
        const b = bounds(boxOf(l))
        g.strokeStyle = '#f59e0b'
        g.lineWidth = 3 * px
        g.setLineDash([6 * px, 5 * px])
        g.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0)
        g.setLineDash([])
      }
    }
    if (layer) {
      const b = boxOf(layer)
      g.save()
      g.translate(b.x + b.w / 2, b.y + b.h / 2)
      g.rotate((b.rot * Math.PI) / 180)
      g.strokeStyle = '#6366f1'
      g.lineWidth = 3 * px
      g.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h)
      g.fillStyle = '#6366f1'
      g.fillRect(b.w / 2 - 9 * px, b.h / 2 - 9 * px, 18 * px, 18 * px)
      g.restore()
    }
    g.strokeStyle = '#ec4899'
    g.lineWidth = 2 * px
    if (guide.gx !== null) { g.beginPath(); g.moveTo(guide.gx, 0); g.lineTo(guide.gx, H); g.stroke() }
    if (guide.gy !== null) { g.beginPath(); g.moveTo(0, guide.gy); g.lineTo(W, guide.gy); g.stroke() }
  })

  const drag = useRef<{ id: string; mode: 'move' | 'size'; x: number; y: number; ox: number; oy: number; ow: number; oh: number } | null>(null)
  const pt = (e: { clientX: number; clientY: number }) => {
    const r = cv.current!.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H]
  }
  const onDown = (e: React.PointerEvent) => {
    const [x, y] = pt(e)
    const px = 1 / K
    if (layer) {
      const b = boxOf(layer)
      const a = (b.rot * Math.PI) / 180
      const hx = b.x + b.w / 2 + (b.w / 2) * Math.cos(a) - (b.h / 2) * Math.sin(a)
      const hy = b.y + b.h / 2 + (b.w / 2) * Math.sin(a) + (b.h / 2) * Math.cos(a)
      if (Math.hypot(x - hx, y - hy) < 22 * px) {
        drag.current = { id: layer.id, mode: 'size', x, y, ox: b.x, oy: b.y, ow: b.w, oh: b.h }
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
        return
      }
    }
    const top = [...s.layers].reverse().find((l) => hit(boxOf(l), x, y))
    setSel(top?.id ?? null)
    if (top) {
      drag.current = { id: top.id, mode: 'move', x, y, ox: top.x, oy: top.y, ow: top.w, oh: top.h }
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    }
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const [x, y] = pt(e)
    if (d.mode === 'size') {
      const l = s.layers.find((q) => q.id === d.id)!
      const w = Math.max(20, d.ow + (x - d.x)), h = Math.max(20, d.oh + (y - d.y))
      edit(d.id, l.kind === 'text' ? { w } : e.shiftKey || l.kind === 'image' ? { w, h: (w * d.oh) / d.ow } : { w, h })
      return
    }
    let nx = d.ox + x - d.x, ny = d.oy + y - d.y
    if (s.snap && !e.altKey) {
      const l = boxOf({ ...s.layers.find((q) => q.id === d.id)!, x: nx, y: ny })
      const t = targets(n, tw, th, s.margin)
      const r = snap(nx, ny, l.w, l.h, t.tx, t.ty, 10 / K)
      nx = r.x
      ny = r.y
      setGuide({ gx: r.gx, gy: r.gy })
    }
    edit(d.id, { x: Math.round(nx), y: Math.round(ny) })
  }
  const onUp = () => {
    drag.current = null
    setGuide({ gx: null, gy: null })
  }
  const onKey = (e: React.KeyboardEvent) => {
    if (!layer || (e.target as HTMLElement).tagName !== 'CANVAS') return
    const st = e.shiftKey ? 10 : 1
    const mv: Record<string, [number, number]> = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] }
    if (mv[e.key]) {
      e.preventDefault()
      edit(layer.id, { x: layer.x + mv[e.key][0], y: layer.y + mv[e.key][1] })
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      set({ layers: s.layers.filter((l) => l.id !== layer.id) })
      setSel(null)
    }
  }

  const add = (kind: Kind, extra: Partial<Layer> = {}) => {
    const cx = Math.max(0, Math.min(n - 1, 1)) * tw
    const l = L({ kind, name: kind === 'text' ? 'Text' : kind === 'image' ? 'Image' : kind === 'rect' ? 'Rectangle' : 'Ellipse', x: cx + 200, y: 300, w: kind === 'text' ? 600 : 400, h: kind === 'text' ? 100 : 300, fill: '#0ea5e9', text: 'New text', ...extra })
    set({ layers: [...s.layers, l] })
    setSel(l.id)
  }
  const order = (id: string, d: number) => {
    const a = [...s.layers]
    const i = a.findIndex((l) => l.id === id)
    const [x] = a.splice(i, 1)
    a.splice(Math.max(0, Math.min(a.length, i + d)), 0, x)
    set({ layers: a })
  }
  const tileCanvas = (i: number) => {
    const c = document.createElement('canvas')
    c.width = tw
    c.height = th
    const g = c.getContext('2d')!
    g.translate(-i * tw, 0)
    drawScene(g, s, W, H, () => {})
    return c
  }
  const blob = (c: HTMLCanvasElement) => new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'))
  const exportZip = async () => {
    setBusy(true)
    const files = []
    for (let i = 0; i < n; i++) files.push({ name: tileName(s.prefix, i, n), data: new Uint8Array(await (await blob(tileCanvas(i))).arrayBuffer()) })
    const zip = makeZip(files)
    download(`${s.prefix || 'carousel'}-${n}-slides.zip`, new Blob([zip.slice().buffer], { type: 'application/zip' }), 'application/zip')
    setBusy(false)
  }
  const exportPano = async () => {
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    drawScene(c.getContext('2d')!, s, W, H, () => {})
    download(`${s.prefix || 'carousel'}-panorama.png`, await blob(c), 'image/png')
  }

  return (
    <div>
      <Panel
        title={`Canvas · ${n} × ${tw}×${th} = ${W}×${H} px`}
        actions={
          <>
            <Btn onClick={() => add('text')}>+ Text</Btn>
            <Btn onClick={() => add('rect')}>+ Rect</Btn>
            <Btn onClick={() => add('ellipse')}>+ Ellipse</Btn>
            <Btn onClick={() => add('image', { src: demoPhoto(), radius: 24 })}>+ Demo photo</Btn>
            <Btn kind="primary" onClick={() => void exportZip()} disabled={busy}>{busy ? 'Zipping…' : `⬇ ${n} PNGs (.zip)`}</Btn>
            <Btn onClick={() => void exportPano()}>⬇ Panorama</Btn>
          </>
        }
      >
        <div style={{ overflowX: 'auto' }}>
          <canvas ref={cv} tabIndex={0} onKeyDown={onKey} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
            style={{ width: '100%', minWidth: Math.min(900, n * 300), display: 'block', touchAction: 'none', borderRadius: 6, cursor: 'move', outline: 'none' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${n}, 1fr)`, gap: 6, marginTop: 8 }}>
          {Array.from({ length: n }, (_, i) => (
            <button key={i} type="button" className="k-btn ghost" style={{ fontSize: 12 }} onClick={async () => download(tileName(s.prefix, i, n), await blob(tileCanvas(i)), 'image/png')}>⬇ Slide {i + 1}</button>
          ))}
        </div>
        {warnings.length > 0 && s.guides && <Note tone="warn">Text cut by a seam (orange): {warnings.map((l) => l.name).join(', ')}. Shapes and photos across seams look seamless when swiping; text split between slides is hard to read.</Note>}
        <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>Drag to move (Alt = no snapping) · corner handle resizes (Shift keeps ratio) · arrows nudge (Shift ×10) · Delete removes. Blue bands mark seams; dashed boxes are safe margins.</p>
      </Panel>
      <Split>
        <div>
          <Panel title="Carousel">
            <Row>
              <Num label="Slides" value={s.n} onChange={(v) => set({ n: Math.max(1, Math.min(10, Math.round(v))) })} min={1} max={10} step={1} />
              <Select label="Tile ratio" value={s.ratio} onChange={(ratio) => set({ ratio })} options={[['1:1', 'Square 1080×1080'], ['4:5', 'Portrait 1080×1350'], ['3:4', 'Tall 1080×1440']]} />
            </Row>
            <Row>
              <Seg value={s.bg.kind} onChange={(kind) => set({ bg: { ...s.bg, kind } })} options={[['solid', 'Solid'], ['linear', 'Gradient across all']]} />
              <label className="k-field"><span className="k-label">Colour 1</span><input type="color" value={s.bg.c1} onChange={(e) => set({ bg: { ...s.bg, c1: e.target.value } })} /></label>
              {s.bg.kind === 'linear' && <label className="k-field"><span className="k-label">Colour 2</span><input type="color" value={s.bg.c2} onChange={(e) => set({ bg: { ...s.bg, c2: e.target.value } })} /></label>}
            </Row>
            {s.bg.kind === 'linear' && <Slider label="Gradient angle" value={s.bg.angle} onChange={(angle) => set({ bg: { ...s.bg, angle } })} min={0} max={360} unit="°" show={String} />}
            <Row>
              <Check label="Snap" value={s.snap} onChange={(v) => set({ snap: v })} />
              <Check label="Guides" value={s.guides} onChange={(guides) => set({ guides })} />
              <Num label="Safe margin" value={s.margin} onChange={(margin) => set({ margin })} unit="px" min={0} max={300} step={1} />
            </Row>
            <Txt label="File name prefix" value={s.prefix} onChange={(prefix) => set({ prefix })} />
            <Btn kind="ghost" onClick={() => { reset(); setSel(null) }}>Reset to demo</Btn>
          </Panel>
          <Panel title={`Layers (${s.layers.length})`}>
            {[...s.layers].reverse().map((l) => {
              const tiles = tilesOf(boxOf(l), n, tw)
              return (
                <div key={l.id} onClick={() => setSel(l.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', borderRadius: 8, cursor: 'pointer', background: sel === l.id ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : undefined }}>
                  <span style={{ width: 18 }}>{l.kind === 'text' ? 'T' : l.kind === 'image' ? '🖼' : l.kind === 'rect' ? '▭' : '◯'}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</span>
                  <span className="muted" style={{ fontSize: 12 }}>{tiles.length ? `slide ${tiles.map((t) => t + 1).join('+')}` : 'off-canvas'}</span>
                  <Btn kind="ghost" onClick={() => order(l.id, 1)} title="Bring forward">↑</Btn>
                  <Btn kind="ghost" onClick={() => order(l.id, -1)} title="Send backward">↓</Btn>
                </div>
              )
            })}
          </Panel>
        </div>
        <Panel title={layer ? `Selected: ${layer.name}` : 'Properties'} actions={layer && <><Btn onClick={() => { const c = { ...layer, id: uid(), x: layer.x + 40, y: layer.y + 40, name: layer.name + ' copy' }; set({ layers: [...s.layers, c] }); setSel(c.id) }}>Duplicate</Btn><Btn kind="danger" onClick={() => { set({ layers: s.layers.filter((l) => l.id !== layer.id) }); setSel(null) }}>Delete</Btn></>}>
          {!layer ? <Note>Click a layer on the canvas or in the list to edit it.</Note> : (
            <>
              <Txt label="Name" value={layer.name} onChange={(name) => edit(layer.id, { name })} />
              <Row>
                <Num label="X" value={layer.x} onChange={(x) => edit(layer.id, { x })} step={1} />
                <Num label="Y" value={layer.y} onChange={(y) => edit(layer.id, { y })} step={1} />
                <Num label="Width" value={layer.w} onChange={(w) => edit(layer.id, { w: Math.max(10, w) })} min={10} step={1} />
                {layer.kind !== 'text' && <Num label="Height" value={layer.h} onChange={(h) => edit(layer.id, { h: Math.max(10, h) })} min={10} step={1} />}
              </Row>
              <Row>
                <Slider label="Rotation" value={layer.rot} onChange={(rot) => edit(layer.id, { rot })} min={-180} max={180} unit="°" show={String} />
                <Slider label="Opacity" value={layer.opacity} onChange={(opacity) => edit(layer.id, { opacity })} min={0} max={1} step={0.05} show={(v) => `${Math.round(v * 100)}%`} />
              </Row>
              {layer.kind === 'text' && (
                <>
                  <Area label="Text" value={layer.text} onChange={(text) => edit(layer.id, { text })} rows={4} />
                  <Row>
                    <Select label="Font" value={layer.font} onChange={(font) => edit(layer.id, { font })} options={FONTS} />
                    <Num label="Size" value={layer.size} onChange={(size) => edit(layer.id, { size: Math.max(6, size) })} unit="px" min={6} step={1} />
                    <Select label="Weight" value={layer.weight} onChange={(weight) => edit(layer.id, { weight })} options={[[400, 'Regular'], [500, 'Medium'], [600, 'Semibold'], [700, 'Bold'], [900, 'Black']]} />
                  </Row>
                  <Row>
                    <Seg value={layer.align} onChange={(align) => edit(layer.id, { align })} options={[['left', 'Left'], ['center', 'Center'], ['right', 'Right']]} />
                    <label className="k-field"><span className="k-label">Colour</span><input type="color" value={layer.color} onChange={(e) => edit(layer.id, { color: e.target.value })} /></label>
                    <Slider label="Line height" value={layer.lineH} onChange={(lineH) => edit(layer.id, { lineH })} min={0.8} max={2} step={0.05} show={(v) => v.toFixed(2)} />
                  </Row>
                </>
              )}
              {(layer.kind === 'rect' || layer.kind === 'ellipse') && (
                <Row>
                  <label className="k-field"><span className="k-label">Fill</span><input type="color" value={layer.fill} onChange={(e) => edit(layer.id, { fill: e.target.value })} /></label>
                  <label className="k-field"><span className="k-label">Stroke</span><input type="color" value={layer.stroke} onChange={(e) => edit(layer.id, { stroke: e.target.value })} /></label>
                  <Num label="Stroke width" value={layer.strokeW} onChange={(strokeW) => edit(layer.id, { strokeW: Math.max(0, strokeW) })} min={0} step={1} />
                  {layer.kind === 'rect' && <Num label="Corner radius" value={layer.radius} onChange={(radius) => edit(layer.id, { radius: Math.max(0, radius) })} min={0} step={1} />}
                </Row>
              )}
              {layer.kind === 'image' && (
                <>
                  <FileDrop accept="image/*" onFiles={(f) => { const r = new FileReader(); r.onload = () => edit(layer.id, { src: String(r.result) }); r.readAsDataURL(f[0]) }} label="Replace image" />
                  <Num label="Corner radius" value={layer.radius} onChange={(radius) => edit(layer.id, { radius: Math.max(0, radius) })} min={0} step={1} />
                  <p className="muted" style={{ fontSize: 13 }}>Images fill their box (cover). Wide photos spanning a seam create the classic "swipe to reveal" panorama.</p>
                </>
              )}
            </>
          )}
          <FileDrop accept="image/*" onFiles={(f) => { const r = new FileReader(); r.onload = () => add('image', { src: String(r.result), w: 900, h: 600 }); r.readAsDataURL(f[0]) }} label="Add your own photo as a layer" />
          <Note>Your design is saved in this browser. Very large photos may not persist after a reload; re-add them if needed.</Note>
        </Panel>
      </Split>
    </div>
  )
}
