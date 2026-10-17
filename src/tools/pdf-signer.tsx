import { useEffect, useRef, useState, type PointerEvent as RPE } from 'react'
import { Btn, download, FileDrop, Note, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, Txt, uid, useToolState } from '../kit'

type Mode = 'draw' | 'type' | 'image'
type Kind = 'sig' | 'date' | 'text'
interface Place { id: string; page: number; x: number; y: number; w: number; kind: Kind; text?: string }
interface PageInfo { w: number; h: number; rot: number }
interface Doc { name: string; bytes: Uint8Array; pages: PageInfo[]; sample: boolean }
type Pt = [number, number, number] // x, y, pressure-ish width factor

const FONTS: [string, string][] = [
  ['"Brush Script MT", "Segoe Script", cursive', 'Brush script'],
  ['"Segoe Script", "Lucida Handwriting", cursive', 'Handwriting'],
  ['"Snell Roundhand", "Apple Chancery", "URW Chancery L", cursive', 'Chancery'],
  ['Georgia, "Times New Roman", serif', 'Serif italic'],
]
const INKS = ['#0b1f66', '#111111', '#1d4ed8', '#7c2d12']

const DEF = { mode: 'type' as Mode, name: 'Jane A. Doe', font: FONTS[0][0], ink: INKS[0], pen: 3, dateFmt: 'iso' as 'iso' | 'us' | 'eu' | 'long' }

function dateText(f: string) {
  const d = new Date()
  if (f === 'us') return d.toLocaleDateString('en-US')
  if (f === 'eu') return d.toLocaleDateString('en-GB')
  if (f === 'long') return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  return d.toISOString().slice(0, 10)
}

/** Crops a canvas to its non-transparent pixels and returns a PNG data URL + aspect (h/w). */
function trim(c: HTMLCanvasElement): { url: string; aspect: number } | null {
  const g = c.getContext('2d')!
  const { data, width, height } = g.getImageData(0, 0, c.width, c.height)
  let x0 = width, y0 = height, x1 = -1, y1 = -1
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  if (x1 < 0) return null
  const pad = 6
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(width - 1, x1 + pad); y1 = Math.min(height - 1, y1 + pad)
  const o = document.createElement('canvas')
  o.width = x1 - x0 + 1
  o.height = y1 - y0 + 1
  o.getContext('2d')!.drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height)
  return { url: o.toDataURL('image/png'), aspect: o.height / o.width }
}

function typedSig(name: string, font: string, ink: string) {
  const c = document.createElement('canvas')
  c.width = 1200
  c.height = 300
  const g = c.getContext('2d')!
  const italic = 'italic '
  g.font = `${italic}150px ${font}`
  const w = g.measureText(name).width
  const k = Math.min(1, 1150 / (w || 1))
  g.font = `${italic}${Math.floor(150 * k)}px ${font}`
  g.fillStyle = ink
  g.textBaseline = 'middle'
  g.fillText(name, 20, 150)
  return trim(c)
}

async function makeSample(): Promise<Doc> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const reg = await doc.embedFont(StandardFonts.Helvetica)
  const W = 612, H = 792
  for (let p = 0; p < 2; p++) {
    const page = doc.addPage([W, H])
    page.drawText(p ? 'Signatures' : 'Freelance Services Agreement', { x: 60, y: H - 80, size: 22, font: bold, color: rgb(0.12, 0.16, 0.3) })
    const lines = p ? 8 : 26
    for (let l = 0; l < lines; l++) page.drawRectangle({ x: 60, y: H - 120 - l * 22, width: (W - 120) * (0.55 + ((l * 37 + p * 11) % 45) / 100), height: 7, color: rgb(0.85, 0.87, 0.92) })
    if (p) {
      ;[['Client', 360], ['Contractor', 220]].forEach(([who, y]) => {
        page.drawLine({ start: { x: 60, y: +y }, end: { x: 330, y: +y }, thickness: 1, color: rgb(0.2, 0.2, 0.3) })
        page.drawText(`${who} signature`, { x: 60, y: +y - 16, size: 10, font: reg, color: rgb(0.35, 0.35, 0.45) })
        page.drawLine({ start: { x: 380, y: +y }, end: { x: 552, y: +y }, thickness: 1, color: rgb(0.2, 0.2, 0.3) })
        page.drawText('Date', { x: 380, y: +y - 16, size: 10, font: reg, color: rgb(0.35, 0.35, 0.45) })
      })
    }
    page.drawText(`Page ${p + 1} of 2`, { x: W / 2 - 26, y: 30, size: 9, font: reg, color: rgb(0.45, 0.45, 0.5) })
  }
  return { name: 'services-agreement.pdf', bytes: await doc.save(), pages: [{ w: W, h: H, rot: 0 }, { w: W, h: H, rot: 0 }], sample: true }
}

