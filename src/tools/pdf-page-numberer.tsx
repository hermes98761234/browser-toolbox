import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { Btn, Check, download, FileDrop, Note, Num, Panel, Row, Select, Slider, Split, Stat, Stats, Txt, useToolState } from '../kit'
import { fillTemplate, mirrorSpot, numbering, place, toUser, visualSize, type Spot, type Style } from './lib/pdf-page-numberer'
import { hexToRgb, parsePages, sanitize } from './lib/pdf-watermarker'

type FontKey = 'Helvetica' | 'HelveticaBold' | 'TimesRoman' | 'Courier'
interface State {
  fmt: string; style: Style; pad: number; start: number; pages: string; spot: Spot; mirror: boolean
  header: string; headerSpot: Spot; font: FontKey; size: number; color: string; mx: number; my: number; mask: boolean
}
const DEF: State = {
  fmt: 'Page {n} of {total}', style: 'arabic', pad: 0, start: 1, pages: '2-', spot: 'bottom-center', mirror: false,
  header: '{file} · {date}', headerSpot: 'top-right', font: 'Helvetica', size: 10, color: '#334155', mx: 40, my: 28, mask: false,
}
const FONTS: [FontKey, string, string][] = [
  ['Helvetica', 'Helvetica', '{s}px Helvetica, Arial, sans-serif'],
  ['HelveticaBold', 'Helvetica Bold', 'bold {s}px Helvetica, Arial, sans-serif'],
  ['TimesRoman', 'Times', '{s}px "Times New Roman", Times, serif'],
  ['Courier', 'Courier', '{s}px "Courier New", Courier, monospace'],
]
const SPOTS: [Spot, string][] = [['top-left', 'Top left'], ['top-center', 'Top center'], ['top-right', 'Top right'], ['bottom-left', 'Bottom left'], ['bottom-center', 'Bottom center'], ['bottom-right', 'Bottom right']]
const PRESETS: [string, Partial<State>][] = [
  ['Page 1 of N', { fmt: 'Page {n} of {total}', style: 'arabic', pad: 0 }],
  ['Plain 1', { fmt: '{n}', style: 'arabic', pad: 0 }],
  ['— 1 —', { fmt: '— {n} —', style: 'arabic', pad: 0 }],
  ['1 / N', { fmt: '{n} / {total}', style: 'arabic', pad: 0 }],
  ['Roman i, ii', { fmt: '{n}', style: 'roman', pad: 0 }],
  ['Bates ACME-000001', { fmt: 'ACME-{n}', style: 'arabic', pad: 6, start: 1, spot: 'bottom-right', pages: 'all', font: 'Courier' }],
  ['Exhibit A-1', { fmt: 'Exhibit A-{n}', style: 'arabic', pad: 0, spot: 'bottom-right' }],
]

let pdfjsP: Promise<typeof import('pdfjs-dist')> | null = null
function pdfjs() {
  pdfjsP ??= (async () => {
    const lib = await import('pdfjs-dist')
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    lib.GlobalWorkerOptions.workerSrc = worker.default
    return lib
  })()
  return pdfjsP
}

async function samplePdf(): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb, degrees } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const reg = await doc.embedFont(StandardFonts.Helvetica)
  const titles = ['Annual Report', 'Letter from the board', 'Highlights', 'Operations review', 'Financial summary', 'Appendix: wide table']
  titles.forEach((t, i) => {
    const wide = i === 5
    const p = doc.addPage(wide ? [841.89, 595.28] : [595.28, 841.89])
    const { width: w, height: h } = p.getSize()
    if (i === 0) {
      p.drawRectangle({ x: 0, y: 0, width: w, height: h, color: rgb(0.2, 0.22, 0.55) })
      p.drawText('Annual Report', { x: 60, y: h / 2, size: 44, font: bold, color: rgb(1, 1, 1) })
      p.drawText('Cover page · usually left without a number', { x: 60, y: h / 2 - 34, size: 14, font: reg, color: rgb(0.85, 0.87, 1) })
      return
    }
    p.drawText(t, { x: 60, y: h - 90, size: 24, font: bold, color: rgb(0.1, 0.12, 0.2) })
    for (let l = 0; l < (wide ? 18 : 28); l++) p.drawRectangle({ x: 60, y: h - 130 - l * 22, width: (w - 120) * (0.55 + ((l * 37 + i * 11) % 45) / 100), height: 7, color: rgb(0.84, 0.86, 0.9) })
    if (i === 3) p.drawText('sample', { x: w - 140, y: 140, size: 30, font: bold, color: rgb(0.9, 0.5, 0.5), rotate: degrees(20), opacity: 0.4 })
  })
  return doc.save()
}

