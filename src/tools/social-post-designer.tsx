import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { Area, Btn, Check, FileDrop, Note, Panel, Row, Select, Seg, Slider, Split, uid, useToolState } from '../kit'
import { coverRect, PRESETS, ratio, unit, wrapLines, type PresetId } from './lib/social-post-designer'

type Kind = 'text' | 'rect' | 'image'
interface Layer {
  id: string
  kind: Kind
  x: number // fractions of the canvas; text x is the anchor for its alignment
  y: number
  w: number
  h: number
  text: string
  size: number // px at a 1080 reference
  font: string
  weight: number
  color: string
  align: 'left' | 'center' | 'right'
  shadow: boolean
  highlight: string
  radius: number
  opacity: number
  src: string
}
interface Bg {
  type: 'solid' | 'gradient' | 'image'
  c1: string
  c2: string
  angle: number
  src: string
  dim: number
}
interface State {
  preset: PresetId
  bg: Bg
  layers: Layer[]
  safe: boolean
}

const FONTS: [string, string][] = [
  ['system-ui, -apple-system, Segoe UI, Roboto, sans-serif', 'Sans'],
  ['Georgia, "Times New Roman", serif', 'Serif'],
  ['Impact, "Arial Black", sans-serif', 'Impact'],
  ['"Trebuchet MS", Verdana, sans-serif', 'Trebuchet'],
  ['"Courier New", ui-monospace, monospace', 'Mono'],
  ['"Brush Script MT", "Segoe Script", cursive', 'Script'],
]
const base: Layer = { id: '', kind: 'text', x: 0.5, y: 0.4, w: 0.8, h: 0.1, text: 'Your text', size: 72, font: FONTS[0][0], weight: 800, color: '#ffffff', align: 'center', shadow: false, highlight: '', radius: 24, opacity: 1, src: '' }
const L = (p: Partial<Layer>): Layer => ({ ...base, id: uid(), ...p })

const TEMPLATES: Record<string, () => Pick<State, 'bg' | 'layers'>> = {
  Quote: () => ({
    bg: { type: 'gradient', c1: '#1e1b4b', c2: '#7c3aed', angle: 135, src: '', dim: 0 },
    layers: [
      L({ text: '“', size: 260, y: 0.08, font: FONTS[1][0], color: '#c4b5fd' }),
      L({ text: 'The best way to predict the future is to create it.', size: 76, y: 0.34, w: 0.78, font: FONTS[1][0], weight: 700 }),
      L({ text: '— Peter Drucker', size: 40, y: 0.74, weight: 400, color: '#ddd6fe' }),
      L({ text: '@yourbrand', size: 30, y: 0.9, weight: 600, color: '#a5b4fc' }),
    ],
  }),
  Sale: () => ({
    bg: { type: 'gradient', c1: '#f97316', c2: '#db2777', angle: 160, src: '', dim: 0 },
    layers: [
      L({ kind: 'rect', x: 0.1, y: 0.16, w: 0.8, h: 0.62, color: '#ffffff', radius: 40, opacity: 0.95 }),
      L({ text: 'SUMMER SALE', size: 64, y: 0.22, color: '#db2777', font: FONTS[2][0], weight: 400 }),
      L({ text: '-40%', size: 260, y: 0.31, color: '#111827', font: FONTS[2][0], weight: 400 }),
      L({ text: 'on everything in store', size: 44, y: 0.6, color: '#374151', weight: 600 }),
      L({ text: ' This weekend only · shop.example.com ', size: 34, y: 0.86, highlight: '#111827', weight: 700 }),
    ],
  }),
  Event: () => ({
    bg: { type: 'gradient', c1: '#0f766e', c2: '#0c4a6e', angle: 200, src: '', dim: 0 },
    layers: [
      L({ text: ' LIVE WEBINAR ', size: 34, y: 0.12, x: 0.08, align: 'left', highlight: '#facc15', color: '#111827', weight: 800 }),
      L({ text: 'Design systems that scale', size: 96, y: 0.24, x: 0.08, w: 0.84, align: 'left', weight: 800 }),
      L({ text: 'Thursday, 12 March · 6 PM CET\nFree · 60 minutes + Q&A', size: 42, y: 0.62, x: 0.08, align: 'left', weight: 500, color: '#ccfbf1' }),
      L({ kind: 'rect', x: 0.08, y: 0.84, w: 0.36, h: 0.08, color: '#facc15', radius: 60 }),
      L({ text: 'Save your seat →', size: 36, y: 0.857, x: 0.26, color: '#111827', weight: 800 }),
    ],
  }),
  Announcement: () => ({
    bg: { type: 'solid', c1: '#0b1020', c2: '#0b1020', angle: 0, src: '', dim: 0 },
    layers: [
      L({ kind: 'rect', x: 0.08, y: 0.2, w: 0.12, h: 0.012, color: '#22d3ee', radius: 4 }),
      L({ text: 'NEW RELEASE', size: 36, y: 0.24, x: 0.08, align: 'left', color: '#22d3ee', weight: 700 }),
      L({ text: 'Version 3.0 is here', size: 110, y: 0.31, x: 0.08, w: 0.84, align: 'left', weight: 900 }),
      L({ text: 'Faster sync, offline mode and a brand-new dark theme.', size: 46, y: 0.62, x: 0.08, w: 0.8, align: 'left', weight: 400, color: '#cbd5e1' }),
    ],
  }),
}