async function loadDoc(f: File): Promise<Doc> {
  const { PDFDocument } = await import('pdf-lib')
  const bytes = new Uint8Array(await f.arrayBuffer())
  const d = await PDFDocument.load(bytes, { ignoreEncryption: true })
  return { name: f.name, bytes, sample: false, pages: d.getPages().map((p) => ({ w: p.getSize().width, h: p.getSize().height, rot: ((p.getRotation().angle % 360) + 360) % 360 })) }
}

function Pad({ ink, pen, onSig }: { ink: string; pen: number; onSig: (s: { url: string; aspect: number } | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const strokes = useRef<Pt[][]>([])
  const cur = useRef<Pt[] | null>(null)
  const last = useRef(0)
  const redraw = () => {
    const c = ref.current
    if (!c) return
    const g = c.getContext('2d')!
    g.clearRect(0, 0, c.width, c.height)
    g.strokeStyle = ink
    g.fillStyle = ink
    g.lineCap = 'round'
    g.lineJoin = 'round'
    for (const s of strokes.current) {
      if (s.length === 1) { g.beginPath(); g.arc(s[0][0], s[0][1], pen, 0, 7); g.fill(); continue }
      for (let i = 1; i < s.length; i++) {
        const [a, b] = [s[i - 1], s[i]]
        const m0 = i > 1 ? [(s[i - 2][0] + a[0]) / 2, (s[i - 2][1] + a[1]) / 2] : [a[0], a[1]]
        const m1 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
        g.lineWidth = pen * 2 * b[2]
        g.beginPath()
        g.moveTo(m0[0], m0[1])
        g.quadraticCurveTo(a[0], a[1], m1[0], m1[1])
        g.stroke()
      }
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { redraw(); if (strokes.current.length && ref.current) onSig(trim(ref.current)) }, [ink, pen])
  const pos = (e: RPE<HTMLCanvasElement>): Pt => {
    const r = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * e.currentTarget.width
    const y = ((e.clientY - r.top) / r.height) * e.currentTarget.height
    const prev = cur.current?.[cur.current.length - 1]
    const now = performance.now()
    const v = prev ? Math.hypot(x - prev[0], y - prev[1]) / Math.max(1, now - last.current) : 0
    last.current = now
    const f = e.pressure && e.pointerType === 'pen' ? 0.4 + e.pressure : Math.max(0.45, Math.min(1.25, 1.3 - v * 0.35))
    return [x, y, prev ? prev[2] * 0.6 + f * 0.4 : f]
  }
  const finish = () => {
    if (!cur.current) return
    cur.current = null
    onSig(ref.current ? trim(ref.current) : null)
  }
  return (
    <div>
      <canvas
        ref={ref}
        width={900}
        height={300}
        style={{ width: '100%', aspectRatio: '3 / 1', background: 'repeating-linear-gradient(transparent 0 74%, var(--line) 74% 75%, transparent 75% 100%) , #fff', borderRadius: 10, border: '1px dashed var(--line)', touchAction: 'none', cursor: 'crosshair' }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); last.current = performance.now(); cur.current = [pos(e)]; strokes.current.push(cur.current); redraw() }}
        onPointerMove={(e) => { if (!cur.current) return; cur.current.push(pos(e)); redraw() }}
        onPointerUp={finish}
        onPointerCancel={finish}
      />
      <Row>
        <Btn onClick={() => { strokes.current.pop(); redraw(); onSig(strokes.current.length && ref.current ? trim(ref.current) : null) }}>↶ Undo stroke</Btn>
        <Btn kind="ghost" onClick={() => { strokes.current = []; redraw(); onSig(null) }}>Clear</Btn>
      </Row>
    </div>
  )
}

export default function PdfSigner() {
  const [s, set] = useToolState('pdf-signer', DEF)
  const [doc, setDoc] = useState<Doc | null>(null)
  const [drawn, setDrawn] = useState<{ url: string; aspect: number } | null>(null)
  const [img, setImg] = useState<{ url: string; aspect: number } | null>(null)
  const [places, setPlaces] = useState<Place[]>([])
  const [page, setPage] = useState(0)
  const [sel, setSel] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [out, setOut] = useState<string | null>(null)
  const sheet = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null)

  const typed = s.mode === 'type' && s.name.trim() ? typedSig(s.name.trim(), s.font, s.ink) : null
  const sig = s.mode === 'draw' ? drawn : s.mode === 'image' ? img : typed

  useEffect(() => {
    void makeSample().then((d) => {
      setDoc(d)
      setPage(1)
      setPlaces([
        { id: uid(), page: 1, x: 0.11, y: 0.47, w: 0.36, kind: 'sig' },
        { id: uid(), page: 1, x: 0.63, y: 0.505, w: 0.16, kind: 'date' },
      ])
    })
  }, [])

  const open = async (f: File) => {
    setErr('')
    setOut(null)
    try {
      const d = await loadDoc(f)
      setDoc(d)
      setPage(d.pages.length - 1)
      setPlaces([])
    } catch (e) {
      setErr(`Could not read this PDF: ${(e as Error).message}`)
    }
  }

  const loadImage = (f: File) => {
    const r = new FileReader()
    r.onload = () => {
      const im = new Image()
      im.onload = () => {
        const c = document.createElement('canvas')
        c.width = im.naturalWidth
        c.height = im.naturalHeight
        const g = c.getContext('2d')!
        g.drawImage(im, 0, 0)
        // knock out near-white paper so scanned signatures become transparent
        const d = g.getImageData(0, 0, c.width, c.height)
        for (let i = 0; i < d.data.length; i += 4) {
          const l = (d.data[i] + d.data[i + 1] + d.data[i + 2]) / 3
          if (l > 225) d.data[i + 3] = 0
          else if (l > 170) d.data[i + 3] = Math.round(((225 - l) / 55) * d.data[i + 3])
        }
        g.putImageData(d, 0, 0)
        setImg(trim(c))
      }
      im.src = String(r.result)
    }
    r.readAsDataURL(f)
  }

  const pg = doc?.pages[page]
  const add = (kind: Kind) => {
    const p: Place = { id: uid(), page, x: 0.55, y: 0.78, w: kind === 'sig' ? 0.3 : 0.16, kind, text: kind === 'text' ? s.name : undefined }
    setPlaces([...places, p])
    setSel(p.id)
  }
  const edit = (id: string, patch: Partial<Place>) => setPlaces((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  const textOf = (p: Place) => (p.kind === 'date' ? dateText(s.dateFmt) : (p.text ?? ''))
  const boxH = (p: Place) => (p.kind === 'sig' && pg ? p.w * (sig?.aspect ?? 0.3) * (pg.w / pg.h) : (p.w * 0.16 * (pg ? pg.w / pg.h : 1)))

  const exportPdf = async () => {
    if (!doc) return
    setErr('')
    try {
      const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
      const d = await PDFDocument.load(doc.bytes, { ignoreEncryption: true })
      const font = await d.embedFont(StandardFonts.Helvetica)
      const png = sig ? await d.embedPng(sig.url) : null
      const hex = s.ink.replace('#', '')
      const col = rgb(parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255)
      for (const p of places) {
        const page = d.getPage(p.page)
        const { width: W, height: H } = page.getSize()
        const w = p.w * W
        if (p.kind === 'sig') {
          if (!png || !sig) continue
          const h = w * sig.aspect
          page.drawImage(png, { x: p.x * W, y: H - p.y * H - h, width: w, height: h })
        } else {
          const t = textOf(p)
          if (!t) continue
          let size = 40
          while (size > 4 && font.widthOfTextAtSize(t, size) > w) size -= 0.5
          page.drawText(t, { x: p.x * W, y: H - p.y * H - size * 0.9, size, font, color: col })
        }
      }
      d.setModificationDate(new Date())
      const bytes = await d.save()
      const name = doc.name.replace(/\.pdf$/i, '') + '-signed.pdf'
      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' })
      download(name, blob)
      if (out) URL.revokeObjectURL(out)
      setOut(URL.createObjectURL(blob))
    } catch (e) {
      setErr(`Signing failed: ${(e as Error).message}`)
    }
  }

  const onMove = (e: RPE<HTMLDivElement>) => {
    if (!drag.current || !sheet.current) return
    const r = sheet.current.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width - drag.current.dx
    const y = (e.clientY - r.top) / r.height - drag.current.dy
    edit(drag.current.id, { x: Math.max(0, Math.min(0.98, x)), y: Math.max(0, Math.min(0.98, y)) })
  }
  const selP = places.find((p) => p.id === sel)
  const onPage = places.filter((p) => p.page === page)

  return (
    <Split wide="right">
      <div>
        <Panel title="1 · Create your signature">
          <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['type', '⌨ Type'], ['draw', '✍ Draw'], ['image', '🖼 Upload']]} />
          <div style={{ marginTop: 12 }}>
            {s.mode === 'type' && (
              <>
                <Txt label="Full name" value={s.name} onChange={(name) => set({ name })} />
                <Select label="Style" value={s.font} onChange={(font) => set({ font })} options={FONTS} />
              </>
            )}
            {s.mode === 'draw' && <Pad ink={s.ink} pen={s.pen} onSig={setDrawn} />}
            {s.mode === 'image' && <FileDrop accept="image/*" onFiles={(f) => loadImage(f[0])} label="Drop a photo or scan of your signature (white paper is made transparent)" />}
          </div>
          <Row>
            <div>
              <span className="k-label">Ink</span>
              <Row>
                {INKS.map((c) => (
                  <button key={c} type="button" aria-label={`Ink ${c}`} onClick={() => set({ ink: c })} style={{ width: 28, height: 28, borderRadius: 99, background: c, border: s.ink === c ? '3px solid var(--accent)' : '2px solid var(--line)', cursor: 'pointer' }} />
                ))}
              </Row>
            </div>
            {s.mode === 'draw' && <Slider label="Pen width" value={s.pen} onChange={(pen) => set({ pen })} min={1} max={8} step={0.5} />}
          </Row>
          <div style={{ marginTop: 10, minHeight: 70, display: 'grid', placeItems: 'center', background: '#fff', borderRadius: 10, border: '1px solid var(--line)', padding: 8 }}>
            {sig ? <img src={sig.url} alt="Signature preview" style={{ maxHeight: 80, maxWidth: '100%' }} /> : <span style={{ color: '#64748b' }}>{s.mode === 'draw' ? 'Sign in the box above with mouse, finger or stylus' : 'No signature yet'}</span>}
          </div>
          {s.mode === 'image' && img && <Btn onClick={() => download('signature.png', new Blob([Uint8Array.from(atob(img.url.split(',')[1]), (c) => c.charCodeAt(0))], { type: 'image/png' }))}>⬇ Transparent PNG</Btn>}
        </Panel>
        <Panel title="2 · Open a PDF">
          <FileDrop accept="application/pdf,.pdf" onFiles={(f) => void open(f[0])} label="Drop a PDF to sign" />
          {doc?.sample && <Note>A sample two-page agreement is loaded. Drop your own PDF to sign it instead.</Note>}
          {err && <Note tone="err">{err}</Note>}
        </Panel>
        <Panel title="Date stamp">
          <Select label="Date format" value={s.dateFmt} onChange={(dateFmt) => set({ dateFmt })} options={[['iso', `ISO · ${dateText('iso')}`], ['us', `US · ${dateText('us')}`], ['eu', `EU · ${dateText('eu')}`], ['long', `Long · ${dateText('long')}`]]} />
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Document" value={doc ? doc.name : '—'} sub={doc ? `${doc.pages.length} page${doc.pages.length > 1 ? 's' : ''}` : ''} />
          <Stat label="Placements" value={places.length} sub={`${onPage.length} on this page`} />
          <Stat label="Signature" value={sig ? 'Ready' : 'Missing'} tone={sig ? 'good' : 'bad'} />
        </Stats>
        <Panel
          title="3 · Place and export"
          actions={
            <>
              <Btn onClick={() => add('sig')} disabled={!doc}>+ Signature</Btn>
              <Btn onClick={() => add('date')} disabled={!doc}>+ Date</Btn>
              <Btn onClick={() => add('text')} disabled={!doc}>+ Text</Btn>
              <Btn kind="primary" onClick={() => void exportPdf()} disabled={!doc || !places.length}>⬇ Signed PDF</Btn>
            </>
          }
        >
          {doc && pg && (
            <>
              <Row>
                <Btn kind="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>◀</Btn>
                <span>Page <b>{page + 1}</b> / {doc.pages.length} · {Math.round(pg.w)}×{Math.round(pg.h)} pt</span>
                <Btn kind="ghost" disabled={page >= doc.pages.length - 1} onClick={() => setPage(page + 1)}>▶</Btn>
              </Row>
              {pg.rot !== 0 && <Note tone="warn">This page has a /Rotate of {pg.rot}°; positions are in the unrotated page frame.</Note>}
              <div
                ref={sheet}
                onPointerMove={onMove}
                onPointerUp={() => (drag.current = null)}
                onPointerLeave={() => (drag.current = null)}
                style={{ position: 'relative', width: '100%', maxWidth: 520, margin: '10px auto', aspectRatio: `${pg.w} / ${pg.h}`, background: '#fff', boxShadow: '0 4px 18px rgb(0 0 0 / .18)', borderRadius: 4, overflow: 'hidden', touchAction: 'none', color: '#1e293b' }}
              >
                {doc.sample ? (
                  <SampleFace page={page} />
                ) : (
                  <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(#e2e8f0 1px, transparent 1px), linear-gradient(90deg, #e2e8f0 1px, transparent 1px)', backgroundSize: '10% 10%', display: 'grid', placeItems: 'center', color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: 20 }}>
                    Page {page + 1} — content preview is not rendered offline. Use the grid (10 % steps) or open the PDF next to this window to line up your signature, then check the result below.
                  </div>
                )}
                {onPage.map((p) => (
                  <div
                    key={p.id}
                    onPointerDown={(e) => {
                      e.stopPropagation()
                      const r = sheet.current!.getBoundingClientRect()
                      drag.current = { id: p.id, dx: (e.clientX - r.left) / r.width - p.x, dy: (e.clientY - r.top) / r.height - p.y }
                      setSel(p.id)
                    }}
                    style={{ position: 'absolute', left: `${p.x * 100}%`, top: `${p.y * 100}%`, width: `${p.w * 100}%`, height: `${boxH(p) * 100}%`, outline: sel === p.id ? '2px solid var(--accent)' : '1px dashed #94a3b8', cursor: 'move', display: 'flex', alignItems: 'flex-start' }}
                  >
                    {p.kind === 'sig' ? (
                      sig ? <img src={sig.url} alt="" draggable={false} style={{ width: '100%', height: '100%' }} /> : <span style={{ fontSize: 11 }}>signature</span>
                    ) : (
                      <svg viewBox={`0 0 100 16`} width="100%" height="100%" preserveAspectRatio="xMinYMin meet"><text x={0} y={12} fontSize={13} fontFamily="Helvetica, Arial, sans-serif" fill={s.ink} textLength={Math.min(100, textOf(p).length * 7)} lengthAdjust="spacingAndGlyphs">{textOf(p)}</text></svg>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
          {selP && (
            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
              <Row>
                <b>Selected: {selP.kind === 'sig' ? 'Signature' : selP.kind === 'date' ? 'Date' : 'Text'}</b>
                <Btn kind="danger" onClick={() => { setPlaces(places.filter((p) => p.id !== selP.id)); setSel(null) }}>Remove</Btn>
              </Row>
              {selP.kind === 'text' && <Txt label="Text" value={selP.text ?? ''} onChange={(text) => edit(selP.id, { text })} />}
              <Slider label="Width" value={Math.round(selP.w * 100)} onChange={(v) => edit(selP.id, { w: v / 100 })} min={5} max={90} unit="% of page" />
              <Row>
                {([['↙ Bottom-left', 0.08, 0.86], ['↘ Bottom-right', 0.92 - selP.w, 0.86], ['↗ Top-right', 0.92 - selP.w, 0.05]] as const).map(([l, x, y]) => (
                  <Btn key={l} kind="ghost" onClick={() => edit(selP.id, { x, y })}>{l}</Btn>
                ))}
              </Row>
              <span className="k-hint">Position: x {Math.round(selP.x * (pg?.w ?? 0))} pt, y {Math.round(selP.y * (pg?.h ?? 0))} pt from top-left</span>
            </div>
          )}
        </Panel>
        {out && (
          <Panel title="Signed result" actions={<Btn kind="ghost" onClick={() => { URL.revokeObjectURL(out); setOut(null) }}>Close</Btn>}>
            <iframe title="Signed PDF" src={out} style={{ width: '100%', height: 520, border: '1px solid var(--line)', borderRadius: 8 }} />
          </Panel>
        )}
        <Note>
          Signatures are stamped as images with pdf-lib — text, links and fonts of the original stay intact. This is a visual (electronic) signature, not a cryptographic
          certificate signature. Nothing is uploaded; the PDF never leaves your browser.
        </Note>
      </div>
    </Split>
  )
}

function SampleFace({ page }: { page: number }) {
  const W = 612, H = 792
  const lines = page ? 8 : 26
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
      <text x={60} y={80} fontSize={22} fontWeight={700} fill="#1f294d" fontFamily="Helvetica, Arial">{page ? 'Signatures' : 'Freelance Services Agreement'}</text>
      {Array.from({ length: lines }, (_, l) => <rect key={l} x={60} y={120 + l * 22 - 7} width={(W - 120) * (0.55 + ((l * 37 + page * 11) % 45) / 100)} height={7} fill="#d9dde9" />)}
      {page === 1 && [['Client', 360], ['Contractor', 220]].map(([who, y]) => (
        <g key={who} fontFamily="Helvetica, Arial" fontSize={10} fill="#59596f">
          <line x1={60} x2={330} y1={H - +y} y2={H - +y} stroke="#333" />
          <text x={60} y={H - +y + 16}>{who} signature</text>
          <line x1={380} x2={552} y1={H - +y} y2={H - +y} stroke="#333" />
          <text x={380} y={H - +y + 16}>Date</text>
        </g>
      ))}
      <text x={W / 2 - 26} y={H - 30} fontSize={9} fill="#73737f" fontFamily="Helvetica, Arial">Page {page + 1} of 2</text>
    </svg>
  )
}
