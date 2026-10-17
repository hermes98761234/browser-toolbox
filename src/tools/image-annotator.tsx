import { useCallback, useEffect, useRef, useState } from 'react'
import { Btn, FileDrop, Note, Panel, Row, Seg, Slider, Split, download, uid, useToolState } from '../kit'
import { AREA_KINDS, arrowHead, bounds, hit, move, nextStep, pixelate, stepRadius, textSize, type Kind, type Shape } from './lib/image-annotator'

const TOOLS: [Kind | 'select', string, string][] = [
  ['select', '↖', 'Select / move'], ['arrow', '➜', 'Arrow'], ['rect', '▭', 'Box'], ['ellipse', '◯', 'Ellipse'], ['line', '╱', 'Line'],
  ['pen', '✎', 'Freehand'], ['text', 'T', 'Text'], ['step', '①', 'Step number'], ['highlight', '▆', 'Highlighter'],
  ['pixelate', '▦', 'Pixelate'], ['blur', '◌', 'Blur'], ['redact', '■', 'Redact (solid)'],
]
const SWATCH = ['#ef4444', '#f59e0b', '#facc15', '#22c55e', '#0ea5e9', '#6366f1', '#ec4899', '#111827', '#ffffff']

interface Prefs { tool: Kind | 'select'; color: string; width: number; fmt: 'png' | 'jpeg' }
const DEF: Prefs = { tool: 'arrow', color: '#ef4444', width: 4, fmt: 'png' }

function demoImage(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 1200
  c.height = 720
  const g = c.getContext('2d')!
  g.fillStyle = '#f8fafc'
  g.fillRect(0, 0, 1200, 720)
  g.fillStyle = '#1e293b'
  g.fillRect(0, 0, 220, 720)
  g.fillStyle = '#ffffff'
  g.fillRect(220, 0, 980, 64)
  g.font = 'bold 22px system-ui, sans-serif'
  g.fillStyle = '#f8fafc'
  g.fillText('◆ Acme Cloud', 24, 40)
  g.font = '17px system-ui, sans-serif'
  ;['Dashboard', 'Projects', 'Billing', 'API keys', 'Settings'].forEach((t, i) => {
    g.fillStyle = i === 3 ? '#334155' : 'transparent'
    g.fillRect(12, 92 + i * 48, 196, 38)
    g.fillStyle = '#cbd5e1'
    g.fillText(t, 28, 117 + i * 48)
  })
  g.fillStyle = '#0f172a'
  g.font = 'bold 26px system-ui, sans-serif'
  g.fillText('API keys', 250, 42)
  g.font = '15px system-ui, sans-serif'
  g.fillStyle = '#64748b'
  g.fillText('signed in as jordan.miller@example.com', 870, 40)
  const card = (x: number, y: number, w: number, h: number) => {
    g.fillStyle = '#ffffff'
    g.strokeStyle = '#e2e8f0'
    g.lineWidth = 2
    g.beginPath()
    g.roundRect(x, y, w, h, 12)
    g.fill()
    g.stroke()
  }
  card(250, 96, 900, 210)
  g.fillStyle = '#0f172a'
  g.font = 'bold 19px system-ui, sans-serif'
  g.fillText('Production key', 278, 134)
  g.font = '18px ui-monospace, monospace'
  g.fillStyle = '#334155'
  g.fillText('demo_key_0000-not-a-real-secret', 278, 180)
  g.font = '15px system-ui, sans-serif'
  g.fillStyle = '#64748b'
  g.fillText('Created 12 Mar 2026 · last used 2 minutes ago', 278, 214)
  g.fillStyle = '#6366f1'
  g.beginPath()
  g.roundRect(278, 240, 150, 42, 8)
  g.fill()
  g.fillStyle = '#ffffff'
  g.font = 'bold 16px system-ui, sans-serif'
  g.fillText('Roll key', 318, 267)
  g.strokeStyle = '#cbd5e1'
  g.beginPath()
  g.roundRect(444, 240, 150, 42, 8)
  g.stroke()
  g.fillStyle = '#334155'
  g.fillText('Copy', 498, 267)
  card(250, 330, 435, 340)
  card(715, 330, 435, 340)
  g.fillStyle = '#0f172a'
  g.font = 'bold 18px system-ui, sans-serif'
  g.fillText('Requests (7 days)', 278, 368)
  g.fillText('Usage limits', 743, 368)
  ;[120, 160, 140, 210, 190, 250, 230].forEach((v, i) => {
    g.fillStyle = '#818cf8'
    g.fillRect(290 + i * 54, 640 - v, 34, v)
  })
  g.font = '16px system-ui, sans-serif'
  ;['Requests / min', 'Monthly quota', 'Webhooks'].forEach((t, i) => {
    g.fillStyle = '#334155'
    g.fillText(t, 743, 420 + i * 70)
    g.fillStyle = '#e2e8f0'
    g.fillRect(743, 436 + i * 70, 370, 10)
    g.fillStyle = ['#22c55e', '#f59e0b', '#0ea5e9'][i]
    g.fillRect(743, 436 + i * 70, [140, 300, 90][i], 10)
  })
  return c
}

