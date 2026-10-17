import { useState } from 'react'
import { Area, Btn, Check, FileDrop, Note, Panel, Row, Select, Split, Stat, Stats, Txt, download, num, uid, useToolState } from '../kit'
import { flowBoxes, groupLines, kb, lines, pageFor, placeLine, splitPages, type Det, type FBox } from './lib/pdf-ocr-converter'
import { sanitize } from './lib/pdf-watermarker'

interface Page {
  id: string
  name: string
  kind: 'img' | 'pdf'
  src?: string // JPEG data URL (image pages)
  iw: number // image px (img) or page pt (pdf)
  ih: number
  pdfIndex?: number
  rotated?: boolean
  text: string
  boxes: FBox[] | null // one per non-empty line when positions are known
  origin: 'demo' | 'detector' | 'typed'
}

interface Settings { dpi: number; paper: 'image' | 'a4' | 'letter'; fit: boolean; overlay: boolean; title: string }
const DEF: Settings = { dpi: 150, paper: 'image', fit: true, overlay: true, title: 'Scanned document' }

type TD = new () => { detect: (src: ImageBitmapSource) => Promise<{ rawValue: string; boundingBox: DOMRectReadOnly }[]> }
const detectorClass = (): TD | undefined => (window as unknown as { TextDetector?: TD }).TextDetector

// ---------- demo "scans" drawn in code (positions are known exactly, like an OCR engine would report) ----------
const DEMO: string[][] = [
  ['NORTHWIND PLUMBING CO.', '41 Harbour Road, Bristol BS1 5TY', '', 'INVOICE  #2026-0412', 'Date: 14 October 2026', 'Bill to: Greenfield Primary School', '', 'Replace boiler pressure valve      1 x    £86.00', 'Labour (2.5 h @ £48.00)                £120.00', 'Flush radiator circuit                     £65.00', 'Call-out fee                                    £35.00', '', 'Subtotal                                       £306.00', 'VAT 20%                                         £61.20', 'TOTAL DUE                                    £367.20', '', 'Payment within 30 days. Sort code 20-45-77.', 'Thank you for your business!'],
  ['SERVICE REPORT', 'Job reference: NW-8841', '', 'Technician: Daniel Okafor', 'Site: boiler room, east wing', '', 'Findings:', '- Pressure relief valve weeping at 2.8 bar', '- Sludge in return pipe, magnetic filter full', '- Flue and gas pressure within limits', '', 'Work done:', '- Valve replaced, system re-pressurised to 1.4 bar', '- Power flush, inhibitor added (500 ml)', '', 'Next service due: April 2027', 'Signed: D. Okafor'],
]

function drawScan(text: string[], seed: number): { src: string; w: number; h: number; boxes: FBox[]; body: string } {
  const W = 1240, H = 1754 // A4 at 150 dpi
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  g.fillStyle = '#f4f1ea'
  g.fillRect(0, 0, W, H)
  let r = seed
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < 2500; i++) {
    g.fillStyle = `rgba(60,50,40,${rnd() * 0.12})`
    g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2, 1 + rnd() * 2)
  }
  g.fillStyle = '#20304a'
  g.fillRect(110, 110, 70, 70)
  const boxes: FBox[] = []
  const kept: string[] = []
  let y = 150
  text.forEach((t, i) => {
    const big = i === 0
    const size = big ? 46 : 32
    y += big ? 0 : 54
    if (!t) return
    g.font = `${big ? 'bold ' : ''}${size}px "Courier New", monospace`
    g.fillStyle = '#1c1c1c'
    const x = big ? 205 : 130
    g.fillText(t, x, y)
    const m = g.measureText(t)
    const top = y - m.actualBoundingBoxAscent, bot = y + m.actualBoundingBoxDescent
    boxes.push({ x: x / W, y: top / H, w: m.width / W, h: (bot - top) / H })
    kept.push(t)
    if (big) y += 30
  })
  g.strokeStyle = 'rgba(0,0,0,.35)'
  g.beginPath()
  g.moveTo(120, 1600)
  g.lineTo(W - 120, 1600)
  g.stroke()
  return { src: c.toDataURL('image/jpeg', 0.72), w: W, h: H, boxes, body: kept.join('\n') }
}

const demoPages = (): Page[] =>
  DEMO.map((t, i) => {
    const d = drawScan(t, 7 + i * 101)
    return { id: uid(), name: `demo-scan-${i + 1}.jpg`, kind: 'img', src: d.src, iw: d.w, ih: d.h, text: d.body, boxes: d.boxes, origin: 'demo' }
  })

async function loadImage(f: File): Promise<{ src: string; w: number; h: number; bmp: ImageBitmap }> {
  const bmp = await createImageBitmap(f)
  const k = Math.min(1, 3500 / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * k)
  c.height = Math.round(bmp.height * k)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  return { src: c.toDataURL('image/jpeg', 0.85), w: c.width, h: c.height, bmp }
}