const DEF: State = { preset: 'ig-square', safe: true, ...TEMPLATES.Sale() }

type Box = { x: number; y: number; w: number; h: number }

function draw(g: CanvasRenderingContext2D, s: State, W: number, H: number, img: (src: string) => HTMLImageElement | null, boxes: Map<string, Box>, sel?: string | null) {
  const u = unit(W, H)
  g.clearRect(0, 0, W, H)
  const bi = s.bg.type === 'image' && s.bg.src ? img(s.bg.src) : null
  if (bi) {
    const r = coverRect(bi.naturalWidth, bi.naturalHeight, W, H)
    g.drawImage(bi, r.x, r.y, r.w, r.h)
  } else if (s.bg.type === 'gradient') {
    const a = ((s.bg.angle - 90) * Math.PI) / 180
    const len = (Math.abs(W * Math.cos(a)) + Math.abs(H * Math.sin(a))) / 2
    const gr = g.createLinearGradient(W / 2 - Math.cos(a) * len, H / 2 - Math.sin(a) * len, W / 2 + Math.cos(a) * len, H / 2 + Math.sin(a) * len)
    gr.addColorStop(0, s.bg.c1)
    gr.addColorStop(1, s.bg.c2)
    g.fillStyle = gr
    g.fillRect(0, 0, W, H)
  } else {
    g.fillStyle = s.bg.c1
    g.fillRect(0, 0, W, H)
  }
  if (s.bg.dim > 0) {
    g.fillStyle = `rgba(0,0,0,${s.bg.dim})`
    g.fillRect(0, 0, W, H)
  }
  boxes.clear()
  for (const l of s.layers) {
    g.save()
    g.globalAlpha = l.opacity
    let box: Box
    if (l.kind === 'rect') {
      box = { x: l.x * W, y: l.y * H, w: l.w * W, h: l.h * H }
      g.fillStyle = l.color
      g.beginPath()
      g.roundRect(box.x, box.y, box.w, box.h, Math.min(l.radius * u, box.w / 2, box.h / 2))
      g.fill()
    } else if (l.kind === 'image') {
      const im = l.src ? img(l.src) : null
      const w = l.w * W
      const h = im ? (w * im.naturalHeight) / im.naturalWidth : w
      box = { x: l.x * W, y: l.y * H, w, h }
      if (im) {
        g.beginPath()
        g.roundRect(box.x, box.y, w, h, l.radius * u)
        g.clip()
        g.drawImage(im, box.x, box.y, w, h)
      }
    } else {
      const fs = l.size * u
      g.font = `${l.weight} ${fs}px ${l.font}`
      g.textBaseline = 'top'
      g.textAlign = l.align
      const lines = wrapLines(l.text, l.w * W, (t) => g.measureText(t).width)
      const lh = fs * 1.15
      const ax = l.x * W
      let minX = Infinity, maxX = -Infinity
      lines.forEach((line, i) => {
        const tw = g.measureText(line).width
        const left = l.align === 'left' ? ax : l.align === 'center' ? ax - tw / 2 : ax - tw
        minX = Math.min(minX, left)
        maxX = Math.max(maxX, left + tw)
        const y = l.y * H + i * lh
        if (l.highlight) {
          g.fillStyle = l.highlight
          g.beginPath()
          g.roundRect(left - fs * 0.15, y - fs * 0.12, tw + fs * 0.3, fs * 1.24, fs * 0.18)
          g.fill()
        }
        if (l.shadow) {
          g.shadowColor = 'rgba(0,0,0,.5)'
          g.shadowBlur = 14 * u
          g.shadowOffsetY = 4 * u
        }
        g.fillStyle = l.color
        g.fillText(line, ax, y)
        g.shadowColor = 'transparent'
      })
      box = { x: minX, y: l.y * H, w: maxX - minX, h: lines.length * lh }
    }
    g.restore()
    boxes.set(l.id, box)
  }
  if (sel !== undefined) {
    const P = PRESETS.find((p) => p.id === s.preset)!
    if (s.safe && P.id === 'story') {
      g.fillStyle = 'rgba(239,68,68,.18)'
      g.fillRect(0, 0, W, H * 0.13)
      g.fillRect(0, H * 0.82, W, H * 0.18)
    }
    const b = sel ? boxes.get(sel) : null
    if (b) {
      g.save()
      g.setLineDash([12 * u, 8 * u])
      g.lineWidth = 3 * u
      g.strokeStyle = '#38bdf8'
      g.strokeRect(b.x - 6 * u, b.y - 6 * u, b.w + 12 * u, b.h + 12 * u)
      g.restore()
    }
  }
}

