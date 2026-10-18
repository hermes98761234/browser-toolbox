import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Check, download, FileDrop, Note, Num, Panel, Row, Seg, Select, Slider, Split, Txt, useToolState } from '../kit'
import { cellRects, coverCrop, gridAreas, hitCell, parseAreas, TEMPLATES, type Layout, type Rect } from './lib/collage-maker'

interface Photo { id: string; name: string; img: HTMLImageElement; url: string }
interface Slot { photo: string | null; zoom: number; px: number; py: number }
const EMPTY: Slot = { photo: null, zoom: 1, px: 0, py: 0 }

const ASPECTS: [string, string, number][] = [
  ['1:1', 'Square 1:1', 1], ['4:5', 'Portrait 4:5', 4 / 5], ['9:16', 'Story 9:16', 9 / 16], ['16:9', 'Wide 16:9', 16 / 9], ['3:2', 'Photo 3:2', 3 / 2], ['2:3', 'Print 2:3', 2 / 3], ['a4', 'A4 portrait', 210 / 297],
]
const DEF = {
  template: 'aab/aac', custom: 'ab/cd', useCustom: false, grid: false, rows: 3, cols: 3,
  aspect: '1:1', width: 2048, gap: 14, margin: 14, radius: 12, bg: '#ffffff',
  caption: 'Summer weekend', capSize: 5, capColor: '#ffffff', capBand: true, showCaption: true, fmt: 'png' as 'png' | 'jpeg',
}

/** Original demo "photos": painted landscapes, still lifes and patterns. */
function demoPhotos(): string[] {
  const make = (draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, w = 900, h = 650) => {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    draw(c.getContext('2d')!, w, h)
    return c.toDataURL('image/jpeg', 0.86)
  }
  const sky = (g: CanvasRenderingContext2D, w: number, h: number, a: string, b: string) => {
    const gr = g.createLinearGradient(0, 0, 0, h)
    gr.addColorStop(0, a)
    gr.addColorStop(1, b)
    g.fillStyle = gr
    g.fillRect(0, 0, w, h)
  }
  return [
    make((g, w, h) => {
      sky(g, w, h, '#f97316', '#fde68a')
      g.fillStyle = '#fff7'
      g.beginPath(); g.arc(w * 0.7, h * 0.45, 70, 0, 7); g.fill()
      for (let i = 0; i < 3; i++) {
        g.fillStyle = ['#7c2d12', '#9a3412', '#431407'][i]
        g.beginPath(); g.moveTo(0, h)
        for (let x = 0; x <= w; x += 30) g.lineTo(x, h * (0.55 + i * 0.12) + Math.sin(x / (90 + i * 40) + i) * 30)
        g.lineTo(w, h); g.fill()
      }
    }),
    make((g, w, h) => {
      sky(g, w, h, '#0ea5e9', '#e0f2fe')
      g.fillStyle = '#0369a1'
      g.fillRect(0, h * 0.62, w, h)
      g.fillStyle = '#fde68a'
      g.beginPath(); g.ellipse(w * 0.5, h * 1.05, w * 0.8, h * 0.35, 0, 0, 7); g.fill()
      g.fillStyle = '#fff'
      for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(120 + i * 170, 90 + (i % 2) * 40, 60, 18, 0, 0, 7); g.fill() }
    }, 650, 900),
    make((g, w, h) => {
      sky(g, w, h, '#14532d', '#4ade80')
      for (let i = 0; i < 40; i++) {
        g.fillStyle = `hsl(${100 + (i % 5) * 12} 55% ${18 + (i % 7) * 4}%)`
        const x = (i * 97) % w, s = 40 + (i % 6) * 14
        g.beginPath(); g.moveTo(x, h * 0.3 + (i % 4) * 60); g.lineTo(x - s, h); g.lineTo(x + s, h); g.fill()
      }
    }),
    make((g, w, h) => {
      g.fillStyle = '#fef3c7'; g.fillRect(0, 0, w, h)
      g.fillStyle = '#b45309'; g.fillRect(0, h * 0.7, w, h)
      g.fillStyle = '#fff'; g.beginPath(); g.ellipse(w / 2, h * 0.68, 200, 50, 0, 0, 7); g.fill()
      ;['#ef4444', '#f59e0b', '#84cc16', '#ef4444'].forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(w / 2 - 110 + i * 72, h * 0.6, 42, 0, 7); g.fill() })
    }),
    make((g, w, h) => {
      sky(g, w, h, '#1e1b4b', '#7c3aed')
      for (let i = 0; i < 160; i++) { g.fillStyle = '#fff'; g.fillRect((i * 173) % w, (i * 71) % (h * 0.7), 2, 2) }
      g.fillStyle = '#0f172a'
      for (let i = 0; i < 12; i++) { const bw = 50 + (i % 3) * 25, bh = 120 + ((i * 53) % 220); g.fillRect(i * 80, h - bh, bw, bh) }
      g.fillStyle = '#fde047'
      for (let i = 0; i < 70; i++) g.fillRect(((i * 41) % 950) + 8, h - 20 - ((i * 37) % 200), 7, 9)
    }, 900, 900),
    make((g, w, h) => {
      for (let y = 0; y < h; y += 60) for (let x = 0; x < w; x += 60) { g.fillStyle = `hsl(${(x + y) / 6 + 170} 65% ${55 + ((x * y) % 7)}%)`; g.fillRect(x, y, 60, 60) }
      g.fillStyle = '#0006'; g.font = 'bold 90px system-ui'; g.textAlign = 'center'; g.fillText('Tiles', w / 2, h / 2 + 30)
    }),
  ]
}