async function detect(bmp: ImageBitmapSource, w: number, h: number): Promise<{ text: string; boxes: FBox[] } | null> {
  const T = detectorClass()
  if (!T) return null
  const raw = await new T().detect(bmp)
  const dets: Det[] = raw.map((d) => ({ text: d.rawValue, x: d.boundingBox.x, y: d.boundingBox.y, w: d.boundingBox.width, h: d.boundingBox.height }))
  const g = groupLines(dets)
  return { text: g.map((d) => d.text).join('\n'), boxes: g.map((d) => ({ x: d.x / w, y: d.y / h, w: d.w / w, h: d.h / h })) }
}

const dataUrlBytes = (u: string) => Uint8Array.from(atob(u.slice(u.indexOf(',') + 1)), (ch) => ch.charCodeAt(0))

export default function PdfOcrConverter() {
  const [s, set] = useToolState('pdf-ocr-converter', DEF)
  const [pages, setPages] = useState<Page[]>(demoPages)
  const [pdf, setPdf] = useState<{ name: string; bytes: Uint8Array } | null>(null)
  const [sel, setSel] = useState(0)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err' | 'warn'; text: string } | null>(null)
  const [bulk, setBulk] = useState('')
  const hasTD = typeof window !== 'undefined' && !!detectorClass()

  const page = pages[Math.min(sel, pages.length - 1)]
  const edit = (id: string, p: Partial<Page>) => setPages((ps) => ps.map((x) => (x.id === id ? { ...x, ...p } : x)))
  const lineCount = (p: Page) => lines(p.text).length
  const boxesOf = (p: Page) => (p.boxes && p.boxes.length === lineCount(p) ? p.boxes : flowBoxes(lineCount(p)))
  const words = pages.reduce((a, p) => a + (p.text.match(/\S+/g)?.length ?? 0), 0)
  const empty = pages.filter((p) => !p.text.trim()).length
  const dropped = [...new Set(pages.flatMap((p) => sanitize(p.text).changed))]

  async function addFiles(fs: File[]) {
    setMsg(null)
    const out: Page[] = []
    for (const f of fs) {
      try {
        if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
          const { PDFDocument } = await import('pdf-lib')
          const bytes = new Uint8Array(await f.arrayBuffer())
          const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
          setPdf({ name: f.name, bytes })
          setPages((ps) => ps.filter((p) => p.kind !== 'pdf' && p.origin !== 'demo'))
          doc.getPages().forEach((pg, i) => {
            const b = pg.getCropBox()
            out.push({ id: uid(), name: `${f.name} · p${i + 1}`, kind: 'pdf', iw: b.width, ih: b.height, pdfIndex: i, rotated: pg.getRotation().angle % 360 !== 0, text: '', boxes: null, origin: 'typed' })
          })
        } else if (f.type.startsWith('image/')) {
          setBusy(`Reading ${f.name}…`)
          const im = await loadImage(f)
          const d = await detect(im.bmp, im.bmp.width, im.bmp.height).catch(() => null)
          out.push({ id: uid(), name: f.name, kind: 'img', src: im.src, iw: im.w, ih: im.h, text: d?.text ?? '', boxes: d?.boxes ?? null, origin: d ? 'detector' : 'typed' })
        }
      } catch (e) {
        setMsg({ tone: 'err', text: `${f.name}: ${(e as Error).message}` })
      }
    }
    setBusy('')
    setPages((ps) => {
      const base = ps.filter((p) => p.origin !== 'demo')
      // PDF pages first (they live in the original file), then image pages
      const next = [...base, ...out].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'pdf' ? -1 : 1))
      return next
    })
    setSel(0)
  }

  async function redetect(p: Page) {
    if (!p.src) return
    setBusy('Detecting text…')
    try {
      const img = new Image()
      img.src = p.src
      await img.decode()
      const bmp = await createImageBitmap(img)
      const d = await detect(bmp, p.iw, p.ih)
      if (d) edit(p.id, { text: d.text, boxes: d.boxes, origin: 'detector' })
    } catch (e) {
      setMsg({ tone: 'err', text: `Text detection failed: ${(e as Error).message}` })
    }
    setBusy('')
  }

  function applyBulk() {
    const parts = splitPages(bulk)
    setPages((ps) => ps.map((p, i) => (i < parts.length ? { ...p, text: parts[i], boxes: null, origin: 'typed' } : p)))
    setMsg({ tone: 'ok', text: `Filled ${Math.min(parts.length, pages.length)} page(s) from the pasted text${parts.length > pages.length ? ` (${parts.length - pages.length} extra part(s) ignored)` : ''}.` })
  }

  async function exportPdf() {
    setBusy('Building searchable PDF…')
    setMsg(null)
    try {
      const L = await import('pdf-lib')
      const doc = pdf ? await L.PDFDocument.load(pdf.bytes, { ignoreEncryption: true }) : await L.PDFDocument.create()
      const font = await doc.embedFont(L.StandardFonts.Helvetica)
      let placed = 0
      for (const p of pages) {
        let pg, area
        if (p.kind === 'pdf') {
          pg = doc.getPage(p.pdfIndex!)
          const b = pg.getCropBox()
          area = { x: b.x, y: b.y, w: b.width, h: b.height }
        } else {
          const g = pageFor(p.iw, p.ih, s.dpi, s.paper)
          pg = doc.addPage([g.pw, g.ph])
          const img = await doc.embedJpg(dataUrlBytes(p.src!))
          pg.drawImage(img, { x: g.ix, y: g.iy, width: g.iw, height: g.ih })
          area = { x: g.ix, y: g.iy, w: g.iw, h: g.ih }
        }
        const ls = lines(p.text)
        if (!ls.length) continue
        const bx = boxesOf(p)
        const key = pg.node.newFontDictionary(font.name, font.ref)
        const ops = [L.pushGraphicsState(), L.beginText(), L.setTextRenderingMode(L.TextRenderingMode.Invisible)]
        ls.forEach((line, i) => {
          const t = sanitize(line.trim()).text
          const pl = placeLine(bx[i], area, font.widthOfTextAtSize(t, 1), s.fit)
          ops.push(L.setFontAndSize(key, pl.size), L.setCharacterSqueeze(pl.squeeze), L.setTextMatrix(1, 0, 0, 1, pl.x, pl.y), L.showText(font.encodeText(t)))
          placed++
        })
        ops.push(L.endText(), L.popGraphicsState())
        pg.pushOperators(...ops)
      }
      doc.setTitle(s.title || 'Searchable document')
      doc.setProducer('Browser Toolbox · PDF OCR Converter')
      doc.setSubject('Image pages with an invisible text layer (render mode 3)')
      const bytes = await doc.save()
      download(`${(pdf?.name.replace(/\.pdf$/i, '') || s.title || 'scan').replace(/[^\w.-]+/g, '-')}-searchable.pdf`, new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }))
      setMsg({ tone: 'ok', text: `Saved ${doc.getPageCount()} page(s), ${placed} invisible text line(s), ${kb(bytes.length)}. Open it and press Ctrl+F to search.` })
    } catch (e) {
      setMsg({ tone: 'err', text: `Export failed: ${(e as Error).message}` })
    }
    setBusy('')
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="1 · Add pages">
          <FileDrop accept="image/*,application/pdf,.pdf" multiple onFiles={addFiles} label="Drop scanned images (JPG/PNG/WebP) or a PDF" />
          <Row>
            <Btn onClick={() => { setPdf(null); setPages(demoPages()); setSel(0); setMsg(null) }}>Load demo scans</Btn>
            <Btn kind="ghost" disabled={!pages.length} onClick={() => { setPages([]); setPdf(null) }}>Clear</Btn>
          </Row>
          {hasTD ? (
            <Note tone="ok">This browser has the built-in <b>TextDetector</b>; text and line positions are filled in automatically for images.</Note>
          ) : (
            <Note>
              No built-in text recognition here (TextDetector is only in some Chromium builds behind a flag). Copy the text from your OS instead —
              Live Text on macOS/iOS, Snipping Tool “Text actions” on Windows, Google Lens on Android — and paste it per page below.
            </Note>
          )}
          {pdf && <Note tone="warn">PDF pages are kept as they are and get the text layer on top. Without a renderer the lines are spread top-to-bottom, so search works but the highlight position is approximate.</Note>}
        </Panel>
        <Panel title="2 · Output">
          <Txt label="Document title" value={s.title} onChange={(title) => set({ title })} />
          <Row>
            <Select label="Image page size" value={s.paper} onChange={(paper) => set({ paper })} options={[['image', 'Image size at DPI'], ['a4', 'Fit on A4'], ['letter', 'Fit on Letter']]} />
            <Select label="Scan resolution" value={s.dpi} onChange={(dpi) => set({ dpi })} options={[[72, '72 dpi'], [100, '100 dpi'], [150, '150 dpi'], [200, '200 dpi'], [300, '300 dpi'], [600, '600 dpi']]} />
          </Row>
          <Check label="Stretch each line to its box width (better highlight & copy order)" value={s.fit} onChange={(fit) => set({ fit })} />
          <Check label="Show text boxes on preview" value={s.overlay} onChange={(overlay) => set({ overlay })} />
          {dropped.length > 0 && <Note tone="warn">The PDF base font is WinAnsi (Latin). These characters are transliterated or replaced: {dropped.slice(0, 20).join(' ')}</Note>}
          <Btn kind="primary" disabled={!pages.length || !!busy} onClick={exportPdf}>⬇ Download searchable PDF</Btn>
          {busy && <p className="muted">{busy}</p>}
          {msg && <Note tone={msg.tone}>{msg.text}</Note>}
        </Panel>
        <Panel title="Bulk paste (optional)">
          <Area value={bulk} onChange={setBulk} rows={5} placeholder={'Text for page 1…\n--- page 2 ---\nText for page 2…'} />
          <Row>
            <Btn disabled={!bulk.trim() || !pages.length} onClick={applyBulk}>Split into pages</Btn>
            <span className="muted">Separate pages with a form feed or a line like “--- page 2 ---”.</span>
          </Row>
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Pages" value={pages.length} sub={pdf ? `from ${pdf.name}` : 'image pages'} />
          <Stat label="Words in text layer" value={num(words, 0)} tone="accent" />
          <Stat label="Pages without text" value={empty} tone={empty ? 'bad' : 'good'} />
          <Stat label="Positioned lines" value={pages.filter((p) => p.boxes && p.boxes.length === lineCount(p)).length + ' / ' + pages.length} sub="pages with exact boxes" />
        </Stats>
        {pages.length > 0 && (
          <Panel title="Pages">
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6 }}>
              {pages.map((p, i) => (
                <button key={p.id} type="button" onClick={() => setSel(i)} title={p.name}
                  style={{ flex: '0 0 auto', width: 74, padding: 4, border: `2px solid ${i === sel ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 8, background: 'var(--panel)', cursor: 'pointer' }}>
                  <div style={{ aspectRatio: `${p.iw} / ${p.ih}`, background: p.src ? `center/cover url(${p.src})` : 'var(--bg, #fff)', border: '1px solid var(--line)', display: 'grid', placeItems: 'center', fontSize: 11 }}>{p.src ? '' : 'PDF'}</div>
                  <div style={{ fontSize: 11, marginTop: 3 }}>{i + 1} {p.text.trim() ? '✓' : '·'}</div>
                </button>
              ))}
            </div>
          </Panel>
        )}
        {page && (
          <Panel title={`Page ${sel + 1}: ${page.name}`} actions={
            <>
              {page.kind === 'img' && hasTD && <Btn onClick={() => redetect(page)}>Detect text</Btn>}
              <Btn kind="ghost" onClick={() => { setPages((ps) => ps.filter((x) => x.id !== page.id || x.kind === 'pdf')); setSel(0) }} disabled={page.kind === 'pdf'}>Remove</Btn>
            </>
          }>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
              <div style={{ position: 'relative', aspectRatio: `${page.iw} / ${page.ih}`, border: '1px solid var(--line)', background: page.src ? undefined : '#fff', maxHeight: 620 }}>
                {page.src ? <img src={page.src} alt={page.name} style={{ width: '100%', height: '100%', display: 'block' }} /> : <span style={{ position: 'absolute', inset: 'auto 8px 8px auto', fontSize: 11, color: '#64748b' }}>{num(page.iw, 0)}×{num(page.ih, 0)} pt</span>}
                {s.overlay && boxesOf(page).map((b, i) => (
                  <div key={i} title={lines(page.text)[i]} style={{ position: 'absolute', left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%`, background: page.boxes ? 'rgba(99,102,241,.18)' : 'rgba(245,158,11,.22)', outline: `1px solid ${page.boxes ? 'rgba(99,102,241,.6)' : 'rgba(245,158,11,.6)'}` }} />
                ))}
              </div>
              <div>
                <Area label={`Text layer · ${lineCount(page)} line(s)`} value={page.text} rows={18} mono
                  onChange={(text) => edit(page.id, { text })} />
                {page.boxes && page.boxes.length !== lineCount(page) && <Note tone="warn">Line count changed ({lineCount(page)} vs {page.boxes.length} detected boxes) — lines are spread evenly until they match again.</Note>}
                {page.rotated && <Note tone="warn">This PDF page is rotated; the text layer follows the unrotated page.</Note>}
                <p className="muted" style={{ fontSize: 13 }}>
                  {page.origin === 'demo' ? 'Demo: exact line boxes, as an OCR engine would report them.' : page.origin === 'detector' ? 'Text and boxes from TextDetector — check and correct the text.' : 'Typed/pasted text: one line per row; positions are spread top-to-bottom (amber).'}
                </p>
              </div>
            </div>
          </Panel>
        )}
        <Panel title="How it works">
          <p className="muted" style={{ margin: 0 }}>
            Each page keeps its image unchanged. On top, every line is written with PDF text render mode 3 (invisible) at the line’s position and size,
            horizontally scaled to the box width. Viewers can then search, select and copy the text, and screen readers can read it. No file leaves your browser.
          </p>
        </Panel>
      </div>
    </Split>
  )
}
