import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { Btn, Check, download, FileDrop, Note, Panel, Row, Seg, Split, Stat, Stats, Txt, uid, useToolState } from '../kit'
import { fmtBytes } from './lib/image-compressor'
import { addUnique, buildRegex, findBoxes, normRect, pagesToRaster, PRESETS, type Box, type TRun } from './lib/pdf-redactor'

const DEF = { dpi: 200, fmt: 'png' as 'png' | 'jpeg', all: false, pad: 1.5, regex: false, caseSens: false, word: false }

interface PageInfo { w: number; h: number; img: string; runs: TRun[] }
interface Result { bytes: Uint8Array; raster: number[]; textLeft: number; leaks: string[]; size: number }

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

// pdf.js's bundled standard fonts (Liberation/Foxit) so non-embedded Helvetica/Times/Courier render with
// their real metrics; otherwise system fallbacks can be wider than the text positions we redact.
const FONTS = import.meta.glob('/node_modules/pdfjs-dist/standard_fonts/*.{pfb,ttf}', { query: '?url', import: 'default' }) as Record<string, () => Promise<string>>
class FontFactory {
  async fetch({ kind, filename }: { kind: string; filename: string }): Promise<Uint8Array> {
    const key = Object.keys(FONTS).find((k) => k.endsWith('/' + filename))
    if (kind !== 'standardFontDataUrl' || !key) throw new Error(`No ${kind} data for ${filename}`)
    return new Uint8Array(await (await fetch(await FONTS[key]())).arrayBuffer())
  }
}
const OPEN_OPTS = { useSystemFonts: false, useWorkerFetch: false, BinaryDataFactory: FontFactory } as object

/** A two-page fake HR record full of obviously fake personal data. */
async function samplePdf(): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  doc.setTitle('Employee record — Jane Example')
  doc.setAuthor('HR Department (sample)')
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const reg = await doc.embedFont(StandardFonts.Helvetica)
  const ink = rgb(0.15, 0.16, 0.2), mute = rgb(0.45, 0.47, 0.52)
  const pages: [string, [string, string][]][] = [
    ['Employee record', [['Name', 'Jane Example'], ['Employee ID', 'EMP-20417'], ['SSN', '078-05-1120'], ['Date of birth', '1988-04-12'], ['E-mail', 'jane.example@example.com'], ['Phone', '(555) 010-4477'], ['Home address', '42 Sample Street, Springfield'], ['Salary', '$84,500.00 per year']]],
    ['Payment details', [['Bank', 'Example Savings Bank'], ['IBAN', 'DE89 3704 0044 0532 0130 00'], ['Corporate card', '4111 1111 1111 1111'], ['Card expiry', '09/28'], ['Emergency contact', 'John Example'], ['Contact phone', '+1 555 010 9921'], ['Contact e-mail', 'john.ex@example.org'], ['Last review', '2025-11-03']]],
  ]
  pages.forEach(([title, rows], i) => {
    const p = doc.addPage([612, 792])
    p.drawRectangle({ x: 0, y: 712, width: 612, height: 80, color: rgb(0.39, 0.4, 0.95) })
    p.drawText(title, { x: 48, y: 742, size: 26, font: bold, color: rgb(1, 1, 1) })
    p.drawText('CONFIDENTIAL — sample document generated in your browser', { x: 48, y: 690, size: 10, font: bold, color: rgb(0.86, 0.15, 0.15) })
    rows.forEach(([k, v], j) => {
      const y = 640 - j * 38
      p.drawText(k, { x: 48, y, size: 12, font: reg, color: mute })
      p.drawText(v, { x: 220, y, size: 13, font: bold, color: ink })
      p.drawLine({ start: { x: 48, y: y - 12 }, end: { x: 564, y: y - 12 }, thickness: 0.5, color: rgb(0.85, 0.86, 0.9) })
    })
    p.drawText(i === 0 ? 'Notes: Jane Example joined the Springfield office in 2019 and can be reached at jane.example@example.com.' : 'Reimbursements go to the IBAN above. Questions: call (555) 010-4477.', { x: 48, y: 300, size: 10.5, font: reg, color: ink })
    p.drawText(`Page ${i + 1} of 2`, { x: 48, y: 40, size: 9, font: reg, color: mute })
  })
  return doc.save()
}