const demoShapes = (): Shape[] => [
  { id: uid(), kind: 'pixelate', x1: 272, y1: 158, x2: 690, y2: 190, color: '#000', width: 4 },
  { id: uid(), kind: 'rect', x1: 268, y1: 230, x2: 438, y2: 292, color: '#ef4444', width: 4 },
  { id: uid(), kind: 'arrow', x1: 640, y1: 300, x2: 446, y2: 268, color: '#ef4444', width: 5 },
  { id: uid(), kind: 'text', x1: 600, y1: 296, x2: 600, y2: 296, color: '#ef4444', width: 3, text: 'Rotate the key here' },
  { id: uid(), kind: 'step', x1: 236, y1: 210, x2: 236, y2: 210, color: '#6366f1', width: 3, n: 1 },
  { id: uid(), kind: 'step', x1: 700, y1: 345, x2: 700, y2: 345, color: '#6366f1', width: 3, n: 2 },
  { id: uid(), kind: 'highlight', x1: 740, y1: 470, x2: 1120, y2: 516, color: '#facc15', width: 4 },
  { id: uid(), kind: 'blur', x1: 860, y1: 20, x2: 1180, y2: 50, color: '#000', width: 4 },
]

function drawShape(g: CanvasRenderingContext2D, s: Shape) {
  const b = bounds(s)
  g.save()
  g.strokeStyle = g.fillStyle = s.color
  g.lineWidth = s.width
  g.lineCap = g.lineJoin = 'round'
  if (s.kind === 'rect') g.strokeRect(b.x, b.y, b.w, b.h)
  else if (s.kind === 'ellipse') {
    g.beginPath()
    g.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2)
    g.stroke()
  } else if (s.kind === 'line' || s.kind === 'arrow') {
    const head = arrowHead(s.x1, s.y1, s.x2, s.y2, s.width)
    const ex = s.kind === 'arrow' ? (head[1][0] + head[2][0]) / 2 : s.x2
    const ey = s.kind === 'arrow' ? (head[1][1] + head[2][1]) / 2 : s.y2
    g.beginPath()
    g.moveTo(s.x1, s.y1)
    g.lineTo(ex, ey)
    g.stroke()
    if (s.kind === 'arrow') {
      g.beginPath()
      head.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
      g.closePath()
      g.fill()
      g.lineWidth = Math.max(1, s.width / 2)
      g.stroke()
    }
  } else if (s.kind === 'pen') {
    g.beginPath()
    s.pts?.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
    g.stroke()
  } else if (s.kind === 'highlight') {
    g.globalAlpha = 0.38
    g.globalCompositeOperation = 'multiply'
    g.fillRect(b.x, b.y, b.w, b.h)
  } else if (s.kind === 'redact') {
    g.fillStyle = '#000'
    g.fillRect(b.x, b.y, b.w, b.h)
  } else if (s.kind === 'pixelate' && b.w >= 1 && b.h >= 1) {
    const x = Math.round(b.x), y = Math.round(b.y), w = Math.round(b.w), h = Math.round(b.h)
    const d = g.getImageData(x, y, w, h)
    pixelate(d.data, w, h, 4 + s.width * 2)
    g.putImageData(d, x, y)
  } else if (s.kind === 'blur' && b.w >= 1 && b.h >= 1) {
    const r = 2 + s.width * 1.5, pad = Math.ceil(r * 2)
    const t = document.createElement('canvas')
    t.width = Math.round(b.w) + pad * 2
    t.height = Math.round(b.h) + pad * 2
    t.getContext('2d')!.drawImage(g.canvas, -Math.round(b.x) + pad, -Math.round(b.y) + pad)
    g.beginPath()
    g.rect(b.x, b.y, b.w, b.h)
    g.clip()
    g.filter = `blur(${r}px)`
    g.drawImage(t, Math.round(b.x) - pad, Math.round(b.y) - pad)
  } else if (s.kind === 'text') {
    const fs = textSize(s.width)
    g.font = `bold ${fs}px system-ui, sans-serif`
    g.textBaseline = 'top'
    ;(s.text ?? '').split('\n').forEach((l, i) => {
      const y = s.y1 + fs * 0.2 + i * fs * 1.25
      g.lineWidth = fs / 4.5
      g.strokeStyle = s.color === '#ffffff' ? '#111827' : '#ffffff'
      g.strokeText(l, s.x1 + fs * 0.3, y)
      g.fillText(l, s.x1 + fs * 0.3, y)
    })
  } else if (s.kind === 'step') {
    const r = stepRadius(s.width)
    g.beginPath()
    g.arc(s.x1, s.y1, r, 0, Math.PI * 2)
    g.fill()
    g.lineWidth = Math.max(2, r / 6)
    g.strokeStyle = '#fff'
    g.stroke()
    g.fillStyle = s.color === '#ffffff' ? '#111827' : '#fff'
    g.font = `bold ${r * 1.1}px system-ui, sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(String(s.n ?? 1), s.x1, s.y1 + r * 0.06)
  }
  g.restore()
}

type Drag = { mode: 'new' | 'move' | 'h1' | 'h2'; id: string; x: number; y: number; before: Shape[] }

export default function ImageAnnotator() {
  const [p, set] = useToolState('image-annotator', DEF)
  const [base, setBase] = useState<HTMLCanvasElement | null>(demoImage)
  const [name, setName] = useState('demo-screenshot')
  const [shapes, setShapes] = useState<Shape[]>(demoShapes)
  const [undo, setUndo] = useState<Shape[][]>([])
  const [redo, setRedo] = useState<Shape[][]>([])
  const [selId, setSelId] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const cv = useRef<HTMLCanvasElement>(null)
  const drag = useRef<Drag | null>(null)
  const textBox = useRef<HTMLTextAreaElement>(null)
  const sel = shapes.find((s) => s.id === selId) ?? null

  const render = useCallback((g: CanvasRenderingContext2D, withSel: boolean) => {
    if (!base) return
    g.drawImage(base, 0, 0)
    for (const s of shapes) drawShape(g, s)
    const s = withSel ? shapes.find((x) => x.id === selId) : null
    if (s) {
      const b = bounds(s)
      const k = base.width / 900
      g.save()
      g.setLineDash([6 * k, 4 * k])
      g.strokeStyle = '#0ea5e9'
      g.lineWidth = 1.5 * k
      g.strokeRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8)
      g.setLineDash([])
      if (!['pen', 'text', 'step'].includes(s.kind))
        for (const [x, y] of [[s.x1, s.y1], [s.x2, s.y2]]) {
          g.fillStyle = '#fff'
          g.fillRect(x - 6 * k, y - 6 * k, 12 * k, 12 * k)
          g.strokeRect(x - 6 * k, y - 6 * k, 12 * k, 12 * k)
        }
      g.restore()
    }
  }, [base, shapes, selId])

  useEffect(() => {
    const c = cv.current
    if (!c || !base) return
    c.width = base.width
    c.height = base.height
    render(c.getContext('2d', { willReadFrequently: true })!, true)
  }, [base, render])

  const commit = (next: Shape[], before = shapes) => {
    setUndo((u) => [...u.slice(-60), before])
    setRedo([])
    setShapes(next)
  }
  const doUndo = () => {
    if (!undo.length) return
    setRedo((r) => [...r, shapes])
    setShapes(undo[undo.length - 1])
    setUndo((u) => u.slice(0, -1))
  }
  const doRedo = () => {
    if (!redo.length) return
    setUndo((u) => [...u, shapes])
    setShapes(redo[redo.length - 1])
    setRedo((r) => r.slice(0, -1))
  }
  const patchSel = (patch: Partial<Shape>) => sel && commit(shapes.map((s) => (s.id === sel.id ? { ...s, ...patch } : s)))
  const removeSel = () => {
    if (!sel) return
    commit(shapes.filter((s) => s.id !== sel.id))
    setSelId(null)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selId) {
        e.preventDefault()
        removeSel()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) doRedo()
        else doUndo()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        doRedo()
      }
    }
    const onPaste = (e: ClipboardEvent) => {
      const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith('image/'))
      if (f) void openFile(f)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('paste', onPaste)
    }
  })

  async function openFile(f: File) {
    try {
      const bmp = await createImageBitmap(f)
      const k = Math.min(1, 4096 / Math.max(bmp.width, bmp.height))
      const c = document.createElement('canvas')
      c.width = Math.round(bmp.width * k)
      c.height = Math.round(bmp.height * k)
      c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
      setBase(c)
      setName(f.name.replace(/\.[^.]+$/, ''))
      setShapes([])
      setUndo([])
      setRedo([])
      setSelId(null)
      setErr('')
    } catch {
      setErr(`Could not open ${f.name} as an image.`)
    }
  }

  const pos = (e: React.PointerEvent) => {
    const r = cv.current!.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * cv.current!.width, ((e.clientY - r.top) / r.height) * cv.current!.height] as [number, number]
  }
  const scale = () => (cv.current ? cv.current.width / cv.current.getBoundingClientRect().width : 1)

  function down(e: React.PointerEvent) {
    if (!base) return
    const [x, y] = pos(e)
    cv.current!.setPointerCapture(e.pointerId)
    const tol = 6 * scale()
    if (p.tool === 'select') {
      if (sel && !['pen', 'text', 'step'].includes(sel.kind)) {
        if (Math.hypot(x - sel.x1, y - sel.y1) < tol * 1.6) return void (drag.current = { mode: 'h1', id: sel.id, x, y, before: shapes })
        if (Math.hypot(x - sel.x2, y - sel.y2) < tol * 1.6) return void (drag.current = { mode: 'h2', id: sel.id, x, y, before: shapes })
      }
      const h = [...shapes].reverse().find((s) => hit(s, x, y, tol))
      setSelId(h?.id ?? null)
      if (h) drag.current = { mode: 'move', id: h.id, x, y, before: shapes }
      return
    }
    const s: Shape = { id: uid(), kind: p.tool, x1: x, y1: y, x2: x, y2: y, color: p.color, width: p.width, pts: p.tool === 'pen' ? [[x, y]] : undefined }
    if (p.tool === 'text' || p.tool === 'step') {
      const n = { ...s, text: p.tool === 'text' ? 'Your text' : undefined, n: p.tool === 'step' ? nextStep(shapes) : undefined }
      commit([...shapes, n])
      setSelId(n.id)
      if (p.tool === 'text') {
        set({ tool: 'select' })
        setTimeout(() => textBox.current?.select(), 30)
      }
      return
    }
    drag.current = { mode: 'new', id: s.id, x, y, before: shapes }
    setShapes([...shapes, s])
  }

  function moveP(e: React.PointerEvent) {
    const d = drag.current
    if (!d) return
    let [x, y] = pos(e)
    setShapes((all) => all.map((s) => {
      if (s.id !== d.id) return s
      if (d.mode === 'move') return move(d.before.find((o) => o.id === s.id) ?? s, x - d.x, y - d.y)
      if (s.kind === 'pen') return { ...s, pts: [...(s.pts ?? []), [x, y]] }
      const ox = d.mode === 'h1' ? s.x2 : s.x1, oy = d.mode === 'h1' ? s.y2 : s.y1
      if (e.shiftKey) {
        const dx = x - ox, dy = y - oy
        if (s.kind === 'line' || s.kind === 'arrow') {
          const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), L = Math.hypot(dx, dy)
          x = ox + L * Math.cos(a)
          y = oy + L * Math.sin(a)
        } else {
          const m = Math.max(Math.abs(dx), Math.abs(dy))
          x = ox + Math.sign(dx || 1) * m
          y = oy + Math.sign(dy || 1) * m
        }
      }
      return d.mode === 'h1' ? { ...s, x1: x, y1: y } : { ...s, x2: x, y2: y }
    }))
  }

  function up() {
    const d = drag.current
    drag.current = null
    if (!d) return
    const s = shapes.find((o) => o.id === d.id)
    if (!s) return
    const b = bounds(s)
    const tiny = s.kind === 'pen' ? (s.pts?.length ?? 0) < 2 : AREA_KINDS.includes(s.kind) ? b.w < 3 || b.h < 3 : Math.hypot(s.x2 - s.x1, s.y2 - s.y1) < 4
    if (d.mode === 'new' && tiny) return setShapes(d.before)
    if (JSON.stringify(d.before) !== JSON.stringify(shapes)) commit(shapes, d.before)
    if (d.mode === 'new') setSelId(s.id)
  }

  function exportImage(copy: boolean) {
    if (!base) return
    const c = document.createElement('canvas')
    c.width = base.width
    c.height = base.height
    const g = c.getContext('2d', { willReadFrequently: true })!
    render(g, false)
    const type = copy ? 'image/png' : `image/${p.fmt}`
    c.toBlob((blob) => {
      if (!blob) return
      if (copy) void navigator.clipboard?.write([new ClipboardItem({ 'image/png': blob })]).catch(() => setErr('Clipboard image copy is not allowed here — use Download instead.'))
      else download(`${name}-annotated.${p.fmt === 'png' ? 'png' : 'jpg'}`, blob)
    }, type, 0.92)
  }

  const counts = shapes.reduce<Record<string, number>>((a, s) => ((a[s.kind] = (a[s.kind] ?? 0) + 1), a), {})

  return (
    <Split wide="right">
      <div>
        <Panel title="Image">
          <FileDrop accept="image/*" onFiles={(f) => openFile(f[0])} label="Drop, choose or paste (Ctrl+V) an image" />
          <Row>
            <Btn onClick={() => { setBase(demoImage()); setShapes(demoShapes()); setName('demo-screenshot'); setUndo([]); setRedo([]); setSelId(null) }}>Load demo screenshot</Btn>
          </Row>
          {err && <Note tone="err">{err}</Note>}
        </Panel>
        <Panel title="Tools">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {TOOLS.map(([k, icon, label]) => (
              <button key={k} type="button" className={`k-btn ${p.tool === k ? 'primary' : ''}`} title={label} onClick={() => set({ tool: k })} style={{ flexDirection: 'column', padding: '6px 2px', fontSize: 12, gap: 2 }}>
                <span style={{ fontSize: 18, lineHeight: 1 }}>{icon}</span>
                {label.split(' ')[0]}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '12px 0' }}>
            {SWATCH.map((c) => (
              <button key={c} type="button" aria-label={`Colour ${c}`} onClick={() => { set({ color: c }); if (sel) patchSel({ color: c }) }}
                style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: p.color === c ? '3px solid var(--accent)' : '1px solid var(--line)', cursor: 'pointer' }} />
            ))}
            <input type="color" value={p.color} onChange={(e) => set({ color: e.target.value })} aria-label="Custom colour" style={{ width: 34, height: 30 }} />
          </div>
          <Slider label="Size" value={p.width} min={1} max={12} onChange={(width) => { set({ width }); if (sel) patchSel({ width }) }} show={(v) => String(v)} />
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>Shift = straight lines at 45° / squares. Delete removes the selection. Ctrl+Z / Ctrl+Y undo and redo.</p>
        </Panel>
        {sel && (
          <Panel title={`Selected: ${TOOLS.find((t) => t[0] === sel.kind)?.[2]}`} actions={<Btn kind="danger" onClick={removeSel}>Delete</Btn>}>
            {sel.kind === 'text' && (
              <label className="k-field">
                <span className="k-label">Text</span>
                <textarea ref={textBox} className="k-area" rows={3} value={sel.text ?? ''} onChange={(e) => setShapes(shapes.map((s) => (s.id === sel.id ? { ...s, text: e.target.value } : s)))} />
              </label>
            )}
            {sel.kind === 'step' && (
              <Row>
                <Btn onClick={() => patchSel({ n: Math.max(1, (sel.n ?? 1) - 1) })}>−</Btn>
                <b style={{ alignSelf: 'center' }}>Step {sel.n}</b>
                <Btn onClick={() => patchSel({ n: (sel.n ?? 1) + 1 })}>+</Btn>
              </Row>
            )}
            <Row>
              <Btn onClick={() => commit([...shapes.filter((s) => s.id !== sel.id), sel])}>Bring to front</Btn>
              <Btn onClick={() => commit([sel, ...shapes.filter((s) => s.id !== sel.id)])}>Send to back</Btn>
              <Btn onClick={() => { const c = move({ ...sel, id: uid(), n: sel.kind === 'step' ? nextStep(shapes) : sel.n }, 20, 20); commit([...shapes, c]); setSelId(c.id) }}>Duplicate</Btn>
            </Row>
            {(sel.kind === 'blur' || sel.kind === 'pixelate') && <Note tone="warn">Blur and pixelation can sometimes be reversed for short text. For passwords or keys, use Redact (solid box).</Note>}
          </Panel>
        )}
        <Panel title="Export">
          <Seg value={p.fmt} onChange={(fmt) => set({ fmt })} options={[['png', 'PNG (sharp)'], ['jpeg', 'JPG (smaller)']]} />
          <Row>
            <Btn kind="primary" onClick={() => exportImage(false)} disabled={!base}>⬇ Download</Btn>
            <Btn onClick={() => exportImage(true)} disabled={!base}>⧉ Copy image</Btn>
          </Row>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>Exports at full resolution ({base?.width ?? 0}×{base?.height ?? 0}px). Everything stays on your device.</p>
        </Panel>
      </div>
      <div>
        <Panel title={name} actions={
          <>
            <Btn onClick={doUndo} disabled={!undo.length}>↶ Undo</Btn>
            <Btn onClick={doRedo} disabled={!redo.length}>↷ Redo</Btn>
            <Btn kind="ghost" onClick={() => { commit([]); setSelId(null) }} disabled={!shapes.length}>Clear all</Btn>
          </>
        }>
          <canvas ref={cv} onPointerDown={down} onPointerMove={moveP} onPointerUp={up} onPointerCancel={up}
            style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 8, border: '1px solid var(--line)', touchAction: 'none', cursor: p.tool === 'select' ? 'default' : 'crosshair', background: 'repeating-conic-gradient(#e5e7eb 0 25%, #fff 0 50%) 0 0/16px 16px' }} />
          <p className="muted" style={{ fontSize: 13 }}>
            {shapes.length} annotation{shapes.length === 1 ? '' : 's'}{shapes.length ? ': ' + Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ') : ''}
          </p>
        </Panel>
      </div>
    </Split>
  )
}
