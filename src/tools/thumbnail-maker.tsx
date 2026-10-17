import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Check, FileDrop, Note, Panel, Row, Seg, Select, Slider, Split, Txt, download, uid, useToolState } from '../kit'
import { contrast, hexRgb, removeBackground, segments, wrap } from './lib/thumbnail-maker'

const W = 1280, H = 720
interface Layer { id: string; text: string; x: number; y: number; size: number; font: string; fill: string; accent: string; stroke: string; strokeW: number; shadow: boolean; rot: number; upper: boolean; maxW: number; box: string }
interface State {
  bg: 'gradient' | 'solid' | 'split' | 'image'; c1: string; c2: string; angle: number; blur: number; darken: number; vignette: boolean
  cut: boolean; tol: number; feather: number; global: boolean; sx: number; sy: number; scale: number; outline: number; outlineColor: string; glow: boolean; flip: boolean
  layers: Layer[]; guides: boolean; q: number
}
const FONTS: [string, string][] = [['Impact, "Anton", "Arial Narrow Bold", sans-serif', 'Impact'], ['"Arial Black", "Arial Bold", sans-serif', 'Arial Black'], ['system-ui, sans-serif', 'System bold'], ['Georgia, serif', 'Serif'], ['"Comic Sans MS", "Comic Neue", cursive', 'Comic']]
const L = (p: Partial<Layer>): Layer => ({ id: uid(), text: 'TEXT', x: 380, y: 300, size: 110, font: FONTS[0][0], fill: '#ffffff', accent: '#facc15', stroke: '#000000', strokeW: 10, shadow: true, rot: 0, upper: true, maxW: 700, box: '', ...p })

const TEMPLATES: Record<string, Partial<State>> = {
  'Big claim': { bg: 'gradient', c1: '#7c3aed', c2: '#0ea5e9', angle: 135, sx: 960, sy: 400, scale: 0.85, layers: [L({ text: 'I tried *every* trophy hack', x: 410, y: 380, size: 112 }), L({ text: '2026', x: 130, y: 80, size: 54, box: '#ef4444', strokeW: 0, shadow: false, rot: -6 })] },
  Versus: { bg: 'split', c1: '#ef4444', c2: '#2563eb', angle: 100, sx: 640, sy: 420, scale: 0.7, layers: [L({ text: 'cheap', x: 260, y: 300, size: 120 }), L({ text: 'VS', x: 640, y: 120, size: 140, fill: '#facc15' }), L({ text: 'pro', x: 1030, y: 300, size: 120 })] },
  Tutorial: { bg: 'gradient', c1: '#0f172a', c2: '#334155', angle: 90, sx: 1000, sy: 420, scale: 0.8, layers: [L({ text: 'How to *win* every time', x: 410, y: 300, size: 104, accent: '#22c55e' }), L({ text: 'in 10 minutes', x: 410, y: 560, size: 48, font: FONTS[2][0], strokeW: 0, box: '#22c55e', fill: '#0f172a', upper: false, shadow: false })] },
}
const DEF: State = { bg: 'gradient', c1: '#7c3aed', c2: '#0ea5e9', angle: 135, blur: 0, darken: 0, vignette: true, cut: true, tol: 40, feather: 18, global: true, sx: 960, sy: 400, scale: 0.85, outline: 10, outlineColor: '#ffffff', glow: true, flip: false, layers: TEMPLATES['Big claim'].layers!, guides: true, q: 0.9 }

function demoSubject(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 640
  c.height = 760
  const g = c.getContext('2d')!
  g.fillStyle = '#00b140'
  g.fillRect(0, 0, 640, 760)
  const gold = g.createLinearGradient(120, 0, 520, 0)
  gold.addColorStop(0, '#b45309')
  gold.addColorStop(0.45, '#fde047')
  gold.addColorStop(1, '#a16207')
  g.fillStyle = gold
  g.lineWidth = 34
  g.strokeStyle = gold
  g.beginPath()
  g.arc(150, 230, 85, Math.PI * 0.5, Math.PI * 1.5)
  g.stroke()
  g.beginPath()
  g.arc(490, 230, 85, Math.PI * 1.5, Math.PI * 0.5)
  g.stroke()
  g.beginPath()
  g.moveTo(130, 120)
  g.lineTo(510, 120)
  g.bezierCurveTo(510, 380, 420, 470, 340, 490)
  g.lineTo(300, 490)
  g.bezierCurveTo(220, 470, 130, 380, 130, 120)
  g.fill()
  g.fillRect(285, 480, 70, 110)
  g.fillRect(190, 580, 260, 50)
  g.fillStyle = '#3f2a14'
  g.fillRect(160, 630, 320, 80)
  g.fillStyle = '#fde68a'
  g.font = 'bold 40px system-ui, sans-serif'
  g.textAlign = 'center'
  g.fillText('#1', 320, 684)
  g.fillStyle = 'rgba(255,255,255,.55)'
  g.beginPath()
  g.ellipse(230, 220, 26, 70, -0.2, 0, Math.PI * 2)
  g.fill()
  return c
}

