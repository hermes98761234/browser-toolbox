import { useEffect, useRef, useState } from 'react'
import { Btn, download, JsonButtons, Note, Panel, Row, Select, Seg, Stat, Stats, Txt, uid } from '../kit'
import { arrowHead, hit, simplify, snapAngle, widthAt, type Item, type ShapeItem } from './lib/interactive-whiteboard'
import { ASPECTS, CANVAS_W, canvasH, cells, MOVES, ratioOf, runtime, sampleBoard, SHOTS, starts, tc, winAnsi, wrap, type Board, type Frame } from './lib/storyboard-maker'

// ---- IndexedDB autosave (one record per board) ----
const DB = 'tb-storyboard-maker', STORE = 'boards', KEY = 'current'
function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
async function idbGet(): Promise<Board | undefined> {
  const db = await idb()
  return new Promise((res) => {
    const q = db.transaction(STORE).objectStore(STORE).get(KEY)
    q.onsuccess = () => res(q.result as Board | undefined)
    q.onerror = () => res(undefined)
  })
}
async function idbSet(b: Board) {
  const db = await idb()
  db.transaction(STORE, 'readwrite').objectStore(STORE).put(b, KEY)
}

type Tool = 'pen' | 'marker' | 'line' | 'arrow' | 'rect' | 'ellipse' | 'eraser'
const TOOLS: [Tool, string][] = [['pen', '✎ Pen'], ['marker', '🖍 Marker'], ['line', '╱ Line'], ['arrow', '➜ Arrow'], ['rect', '▭ Box'], ['ellipse', '◯ Ellipse'], ['eraser', '⌫ Eraser']]
const INKS = ['#1f2937', '#64748b', '#ef4444', '#f59e0b', '#10b981', '#0ea5e9', '#6366f1', '#a16207']

function drawItem(g: CanvasRenderingContext2D, it: Item) {
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.strokeStyle = it.color
  g.fillStyle = it.color
  if (it.kind === 'pen' || it.kind === 'marker') {
    const p = it.pts
    g.globalAlpha = it.kind === 'marker' ? 0.35 : 1
    g.lineWidth = it.kind === 'marker' ? it.size * 4 : widthAt(it.size, 0.5)
    g.beginPath()
    g.moveTo(p[0], p[1])
    for (let i = 3; i < p.length; i += 3) g.lineTo(p[i], p[i + 1])
    if (p.length === 3) g.lineTo(p[0] + 0.1, p[1])
    g.stroke()
    g.globalAlpha = 1
    return
  }
  if (it.kind === 'text' || it.kind === 'note') return
  const sh = it as ShapeItem
  g.lineWidth = sh.size
  g.beginPath()
  if (sh.kind === 'line' || sh.kind === 'arrow') {
    g.moveTo(sh.x1, sh.y1)
    g.lineTo(sh.x2, sh.y2)
    g.stroke()
    if (sh.kind === 'arrow') {
      const h = arrowHead(sh.x1, sh.y1, sh.x2, sh.y2, sh.size)
      g.beginPath(); g.moveTo(...h[0]); g.lineTo(...h[1]); g.lineTo(...h[2]); g.closePath(); g.fill()
    }
    return
  }
  const x = Math.min(sh.x1, sh.x2), y = Math.min(sh.y1, sh.y2), w = Math.abs(sh.x2 - sh.x1), h = Math.abs(sh.y2 - sh.y1)
  if (sh.kind === 'rect') g.rect(x, y, w, h)
  else g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
  if (sh.fill) { g.globalAlpha = 0.25; g.fill(); g.globalAlpha = 1 }
  g.stroke()
}

function paint(c: HTMLCanvasElement, items: Item[], H: number, guides = false) {
  const g = c.getContext('2d')!
  g.setTransform(c.width / CANVAS_W, 0, 0, c.height / H, 0, 0)
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, CANVAS_W, H)
  if (guides) {
    g.strokeStyle = 'rgba(99,102,241,.18)'
    g.lineWidth = 1.5
    g.setLineDash([8, 8])
    for (const f of [1 / 3, 2 / 3]) {
      g.beginPath(); g.moveTo(CANVAS_W * f, 0); g.lineTo(CANVAS_W * f, H); g.stroke()
      g.beginPath(); g.moveTo(0, H * f); g.lineTo(CANVAS_W, H * f); g.stroke()
    }
    g.setLineDash([])
  }
  for (const it of items) drawItem(g, it)
}