function roundRect(g: CanvasRenderingContext2D, r: Rect, rad: number) {
  const k = Math.min(rad, r.w / 2, r.h / 2)
  g.beginPath()
  g.roundRect(r.x, r.y, r.w, r.h, k)
}

export default function CollageMaker() {
  const [s, set, reset] = useToolState('collage-maker', DEF)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [slots, setSlots] = useState<Slot[]>([])
  const [sel, setSel] = useState(0)
  const [pick, setPick] = useState<string | null>(null)
  const [drag, setDrag] = useState<'pan' | 'swap'>('pan')
  const cv = useRef<HTMLCanvasElement>(null)

  const areas = s.grid ? gridAreas(Math.max(1, Math.min(6, s.rows)), Math.max(1, Math.min(6, s.cols))) : s.useCustom ? s.custom : s.template
  const layout: Layout | null = useMemo(() => parseAreas(areas), [areas])
  const ratio = ASPECTS.find((a) => a[0] === s.aspect)?.[2] ?? 1
  const W = Math.max(200, Math.min(8000, s.width)), H = Math.round(W / ratio)

  const addFiles = (urls: { url: string; name: string }[]) => {
    for (const u of urls) {
      const img = new Image()
      img.onload = () => {
        const p: Photo = { id: Math.random().toString(36).slice(2), name: u.name, img, url: u.url }
        setPhotos((ps) => [...ps, p])
        setSlots((sl) => {
          const i = sl.findIndex((x) => !x.photo)
          if (i < 0) return sl
          const out = [...sl]
          out[i] = { ...EMPTY, photo: p.id }
          return out
        })
      }
      img.src = u.url
    }
  }
  const seeded = useRef(false)
  useEffect(() => {
    if (seeded.current) return
    seeded.current = true
    addFiles(demoPhotos().map((url, i) => ({ url, name: `demo-${i + 1}.jpg` })))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Keep one slot per cell.
  const n = layout?.cells.length ?? 0
  if (slots.length < n) {
    const used = new Set(slots.map((x) => x.photo))
    const free = photos.filter((p) => !used.has(p.id))
    setSlots([...slots, ...Array.from({ length: n - slots.length }, (_, i) => ({ ...EMPTY, photo: free[i]?.id ?? null }))])
  }

  const draw = (g: CanvasRenderingContext2D, w: number, h: number, highlight: boolean) => {
    if (!layout) return
    const k = w / W
    g.clearRect(0, 0, w, h)
    if (s.fmt === 'jpeg' || s.bg !== 'transparent') {
      g.fillStyle = s.bg
      g.fillRect(0, 0, w, h)
    }
    const rects = cellRects(layout, w, h, s.gap * k, s.margin * k)
    rects.forEach((r, i) => {
      const slot = slots[i]
      const p = photos.find((x) => x.id === slot?.photo)
      g.save()
      roundRect(g, r, s.radius * k)
      g.clip()
      if (p) {
        const c = coverCrop(p.img.naturalWidth, p.img.naturalHeight, r.w, r.h, slot.zoom, slot.px, slot.py)
        g.drawImage(p.img, c.sx, c.sy, c.sw, c.sh, r.x, r.y, r.w, r.h)
      } else {
        g.fillStyle = '#94a3b833'
        g.fillRect(r.x, r.y, r.w, r.h)
        if (highlight) {
          g.fillStyle = '#64748b'
          g.font = `${Math.max(12, r.w / 14)}px system-ui`
          g.textAlign = 'center'
          g.fillText('Drop or pick a photo', r.x + r.w / 2, r.y + r.h / 2)
        }
      }
      g.restore()
      if (highlight && i === sel) {
        g.strokeStyle = '#6366f1'
        g.lineWidth = 3
        roundRect(g, { x: r.x + 1.5, y: r.y + 1.5, w: r.w - 3, h: r.h - 3 }, s.radius * k)
        g.stroke()
      }
    })
    if (s.showCaption && s.caption.trim()) {
      const fs = (s.capSize / 100) * h
      g.font = `700 ${fs}px system-ui, sans-serif`
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      const y = h - s.margin * k - fs * 1.1
      if (s.capBand) {
        const tw = g.measureText(s.caption).width
        g.fillStyle = '#0008'
        g.beginPath()
        g.roundRect(w / 2 - tw / 2 - fs * 0.6, y - fs * 0.75, tw + fs * 1.2, fs * 1.5, fs * 0.3)
        g.fill()
      } else {
        g.shadowColor = '#000a'
        g.shadowBlur = fs * 0.25
      }
      g.fillStyle = s.capColor
      g.fillText(s.caption, w / 2, y)
      g.shadowBlur = 0
    }
  }

  // Preview canvas (~ 900 px wide, retina aware)
  const PW = 900, PH = Math.round(PW / ratio)
  useEffect(() => {
    const c = cv.current
    if (!c) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    c.width = PW * dpr
    c.height = PH * dpr
    const g = c.getContext('2d')!
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    draw(g, PW, PH, true)
  })

  const toLocal = (e: { clientX: number; clientY: number }) => {
    const r = cv.current!.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * PW, ((e.clientY - r.top) / r.height) * PH]
  }
  const rectsPreview = layout ? cellRects(layout, PW, PH, (s.gap * PW) / W, (s.margin * PW) / W) : []
  const dragRef = useRef<{ cell: number; x: number; y: number; px: number; py: number } | null>(null)
  const patch = (i: number, p: Partial<Slot>) => setSlots((sl) => sl.map((x, j) => (j === i ? { ...x, ...p } : x)))
  const place = (cell: number, photo: string) => patch(cell, { ...EMPTY, photo })

  const exportImg = () => {
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    draw(c.getContext('2d')!, W, H, false)
    c.toBlob((b) => b && download(`collage-${W}x${H}.${s.fmt === 'png' ? 'png' : 'jpg'}`, b, b.type), `image/${s.fmt}`, 0.92)
  }
  const shuffle = () => {
    const ids = photos.map((p) => p.id).sort(() => Math.random() - 0.5)
    setSlots(slots.map((_, i) => ({ ...EMPTY, photo: ids[i % Math.max(1, ids.length)] ?? null })))
  }
  const cur = slots[sel]

  return (
    <Split wide="right">
      <div>
        <Panel title="Layout">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(62px, 1fr))', gap: 6, marginBottom: 10 }}>
            {TEMPLATES.map(([name, t]) => {
              const l = parseAreas(t)!
              const on = !s.grid && !s.useCustom && s.template === t
              return (
                <button key={t} type="button" title={name} onClick={() => set({ template: t, grid: false, useCustom: false })}
                  style={{ display: 'grid', gridTemplateColumns: `repeat(${l.cols}, 1fr)`, gridTemplateRows: `repeat(${l.rows}, 1fr)`, gap: 2, aspectRatio: '1', padding: 4, borderRadius: 8, cursor: 'pointer', border: `2px solid ${on ? 'var(--accent)' : 'var(--line)'}`, background: 'var(--panel)' }}>
                  {l.cells.map((c) => <span key={c.name} style={{ gridArea: `${c.r0 + 1} / ${c.c0 + 1} / ${c.r1 + 2} / ${c.c1 + 2}`, background: on ? 'var(--accent)' : 'var(--muted)', opacity: 0.55, borderRadius: 2 }} />)}
                </button>
              )
            })}
          </div>
          <Check label="Uniform grid" value={s.grid} onChange={(grid) => set({ grid, useCustom: false })} />
          {s.grid && <Row><Num label="Rows" value={s.rows} onChange={(rows) => set({ rows })} min={1} max={6} step={1} /><Num label="Columns" value={s.cols} onChange={(cols) => set({ cols })} min={1} max={6} step={1} /></Row>}
          <Check label="Custom areas" value={s.useCustom} onChange={(useCustom) => set({ useCustom, grid: false })} />
          {s.useCustom && <Txt label="Areas (rows split by /, one letter per cell)" value={s.custom} onChange={(custom) => set({ custom })} hint="e.g. aab/aac/dde — repeated letters span." />}
          {!layout && <Note tone="err">Each letter must form a rectangle and all rows need the same length.</Note>}
        </Panel>
        <Panel title="Canvas & style">
          <Select label="Size" value={s.aspect} onChange={(aspect) => set({ aspect })} options={ASPECTS.map(([v, l]) => [v, l] as const)} />
          <Row>
            <Num label="Width" value={s.width} onChange={(width) => set({ width })} unit="px" min={200} max={8000} step={1} />
            <Select label="Format" value={s.fmt} onChange={(fmt) => set({ fmt })} options={[['png', 'PNG'], ['jpeg', 'JPEG']]} />
          </Row>
          <Slider label="Spacing" value={s.gap} onChange={(gap) => set({ gap })} min={0} max={80} unit=" px" show={String} />
          <Slider label="Outer margin" value={s.margin} onChange={(margin) => set({ margin })} min={0} max={160} unit=" px" show={String} />
          <Slider label="Corner radius" value={s.radius} onChange={(radius) => set({ radius })} min={0} max={200} unit=" px" show={String} />
          <Row>
            <label className="k-field"><span className="k-label">Background</span><input type="color" value={s.bg === 'transparent' ? '#ffffff' : s.bg} onChange={(e) => set({ bg: e.target.value })} /></label>
            {['#ffffff', '#111827', '#fef3c7', '#e0e7ff', '#fce7f3'].map((c) => <button key={c} type="button" aria-label={c} onClick={() => set({ bg: c })} style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid var(--line)', background: c, cursor: 'pointer' }} />)}
          </Row>
        </Panel>
        <Panel title="Caption">
          <Check label="Show caption" value={s.showCaption} onChange={(showCaption) => set({ showCaption })} />
          <Txt label="Text" value={s.caption} onChange={(caption) => set({ caption })} />
          <Row>
            <Slider label="Size" value={s.capSize} onChange={(capSize) => set({ capSize })} min={2} max={14} step={0.5} unit="%" />
            <label className="k-field"><span className="k-label">Colour</span><input type="color" value={s.capColor} onChange={(e) => set({ capColor: e.target.value })} /></label>
          </Row>
          <Check label="Dark band behind text" value={s.capBand} onChange={(capBand) => set({ capBand })} />
        </Panel>
      </div>
      <div>
        <Panel title={`Collage · ${W} × ${H} px`} actions={<><Btn onClick={shuffle}>🔀 Shuffle</Btn><Btn kind="primary" onClick={exportImg} disabled={!layout}>⬇ Export {s.fmt.toUpperCase()}</Btn><Btn kind="ghost" onClick={reset}>Reset</Btn></>}>
          <Row>
            <Seg value={drag} onChange={setDrag} options={[['pan', '✋ Drag pans photo'], ['swap', '⇄ Drag swaps cells']]} />
            <span className="muted" style={{ fontSize: 13 }}>Scroll over a cell to zoom.</span>
          </Row>
          <canvas
            ref={cv}
            style={{ width: '100%', maxWidth: ratio < 1 ? 520 : '100%', display: 'block', margin: '0 auto', touchAction: 'none', borderRadius: 6, boxShadow: '0 1px 6px rgba(0,0,0,.2)', background: 'repeating-conic-gradient(#8882 0 25%, transparent 0 50%) 0 0/16px 16px' }}
            onPointerDown={(e) => {
              const [x, y] = toLocal(e)
              const i = hitCell(rectsPreview, x, y)
              if (i < 0) return
              if (pick) {
                place(i, pick)
                setPick(null)
              }
              setSel(i)
              ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
              dragRef.current = { cell: i, x, y, px: slots[i]?.px ?? 0, py: slots[i]?.py ?? 0 }
            }}
            onPointerMove={(e) => {
              const d = dragRef.current
              if (!d || drag !== 'pan') return
              const [x, y] = toLocal(e)
              const r = rectsPreview[d.cell], slot = slots[d.cell], p = photos.find((q) => q.id === slot?.photo)
              if (!r || !p) return
              const c = coverCrop(p.img.naturalWidth, p.img.naturalHeight, r.w, r.h, slot.zoom)
              const sc = c.sw / r.w // source px per preview px
              const fx = (p.img.naturalWidth - c.sw) / 2, fy = (p.img.naturalHeight - c.sh) / 2
              patch(d.cell, { px: fx > 0.5 ? Math.max(-1, Math.min(1, d.px - ((x - d.x) * sc) / fx)) : 0, py: fy > 0.5 ? Math.max(-1, Math.min(1, d.py - ((y - d.y) * sc) / fy)) : 0 })
            }}
            onPointerUp={(e) => {
              const d = dragRef.current
              dragRef.current = null
              if (!d || drag !== 'swap') return
              const [x, y] = toLocal(e)
              const j = hitCell(rectsPreview, x, y)
              if (j >= 0 && j !== d.cell) {
                setSlots((sl) => sl.map((v, k) => (k === d.cell ? sl[j] : k === j ? sl[d.cell] : v)))
                setSel(j)
              }
            }}
            onWheel={(e) => {
              const [x, y] = toLocal(e)
              const i = hitCell(rectsPreview, x, y)
              if (i < 0 || !slots[i]?.photo) return
              patch(i, { zoom: Math.max(1, Math.min(5, slots[i].zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1))) })
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const [x, y] = toLocal(e)
              const i = hitCell(rectsPreview, x, y)
              const id = e.dataTransfer.getData('text/x-photo')
              if (i >= 0 && id) place(i, id)
              else if (e.dataTransfer.files.length) addFiles([...e.dataTransfer.files].filter((f) => f.type.startsWith('image/')).map((f) => ({ url: URL.createObjectURL(f), name: f.name })))
            }}
          />
          {cur && layout && (
            <Row>
              <b style={{ alignSelf: 'center' }}>Cell {sel + 1}</b>
              <Slider label="Zoom" value={cur.zoom} onChange={(zoom) => patch(sel, { zoom })} min={1} max={5} step={0.05} unit="×" />
              <Btn onClick={() => patch(sel, { zoom: 1, px: 0, py: 0 })}>Recenter</Btn>
              <Btn kind="ghost" onClick={() => patch(sel, { ...EMPTY })}>Clear cell</Btn>
            </Row>
          )}
        </Panel>
        <Panel title={`Photos (${photos.length})`} actions={<Btn kind="ghost" onClick={() => { setPhotos([]); setSlots(slots.map(() => ({ ...EMPTY }))) }}>Remove all</Btn>}>
          <FileDrop accept="image/*" multiple onFiles={(fs) => addFiles(fs.filter((f) => f.type.startsWith('image/')).map((f) => ({ url: URL.createObjectURL(f), name: f.name })))} label="Add photos (they fill empty cells in order)" />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {photos.map((p) => {
              const used = slots.some((x) => x.photo === p.id)
              return (
                <div key={p.id} style={{ position: 'relative' }}>
                  <img src={p.url} alt={p.name} draggable onDragStart={(e) => e.dataTransfer.setData('text/x-photo', p.id)} onClick={() => setPick(pick === p.id ? null : p.id)}
                    style={{ width: 76, height: 76, objectFit: 'cover', borderRadius: 8, cursor: 'grab', outline: pick === p.id ? '3px solid var(--accent)' : used ? '2px solid var(--ok)' : '1px solid var(--line)', opacity: used ? 1 : 0.8 }} />
                  <button type="button" aria-label="Remove photo" onClick={() => { setPhotos(photos.filter((x) => x.id !== p.id)); setSlots(slots.map((x) => (x.photo === p.id ? { ...EMPTY } : x))) }}
                    style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, border: 0, background: 'var(--err)', color: '#fff', fontSize: 11, cursor: 'pointer' }}>✕</button>
                </div>
              )
            })}
          </div>
          <Note>Drag a thumbnail onto a cell, or tap a thumbnail and then tap a cell. Green outline = in use. Photos stay on your device.</Note>
        </Panel>
      </div>
    </Split>
  )
}