function readImage(f: File, max = 1600): Promise<string> {
  return new Promise((res, rej) => {
    const im = new Image()
    im.onload = () => {
      const s = Math.min(1, max / Math.max(im.width, im.height))
      const c = document.createElement('canvas')
      c.width = Math.round(im.width * s)
      c.height = Math.round(im.height * s)
      c.getContext('2d')!.drawImage(im, 0, 0, c.width, c.height)
      URL.revokeObjectURL(im.src)
      res(f.type === 'image/png' || f.type === 'image/svg+xml' ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.85))
    }
    im.onerror = () => rej(new Error('bad image'))
    im.src = URL.createObjectURL(f)
  })
}

export default function SocialPostDesigner() {
  const [s, set, reset] = useToolState('social-post-designer', DEF)
  const [sel, setSel] = useState<string | null>(s.layers[1]?.id ?? null)
  const [, bump] = useState(0)
  const cv = useRef<HTMLCanvasElement>(null)
  const boxes = useRef(new Map<string, Box>())
  const cache = useRef(new Map<string, HTMLImageElement>())
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null)
  const P = PRESETS.find((p) => p.id === s.preset) ?? PRESETS[0]
  const cur = s.layers.find((l) => l.id === sel) ?? null

  const img = (src: string) => {
    let im = cache.current.get(src)
    if (!im) {
      im = new Image()
      im.onload = () => bump((n) => n + 1)
      im.src = src
      cache.current.set(src, im)
    }
    return im.complete && im.naturalWidth ? im : null
  }

  useEffect(() => {
    const c = cv.current
    if (!c) return
    draw(c.getContext('2d')!, s, P.w, P.h, img, boxes.current, sel)
  })

  const edit = (p: Partial<Layer>) => cur && set((st) => ({ ...st, layers: st.layers.map((l) => (l.id === cur.id ? { ...l, ...p } : l)) }))
  const add = (l: Layer) => {
    set((st) => ({ ...st, layers: [...st.layers, l] }))
    setSel(l.id)
  }
  const moveLayer = (d: number) => {
    if (!cur) return
    const i = s.layers.indexOf(cur)
    const j = i + d
    if (j < 0 || j >= s.layers.length) return
    const ls = [...s.layers]
    ;[ls[i], ls[j]] = [ls[j], ls[i]]
    set({ layers: ls })
  }

  const pt = (e: RPointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * P.w, ((e.clientY - r.top) / r.height) * P.h]
  }
  const down = (e: RPointerEvent<HTMLCanvasElement>) => {
    const [x, y] = pt(e)
    const hit = [...s.layers].reverse().find((l) => {
      const b = boxes.current.get(l.id)
      return b && x >= b.x - 10 && x <= b.x + b.w + 10 && y >= b.y - 10 && y <= b.y + b.h + 10
    })
    setSel(hit?.id ?? null)
    if (!hit) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { id: hit.id, dx: x / P.w - hit.x, dy: y / P.h - hit.y }
  }
  const move = (e: RPointerEvent<HTMLCanvasElement>) => {
    const d = drag.current
    if (!d) return
    const [x, y] = pt(e)
    const nx = Math.round((x / P.w - d.dx) * 1000) / 1000
    const ny = Math.round((y / P.h - d.dy) * 1000) / 1000
    set((st) => ({ ...st, layers: st.layers.map((l) => (l.id === d.id ? { ...l, x: nx, y: ny } : l)) }))
  }

  const exportAs = (type: 'image/png' | 'image/jpeg') => {
    const c = document.createElement('canvas')
    c.width = P.w
    c.height = P.h
    draw(c.getContext('2d')!, s, P.w, P.h, img, new Map())
    c.toBlob((b) => {
      if (!b) return
      const a = document.createElement('a')
      a.href = URL.createObjectURL(b)
      a.download = `${P.id}-${P.w}x${P.h}.${type === 'image/png' ? 'png' : 'jpg'}`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    }, type, 0.92)
  }

  return (
    <Split wide="left">
      <div>
        <Panel
          title={`${P.name} · ${P.w}×${P.h} (${ratio(P.w, P.h)})`}
          actions={
            <>
              <Btn kind="primary" onClick={() => exportAs('image/png')}>⬇ PNG</Btn>
              <Btn onClick={() => exportAs('image/jpeg')}>⬇ JPEG</Btn>
            </>
          }
        >
          <div style={{ display: 'grid', placeItems: 'center', background: 'repeating-conic-gradient(var(--line) 0 25%, transparent 0 50%) 0 0 / 16px 16px', borderRadius: 8, padding: 8 }}>
            <canvas
              ref={cv}
              width={P.w}
              height={P.h}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={() => (drag.current = null)}
              style={{ width: '100%', maxWidth: `calc(68vh * ${P.w / P.h})`, height: 'auto', touchAction: 'none', cursor: 'move', boxShadow: '0 4px 20px #0003', borderRadius: 4 }}
            />
          </div>
          <p className="muted" style={{ fontSize: 13, margin: '8px 0 0' }}>Click a layer to select it, drag to move. Layout is stored in proportions, so switching platform keeps the design.</p>
        </Panel>
        <Panel title="Templates">
          <Row>
            {Object.keys(TEMPLATES).map((k) => (
              <Btn key={k} onClick={() => (set(TEMPLATES[k]()), setSel(null))}>{k}</Btn>
            ))}
            <Btn kind="ghost" onClick={() => (reset(), setSel(null))}>Reset</Btn>
          </Row>
        </Panel>
      </div>
      <div>
        <Panel title="Canvas">
          <Select label="Platform size" value={s.preset} onChange={(preset) => set({ preset })} options={PRESETS.map((p) => [p.id, `${p.name} — ${p.w}×${p.h}`] as const)} />
          {P.id === 'story' && <Check label="Show UI safe zones (top 13%, bottom 18%)" value={s.safe} onChange={(safe) => set({ safe })} />}
          <div style={{ margin: '8px 0' }}>
            <Seg value={s.bg.type} onChange={(type) => set({ bg: { ...s.bg, type } })} options={[['solid', 'Solid'], ['gradient', 'Gradient'], ['image', 'Photo']]} />
          </div>
          <Row>
            <label className="k-field"><span className="k-label">{s.bg.type === 'gradient' ? 'From' : 'Colour'}</span><input type="color" value={s.bg.c1} onChange={(e) => set({ bg: { ...s.bg, c1: e.target.value } })} /></label>
            {s.bg.type === 'gradient' && <label className="k-field"><span className="k-label">To</span><input type="color" value={s.bg.c2} onChange={(e) => set({ bg: { ...s.bg, c2: e.target.value } })} /></label>}
            {s.bg.type === 'gradient' && <Slider label="Angle" value={s.bg.angle} onChange={(angle) => set({ bg: { ...s.bg, angle } })} min={0} max={360} step={5} unit="°" show={String} />}
          </Row>
          {s.bg.type === 'image' && <FileDrop accept="image/*" onFiles={(f) => void readImage(f[0]).then((src) => set({ bg: { ...s.bg, src } }))} label={s.bg.src ? 'Replace background photo' : 'Choose a background photo'} />}
          <Slider label="Darken" value={Math.round(s.bg.dim * 100)} onChange={(v) => set({ bg: { ...s.bg, dim: v / 100 } })} min={0} max={80} unit="%" show={String} />
        </Panel>
        <Panel title="Layers">
          <Row>
            <Btn onClick={() => add(L({ y: 0.45 }))}>+ Text</Btn>
            <Btn onClick={() => add(L({ kind: 'rect', x: 0.3, y: 0.4, w: 0.4, h: 0.2, color: '#6366f1', radius: 24 }))}>+ Shape</Btn>
            <label className="k-btn">
              + Image
              <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void readImage(f, 1200).then((src) => add(L({ kind: 'image', x: 0.35, y: 0.35, w: 0.3, radius: 0, src }))) }} />
            </label>
          </Row>
          <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: 4, marginTop: 8 }}>
            {s.layers.map((l) => (
              <button key={l.id} type="button" className={`k-btn ${l.id === sel ? 'primary' : 'ghost'}`} onClick={() => setSel(l.id)} style={{ justifyContent: 'flex-start', textAlign: 'left', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                {l.kind === 'text' ? `T  ${l.text.replace(/\n/g, ' ').trim() || '(empty)'}` : l.kind === 'rect' ? '▭  Shape' : '🖼  Image'}
              </button>
            ))}
          </div>
        </Panel>
        {cur ? (
          <Panel
            title={cur.kind === 'text' ? 'Text' : cur.kind === 'rect' ? 'Shape' : 'Image'}
            actions={
              <>
                <Btn kind="ghost" title="Bring forward" onClick={() => moveLayer(1)}>▲</Btn>
                <Btn kind="ghost" title="Send backward" onClick={() => moveLayer(-1)}>▼</Btn>
                <Btn kind="ghost" title="Duplicate" onClick={() => add({ ...cur, id: uid(), x: cur.x + 0.03, y: cur.y + 0.03 })}>⧉</Btn>
                <Btn kind="danger" title="Delete" onClick={() => (set({ layers: s.layers.filter((l) => l.id !== cur.id) }), setSel(null))}>✕</Btn>
              </>
            }
          >
            {cur.kind === 'text' && (
              <>
                <Area value={cur.text} onChange={(text) => edit({ text })} rows={3} />
                <Row>
                  <Select label="Font" value={cur.font} onChange={(font) => edit({ font })} options={FONTS} />
                  <Select label="Weight" value={cur.weight} onChange={(weight) => edit({ weight })} options={[[400, 'Regular'], [600, 'Semibold'], [800, 'Bold'], [900, 'Black']]} />
                </Row>
                <Slider label="Size" value={cur.size} onChange={(size) => edit({ size })} min={16} max={320} unit="px" show={String} />
                <Slider label="Wrap width" value={Math.round(cur.w * 100)} onChange={(v) => edit({ w: v / 100 })} min={10} max={100} unit="%" show={String} />
                <Row>
                  <Seg value={cur.align} onChange={(align) => edit({ align })} options={[['left', '⇤'], ['center', '↔'], ['right', '⇥']]} label="Alignment" />
                  <label className="k-field"><span className="k-label">Colour</span><input type="color" value={cur.color} onChange={(e) => edit({ color: e.target.value })} /></label>
                  <label className="k-field"><span className="k-label">Highlight</span><input type="color" value={cur.highlight || '#000000'} onChange={(e) => edit({ highlight: e.target.value })} /></label>
                </Row>
                <Row>
                  <Check label="Drop shadow" value={cur.shadow} onChange={(shadow) => edit({ shadow })} />
                  <Check label="Highlight box" value={!!cur.highlight} onChange={(v) => edit({ highlight: v ? '#111827' : '' })} />
                </Row>
              </>
            )}
            {cur.kind === 'rect' && (
              <>
                <label className="k-field"><span className="k-label">Colour</span><input type="color" value={cur.color} onChange={(e) => edit({ color: e.target.value })} /></label>
                <Slider label="Width" value={Math.round(cur.w * 100)} onChange={(v) => edit({ w: v / 100 })} min={1} max={100} unit="%" show={String} />
                <Slider label="Height" value={Math.round(cur.h * 1000) / 10} onChange={(v) => edit({ h: v / 100 })} min={0.5} max={100} step={0.5} unit="%" show={String} />
              </>
            )}
            {cur.kind === 'image' && <Slider label="Width" value={Math.round(cur.w * 100)} onChange={(v) => edit({ w: v / 100 })} min={5} max={100} unit="%" show={String} />}
            {cur.kind !== 'text' && <Slider label="Corner radius" value={cur.radius} onChange={(radius) => edit({ radius })} min={0} max={300} unit="px" show={String} />}
            <Slider label="Opacity" value={Math.round(cur.opacity * 100)} onChange={(v) => edit({ opacity: v / 100 })} min={5} max={100} unit="%" show={String} />
            <Row>
              <Btn kind="ghost" onClick={() => edit(cur.kind === 'text' ? { x: 0.5, align: 'center' } : { x: (1 - cur.w) / 2 })}>Centre horizontally</Btn>
            </Row>
          </Panel>
        ) : (
          <Note>
            <div style={{ gridColumn: '1 / -1' }}>Select a layer on the canvas or in the list to edit its text and style.</div>
          </Note>
        )}
      </div>
    </Split>
  )
}
