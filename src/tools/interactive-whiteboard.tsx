import { useCallback, useEffect, useRef, useState, type PointerEvent as RPE } from 'react'
import { Btn, Check, download, JsonButtons, Note, Panel, Row, Seg, Slider, uid, useToolState } from '../kit'
import { arrowHead, BOARD_H, BOARD_W, hit, moveItem, simplify, snapAngle, textBox, widthAt, type Bg, type Item, type Page, type ShapeItem, type Stroke, type TextItem, type Tool } from './lib/interactive-whiteboard'

const COLORS = ['#111827', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#ffffff']
const NOTE_BG = '#fef08a'
const TOOLS: [Tool, string, string][] = [
  ['pen', '✏️', 'Pen (pressure)'], ['marker', '🖍', 'Highlighter'], ['line', '╱', 'Line (Shift = 15°)'], ['arrow', '➜', 'Arrow'], ['rect', '▭', 'Rectangle'],
  ['ellipse', '◯', 'Ellipse'], ['text', 'T', 'Text'], ['note', '🗒', 'Sticky note'], ['move', '✋', 'Move'], ['eraser', '⌫', 'Eraser'], ['laser', '🔴', 'Laser pointer (not saved)'],
]

function sample(): Page[] {
  const circle: number[] = []
  for (let a = 0; a <= Math.PI * 2.1; a += 0.08) circle.push(1180 + 150 * Math.cos(a) + 6 * Math.sin(a * 5), 520 + 110 * Math.sin(a), 0.35 + 0.4 * Math.abs(Math.sin(a)))
  const under: number[] = []
  for (let x = 120; x <= 760; x += 12) under.push(x, 178 + 4 * Math.sin(x / 40), 0.3 + (0.6 * (x - 120)) / 640)
  return [
    {
      id: 'p1', bg: 'grid', items: [
        { id: 't1', kind: 'text', color: '#111827', size: 8, x: 120, y: 90, text: 'Brainstorm: spring launch' },
        { id: 's1', kind: 'pen', color: '#3b82f6', size: 5, pts: under },
        { id: 'n1', kind: 'note', color: NOTE_BG, size: 4, x: 140, y: 260, text: 'Early-bird pricing\n−20 % first week' },
        { id: 'n2', kind: 'note', color: '#bbf7d0', size: 4, x: 420, y: 300, text: 'Short demo video\n(60 s)' },
        { id: 'n3', kind: 'note', color: '#bfdbfe', size: 4, x: 700, y: 260, text: 'Partner newsletter' },
        { id: 'a1', kind: 'arrow', color: '#111827', size: 4, fill: false, x1: 920, y1: 380, x2: 1040, y2: 460 },
        { id: 'c1', kind: 'pen', color: '#ef4444', size: 6, pts: circle },
        { id: 't2', kind: 'text', color: '#ef4444', size: 6, x: 1080, y: 500, text: 'Launch day!' },
        { id: 'r1', kind: 'rect', color: '#10b981', size: 4, fill: false, x1: 120, y1: 640, x2: 900, y2: 900 },
        { id: 't3', kind: 'text', color: '#065f46', size: 5, x: 150, y: 670, text: 'Owners: Ana (video) · Ben (pricing)\nDeadline: Friday' },
      ],
    },
    {
      id: 'p2', bg: 'dots', items: [
        { id: 'b1', kind: 'rect', color: '#3b82f6', size: 4, fill: false, x1: 160, y1: 400, x2: 460, y2: 560 },
        { id: 'b2', kind: 'rect', color: '#8b5cf6', size: 4, fill: false, x1: 650, y1: 400, x2: 950, y2: 560 },
        { id: 'b3', kind: 'ellipse', color: '#10b981', size: 4, fill: false, x1: 1140, y1: 390, x2: 1460, y2: 570 },
        { id: 'l1', kind: 'arrow', color: '#111827', size: 4, fill: false, x1: 470, y1: 480, x2: 640, y2: 480 },
        { id: 'l2', kind: 'arrow', color: '#111827', size: 4, fill: false, x1: 960, y1: 480, x2: 1130, y2: 480 },
        { id: 'x1', kind: 'text', color: '#1d4ed8', size: 6, x: 230, y: 455, text: 'Browser' },
        { id: 'x2', kind: 'text', color: '#6d28d9', size: 6, x: 750, y: 455, text: 'API' },
        { id: 'x3', kind: 'text', color: '#047857', size: 6, x: 1220, y: 455, text: 'Database' },
        { id: 'x4', kind: 'text', color: '#111827', size: 8, x: 160, y: 160, text: 'Request flow' },
      ],
    },
    { id: 'p3', bg: 'lines', items: [] },
  ]
}

const DEF = { pages: sample(), cur: 0, tool: 'pen' as Tool, color: '#111827', size: 4, fill: false, penOnly: false }

function drawBg(g: CanvasRenderingContext2D, bg: Bg) {
  g.fillStyle = bg === 'dark' ? '#0f2a1f' : '#ffffff'
  g.fillRect(0, 0, BOARD_W, BOARD_H)
  g.strokeStyle = bg === 'dark' ? 'rgba(255,255,255,.08)' : '#e2e8f0'
  g.fillStyle = '#cbd5e1'
  g.lineWidth = 1
  if (bg === 'grid' || bg === 'dark') {
    g.beginPath()
    for (let x = 40; x < BOARD_W; x += 40) { g.moveTo(x, 0); g.lineTo(x, BOARD_H) }
    for (let y = 40; y < BOARD_H; y += 40) { g.moveTo(0, y); g.lineTo(BOARD_W, y) }
    g.stroke()
  } else if (bg === 'dots') {
    for (let x = 40; x < BOARD_W; x += 40) for (let y = 40; y < BOARD_H; y += 40) g.fillRect(x - 1.5, y - 1.5, 3, 3)
  } else if (bg === 'lines') {
    g.beginPath()
    for (let y = 120; y < BOARD_H; y += 48) { g.moveTo(0, y); g.lineTo(BOARD_W, y) }
    g.stroke()
    g.strokeStyle = '#fca5a5'
    g.beginPath(); g.moveTo(110, 0); g.lineTo(110, BOARD_H); g.stroke()
  } else if (bg === 'iso') {
    // triangular grid: verticals every L·√3/2, sloped lines at ±30° every L vertically
    const L = 40, dx = (L * Math.sqrt(3)) / 2, k = Math.tan(Math.PI / 6) * BOARD_W
    g.beginPath()
    for (let x = 0; x < BOARD_W; x += dx) { g.moveTo(x, 0); g.lineTo(x, BOARD_H) }
    for (let c = -k; c < BOARD_H + k; c += L) {
      g.moveTo(0, c); g.lineTo(BOARD_W, c + k)
      g.moveTo(0, c); g.lineTo(BOARD_W, c - k)
    }
    g.stroke()
  }
}

function drawItem(g: CanvasRenderingContext2D, it: Item) {
  g.lineCap = 'round'
  g.lineJoin = 'round'
  if (it.kind === 'pen' || it.kind === 'marker') {
    const p = it.pts
    g.strokeStyle = it.color
    if (it.kind === 'marker') {
      g.globalAlpha = 0.35
      g.lineWidth = it.size * 4
      g.beginPath()
      g.moveTo(p[0], p[1])
      for (let i = 3; i < p.length; i += 3) g.lineTo(p[i], p[i + 1])
      if (p.length === 3) g.lineTo(p[0] + 0.1, p[1])
      g.stroke()
      g.globalAlpha = 1
      return
    }
    if (p.length === 3) {
      g.fillStyle = it.color
      g.beginPath(); g.arc(p[0], p[1], widthAt(it.size, p[2]) / 2, 0, 7); g.fill()
      return
    }
    // variable width: quadratic segments through midpoints, width from pressure
    for (let i = 3; i < p.length; i += 3) {
      const x0 = i > 3 ? (p[i - 6] + p[i - 3]) / 2 : p[i - 3], y0 = i > 3 ? (p[i - 5] + p[i - 2]) / 2 : p[i - 2]
      const x1 = (p[i - 3] + p[i]) / 2, y1 = (p[i - 2] + p[i + 1]) / 2
      g.lineWidth = widthAt(it.size, (p[i - 1] + p[i + 2]) / 2)
      g.beginPath()
      g.moveTo(x0, y0)
      g.quadraticCurveTo(p[i - 3], p[i - 2], i === p.length - 3 ? p[i] : x1, i === p.length - 3 ? p[i + 1] : y1)
      g.stroke()
    }
    return
  }
  if (it.kind === 'text' || it.kind === 'note') {
    const b = textBox(it)
    if (it.kind === 'note') {
      g.fillStyle = 'rgba(0,0,0,.12)'
      g.fillRect(b.x + 4, b.y + 6, b.w, b.h)
      g.fillStyle = it.color
      g.fillRect(b.x, b.y, b.w, b.h)
    }
    g.fillStyle = it.kind === 'note' ? '#1f2937' : it.color
    g.font = `${it.kind === 'note' ? 600 : 700} ${b.fs}px system-ui, sans-serif`
    g.textBaseline = 'top'
    it.text.split('\n').forEach((l, i) => g.fillText(l, b.x + (it.kind === 'note' ? 16 : 0), b.y + (it.kind === 'note' ? 18 : 0) + i * b.fs * 1.25, it.kind === 'note' ? b.w - 32 : undefined))
    return
  }
  g.strokeStyle = it.color
  g.fillStyle = it.color
  g.lineWidth = it.size
  g.beginPath()
  if (it.kind === 'line' || it.kind === 'arrow') {
    g.moveTo(it.x1, it.y1)
    g.lineTo(it.x2, it.y2)
    g.stroke()
    if (it.kind === 'arrow') {
      const h = arrowHead(it.x1, it.y1, it.x2, it.y2, it.size)
      g.beginPath(); g.moveTo(...h[0]); g.lineTo(...h[1]); g.lineTo(...h[2]); g.closePath(); g.fill()
    }
    return
  }
  const sh = it as ShapeItem
  const x = Math.min(sh.x1, sh.x2), y = Math.min(sh.y1, sh.y2), w = Math.abs(sh.x2 - sh.x1), h = Math.abs(sh.y2 - sh.y1)
  if (it.kind === 'rect') g.rect(x, y, w, h)
  else g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
  if (sh.fill) { g.globalAlpha = 0.25; g.fill(); g.globalAlpha = 1 }
  g.stroke()
}

function drawPage(g: CanvasRenderingContext2D, page: Page, extra: Item[] = []) {
  drawBg(g, page.bg)
  for (const it of [...page.items, ...extra]) drawItem(g, it)
}

export default function InteractiveWhiteboard() {
  const [s, set, reset] = useToolState('interactive-whiteboard', DEF)
  const cv = useRef<HTMLCanvasElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const draft = useRef<Item | null>(null)
  const drag = useRef<{ id: string; x: number; y: number } | null>(null)
  const laser = useRef<{ x: number; y: number; t: number }[]>([])
  const penSeen = useRef(false)
  const [undo, setUndo] = useState<Page[][]>([])
  const [redo, setRedo] = useState<Page[][]>([])
  const [editor, setEditor] = useState<{ x: number; y: number; kind: 'text' | 'note'; value: string } | null>(null)
  const [full, setFull] = useState(false)
  const [busy, setBusy] = useState(false)
  const cur = Math.min(s.cur, s.pages.length - 1)
  const page = s.pages[cur]

  const redraw = useCallback(() => {
    const g = cv.current?.getContext('2d')
    if (!g) return
    drawPage(g, page, draft.current ? [draft.current] : [])
    const now = performance.now()
    laser.current = laser.current.filter((p) => now - p.t < 700)
    laser.current.forEach((p, i) => {
      const a = 1 - (now - p.t) / 700
      g.fillStyle = `rgba(239,68,68,${a})`
      g.beginPath(); g.arc(p.x, p.y, i === laser.current.length - 1 ? 9 : 6 * a + 1, 0, 7); g.fill()
    })
  }, [page])
  useEffect(redraw, [redraw])
  useEffect(() => {
    if (s.tool !== 'laser') return
    let raf = 0
    const loop = () => { redraw(); raf = requestAnimationFrame(loop) }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [s.tool, redraw])

  const commit = (items: Item[]) => {
    setUndo((u) => [...u.slice(-40), s.pages])
    setRedo([])
    set({ pages: s.pages.map((p, i) => (i === cur ? { ...p, items } : p)) })
  }
  const pos = (e: { clientX: number; clientY: number }) => {
    const r = cv.current!.getBoundingClientRect()
    return [((e.clientX - r.left) * BOARD_W) / r.width, ((e.clientY - r.top) * BOARD_H) / r.height] as const
  }
  const pressure = (e: PointerEvent) => (e.pointerType === 'pen' ? e.pressure || 0.5 : 0.5)

  const down = (e: RPE<HTMLCanvasElement>) => {
    if (e.pointerType === 'pen') penSeen.current = true
    if (s.penOnly && penSeen.current && e.pointerType === 'touch') return
    if (editor) return
    const [x, y] = pos(e)
    e.currentTarget.setPointerCapture(e.pointerId)
    const t = s.tool
    if (t === 'laser') { laser.current.push({ x, y, t: performance.now() }); return }
    if (t === 'text' || t === 'note') { setEditor({ x, y, kind: t, value: '' }); return }
    if (t === 'eraser') {
      setUndo((u) => [...u.slice(-40), s.pages])
      setRedo([])
      const left = page.items.filter((it) => !hit(it, x, y, 8))
      if (left.length !== page.items.length) set({ pages: s.pages.map((p, i) => (i === cur ? { ...p, items: left } : p)) })
      drag.current = { id: 'eraser', x, y }
      return
    }
    if (t === 'move') {
      const target = [...page.items].reverse().find((it) => hit(it, x, y, 8))
      if (target) { drag.current = { id: target.id, x, y }; setUndo((u) => [...u.slice(-40), s.pages]); setRedo([]) }
      return
    }
    if (t === 'pen' || t === 'marker') draft.current = { id: uid(), kind: t, color: s.color, size: s.size, pts: [x, y, pressure(e.nativeEvent)] }
    else draft.current = { id: uid(), kind: t, color: s.color, size: s.size, fill: s.fill, x1: x, y1: y, x2: x, y2: y }
    redraw()
  }
  const move = (e: RPE<HTMLCanvasElement>) => {
    const t = s.tool
    if (t === 'laser') {
      if (e.buttons || e.pointerType === 'mouse') { const [x, y] = pos(e); laser.current.push({ x, y, t: performance.now() }) }
      return
    }
    if (drag.current?.id === 'eraser') {
      const [x, y] = pos(e)
      const left = page.items.filter((it) => !hit(it, x, y, 8))
      if (left.length !== page.items.length) set({ pages: s.pages.map((p, i) => (i === cur ? { ...p, items: left } : p)) })
      return
    }
    if (drag.current) {
      const [x, y] = pos(e)
      const d = drag.current
      set({ pages: s.pages.map((p, i) => (i === cur ? { ...p, items: p.items.map((it) => (it.id === d.id ? moveItem(it, x - d.x, y - d.y) : it)) } : p)) })
      drag.current = { ...d, x, y }
      return
    }
    const dr = draft.current
    if (!dr) return
    if (dr.kind === 'pen' || dr.kind === 'marker') {
      const evs = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent]
      for (const ev of evs.length ? evs : [e.nativeEvent]) { const [x, y] = pos(ev); (dr as Stroke).pts.push(x, y, pressure(ev)) }
    } else {
      let [x, y] = pos(e)
      const sh = dr as ShapeItem
      if (e.shiftKey) {
        if (sh.kind === 'line' || sh.kind === 'arrow') [x, y] = snapAngle(sh.x1, sh.y1, x, y)
        else { const d = Math.max(Math.abs(x - sh.x1), Math.abs(y - sh.y1)); x = sh.x1 + Math.sign(x - sh.x1) * d; y = sh.y1 + Math.sign(y - sh.y1) * d }
      }
      sh.x2 = x
      sh.y2 = y
    }
    redraw()
  }
  const up = () => {
    drag.current = null
    const dr = draft.current
    draft.current = null
    if (!dr) return
    if (dr.kind === 'pen' || dr.kind === 'marker') commit([...page.items, { ...dr, pts: simplify(dr.pts) }])
    else if (Math.hypot((dr as ShapeItem).x2 - (dr as ShapeItem).x1, (dr as ShapeItem).y2 - (dr as ShapeItem).y1) > 4) commit([...page.items, dr])
    else redraw()
  }

  const finishText = () => {
    if (editor && editor.value.trim()) {
      const it: TextItem = { id: uid(), kind: editor.kind, color: editor.kind === 'note' ? NOTE_BG : s.color, size: s.size + 2, x: editor.x, y: editor.y, text: editor.value }
      commit([...page.items, it])
    }
    setEditor(null)
  }

  const doUndo = () => { if (!undo.length) return; setRedo((r) => [...r, s.pages]); set({ pages: undo[undo.length - 1] }); setUndo((u) => u.slice(0, -1)) }
  const doRedo = () => { if (!redo.length) return; setUndo((u) => [...u, s.pages]); set({ pages: redo[redo.length - 1] }); setRedo((r) => r.slice(0, -1)) }
  const goto = (i: number) => set({ cur: Math.max(0, Math.min(s.pages.length - 1, i)) })

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'TEXTAREA' || (e.target as HTMLElement).tagName === 'INPUT') return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo() }
      else if (e.key === 'ArrowRight' || e.key === 'PageDown') goto(cur + 1)
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') goto(cur - 1)
    }
    addEventListener('keydown', key)
    const fs = () => setFull(document.fullscreenElement === wrap.current)
    document.addEventListener('fullscreenchange', fs)
    return () => { removeEventListener('keydown', key); document.removeEventListener('fullscreenchange', fs) }
  })

  const render = (p: Page, scale = 1) => {
    const c = document.createElement('canvas')
    c.width = BOARD_W * scale
    c.height = BOARD_H * scale
    const g = c.getContext('2d')!
    g.scale(scale, scale)
    drawPage(g, p)
    return c
  }
  const exportPdf = async () => {
    setBusy(true)
    try {
      const { PDFDocument } = await import('pdf-lib')
      const doc = await PDFDocument.create()
      for (const p of s.pages) {
        const blob = await new Promise<Blob>((ok) => render(p, 1.5).toBlob((b) => ok(b!), 'image/png'))
        const img = await doc.embedPng(new Uint8Array(await blob.arrayBuffer()))
        const pg = doc.addPage([842, 526.25]) // A4 width, 16:10
        pg.drawImage(img, { x: 0, y: 0, width: 842, height: 526.25 })
      }
      download('whiteboard.pdf', new Blob([(await doc.save()) as BlobPart], { type: 'application/pdf' }))
    } finally {
      setBusy(false)
    }
  }
  const exportPng = () => render(page, 2).toBlob((b) => b && download(`whiteboard-page-${cur + 1}.png`, b))

  const ed = editor
  return (
    <div>
      <Panel
        title={`Page ${cur + 1} of ${s.pages.length}`}
        actions={
          <>
            <Btn kind="ghost" onClick={() => goto(cur - 1)} disabled={cur === 0}>◀</Btn>
            <Btn kind="ghost" onClick={() => goto(cur + 1)} disabled={cur === s.pages.length - 1}>▶</Btn>
            <Btn onClick={() => set({ pages: [...s.pages.slice(0, cur + 1), { id: uid(), bg: page.bg, items: [] }, ...s.pages.slice(cur + 1)], cur: cur + 1 })}>+ Page</Btn>
            <Btn kind="ghost" disabled={s.pages.length < 2} onClick={() => { setUndo((u) => [...u, s.pages]); set({ pages: s.pages.filter((_, i) => i !== cur), cur: Math.max(0, cur - 1) }) }}>Delete page</Btn>
            <Btn kind="primary" onClick={() => void wrap.current?.requestFullscreen?.()}>▶ Present</Btn>
          </>
        }
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
          {TOOLS.map(([t, icon, name]) => (
            <button key={t} type="button" title={name} aria-label={name} onClick={() => set({ tool: t })} className={`k-btn ${s.tool === t ? 'primary' : 'ghost'}`} style={{ minWidth: 40 }}>{icon}</button>
          ))}
          <span style={{ width: 8 }} />
          {COLORS.map((c) => (
            <button key={c} type="button" aria-label={`Colour ${c}`} onClick={() => set({ color: c })} style={{ width: 28, height: 28, borderRadius: 14, background: c, border: s.color === c ? '3px solid var(--accent)' : '1px solid var(--line)', cursor: 'pointer' }} />
          ))}
          <input type="color" value={s.color} onChange={(e) => set({ color: e.target.value })} aria-label="Custom colour" style={{ width: 32, height: 30, border: 'none', background: 'none' }} />
          <span style={{ width: 8 }} />
          <Btn kind="ghost" onClick={doUndo} disabled={!undo.length} title="Undo (Ctrl+Z)">↶</Btn>
          <Btn kind="ghost" onClick={doRedo} disabled={!redo.length} title="Redo (Ctrl+Shift+Z)">↷</Btn>
        </div>
        <div ref={wrap} style={full ? { background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', position: 'relative' } : { position: 'relative' }}>
          <canvas
            ref={cv}
            width={BOARD_W}
            height={BOARD_H}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            style={{ width: full ? 'min(100vw, 160vh)' : '100%', height: 'auto', display: 'block', touchAction: 'none', borderRadius: full ? 0 : 8, border: full ? 'none' : '1px solid var(--line)', cursor: s.tool === 'move' ? 'grab' : s.tool === 'text' ? 'text' : 'crosshair' }}
          />
          {ed && (
            <textarea
              autoFocus
              value={ed.value}
              placeholder={ed.kind === 'note' ? 'Sticky note…' : 'Type, Enter to place'}
              onChange={(e) => setEditor({ ...ed, value: e.target.value })}
              onBlur={finishText}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finishText() } if (e.key === 'Escape') setEditor(null) }}
              style={{ position: 'absolute', left: `${(ed.x / BOARD_W) * 100}%`, top: `${(ed.y / BOARD_H) * 100}%`, minWidth: 180, minHeight: 60, font: '600 16px system-ui', background: ed.kind === 'note' ? NOTE_BG : 'rgba(255,255,255,.95)', color: '#111827', border: '2px dashed var(--accent)', borderRadius: 4, padding: 6 }}
            />
          )}
          {full && (
            <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 6, background: 'rgba(15,23,42,.8)', padding: 6, borderRadius: 10 }}>
              <Btn kind="ghost" onClick={() => goto(cur - 1)}>◀</Btn>
              <span style={{ color: '#fff', alignSelf: 'center' }}>{cur + 1}/{s.pages.length}</span>
              <Btn kind="ghost" onClick={() => goto(cur + 1)}>▶</Btn>
              {(['pen', 'laser', 'eraser'] as Tool[]).map((t) => <Btn key={t} kind={s.tool === t ? 'primary' : 'ghost'} onClick={() => set({ tool: t })}>{TOOLS.find((x) => x[0] === t)![1]}</Btn>)}
              <Btn kind="ghost" onClick={() => void document.exitFullscreen()}>✕</Btn>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginTop: 8 }}>
          {s.pages.map((p, i) => (
            <button key={p.id} type="button" onClick={() => goto(i)} style={{ flex: '0 0 auto', width: 96, height: 60, borderRadius: 6, border: `2px solid ${i === cur ? 'var(--accent)' : 'var(--line)'}`, background: p.bg === 'dark' ? '#0f2a1f' : '#fff', color: '#334155', cursor: 'pointer', fontSize: 12 }}>
              {i + 1} · {p.items.length} items
            </button>
          ))}
        </div>
      </Panel>
      <div className="k-split">
        <Panel title="Pen & shapes">
          <Slider label="Size" value={s.size} min={1} max={24} step={1} onChange={(size) => set({ size })} />
          <Row>
            <Check label="Filled shapes" value={s.fill} onChange={(fill) => set({ fill })} />
            <Check label="Pen only (palm rejection)" value={s.penOnly} onChange={(penOnly) => set({ penOnly })} />
          </Row>
          <p className="muted" style={{ fontSize: 12 }}>A stylus draws with real pressure (thicker when you press harder). Hold Shift for straight 15° lines and perfect squares/circles. ←/→ switch pages, Ctrl+Z undo.</p>
        </Panel>
        <Panel title="Background & export" actions={<Btn kind="ghost" onClick={() => { reset(); setUndo([]); setRedo([]) }}>Reset board</Btn>}>
          <Seg value={page.bg} onChange={(bg) => set({ pages: s.pages.map((p, i) => (i === cur ? { ...p, bg } : p)) })} options={[['plain', 'Plain'], ['grid', 'Grid'], ['dots', 'Dots'], ['lines', 'Lined'], ['iso', 'Isometric'], ['dark', 'Chalk']]} label="Background" />
          <Row>
            <Btn kind="primary" onClick={() => void exportPdf()} disabled={busy}>{busy ? 'Building PDF…' : '⬇ All pages as PDF'}</Btn>
            <Btn onClick={exportPng}>⬇ Page PNG</Btn>
            <Btn kind="ghost" onClick={() => { if (page.items.length) commit([]) }}>Clear page</Btn>
          </Row>
          <Row><JsonButtons name="whiteboard.json" data={s.pages} onLoad={(pages) => Array.isArray(pages) && pages.length && set({ pages, cur: 0 })} /></Row>
          <Note>Boards are saved in this browser automatically. Use Backup to move them to another device.</Note>
        </Panel>
      </div>
    </div>
  )
}