function silhouette(src: HTMLCanvasElement, color: string, r: number): HTMLCanvasElement {
  const pad = Math.ceil(r) + 2
  const c = document.createElement('canvas')
  c.width = src.width + pad * 2
  c.height = src.height + pad * 2
  const g = c.getContext('2d')!
  for (let a = 0; a < 24; a++) g.drawImage(src, pad + Math.cos((a / 24) * Math.PI * 2) * r, pad + Math.sin((a / 24) * Math.PI * 2) * r)
  g.globalCompositeOperation = 'source-in'
  g.fillStyle = color
  g.fillRect(0, 0, c.width, c.height)
  g.globalCompositeOperation = 'source-over'
  g.drawImage(src, pad, pad)
  return c
}

type Box = { id: string; x: number; y: number; w: number; h: number }

function layoutText(g: CanvasRenderingContext2D, l: Layer) {
  g.font = `900 ${l.size}px ${l.font}`
  const text = l.upper ? l.text.toUpperCase() : l.text
  const lines = wrap(text, l.maxW, (s) => g.measureText(s).width)
  const lh = l.size * 1.02
  const widths = lines.map((ln) => g.measureText(ln.replace(/\*/g, '')).width)
  const w = Math.max(...widths, 10), h = lines.length * lh
  return { lines, widths, lh, w, h }
}

function drawText(g: CanvasRenderingContext2D, l: Layer) {
  const { lines, widths, lh, w, h } = layoutText(g, l)
  g.save()
  g.translate(l.x, l.y)
  g.rotate((l.rot * Math.PI) / 180)
  g.textBaseline = 'middle'
  g.lineJoin = 'round'
  if (l.box) {
    const p = l.size * 0.3
    g.fillStyle = l.box
    if (l.shadow) Object.assign(g, { shadowColor: 'rgba(0,0,0,.45)', shadowBlur: 18, shadowOffsetY: 8 })
    g.beginPath()
    g.roundRect(-w / 2 - p, -h / 2 - p * 0.6, w + 2 * p, h + p * 1.2, l.size * 0.18)
    g.fill()
    g.shadowColor = 'transparent'
  }
  lines.forEach((ln, i) => {
    const x = -widths[i] / 2
    const y = -h / 2 + lh * (i + 0.5)
    const segs = segments(ln)
    for (const pass of ['stroke', 'fill'] as const) {
      let cx = x
      for (const sg of segs) {
        if (pass === 'stroke' && l.strokeW > 0) {
          if (l.shadow) Object.assign(g, { shadowColor: 'rgba(0,0,0,.55)', shadowBlur: 16, shadowOffsetX: 4, shadowOffsetY: 8 })
          g.lineWidth = l.strokeW * 2
          g.strokeStyle = l.stroke
          g.strokeText(sg.t, cx, y)
          g.shadowColor = 'transparent'
        }
        if (pass === 'fill') {
          if (l.shadow && l.strokeW === 0 && !l.box) Object.assign(g, { shadowColor: 'rgba(0,0,0,.55)', shadowBlur: 14, shadowOffsetY: 6 })
          g.fillStyle = sg.hot ? l.accent : l.fill
          g.fillText(sg.t, cx, y)
          g.shadowColor = 'transparent'
        }
        cx += g.measureText(sg.t).width
      }
    }
  })
  g.restore()
  return { id: l.id, x: l.x - w / 2, y: l.y - h / 2, w, h }
}