interface Doc { name: string; bytes: Uint8Array; pdf: PDFDocumentProxy; n: number }

export default function PdfPageNumberer() {
  const [s, set, reset] = useToolState('pdf-page-numberer', DEF)
  const [doc, setDoc] = useState<Doc | null>(null)
  const [view, setView] = useState(1)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')
  const [out, setOut] = useState<{ name: string; size: number } | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const bg = useRef<{ page: number; img: HTMLCanvasElement; w: number; h: number; scale: number } | null>(null)
  const [bgTick, setBgTick] = useState(0)

  const open = async (bytes: Uint8Array, name: string) => {
    setErr('')
    setOut(null)
    try {
      const lib = await pdfjs()
      const pdf = await lib.getDocument({ data: bytes.slice() }).promise
      bg.current = null
      setDoc({ name, bytes, pdf, n: pdf.numPages })
      setView(Math.min(2, pdf.numPages))
    } catch (e) {
      setErr(`Could not open this PDF: ${(e as Error).message}`)
    }
  }
  useEffect(() => {
    void samplePdf().then((b) => open(b, 'annual-report.pdf'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const total = doc?.n ?? 0
  const sel = parsePages(s.pages, Math.max(1, total))
  const nums = numbering(sel.pages, s.start)
  const date = new Date().toISOString().slice(0, 10)
  const labelFor = (page: number) => {
    const n = nums.map.get(page)
    const c = { n: n ?? 0, total: nums.total, page, pages: total, file: doc?.name ?? '', date }
    return { num: n === undefined ? '' : sanitize(fillTemplate(s.fmt, c, s.style, s.pad)).text, head: n === undefined ? '' : sanitize(fillTemplate(s.header, c, s.style, s.pad)).text }
  }
  const lossy = sanitize(s.fmt + s.header).changed

  // Render the previewed page once, then overlay labels whenever settings change.
  useEffect(() => {
    if (!doc) return
    let live = true
    void (async () => {
      const pg = await doc.pdf.getPage(view)
      const base = pg.getViewport({ scale: 1 })
      const scale = 520 / Math.max(base.width, base.height)
      const vp = pg.getViewport({ scale: scale * 2 })
      const c = document.createElement('canvas')
      c.width = Math.round(vp.width)
      c.height = Math.round(vp.height)
      await pg.render({ canvas: c, viewport: vp }).promise
      if (!live) return
      bg.current = { page: view, img: c, w: base.width, h: base.height, scale: scale * 2 }
      setBgTick((t) => t + 1)
    })()
    return () => { live = false }
  }, [doc, view])

  useEffect(() => {
    const c = canvas.current
    const b = bg.current
    if (!c || !b) return
    c.width = b.img.width
    c.height = b.img.height
    const g = c.getContext('2d')!
    g.drawImage(b.img, 0, 0)
    const { num: lab, head } = labelFor(b.page)
    const fontCss = FONTS.find((f) => f[0] === s.font)![2].replace('{s}', String(s.size * b.scale))
    g.font = fontCss
    const draw = (text: string, spot: Spot) => {
      if (!text) return
      const tw = g.measureText(text).width / b.scale
      const sp = mirrorSpot(spot, b.page, s.mirror)
      const [x, y] = place(sp, { x: 0, y: 0, w: b.w, h: b.h }, tw, s.size, s.mx, s.my)
      const cx = x * b.scale, cy = (b.h - y) * b.scale
      if (s.mask) {
        g.fillStyle = '#fff'
        g.fillRect(cx - 3 * b.scale, cy - s.size * 0.9 * b.scale, (tw + 6) * b.scale, s.size * 1.25 * b.scale)
      }
      g.fillStyle = s.color
      g.fillText(text, cx, cy)
      g.strokeStyle = 'rgba(99,102,241,.55)'
      g.setLineDash([4, 4])
      g.strokeRect(cx - 4, cy - s.size * 0.85 * b.scale, tw * b.scale + 8, s.size * 1.15 * b.scale)
      g.setLineDash([])
    }
    draw(lab, s.spot)
    draw(head, s.headerSpot)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgTick, s, doc])

  const apply = async () => {
    if (!doc || sel.error) return
    setBusy('Numbering pages…')
    setErr('')
    try {
      const { PDFDocument, StandardFonts, rgb, degrees } = await import('pdf-lib')
      const d = await PDFDocument.load(doc.bytes, { ignoreEncryption: true })
      const font = await d.embedFont(StandardFonts[s.font])
      const [r, gg, bb] = hexToRgb(s.color)
      d.getPages().forEach((p, i) => {
        const page = i + 1
        const { num: lab, head } = labelFor(page)
        const crop = p.getCropBox()
        const box = { x: crop.x, y: crop.y, w: crop.width, h: crop.height }
        const rot = p.getRotation().angle
        const [vw, vh] = visualSize(box.w, box.h, rot)
        const put = (text: string, spot: Spot) => {
          if (!text) return
          const tw = font.widthOfTextAtSize(text, s.size)
          const [vx, vy] = place(mirrorSpot(spot, page, s.mirror), { x: 0, y: 0, w: vw, h: vh }, tw, s.size, s.mx, s.my)
          if (s.mask) {
            const [mx, my, deg] = toUser(vx - 3, vy - s.size * 0.35, rot, box)
            p.drawRectangle({ x: mx, y: my, width: tw + 6, height: s.size * 1.25, color: rgb(1, 1, 1), rotate: degrees(deg) })
          }
          const [x, y, deg] = toUser(vx, vy, rot, box)
          p.drawText(text, { x, y, size: s.size, font, color: rgb(r, gg, bb), rotate: degrees(deg) })
        }
        put(lab, s.spot)
        put(head, s.headerSpot)
      })
      const bytes = await d.save()
      const name = doc.name.replace(/\.pdf$/i, '') + '-numbered.pdf'
      download(name, new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }))
      setOut({ name, size: bytes.length })
    } catch (e) {
      setErr(`Failed: ${(e as Error).message}`)
    }
    setBusy('')
  }

  const first = sel.pages[0]
  return (
    <Split wide="right">
      <div>
        <Panel title="1 · PDF">
          <FileDrop accept="application/pdf,.pdf" label="Drop a PDF or click to choose" onFiles={async ([f]) => open(new Uint8Array(await f.arrayBuffer()), f.name)} />
          {doc && <p className="muted" style={{ margin: '8px 0 0' }}>📄 <b>{doc.name}</b> · {doc.n} pages{doc.name === 'annual-report.pdf' ? ' (sample)' : ''}</p>}
          {err && <Note tone="err">{err}</Note>}
        </Panel>
        <Panel title="2 · Number format">
          <Row>{PRESETS.map(([n, p]) => <Btn key={n} kind="ghost" onClick={() => set(p)}>{n}</Btn>)}</Row>
          <Txt label="Format" value={s.fmt} onChange={(fmt) => set({ fmt })} hint="Tokens: {n} number · {total} last number · {page} {pages} physical · {file} {date}" />
          <Row>
            <Select label="Style" value={s.style} onChange={(style) => set({ style })} options={[['arabic', '1, 2, 3'], ['roman', 'i, ii, iii'], ['ROMAN', 'I, II, III'], ['alpha', 'a, b, c'], ['ALPHA', 'A, B, C']]} />
            <Num label="Start at" value={s.start} onChange={(start) => set({ start: Math.round(start) })} min={s.style === 'arabic' ? 0 : 1} step={1} />
            <Num label="Zero-pad digits" value={s.pad} onChange={(pad) => set({ pad: Math.max(0, Math.min(10, Math.round(pad))) })} min={0} max={10} step={1} />
          </Row>
          <Txt label="Pages to number" value={s.pages} onChange={(pages) => set({ pages })} hint={'"all", "2-" (skip cover), "odd", "3-10, 12"'} />
          {sel.error && <Note tone="err">{sel.error}</Note>}
          <Select label="Position" value={s.spot} onChange={(spot) => set({ spot })} options={SPOTS} />
          <Check label="Mirror left/right on even pages (book layout)" value={s.mirror} onChange={(mirror) => set({ mirror })} />
        </Panel>
        <Panel title="3 · Header / footer text (optional)">
          <Txt label="Text" value={s.header} onChange={(header) => set({ header })} placeholder="Leave empty for none" hint="Same tokens; e.g. Confidential · {file}" />
          <Select label="Position" value={s.headerSpot} onChange={(headerSpot) => set({ headerSpot })} options={SPOTS} />
        </Panel>
        <Panel title="4 · Look" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            <Select label="Font" value={s.font} onChange={(font) => set({ font })} options={FONTS.map(([k, l]) => [k, l] as [FontKey, string])} />
            <label className="k-field"><span className="k-label">Color</span><input type="color" value={s.color} onChange={(e) => set({ color: e.target.value })} style={{ width: 64, height: 36 }} /></label>
          </Row>
          <Slider label="Font size" value={s.size} onChange={(size) => set({ size })} min={6} max={28} step={0.5} unit=" pt" />
          <Slider label="Side margin" value={s.mx} onChange={(mx) => set({ mx })} min={0} max={120} unit=" pt" />
          <Slider label="Top/bottom margin" value={s.my} onChange={(my) => set({ my })} min={0} max={120} unit=" pt" />
          <Check label="White box behind text (covers old numbers)" value={s.mask} onChange={(mask) => set({ mask })} />
          {lossy.length > 0 && <Note tone="warn">Standard PDF fonts can't draw {lossy.join(' ')}; they will be transliterated or replaced with “?”.</Note>}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Pages" value={total || '—'} />
          <Stat label="Numbered" value={sel.pages.length} sub={first ? `from page ${first}` : ''} />
          <Stat label="First label" value={first ? labelFor(first).num || '—' : '—'} tone="accent" />
          <Stat label="Last label" value={sel.pages.length ? labelFor(sel.pages[sel.pages.length - 1]).num : '—'} />
        </Stats>
        <Panel
          title={`Preview · page ${view} of ${total || '…'}`}
          actions={<>
            <Btn kind="ghost" disabled={view <= 1} onClick={() => setView(view - 1)}>◀</Btn>
            <Btn kind="ghost" disabled={view >= total} onClick={() => setView(view + 1)}>▶</Btn>
            <Btn kind="primary" disabled={!doc || !!sel.error || !!busy} onClick={() => void apply()}>{busy || '⬇ Download numbered PDF'}</Btn>
          </>}
        >
          <div style={{ display: 'grid', placeItems: 'center', background: 'var(--bg)', borderRadius: 10, padding: 12 }}>
            <canvas ref={canvas} style={{ maxWidth: '100%', maxHeight: 560, boxShadow: '0 2px 12px rgba(0,0,0,.25)', background: '#fff' }} />
          </div>
          {!nums.map.has(view) && doc && <p className="muted" style={{ textAlign: 'center' }}>This page is not in the numbered range.</p>}
          {out && <Note tone="ok">Saved <b>{out.name}</b> ({(out.size / 1024).toFixed(1)} KB). Dashed boxes in the preview are guides only.</Note>}
        </Panel>
        <Panel title="Tips">
          <ul className="muted" style={{ margin: 0, paddingLeft: 18 }}>
            <li>Skip a cover with <b>2-</b> and start at 1; front matter can use roman numerals in a separate pass.</li>
            <li><b>{'{total}'}</b> is the last number shown, so “Page 3 of 5” stays consistent when the cover is skipped.</li>
            <li>Rotated pages are handled: labels are placed relative to the page as you see it.</li>
            <li>Bates numbering: use a prefix, zero padding and “all” pages.</li>
            <li>Everything runs locally; the PDF never leaves your browser.</li>
          </ul>
        </Panel>
      </div>
    </Split>
  )
}