function Thumb({ frame, H, w = 200 }: { frame: Frame; H: number; w?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (ref.current) paint(ref.current, frame.items, H)
  }, [frame.items, H])
  return <canvas ref={ref} width={w * 2} height={Math.round((w * 2 * H) / CANVAS_W)} style={{ width: '100%', display: 'block', border: '1px solid var(--line)', borderRadius: 4, background: '#fff' }} />
}

const blank = (): Frame => ({ id: uid(), shot: 'MS', move: 'Static', dur: 3, action: '', dialogue: '', items: [] })

export default function StoryboardMaker() {
  const [b, setB] = useState<Board>(sampleBoard)
  const [loaded, setLoaded] = useState(false)
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'off'>('idle')
  const [sel, setSel] = useState(0)
  const [tool, setTool] = useState<Tool>('pen')
  const [ink, setInk] = useState(INKS[0])
  const [size, setSize] = useState(4)
  const [guides, setGuides] = useState(true)
  const [draft, setDraft] = useState<Item | null>(null)
  const [busy, setBusy] = useState(false)
  const undo = useRef<Item[][]>([])
  const [undoN, setUndoN] = useState(0)
  const cv = useRef<HTMLCanvasElement>(null)
  const H = canvasH(b.aspect)
  const fr = b.frames[Math.min(sel, b.frames.length - 1)]

  useEffect(() => {
    if (typeof indexedDB === 'undefined') {
      setSaved('off')
      setLoaded(true)
      return
    }
    idbGet().then((x) => {
      if (x?.frames?.length) setB(x)
    }).catch(() => setSaved('off')).finally(() => setLoaded(true))
  }, [])
  useEffect(() => {
    if (!loaded || saved === 'off') return
    setSaved('saving')
    const t = setTimeout(() => idbSet(b).then(() => setSaved('saved')).catch(() => setSaved('off')), 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b, loaded])
  useEffect(() => {
    if (cv.current && fr) paint(cv.current, draft ? [...fr.items, draft] : fr.items, H, guides)
  }, [fr, draft, H, guides])

  const up = (p: Partial<Board>) => setB((x) => ({ ...x, ...p }))
  const editFrame = (p: Partial<Frame>) => setB((x) => ({ ...x, frames: x.frames.map((f) => (f.id === fr.id ? { ...f, ...p } : f)) }))
  const setItems = (items: Item[]) => {
    undo.current.push(fr.items)
    if (undo.current.length > 50) undo.current.shift()
    setUndoN(undo.current.length)
    editFrame({ items })
  }

  const pt = (e: React.PointerEvent) => {
    const r = cv.current!.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * CANVAS_W, ((e.clientY - r.top) / r.height) * H] as [number, number]
  }
  const down = (e: React.PointerEvent) => {
    if (!fr) return
    cv.current!.setPointerCapture(e.pointerId)
    const [x, y] = pt(e)
    if (tool === 'eraser') {
      const keep = fr.items.filter((it) => !hit(it, x, y, 10))
      if (keep.length !== fr.items.length) setItems(keep)
      setDraft({ id: 'erase', kind: 'pen', color: 'transparent', size: 0, pts: [x, y, 0.5] })
      return
    }
    if (tool === 'pen' || tool === 'marker') setDraft({ id: uid(), kind: tool, color: ink, size, pts: [x, y, e.pressure || 0.5] })
    else setDraft({ id: uid(), kind: tool, color: ink, size, fill: false, x1: x, y1: y, x2: x, y2: y })
  }
  const move = (e: React.PointerEvent) => {
    if (!draft) return
    let [x, y] = pt(e)
    if (tool === 'eraser') {
      const keep = fr.items.filter((it) => !hit(it, x, y, 10))
      if (keep.length !== fr.items.length) editFrame({ items: keep })
      return
    }
    if (draft.kind === 'pen' || draft.kind === 'marker') setDraft({ ...draft, pts: [...draft.pts, x, y, e.pressure || 0.5] })
    else if (draft.kind !== 'text' && draft.kind !== 'note') {
      if (e.shiftKey && (draft.kind === 'line' || draft.kind === 'arrow')) [x, y] = snapAngle(draft.x1, draft.y1, x, y)
      setDraft({ ...(draft as ShapeItem), x2: x, y2: y })
    }
  }
  const upPtr = () => {
    if (draft && draft.id !== 'erase') {
      const it = draft.kind === 'pen' || draft.kind === 'marker' ? { ...draft, pts: simplify(draft.pts) } : draft
      setItems([...fr.items, it])
    }
    setDraft(null)
  }

  const moveFrame = (d: number) => {
    const i = b.frames.indexOf(fr), j = i + d
    if (j < 0 || j >= b.frames.length) return
    const fs = [...b.frames]
    ;[fs[i], fs[j]] = [fs[j], fs[i]]
    up({ frames: fs })
    setSel(j)
  }
  const insert = (f: Frame) => {
    const i = b.frames.indexOf(fr) + 1
    up({ frames: [...b.frames.slice(0, i), f, ...b.frames.slice(i)] })
    setSel(i)
    undo.current = []
  }

  const framePng = async (f: Frame, scale = 1): Promise<Uint8Array> => {
    const c = document.createElement('canvas')
    c.width = CANVAS_W * scale
    c.height = Math.round(H * scale)
    paint(c, f.items, H)
    const blob = await new Promise<Blob>((r) => c.toBlob((x) => r(x!), 'image/png'))
    return new Uint8Array(await blob.arrayBuffer())
  }

  const exportPdf = async () => {
    setBusy(true)
    try {
      const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
      const pdf = await PDFDocument.create()
      pdf.setTitle(b.title || 'Storyboard')
      const font = await pdf.embedFont(StandardFonts.Helvetica)
      const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
      const ital = await pdf.embedFont(StandardFonts.HelveticaOblique)
      const [pw, ph] = b.paper === 'a4' ? [841.89, 595.28] : [792, 612]
      const st = starts(b.frames)
      const pages = Math.ceil(b.frames.length / b.perPage)
      for (let p = 0; p < pages; p++) {
        const page = pdf.addPage([pw, ph])
        page.drawText(winAnsi(b.title || 'Storyboard'), { x: 36, y: ph - 46, size: 16, font: bold })
        const meta = `${b.aspect} · ${b.frames.length} frames · ${tc(runtime(b.frames))} · page ${p + 1}/${pages}`
        page.drawText(winAnsi(meta).replace(/·/g, '|'), { x: pw - 36 - font.widthOfTextAtSize(winAnsi(meta).replace(/·/g, '|'), 9), y: ph - 44, size: 9, font, color: rgb(0.4, 0.4, 0.45) })
        const cs = cells(pw, ph, b.perPage, ratioOf(b.aspect))
        for (let k = 0; k < cs.length; k++) {
          const i = p * b.perPage + k
          const f = b.frames[i]
          if (!f) break
          const { img, text } = cs[k]
          const png = await pdf.embedPng(await framePng(f, 0.75))
          const box = { x: img.x, y: img.y, width: img.w, height: img.h }
          page.drawImage(png, box)
          page.drawRectangle({ ...box, borderColor: rgb(0.2, 0.2, 0.25), borderWidth: 1 })
          let y = img.y - 13
          const head = `${i + 1}  ${f.shot} - ${f.move} - ${f.dur}s  @${tc(st[i])}`
          page.drawText(winAnsi(head), { x: text.x, y, size: 9.5, font: bold })
          const fs = b.perPage >= 9 ? 7.5 : 8.5
          const put = (s: string, fnt: typeof font) => {
            for (const line of wrap(winAnsi(s), text.w, (q) => fnt.widthOfTextAtSize(q, fs))) {
              y -= fs + 2.5
              if (y < text.y) return
              page.drawText(line, { x: text.x, y, size: fs, font: fnt })
            }
          }
          y -= 2
          if (f.action) put(f.action, font)
          if (f.dialogue) put(f.dialogue, ital)
        }
      }
      const bytes = await pdf.save()
      download(`${(b.title || 'storyboard').replace(/[^\w-]+/g, '-')}.pdf`, new Blob([bytes as BlobPart], { type: 'application/pdf' }))
    } finally {
      setBusy(false)
    }
  }
  const exportPng = async () => {
    const bytes = await framePng(fr, 2)
    download(`frame-${b.frames.indexOf(fr) + 1}.png`, new Blob([bytes as BlobPart], { type: 'image/png' }))
  }

  if (!fr) return <Panel title="Storyboard"><Btn kind="primary" onClick={() => up({ frames: [blank()] })}>+ First frame</Btn></Panel>
  const idx = b.frames.indexOf(fr)
  const st = starts(b.frames)

  return (
    <div>
      <Panel
        title="Project"
        actions={<>
          <Btn kind="primary" onClick={() => void exportPdf()} disabled={busy}>{busy ? 'Building…' : '⬇ PDF'}</Btn>
          <JsonButtons name="storyboard.json" data={b} onLoad={(d) => d?.frames?.length && (setB(d), setSel(0))} />
          <Btn kind="ghost" onClick={() => { setB(sampleBoard()); setSel(0) }}>Sample</Btn>
          <Btn kind="ghost" onClick={() => { up({ frames: [blank()], title: 'Untitled' }); setSel(0) }}>New</Btn>
        </>}
      >
        <Row>
          <Txt label="Title" value={b.title} onChange={(title) => up({ title })} />
          <Select label="Aspect ratio" value={b.aspect} onChange={(aspect) => up({ aspect })} options={ASPECTS.map(([v, l]) => [v, l] as [string, string])} />
          <Select label="PDF frames per page" value={b.perPage} onChange={(perPage) => up({ perPage })} options={[[2, '2 (1×2)'], [3, '3 (1×3)'], [4, '4 (2×2)'], [6, '6 (2×3)'], [9, '9 (3×3)']]} />
          <Select label="Paper" value={b.paper} onChange={(paper) => up({ paper })} options={[['letter', 'US Letter landscape'], ['a4', 'A4 landscape']]} />
        </Row>
        <Stats>
          <Stat label="Frames" value={b.frames.length} />
          <Stat label="Running time" value={tc(runtime(b.frames))} sub="sum of frame durations" />
          <Stat label="PDF pages" value={Math.ceil(b.frames.length / b.perPage)} />
          <Stat label="Autosave" value={<span style={{ fontSize: 15 }}>{saved === 'off' ? 'Unavailable' : saved === 'saving' ? 'Saving…' : 'Saved ✓'}</span>} sub={saved === 'off' ? 'use Backup' : 'IndexedDB, this browser'} tone={saved === 'off' ? 'bad' : 'good'} />
        </Stats>
      </Panel>

      <div className="k-split wide-left">
        <Panel title={`Frame ${idx + 1} of ${b.frames.length}`} actions={<>
          <Btn kind="ghost" onClick={() => { const u = undo.current.pop(); setUndoN(undo.current.length); if (u) editFrame({ items: u }) }} disabled={!undoN} title="Undo">↶ Undo</Btn>
          <Btn kind="ghost" onClick={() => fr.items.length && setItems([])}>Clear</Btn>
          <Btn kind="ghost" onClick={() => void exportPng()}>⬇ PNG</Btn>
        </>}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8, alignItems: 'center' }}>
            <Seg value={tool} onChange={setTool} options={TOOLS} label="Drawing tool" />
            {INKS.map((c) => (
              <button key={c} type="button" aria-label={`Ink ${c}`} onClick={() => setInk(c)} style={{ width: 24, height: 24, borderRadius: 12, background: c, border: ink === c ? '3px solid var(--accent)' : '2px solid var(--line)', padding: 0, cursor: 'pointer' }} />
            ))}
            <label className="muted" style={{ fontSize: 13 }}>Size <input type="range" min={1} max={14} value={size} onChange={(e) => setSize(Number(e.target.value))} style={{ width: 90, verticalAlign: 'middle' }} /></label>
            <label className="muted" style={{ fontSize: 13 }}><input type="checkbox" checked={guides} onChange={(e) => setGuides(e.target.checked)} /> Thirds</label>
          </div>
          <canvas
            ref={cv}
            width={CANVAS_W}
            height={H}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={upPtr}
            onPointerCancel={upPtr}
            style={{ width: '100%', maxHeight: '62vh', objectFit: 'contain', touchAction: 'none', cursor: tool === 'eraser' ? 'cell' : 'crosshair', border: '2px solid var(--line)', borderRadius: 6, background: '#fff', display: 'block' }}
          />
          <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>Hold Shift to snap lines to 15°. Dashed thirds guides are not exported.</p>
        </Panel>
        <Panel title="Shot notes">
          <Row>
            <Select label="Shot" value={fr.shot} onChange={(shot) => editFrame({ shot })} options={SHOTS} />
            <Select label="Camera move" value={fr.move} onChange={(m) => editFrame({ move: m })} options={MOVES} />
          </Row>
          <label className="k-field"><span className="k-label">Duration (s) — starts at {tc(st[idx])}</span>
            <input className="k-text" type="number" min={0} step={0.5} value={fr.dur} onChange={(e) => editFrame({ dur: Math.max(0, Number(e.target.value) || 0) })} />
          </label>
          <label className="k-field"><span className="k-label">Action / description</span>
            <textarea className="k-area" rows={4} value={fr.action} onChange={(e) => editFrame({ action: e.target.value })} placeholder="What happens in this shot" />
          </label>
          <label className="k-field"><span className="k-label">Dialogue / sound</span>
            <textarea className="k-area" rows={3} value={fr.dialogue} onChange={(e) => editFrame({ dialogue: e.target.value })} placeholder="NAME: line…  or SFX" />
          </label>
          <Row>
            <Btn onClick={() => moveFrame(-1)} disabled={idx === 0}>← Move</Btn>
            <Btn onClick={() => moveFrame(1)} disabled={idx === b.frames.length - 1}>Move →</Btn>
            <Btn onClick={() => insert({ ...fr, id: uid(), items: fr.items.map((i) => ({ ...i, id: uid() })) })}>Duplicate</Btn>
            <Btn kind="danger" onClick={() => { if (b.frames.length > 1) { up({ frames: b.frames.filter((f) => f.id !== fr.id) }); setSel(Math.max(0, idx - 1)) } }} disabled={b.frames.length < 2}>Delete</Btn>
          </Row>
        </Panel>
      </div>

      <Panel title="Storyboard" actions={<Btn kind="primary" onClick={() => insert(blank())}>+ Frame after {idx + 1}</Btn>}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12 }}>
          {b.frames.map((f, i) => (
            <button key={f.id} type="button" onClick={() => { setSel(i); undo.current = []; setUndoN(0) }} style={{ textAlign: 'left', padding: 8, borderRadius: 8, border: i === idx ? '2px solid var(--accent)' : '1px solid var(--line)', background: 'var(--panel)', color: 'inherit', cursor: 'pointer', font: 'inherit' }}>
              <Thumb frame={f} H={H} />
              <div style={{ fontSize: 12, marginTop: 6 }}><b>{i + 1}</b> · {f.shot} · {f.move} · {f.dur}s <span className="muted">@{tc(st[i])}</span></div>
              <div className="muted" style={{ fontSize: 12, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{f.action || 'No description yet'}</div>
            </button>
          ))}
        </div>
        <Note>Your board autosaves to this browser (IndexedDB). Use Backup to move it to another device. PDF text uses standard fonts, so non-Latin characters print as “?”.</Note>
      </Panel>
    </div>
  )
}
