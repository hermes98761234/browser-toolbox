import { useEffect, useRef, useState } from 'react'
import { Btn, Check, FileDrop, Note, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, useToolState } from '../kit'
import { makeZip } from './lib/image-compressor'
import { scanMetadata, type MetaReport } from './lib/image-redaction-tool'
import { dropMask, faceToMask, hitTest, redact, resizeTo, type Mask, type RenderOpts, type Style } from './lib/face-blur-redactor'

interface Photo { id: string; name: string; src: HTMLCanvasElement; meta: MetaReport | null; masks: Mask[] }
type FD = new (o: object) => { detect: (i: CanvasImageSource) => Promise<{ boundingBox: DOMRectReadOnly }[]> }

const hasFD = typeof window !== 'undefined' && 'FaceDetector' in window
const EMOJI = ['🙂', '😎', '🐱', '🐻', '⭐', '🌸', '🤖', '👽']
const DEF = { style: 'blur' as Style, strength: 0.25, feather: 0.25, color: '#1f2937', emoji: '🙂', size: 0.09, fmt: 'image/jpeg', quality: 0.9, outlines: true }
const rid = () => Math.random().toString(36).slice(2, 9)

/** Synthetic group photo with cartoon faces so the tool has something to work on. */
function demoPhoto(seed: number): { canvas: HTMLCanvasElement; faces: Mask[] } {
  const W = 1200, H = 800
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  const sky = g.createLinearGradient(0, 0, 0, H)
  sky.addColorStop(0, seed ? '#fde68a' : '#93c5fd')
  sky.addColorStop(1, seed ? '#f97316' : '#e0f2fe')
  g.fillStyle = sky
  g.fillRect(0, 0, W, H)
  g.fillStyle = seed ? '#7c2d12' : '#166534'
  g.fillRect(0, H * 0.72, W, H)
  const skins = ['#f1c27d', '#c68642', '#8d5524', '#ffdbac', '#e0ac69']
  const shirts = ['#2563eb', '#db2777', '#059669', '#7c3aed', '#ea580c']
  const people = seed ? [[300, 330, 85], [600, 300, 95], [900, 340, 80]] : [[200, 360, 70], [420, 320, 78], [640, 350, 72], [860, 315, 80], [1050, 370, 66]]
  const faces: Mask[] = []
  people.forEach(([x, y, r], i) => {
    g.fillStyle = shirts[(i + seed) % 5]
    g.beginPath()
    g.ellipse(x, y + r * 2.6, r * 1.5, r * 1.6, 0, Math.PI, 0)
    g.fill()
    g.fillRect(x - r * 1.5, y + r * 2.6, r * 3, H)
    g.fillStyle = skins[(i + seed * 2) % 5]
    g.beginPath()
    g.ellipse(x, y, r * 0.8, r, 0, 0, 7)
    g.fill()
    g.fillStyle = '#3f2a1d'
    g.beginPath()
    g.ellipse(x, y - r * 0.55, r * 0.85, r * 0.5, 0, Math.PI, 0)
    g.fill()
    g.fillStyle = '#111827'
    for (const dx of [-0.3, 0.3]) {
      g.beginPath()
      g.arc(x + dx * r, y - r * 0.05, r * 0.09, 0, 7)
      g.fill()
    }
    g.strokeStyle = '#7f1d1d'
    g.lineWidth = r * 0.07
    g.beginPath()
    g.arc(x, y + r * 0.25, r * 0.3, 0.15 * Math.PI, 0.85 * Math.PI)
    g.stroke()
    faces.push({ id: rid(), cx: x / W, cy: (y - r * 0.1) / H, rx: (r * 1.0) / W, ry: (r * 1.25) / H })
  })
  g.fillStyle = 'rgba(0,0,0,.55)'
  g.font = '22px system-ui, sans-serif'
  g.fillText(seed ? 'Demo photo 2 — no masks yet: copy them or click faces' : 'Demo photo 1 — team picnic', 24, H - 24)
  return { canvas: c, faces }
}