export default function ThumbnailMaker() {
  const [s, set, reset] = useToolState('thumbnail-maker', DEF)
  const [subject, setSubject] = useState<HTMLCanvasElement | null>(demoSubject)
  const [bgImg, setBgImg] = useState<ImageBitmap | null>(null)
  const [sel, setSel] = useState<string>(s.layers[0]?.id ?? '')
  const [warn, setWarn] = useState<string[]>([])
  const [size, setSize] = useState('')
  const cv = useRef<HTMLCanvasElement>(null)
  const small = useRef<HTMLCanvasElement>(null)
  const tiny = useRef<HTMLCanvasElement>(null)
  const boxes = useRef<Box[]>([])
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null)
  const layer = s.layers.find((l) => l.id === sel)
  const editL = (p: Partial<Layer>) => set({ layers: s.layers.map((l) => (l.id === sel ? { ...l, ...p } : l)) })

  const cutout = useMemo(() => {
    if (!subject) return null
    const c = document.createElement('canvas')
    c.width = subject.width
    c.height = subject.height
    const g = c.getContext('2d', { willReadFrequently: true })!
    g.drawImage(subject, 0, 0)
    let frac = 0
    if (s.cut) {
      const d = g.getImageData(0, 0, c.width, c.height)
      frac = removeBackground(d.data, c.width, c.height, s.tol, s.feather, s.global)
      g.putImageData(d, 0, 0)
    }
    return { c: s.outline > 0 ? silhouette(c, s.outlineColor, s.outline) : c, frac }
  }, [subject, s.cut, s.tol, s.feather, s.global, s.outline, s.outlineColor])

  function paint(g: CanvasRenderingContext2D, guides: boolean) {
    g.save()
    g.clearRect(0, 0, W, H)
    if (s.blur) g.filter = `blur(${s.blur}px)`
    if (s.bg === 'image' && bgImg) {
      const k = Math.max(W / bgImg.width, H / bgImg.height)
      g.drawImage(bgImg, (W - bgImg.width * k) / 2, (H - bgImg.height * k) / 2, bgImg.width * k, bgImg.height * k)
    } else if (s.bg === 'split') {
      g.fillStyle = s.c1
      g.fillRect(0, 0, W, H)
      g.fillStyle = s.c2
      const off = Math.tan(((s.angle - 90) * Math.PI) / 180) * H / 2
      g.beginPath()
      g.moveTo(W / 2 + off, 0)
      g.lineTo(W, 0)
      g.lineTo(W, H)
      g.lineTo(W / 2 - off, H)
      g.fill()
    } else if (s.bg === 'solid') {
      g.fillStyle = s.c1
      g.fillRect(0, 0, W, H)
    } else {
      const a = (s.angle * Math.PI) / 180, r = Math.hypot(W, H) / 2
      const gr = g.createLinearGradient(W / 2 - Math.cos(a) * r, H / 2 - Math.sin(a) * r, W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r)
      gr.addColorStop(0, s.c1)
      gr.addColorStop(1, s.c2)
      g.fillStyle = gr
      g.fillRect(0, 0, W, H)
    }
    g.filter = 'none'
    if (s.darken) {
      g.fillStyle = `rgba(0,0,0,${s.darken / 100})`
      g.fillRect(0, 0, W, H)
    }
    if (s.vignette) {
      const v = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.7)
      v.addColorStop(0, 'rgba(0,0,0,0)')
      v.addColorStop(1, 'rgba(0,0,0,.55)')
      g.fillStyle = v
      g.fillRect(0, 0, W, H)
    }
    const out: Box[] = []
    if (cutout) {
      const k = (s.scale * H) / cutout.c.height
      const w = cutout.c.width * k, h = cutout.c.height * k
      g.save()
      if (s.glow) Object.assign(g, { shadowColor: 'rgba(0,0,0,.6)', shadowBlur: 40, shadowOffsetY: 16 })
      g.translate(s.sx, s.sy)
      if (s.flip) g.scale(-1, 1)
      g.drawImage(cutout.c, -w / 2, -h / 2, w, h)
      g.restore()
      out.push({ id: 'subject', x: s.sx - w / 2, y: s.sy - h / 2, w, h })
    }
    const ws: string[] = []
    for (const l of s.layers) {
      const lay = layoutText(g, l)
      const bx = Math.max(0, Math.round(l.x - lay.w / 2)), by = Math.max(0, Math.round(l.y - lay.h / 2))
      const bw = Math.max(1, Math.min(W - bx, Math.round(lay.w))), bh = Math.max(1, Math.min(H - by, Math.round(lay.h)))
      if (bx < W && by < H && !l.box) {
        const d = g.getImageData(bx, by, bw, bh).data
        let r = 0, gg = 0, b = 0, n = 0
        for (let i = 0; i < d.length; i += 64) {
          r += d[i]
          gg += d[i + 1]
          b += d[i + 2]
          n++
        }
        const avg: [number, number, number] = [r / n, gg / n, b / n]
        const cr = Math.max(contrast(hexRgb(l.fill), avg), l.strokeW >= 4 ? contrast(hexRgb(l.stroke), avg) : 0)
        if (cr < 3) ws.push(`“${l.text.slice(0, 24)}” has low contrast (${cr.toFixed(1)}:1) against the background — add a stroke or a box.`)
      }
      if (l.size < 40) ws.push(`“${l.text.slice(0, 24)}” is ${l.size}px — it will be unreadable at phone size (aim for 60px+).`)
      out.push(drawText(g, l))
      if (bx + lay.w > W + 2 || by + lay.h > H + 2 || l.x - lay.w / 2 < -2 || l.y - lay.h / 2 < -2) ws.push(`“${l.text.slice(0, 24)}” runs off the edge.`)
      if (l.x + lay.w / 2 > 1100 && l.y + lay.h / 2 > 640) ws.push(`“${l.text.slice(0, 24)}” sits under the video-length badge (bottom right).`)
    }
    if (guides) {
      g.strokeStyle = 'rgba(255,255,255,.6)'
      g.setLineDash([10, 8])
      g.lineWidth = 2
      g.strokeRect(1105, 645, 160, 60)
      g.fillStyle = 'rgba(0,0,0,.6)'
      g.fillRect(1180, 665, 80, 34)
      g.fillStyle = '#fff'
      g.font = 'bold 22px system-ui'
      g.fillText('12:34', 1190, 690)
      const b = out.find((o) => o.id === sel)
      if (b) {
        g.strokeStyle = '#38bdf8'
        g.strokeRect(b.x - 8, b.y - 8, b.w + 16, b.h + 16)
      }
    }
    g.restore()
    boxes.current = out
    return ws
  }

  useEffect(() => {
    const c = cv.current
    if (!c) return
    c.width = W
    c.height = H
    const ws = paint(c.getContext('2d', { willReadFrequently: true })!, s.guides)
    setWarn((old) => (old.join() === ws.join() ? old : ws))
    const clean = document.createElement('canvas')
    clean.width = W
    clean.height = H
    paint(clean.getContext('2d', { willReadFrequently: true })!, false)
    for (const [ref, w] of [[small, 320], [tiny, 168]] as const) {
      const t = ref.current
      if (!t) continue
      t.width = w
      t.height = (w * 9) / 16
      const tg = t.getContext('2d')!
      tg.imageSmoothingQuality = 'high'
      tg.drawImage(clean, 0, 0, t.width, t.height)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, cutout, bgImg, sel])

  const pt = (e: React.PointerEvent) => {
    const r = cv.current!.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H]
  }
  function down(e: React.PointerEvent) {
    const [x, y] = pt(e)
    const hit = [...boxes.current].reverse().find((b) => x >= b.x - 10 && x <= b.x + b.w + 10 && y >= b.y - 10 && y <= b.y + b.h + 10)
    if (!hit) return setSel('')
    setSel(hit.id)
    cv.current!.setPointerCapture(e.pointerId)
    const ox = hit.id === 'subject' ? s.sx : s.layers.find((l) => l.id === hit.id)!.x
    const oy = hit.id === 'subject' ? s.sy : s.layers.find((l) => l.id === hit.id)!.y
    drag.current = { id: hit.id, dx: x - ox, dy: y - oy }
  }
  function moveP(e: React.PointerEvent) {
    const d = drag.current
    if (!d) return
    const [x, y] = pt(e)
    const nx = Math.round(x - d.dx), ny = Math.round(y - d.dy)
    if (d.id === 'subject') set({ sx: nx, sy: ny })
    else set({ layers: s.layers.map((l) => (l.id === d.id ? { ...l, x: nx, y: ny } : l)) })
  }

  function exportImg(type: 'jpeg' | 'png') {
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    paint(c.getContext('2d', { willReadFrequently: true })!, false)
    c.toBlob((b) => {
      if (!b) return
      setSize(`${type.toUpperCase()} ${(b.size / 1024).toFixed(0)} KB${b.size > 2 * 1024 * 1024 ? ' — over YouTube’s 2 MB limit, lower the quality' : ' ✓ under 2 MB'}`)
      download(`thumbnail.${type === 'jpeg' ? 'jpg' : 'png'}`, b)
    }, `image/${type}`, s.q)
  }
  const color = (label: string, v: string, on: (v: string) => void) => (
    <label className="k-field" style={{ flex: '0 0 auto' }}><span className="k-label">{label}</span><input type="color" value={v} onChange={(e) => on(e.target.value)} style={{ width: 48, height: 34 }} /></label>
  )

  return (
    <Split wide="right">
      <div>
        <Panel title="Templates">
          <Row>{Object.keys(TEMPLATES).map((k) => <Btn key={k} onClick={() => { const t = TEMPLATES[k]; set({ ...t, layers: t.layers!.map((l) => ({ ...l, id: uid() })) }); setSel('') }}>{k}</Btn>)}<Btn kind="ghost" onClick={reset}>Reset</Btn></Row>
        </Panel>
        <Panel title="Text" actions={<Btn onClick={() => { const n = L({ text: 'New *text*', x: 640, y: 360, size: 90 }); set({ layers: [...s.layers, n] }); setSel(n.id) }}>+ Text</Btn>}>
          <div className="k-seg" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
            {s.layers.map((l, i) => <button key={l.id} type="button" className={sel === l.id ? 'on' : ''} onClick={() => setSel(l.id)}>{i + 1}. {l.text.replace(/\*/g, '').slice(0, 14)}</button>)}
            <button type="button" className={sel === 'subject' ? 'on' : ''} onClick={() => setSel('subject')}>Subject</button>
          </div>
          {layer ? (
            <>
              <Txt label="Text (wrap *words* in asterisks to highlight)" value={layer.text} onChange={(text) => editL({ text })} />
              <Row>
                <Select label="Font" value={layer.font} onChange={(font) => editL({ font })} options={FONTS} />
                <Check label="UPPERCASE" value={layer.upper} onChange={(upper) => editL({ upper })} />
                <Check label="Shadow" value={layer.shadow} onChange={(shadow) => editL({ shadow })} />
              </Row>
              <Slider label="Size" value={layer.size} min={20} max={240} onChange={(size) => editL({ size })} unit="px" show={String} />
              <Slider label="Wrap width" value={layer.maxW} min={200} max={1260} step={10} onChange={(maxW) => editL({ maxW })} unit="px" show={String} />
              <Row>
                {color('Fill', layer.fill, (fill) => editL({ fill }))}
                {color('Highlight', layer.accent, (accent) => editL({ accent }))}
                {color('Stroke', layer.stroke, (stroke) => editL({ stroke }))}
                {color('Box', layer.box || '#ef4444', (box) => editL({ box }))}
                <Check label="Box on" value={!!layer.box} onChange={(on) => editL({ box: on ? '#ef4444' : '' })} />
              </Row>
              <Slider label="Stroke" value={layer.strokeW} min={0} max={24} onChange={(strokeW) => editL({ strokeW })} unit="px" show={String} />
              <Slider label="Rotate" value={layer.rot} min={-30} max={30} onChange={(rot) => editL({ rot })} unit="°" show={String} />
              <Btn kind="danger" onClick={() => { set({ layers: s.layers.filter((l) => l.id !== sel) }); setSel('') }}>Delete text</Btn>
            </>
          ) : <p className="muted">Click a text on the canvas or a tab above to edit it. Drag anything to move it.</p>}
        </Panel>
        <Panel title="Subject cut-out">
          <FileDrop accept="image/*" onFiles={async (f) => { const b = await createImageBitmap(f[0]); const k = Math.min(1, 1000 / Math.max(b.width, b.height)); const c = document.createElement('canvas'); c.width = Math.round(b.width * k); c.height = Math.round(b.height * k); c.getContext('2d')!.drawImage(b, 0, 0, c.width, c.height); setSubject(c) }} label="Drop a photo of you / the product" />
          <Row>
            <Btn onClick={() => setSubject(demoSubject())}>Demo trophy</Btn>
            <Btn kind="ghost" onClick={() => setSubject(null)}>No subject</Btn>
            <Check label="Remove background" value={s.cut} onChange={(cut) => set({ cut })} />
          </Row>
          {s.cut && (
            <>
              <Slider label="Tolerance" value={s.tol} min={5} max={150} onChange={(tol) => set({ tol })} show={String} />
              <Slider label="Edge feather" value={s.feather} min={0} max={60} onChange={(feather) => set({ feather })} show={String} />
              <Check label="Also remove enclosed areas of the same colour" value={s.global} onChange={(global) => set({ global })} />
              {cutout && <p className="muted" style={{ fontSize: 13 }}>Removed {(cutout.frac * 100).toFixed(0)}% of the photo. Works best on plain or green-screen backgrounds (the colour is sampled from the photo’s edges).</p>}
            </>
          )}
          <Slider label="Scale" value={s.scale} min={0.2} max={1.6} step={0.01} onChange={(scale) => set({ scale })} show={(v) => `${Math.round(v * 100)}%`} />
          <Row>
            <Slider label="Outline" value={s.outline} min={0} max={30} onChange={(outline) => set({ outline })} unit="px" show={String} />
            {color('Outline colour', s.outlineColor, (outlineColor) => set({ outlineColor }))}
          </Row>
          <Row><Check label="Drop shadow" value={s.glow} onChange={(glow) => set({ glow })} /><Check label="Mirror" value={s.flip} onChange={(flip) => set({ flip })} /></Row>
        </Panel>
        <Panel title="Background">
          <Seg value={s.bg} onChange={(bg) => set({ bg })} options={[['gradient', 'Gradient'], ['split', 'Split'], ['solid', 'Solid'], ['image', 'Image']]} />
          {s.bg === 'image' && <FileDrop accept="image/*" onFiles={async (f) => setBgImg(await createImageBitmap(f[0]))} label={bgImg ? 'Replace background image' : 'Drop a background image'} />}
          <Row>
            {color('Colour 1', s.c1, (c1) => set({ c1 }))}
            {color('Colour 2', s.c2, (c2) => set({ c2 }))}
          </Row>
          <Slider label="Angle" value={s.angle} min={0} max={180} onChange={(angle) => set({ angle })} unit="°" show={String} />
          <Slider label="Blur" value={s.blur} min={0} max={30} onChange={(blur) => set({ blur })} unit="px" show={String} />
          <Slider label="Darken" value={s.darken} min={0} max={80} onChange={(darken) => set({ darken })} unit="%" show={String} />
          <Check label="Vignette" value={s.vignette} onChange={(vignette) => set({ vignette })} />
        </Panel>
      </div>
      <div>
        <Panel title="1280 × 720 canvas" actions={<Check label="Guides" value={s.guides} onChange={(guides) => set({ guides })} />}>
          <canvas ref={cv} onPointerDown={down} onPointerMove={moveP} onPointerUp={() => (drag.current = null)} style={{ width: '100%', aspectRatio: '16 / 9', display: 'block', borderRadius: 10, touchAction: 'none', cursor: 'move' }} />
          {warn.map((w) => <Note key={w} tone="warn">{w}</Note>)}
          {!warn.length && <Note tone="ok">Readable: good contrast, large text, nothing under the timestamp.</Note>}
        </Panel>
        <Panel title="How it looks in the feed">
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <figure style={{ margin: 0 }}><canvas ref={small} style={{ width: 320, maxWidth: '100%', borderRadius: 8 }} /><figcaption className="muted" style={{ fontSize: 12 }}>Desktop home feed · 320 px</figcaption></figure>
            <figure style={{ margin: 0 }}><canvas ref={tiny} style={{ width: 168, borderRadius: 6 }} /><figcaption className="muted" style={{ fontSize: 12 }}>Sidebar / phone · 168 px</figcaption></figure>
          </div>
        </Panel>
        <Panel title="Export">
          <Slider label="JPG quality" value={s.q} min={0.5} max={1} step={0.01} onChange={(q) => set({ q })} show={(v) => `${Math.round(v * 100)}%`} />
          <Row>
            <Btn kind="primary" onClick={() => exportImg('jpeg')}>⬇ JPG</Btn>
            <Btn onClick={() => exportImg('png')}>⬇ PNG</Btn>
            {size && <span className="muted">{size}</span>}
          </Row>
        </Panel>
      </div>
    </Split>
  )
}