let mctx: CanvasRenderingContext2D | null = null
/** Relative width of a prefix, measured with a Helvetica-like font (better than character counts). */
function measure(s: string, full: string) {
  mctx ??= document.createElement('canvas').getContext('2d')
  if (!mctx) return full.length ? s.length / full.length : 0
  mctx.font = '20px Helvetica, Arial, "Liberation Sans", sans-serif'
  const fw = mctx.measureText(full).width
  return fw ? mctx.measureText(s).width / fw : 0
}

const toBlob = (c: HTMLCanvasElement, type: string, q?: number) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Encoding failed'))), type, q))

export default function PdfRedactor() {
  const [s, set] = useToolState('pdf-redactor', DEF)
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [bytes, setBytes] = useState<Uint8Array | null>(null)
  const [name, setName] = useState('sample.pdf')
  const [pages, setPages] = useState<PageInfo[]>([])
  const [boxes, setBoxes] = useState<Box[]>([])
  const [term, setTerm] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [res, setRes] = useState<Result | null>(null)
  const [drag, setDrag] = useState<{ page: number; x0: number; y0: number; x1: number; y1: number } | null>(null)
  const pageEls = useRef<(HTMLDivElement | null)[]>([])

  const search = (re: RegExp | null, src: string, list: PageInfo[] = pages, base: Box[] = boxes) => {
    if (!re) {
      setMsg('Enter a valid search term (a regex must not match empty text).')
      return base
    }
    const found = list.flatMap((p, i) => findBoxes(p.runs, re, i, src, s.pad, measure)).map((b) => ({ ...b, id: uid() }))
    const next = addUnique(base, found)
    setMsg(`${src}: ${found.length} match${found.length === 1 ? '' : 'es'}, ${next.length - base.length} new box${next.length - base.length === 1 ? '' : 'es'} added.`)
    setBoxes(next)
    return next
  }

  const open = async (data: Uint8Array, fname: string, sample = false) => {
    setErr('')
    setRes(null)
    setBusy('Opening…')
    try {
      const lib = await pdfjs()
      const d = await lib.getDocument({ data: data.slice(), ...OPEN_OPTS }).promise
      const infos: PageInfo[] = []
      for (let i = 1; i <= d.numPages; i++) {
        setBusy(`Reading page ${i} / ${d.numPages}`)
        const pg = await d.getPage(i)
        const vp = pg.getViewport({ scale: 1 })
        const sc = Math.min(2, 1400 / Math.max(vp.width, vp.height))
        const pv = pg.getViewport({ scale: sc })
        const c = document.createElement('canvas')
        c.width = Math.ceil(pv.width)
        c.height = Math.ceil(pv.height)
        await pg.render({ canvas: c, viewport: pv }).promise
        const img = c.toDataURL('image/jpeg', 0.85)
        c.width = c.height = 0
        const tc = await pg.getTextContent()
        const runs: TRun[] = []
        for (const it of tc.items) {
          if (!('str' in it) || !it.str) continue
          const t = lib.Util.transform(vp.transform, it.transform as number[])
          runs.push({ str: it.str, x: t[4], y: t[5], w: it.width * vp.scale, h: Math.hypot(t[2], t[3]) || it.height })
        }
        infos.push({ w: vp.width, h: vp.height, img, runs })
      }
      void doc?.loadingTask.destroy()
      setDoc(d)
      setBytes(data)
      setName(fname)
      setPages(infos)
      setBoxes([])
      setMsg('')
      if (sample) {
        let b: Box[] = []
        for (const k of ['ssn', 'email', 'phone', 'card', 'iban']) b = search(new RegExp(PRESETS.find((p) => p.key === k)!.re, 'g'), PRESETS.find((p) => p.key === k)!.label, infos, b)
        setMsg('Sample loaded: SSN, e-mail, phone, card and IBAN were found automatically. Drag on a page to add more boxes.')
      }
    } catch (e) {
      setErr(`Could not open this PDF: ${(e as Error).message}`)
    }
    setBusy('')
  }

  useEffect(() => {
    void samplePdf().then((b) => open(b, 'sample.pdf', true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toPt = (e: RPointerEvent, page: number) => {
    const r = pageEls.current[page]!.getBoundingClientRect()
    const p = pages[page]
    return [((e.clientX - r.left) / r.width) * p.w, ((e.clientY - r.top) / r.height) * p.h]
  }

  const apply = async () => {
    if (!doc || !bytes) return
    setErr('')
    setRes(null)
    try {
      const { PDFDocument, PDFName } = await import('pdf-lib')
      let src: Awaited<ReturnType<typeof PDFDocument.load>> | null = null
      try {
        src = await PDFDocument.load(bytes, { ignoreEncryption: true })
        if (src.isEncrypted) src = null
      } catch {
        src = null
      }
      const raster = new Set(pagesToRaster(boxes, pages.length, s.all || !src))
      const out = await PDFDocument.create()
      out.setProducer('Browser Toolbox')
      out.setCreator('')
      const keep = pages.map((_, i) => i).filter((i) => !raster.has(i))
      const copied = src && keep.length ? await out.copyPages(src, keep) : []
      for (let i = 0; i < pages.length; i++) {
        if (!raster.has(i)) {
          const p = copied[keep.indexOf(i)]
          p.node.delete(PDFName.of('Metadata'))
          p.node.delete(PDFName.of('PieceInfo'))
          out.addPage(p)
          continue
        }
        setBusy(`Rasterizing page ${i + 1} / ${pages.length}`)
        const pg = await doc.getPage(i + 1)
        const sc = s.dpi / 72
        const vp = pg.getViewport({ scale: sc })
        const c = document.createElement('canvas')
        c.width = Math.round(vp.width)
        c.height = Math.round(vp.height)
        const ctx = c.getContext('2d')!
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, c.width, c.height)
        await pg.render({ canvas: c, canvasContext: ctx, viewport: vp }).promise
        ctx.fillStyle = '#000'
        for (const b of boxes.filter((x) => x.page === i)) ctx.fillRect(Math.floor(b.x * sc), Math.floor(b.y * sc), Math.ceil(b.w * sc) + 1, Math.ceil(b.h * sc) + 1)
        const blob = await toBlob(c, `image/${s.fmt}`, 0.92)
        c.width = c.height = 0
        const data = new Uint8Array(await blob.arrayBuffer())
        const img = s.fmt === 'png' ? await out.embedPng(data) : await out.embedJpg(data)
        const page = out.addPage([pages[i].w, pages[i].h])
        page.drawImage(img, { x: 0, y: 0, width: pages[i].w, height: pages[i].h })
      }
      setBusy('Saving and verifying…')
      const outBytes = await out.save()
      // Verify: redacted pages carry no text, and no redacted string survives anywhere.
      const lib = await pdfjs()
      const check = await lib.getDocument({ data: outBytes.slice(), ...OPEN_OPTS }).promise
      let textLeft = 0
      const all: string[] = []
      for (let i = 1; i <= check.numPages; i++) {
        const tc = await (await check.getPage(i)).getTextContent()
        const strs = tc.items.map((it) => ('str' in it ? it.str : '')).filter(Boolean)
        if (raster.has(i - 1)) textLeft += strs.length
        all.push(strs.join(' '))
      }
      await check.loadingTask.destroy()
      const flat = all.join('\n').toLowerCase()
      const leaks = [...new Set(boxes.map((b) => b.text?.trim()).filter((t): t is string => !!t && flat.includes(t.toLowerCase())))]
      setRes({ bytes: outBytes, raster: [...raster], textLeft, leaks, size: outBytes.length })
    } catch (e) {
      setErr(`Redaction failed: ${(e as Error).message}`)
    }
    setBusy('')
  }

  const perPage = pages.map((_, i) => boxes.filter((b) => b.page === i).length)
  const rasterCount = pagesToRaster(boxes, pages.length, s.all).length

  return (
    <Split wide="right">
      <div>
        <Panel title="1 · Open a PDF">
          <FileDrop accept="application/pdf,.pdf" onFiles={async ([f]) => open(new Uint8Array(await f.arrayBuffer()), f.name)} label="Drop a PDF or click to choose" />
          <p className="muted" style={{ margin: '8px 0 0' }}>
            {name} · {pages.length} page{pages.length === 1 ? '' : 's'} · processed locally, nothing is uploaded
          </p>
          {busy && <Note>{busy}</Note>}
          {err && <Note tone="err">{err}</Note>}
        </Panel>
        <Panel title="2 · Find text to redact">
          <Txt label="Search for" value={term} onChange={setTerm} placeholder="e.g. Jane Example" />
          <Row>
            <Check label="Regex" value={s.regex} onChange={(regex) => set({ regex })} />
            <Check label="Match case" value={s.caseSens} onChange={(caseSens) => set({ caseSens })} />
            <Check label="Whole word" value={s.word} onChange={(word) => set({ word })} />
          </Row>
          <Row>
            <Btn kind="primary" onClick={() => search(buildRegex(term, s), `“${term.trim()}”`)} disabled={!term.trim()}>Mark all matches</Btn>
          </Row>
          <p className="k-label" style={{ margin: '12px 0 6px' }}>Quick patterns</p>
          <Row>
            {PRESETS.map((p) => (
              <Btn key={p.key} onClick={() => search(new RegExp(p.re, 'g'), p.label)}>+ {p.label}</Btn>
            ))}
          </Row>
          {msg && <Note tone="ok">{msg}</Note>}
          <Note>Search uses the PDF's text layer. Scanned pages have no text, so draw boxes by hand there.</Note>
        </Panel>
        <Panel title="3 · Apply redactions">
          <Row>
            <Seg value={String(s.dpi)} onChange={(v) => set({ dpi: Number(v) })} options={[['150', '150 dpi'], ['200', '200 dpi'], ['300', '300 dpi']]} label="Resolution" />
            <Seg value={s.fmt} onChange={(fmt) => set({ fmt })} options={[['png', 'PNG (sharp)'], ['jpeg', 'JPEG (small)']]} label="Image format" />
          </Row>
          <Check label="Rasterize every page (also removes text and links from pages without boxes)" value={s.all} onChange={(all) => set({ all })} />
          <Note tone="warn">
            Redaction is permanent: every page with a box is re-rendered as a flat <b>image</b> with the black boxes burned in. Its text, links, form fields and
            hidden layers are gone, so text on those pages can no longer be selected or searched. Document metadata (title, author, XMP) is removed.
          </Note>
          <Row>
            <Btn kind="primary" onClick={apply} disabled={!boxes.length && !s.all || !!busy}>⬛ Redact {rasterCount} page{rasterCount === 1 ? '' : 's'}</Btn>
            <Btn kind="ghost" onClick={() => setBoxes([])} disabled={!boxes.length}>Clear all boxes</Btn>
          </Row>
          {res && (
            <>
              <Note tone={res.textLeft === 0 && !res.leaks.length ? 'ok' : 'err'}>
                Verified: {res.textLeft} text item{res.textLeft === 1 ? '' : 's'} left on the {res.raster.length} redacted page{res.raster.length === 1 ? '' : 's'};
                {res.leaks.length ? ` still found elsewhere: ${res.leaks.join(', ')} — add boxes on those pages too.` : ' none of the redacted strings appear anywhere in the output.'}
              </Note>
              <Btn kind="primary" onClick={() => download(name.replace(/\.pdf$/i, '') + '-redacted.pdf', new Blob([res.bytes as BlobPart], { type: 'application/pdf' }))}>
                ⬇ Download redacted PDF ({fmtBytes(res.size)})
              </Btn>
            </>
          )}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Boxes" value={boxes.length} tone="accent" />
          <Stat label="Pages to rasterize" value={`${rasterCount} / ${pages.length}`} />
          <Stat label="Text runs found" value={pages.reduce((a, p) => a + p.runs.length, 0)} sub={pages.length && pages.every((p) => !p.runs.length) ? 'scanned PDF? draw boxes' : 'searchable'} />
        </Stats>
        <Panel title="Pages — drag to draw a box, click ✕ to remove one">
          {pages.map((p, i) => (
            <div key={i} style={{ marginBottom: 18 }}>
              <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>
                Page {i + 1} · {Math.round(p.w)} × {Math.round(p.h)} pt · {perPage[i]} box{perPage[i] === 1 ? '' : 'es'}
              </div>
              <div
                ref={(el) => {
                  pageEls.current[i] = el
                }}
                style={{ position: 'relative', maxWidth: 760, aspectRatio: `${p.w} / ${p.h}`, boxShadow: '0 1px 6px rgba(0,0,0,.25)', cursor: 'crosshair', touchAction: 'none', userSelect: 'none' }}
                onPointerDown={(e) => {
                  if ((e.target as HTMLElement).dataset.x) return
                  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                  const [x, y] = toPt(e, i)
                  setDrag({ page: i, x0: x, y0: y, x1: x, y1: y })
                }}
                onPointerMove={(e) => {
                  if (drag?.page !== i) return
                  const [x, y] = toPt(e, i)
                  setDrag({ ...drag, x1: x, y1: y })
                }}
                onPointerUp={() => {
                  if (drag?.page !== i) return
                  const r = normRect(drag.x0, drag.y0, drag.x1, drag.y1, p.w, p.h)
                  if (r.w > 3 && r.h > 3) setBoxes([...boxes, { id: uid(), page: i, ...r, src: 'manual' }])
                  setDrag(null)
                }}
              >
                <img src={p.img} alt={`Page ${i + 1}`} draggable={false} style={{ width: '100%', height: '100%', display: 'block', background: '#fff' }} />
                {boxes.filter((b) => b.page === i).map((b) => (
                  <div key={b.id} title={b.text ? `${b.src}: ${b.text}` : b.src} style={{ position: 'absolute', left: `${(b.x / p.w) * 100}%`, top: `${(b.y / p.h) * 100}%`, width: `${(b.w / p.w) * 100}%`, height: `${(b.h / p.h) * 100}%`, background: 'rgba(0,0,0,.78)', outline: '1.5px solid #ef4444' }}>
                    <button
                      type="button"
                      data-x="1"
                      aria-label="Remove box"
                      onClick={() => setBoxes(boxes.filter((x) => x.id !== b.id))}
                      style={{ position: 'absolute', right: -9, top: -9, width: 18, height: 18, borderRadius: 9, border: 0, background: '#ef4444', color: '#fff', fontSize: 11, lineHeight: '18px', padding: 0, cursor: 'pointer' }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {drag?.page === i && (() => {
                  const r = normRect(drag.x0, drag.y0, drag.x1, drag.y1, p.w, p.h)
                  return <div style={{ position: 'absolute', left: `${(r.x / p.w) * 100}%`, top: `${(r.y / p.h) * 100}%`, width: `${(r.w / p.w) * 100}%`, height: `${(r.h / p.h) * 100}%`, background: 'rgba(0,0,0,.45)', outline: '1.5px dashed #ef4444' }} />
                })()}
              </div>
            </div>
          ))}
          {!pages.length && <p className="muted">Loading sample…</p>}
        </Panel>
      </div>
    </Split>
  )
}