function render(src: HTMLCanvasElement, masks: Mask[], o: RenderOpts & { emoji: string }, scale = 1): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(src.width * scale))
  c.height = Math.max(1, Math.round(src.height * scale))
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.drawImage(src, 0, 0, c.width, c.height)
  if (masks.length) {
    const id = g.getImageData(0, 0, c.width, c.height)
    redact(id, masks, o)
    g.putImageData(id, 0, 0)
    if (o.style === 'emoji')
      for (const m of masks) {
        const fs = m.ry * c.height * 2.05
        g.font = `${fs}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        g.save()
        g.translate(m.cx * c.width, m.cy * c.height)
        g.scale((m.rx * c.width) / (m.ry * c.height), 1)
        g.fillText(o.emoji, 0, fs * 0.06)
        g.restore()
      }
  }
  return c
}

export default function FaceBlurRedactor() {
  const [s, set] = useToolState('face-blur-redactor', DEF)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [cur, setCur] = useState(0)
  const [selId, setSelId] = useState('')
  const [msg, setMsg] = useState<{ tone: 'info' | 'ok' | 'err' | 'warn'; text: string } | null>(null)
  const view = useRef<HTMLCanvasElement>(null)
  const drag = useRef<{ id: string; part: 'body' | 'handle'; dx: number; dy: number; fresh?: [number, number] } | null>(null)
  const p = photos[Math.min(cur, photos.length - 1)]
  const opts = { style: s.style, strength: s.strength, feather: s.feather, color: s.color, emoji: s.emoji }

  useEffect(() => {
    const a = demoPhoto(0), b = demoPhoto(1)
    setPhotos([
      { id: rid(), name: 'demo-picnic.jpg', src: a.canvas, meta: null, masks: a.faces },
      { id: rid(), name: 'demo-sunset.jpg', src: b.canvas, meta: null, masks: [] },
    ])
  }, [])

  const setMasks = (fn: (m: Mask[]) => Mask[], idx = cur) => setPhotos((l) => l.map((ph, i) => (i === idx ? { ...ph, masks: fn(ph.masks) } : ph)))

  // Preview render (scaled down for speed; export is full resolution).
  useEffect(() => {
    const c = view.current
    if (!c || !p) return
    const scale = Math.min(1, 1100 / p.src.width)
    const out = render(p.src, p.masks, opts, scale)
    c.width = out.width
    c.height = out.height
    const g = c.getContext('2d')!
    g.drawImage(out, 0, 0)
    if (s.outlines)
      for (const m of p.masks) {
        const sel = m.id === selId
        g.strokeStyle = sel ? '#facc15' : m.auto ? '#22d3ee' : 'rgba(255,255,255,.85)'
        g.lineWidth = sel ? 3 : 2
        g.setLineDash(sel ? [] : [6, 4])
        g.beginPath()
        g.ellipse(m.cx * c.width, m.cy * c.height, m.rx * c.width, m.ry * c.height, 0, 0, 7)
        g.stroke()
        g.setLineDash([])
        g.fillStyle = sel ? '#facc15' : '#ffffff'
        g.beginPath()
        g.arc((m.cx + m.rx * Math.SQRT1_2) * c.width, (m.cy + m.ry * Math.SQRT1_2) * c.height, 7, 0, 7)
        g.fill()
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p, s.style, s.strength, s.feather, s.color, s.emoji, s.outlines, selId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selId && !(e.target instanceof HTMLInputElement)) {
        setMasks((m) => m.filter((x) => x.id !== selId))
        setSelId('')
      }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = e.currentTarget, r = c.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * c.width, ((e.clientY - r.top) / r.height) * c.height, c.width, c.height]
  }
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!p) return
    const [x, y, W, H] = pos(e)
    e.currentTarget.setPointerCapture(e.pointerId)
    const hit = hitTest(p.masks, x, y, W, H, 12)
    if (hit) {
      const m = p.masks.find((k) => k.id === hit.id)!
      drag.current = { ...hit, dx: x / W - m.cx, dy: y / H - m.cy }
      setSelId(hit.id)
    } else {
      const m = dropMask(x, y, W, H, s.size, rid())
      setMasks((l) => [...l, m])
      setSelId(m.id)
      drag.current = { id: m.id, part: 'handle', dx: 0, dy: 0, fresh: [x, y] }
    }
  }
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current
    if (!d) return
    const [x, y, W, H] = pos(e)
    if (d.fresh) {
      if (Math.hypot(x - d.fresh[0], y - d.fresh[1]) < 12) return
      d.fresh = undefined
    }
    setMasks((l) => l.map((m) => (m.id !== d.id ? m : d.part === 'handle' ? (e.buttons ? resizeTo(m, x, y, W, H) : m) : { ...m, cx: x / W - d.dx, cy: y / H - d.dy })))
  }

  const add = async (files: File[]) => {
    const out: Photo[] = []
    for (const f of files) {
      try {
        const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' })
        const c = document.createElement('canvas')
        c.width = bmp.width
        c.height = bmp.height
        c.getContext('2d')!.drawImage(bmp, 0, 0)
        out.push({ id: rid(), name: f.name, src: c, meta: scanMetadata(new Uint8Array(await f.slice(0, 256 * 1024).arrayBuffer())), masks: [] })
      } catch {
        setMsg({ tone: 'err', text: `${f.name}: this browser cannot decode the image.` })
      }
    }
    setPhotos((l) => [...l, ...out])
    if (out.length) setCur(photos.length)
  }

  const detect = async (idx: number[]) => {
    if (!hasFD) return
    const Det = (window as unknown as { FaceDetector: FD }).FaceDetector
    let n = 0
    try {
      const det = new Det({ fastMode: false, maxDetectedFaces: 64 })
      for (const i of idx) {
        const ph = photos[i]
        const faces = await det.detect(ph.src)
        n += faces.length
        setMasks((l) => [...l.filter((m) => !m.auto), ...faces.map((f) => faceToMask(f.boundingBox, ph.src.width, ph.src.height, 0.3, rid()))], i)
      }
      setMsg({ tone: n ? 'ok' : 'warn', text: n ? `Found ${n} face${n > 1 ? 's' : ''}. Check every photo: detectors miss profiles, small and partly hidden faces.` : 'No faces found. Add masks by clicking.' })
    } catch (e) {
      setMsg({ tone: 'err', text: `Face detection failed: ${(e as Error).message}` })
    }
  }

  const copyTo = (targets: number[]) => {
    if (!p) return
    setPhotos((l) => l.map((ph, i) => (targets.includes(i) ? { ...ph, masks: [...ph.masks, ...p.masks.map((m) => ({ ...m, id: rid(), auto: false }))] } : ph)))
    if (targets.length === 1) setCur(targets[0])
  }

  const exportOne = async (ph: Photo) => {
    const c = render(ph.src, ph.masks, opts)
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, s.fmt, s.quality))
    return { blob, name: ph.name.replace(/\.[^.]+$/, '') + '-redacted.' + (s.fmt === 'image/png' ? 'png' : s.fmt === 'image/webp' ? 'webp' : 'jpg') }
  }
  const save = async (all: boolean) => {
    const list = all ? photos : p ? [p] : []
    if (all && list.length > 1) {
      const files = []
      for (const ph of list) {
        const { blob, name } = await exportOne(ph)
        if (blob) files.push({ name, data: new Uint8Array(await blob.arrayBuffer()) })
      }
      const zip = makeZip(files)
      dl(new Blob([zip as Uint8Array<ArrayBuffer>], { type: 'application/zip' }), 'redacted-photos.zip')
    } else if (list[0]) {
      const { blob, name } = await exportOne(list[0])
      if (blob) dl(blob, name)
    }
    setMsg({ tone: 'ok', text: 'Exported. Pixels inside every mask were overwritten, and the file was re-encoded from the canvas, so EXIF, GPS, XMP and maker notes are gone.' })
  }
  const dl = (b: Blob, name: string) => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(b)
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }

  const totalMasks = photos.reduce((a, ph) => a + ph.masks.length, 0)
  const unmasked = photos.filter((ph) => !ph.masks.length).length

  return (
    <Split wide="right">
      <div>
        <Panel title="Photos">
          <FileDrop accept="image/*" multiple onFiles={(f) => void add(f)} label="Drop photos here (batch) or click to choose" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: 8, marginTop: 10 }}>
            {photos.map((ph, i) => (
              <button key={ph.id} type="button" onClick={() => { setCur(i); setSelId('') }} className="k-btn" style={{ padding: 4, display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 2, outline: i === cur ? '2px solid var(--accent)' : undefined }} title={ph.name}>
                <img alt={ph.name} src={thumb(ph.src)} style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 6 }} />
                <span style={{ fontSize: 12 }}>{ph.masks.length} mask{ph.masks.length === 1 ? '' : 's'}</span>
              </button>
            ))}
          </div>
        </Panel>
        <Panel title="Style">
          <Seg value={s.style} onChange={(style) => set({ style })} options={[['blur', 'Blur'], ['pixelate', 'Pixelate'], ['solid', 'Solid'], ['emoji', 'Emoji']]} />
          {s.style !== 'solid' && s.style !== 'emoji' && <Slider label="Strength" value={s.strength} onChange={(strength) => set({ strength })} min={0.06} max={0.4} step={0.01} show={(v) => `${Math.round(v * 100)}%`} />}
          {s.style === 'solid' && <label className="k-field"><span className="k-label">Fill colour</span><input type="color" value={s.color} onChange={(e) => set({ color: e.target.value })} /></label>}
          {s.style === 'emoji' && (
            <div className="k-seg" style={{ flexWrap: 'wrap' }}>
              {EMOJI.map((em) => <button key={em} type="button" className={em === s.emoji ? 'on' : ''} onClick={() => set({ emoji: em })} style={{ fontSize: 20 }}>{em}</button>)}
            </div>
          )}
          <Slider label="Edge feather" value={s.feather} onChange={(feather) => set({ feather })} min={0} max={0.6} step={0.01} show={(v) => `${Math.round(v * 100)}%`} />
          <Slider label="New mask size" value={s.size} onChange={(size) => set({ size })} min={0.03} max={0.25} step={0.005} show={(v) => `${Math.round(v * 100)}%`} />
          <Check label="Show mask outlines in the preview" value={s.outlines} onChange={(outlines) => set({ outlines })} />
        </Panel>
        <Panel title="Export">
          <Row>
            <Select label="Format" value={s.fmt} onChange={(fmt) => set({ fmt })} options={[['image/jpeg', 'JPEG'], ['image/png', 'PNG'], ['image/webp', 'WebP']]} />
            {s.fmt !== 'image/png' && <Slider label="Quality" value={s.quality} onChange={(quality) => set({ quality })} min={0.5} max={1} step={0.01} show={(v) => `${Math.round(v * 100)}`} />}
          </Row>
          <Row>
            <Btn kind="primary" onClick={() => void save(false)} disabled={!p}>⬇ This photo</Btn>
            <Btn onClick={() => void save(true)} disabled={photos.length < 2}>⬇ All as ZIP ({photos.length})</Btn>
          </Row>
          {p?.meta && (p.meta.exif || p.meta.xmp || p.meta.iptc) && <Note tone="warn">The original {p.meta.format} carries {[p.meta.exif && 'EXIF', p.meta.gps && 'GPS location', p.meta.xmp && 'XMP', p.meta.iptc && 'IPTC'].filter(Boolean).join(', ')}. The export drops all of it.</Note>}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Photos" value={photos.length} />
          <Stat label="Masks" value={totalMasks} sub={p ? `${p.masks.length} on this photo` : ''} />
          <Stat label="Without masks" value={unmasked} tone={unmasked ? 'bad' : 'good'} sub={unmasked ? 'check before exporting' : 'all covered'} />
          <Stat label="Face detection" value={hasFD ? 'Available' : 'Manual'} tone={hasFD ? 'good' : 'accent'} sub={hasFD ? 'Shape Detection API' : 'click to mask faces'} />
        </Stats>
        <Panel
          title={p ? p.name : 'Preview'}
          actions={
            <>
              {hasFD && <Btn kind="primary" onClick={() => void detect([cur])}>Detect faces</Btn>}
              {hasFD && photos.length > 1 && <Btn onClick={() => void detect(photos.map((_, i) => i))}>Detect in all</Btn>}
              <Btn onClick={() => copyTo([cur + 1])} disabled={!p?.masks.length || cur >= photos.length - 1}>Copy masks → next</Btn>
              <Btn onClick={() => copyTo(photos.map((_, i) => i).filter((i) => i !== cur))} disabled={!p?.masks.length || photos.length < 2}>→ all</Btn>
              <Btn kind="ghost" onClick={() => { setMasks(() => []); setSelId('') }} disabled={!p?.masks.length}>Clear</Btn>
              <Btn kind="danger" onClick={() => { setMasks((l) => l.filter((m) => m.id !== selId)); setSelId('') }} disabled={!selId}>Delete selected</Btn>
            </>
          }
        >
          <canvas ref={view} onPointerDown={down} onPointerMove={move} onPointerUp={() => (drag.current = null)} style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 8, cursor: 'crosshair', touchAction: 'none', background: 'var(--line)' }} />
          <p className="muted" style={{ fontSize: 13 }}>
            Click a face to drop an elliptical mask (drag while clicking to size it). Drag a mask to move it, drag its round handle to resize, press Delete to remove the selected one. Masks are stored relative to the photo, so “Copy masks” works for burst shots of different sizes.
          </p>
          {!hasFD && <Note>Automatic detection needs the browser Shape Detection API (FaceDetector), which this browser does not expose. In Chrome it can be enabled with the “Experimental Web Platform features” flag. Manual mode below is fast: one click per face.</Note>}
          {msg && <Note tone={msg.tone}>{msg.text}</Note>}
        </Panel>
        <Note tone="info">Redaction is irreversible: blur adds quantisation and noise, pixelate averages whole blocks and solid overwrites, so the originals cannot be recovered from the exported file. Everything runs locally; nothing is uploaded.</Note>
      </div>
    </Split>
  )
}

const thumbs = new WeakMap<HTMLCanvasElement, string>()
function thumb(c: HTMLCanvasElement): string {
  let u = thumbs.get(c)
  if (!u) {
    const t = document.createElement('canvas')
    t.width = 160
    t.height = Math.round((160 * c.height) / c.width)
    t.getContext('2d')!.drawImage(c, 0, 0, t.width, t.height)
    u = t.toDataURL('image/jpeg', 0.7)
    thumbs.set(c, u)
  }
  return u
}
