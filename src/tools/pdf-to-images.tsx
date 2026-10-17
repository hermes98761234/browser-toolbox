import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { Btn, download, FileDrop, Note, Panel, Row, Seg, Slider, Split, Stat, Stats, Txt, useToolState } from '../kit'
import { fmtBytes, makeZip } from './lib/image-compressor'
import { outName, parsePages, pixelSize, safeDpi } from './lib/pdf-to-images'

type Fmt = 'png' | 'jpeg' | 'webp'
const DEF = { fmt: 'png' as Fmt, dpi: 150, quality: 0.9, spec: 'all', transparent: false }
const DPI_PRESETS = [72, 96, 150, 200, 300] as const

interface PageInfo { w: number; h: number; thumb: string }
interface Out { page: number; name: string; blob: Blob; url: string; w: number; h: number }

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

/** Builds a three-page sample PDF so the tool has something to show on first load. */
async function samplePdf(): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const reg = await doc.embedFont(StandardFonts.Helvetica)
  const sizes: [number, number][] = [[612, 792], [841.89, 595.28], [500, 500]]
  const cols = [rgb(0.39, 0.4, 0.95), rgb(0.05, 0.65, 0.91), rgb(0.06, 0.73, 0.51), rgb(0.96, 0.62, 0.04), rgb(0.94, 0.27, 0.27)]
  sizes.forEach(([w, h], i) => {
    const p = doc.addPage([w, h])
    p.drawRectangle({ x: 0, y: h - 90, width: w, height: 90, color: cols[i] })
    p.drawText(`Sample page ${i + 1}`, { x: 36, y: h - 58, size: 30, font: bold, color: rgb(1, 1, 1) })
    p.drawText(['US Letter portrait · 8.5 × 11 in', 'A4 landscape · 297 × 210 mm', 'Square · 500 × 500 pt'][i], { x: 36, y: h - 120, size: 14, font: reg, color: rgb(0.3, 0.3, 0.35) })
    const n = 5, bw = (w - 120) / n
    for (let j = 0; j < n; j++) {
      const bh = (h - 260) * (0.3 + 0.7 * Math.abs(Math.sin(i * 2 + j * 1.3)))
      p.drawRectangle({ x: 60 + j * bw + 8, y: 70, width: bw - 16, height: bh, color: cols[j] })
    }
    p.drawLine({ start: { x: 50, y: 70 }, end: { x: w - 50, y: 70 }, thickness: 1.5, color: rgb(0.2, 0.2, 0.2) })
    p.drawText(`Page ${i + 1} of 3 · generated in your browser`, { x: 36, y: 30, size: 10, font: reg, color: rgb(0.5, 0.5, 0.55) })
  })
  return doc.save()
}

function toBlob(c: HTMLCanvasElement, type: string, q: number): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Encoding failed'))), type, q))
}

export default function PdfToImages() {
  const [s, set] = useToolState('pdf-to-images', DEF)
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [name, setName] = useState('sample.pdf')
  const [pages, setPages] = useState<PageInfo[]>([])
  const [outs, setOuts] = useState<Out[]>([])
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const cancel = useRef(false)

  const open = async (data: Uint8Array, fname: string) => {
    setErr('')
    setBusy('Opening…')
    try {
      const lib = await pdfjs()
      const d = await lib.getDocument({ data: data.slice() }).promise
      const infos: PageInfo[] = []
      for (let i = 1; i <= d.numPages; i++) {
        const pg = await d.getPage(i)
        const vp = pg.getViewport({ scale: 1 })
        let thumb = ''
        if (i <= 60) {
          const tv = pg.getViewport({ scale: 140 / Math.max(vp.width, vp.height) })
          const c = document.createElement('canvas')
          c.width = Math.ceil(tv.width)
          c.height = Math.ceil(tv.height)
          await pg.render({ canvas: c, viewport: tv }).promise
          thumb = c.toDataURL('image/jpeg', 0.7)
        }
        infos.push({ w: vp.width, h: vp.height, thumb })
        setBusy(`Reading page ${i} / ${d.numPages}`)
      }
      outs.forEach((o) => URL.revokeObjectURL(o.url))
      setOuts([])
      setDoc(d)
      setName(fname)
      setPages(infos)
    } catch (e) {
      setErr(`Could not open this PDF: ${(e as Error).message}`)
    }
    setBusy('')
  }

  useEffect(() => {
    void samplePdf().then((b) => open(b, 'sample.pdf'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sel = parsePages(s.spec, pages.length)
  const ext = s.fmt === 'jpeg' ? 'jpg' : s.fmt
  const estPx = sel.pages.reduce((a, p) => {
    const [w, h] = pixelSize(pages[p - 1].w, pages[p - 1].h, s.dpi)
    return a + w * h
  }, 0)

  const convert = async () => {
    if (!doc) return
    cancel.current = false
    outs.forEach((o) => URL.revokeObjectURL(o.url))
    setOuts([])
    const res: Out[] = []
    for (const [k, p] of sel.pages.entries()) {
      if (cancel.current) break
      setBusy(`Rendering page ${p} (${k + 1} / ${sel.pages.length})`)
      const pg = await doc.getPage(p)
      const base = pg.getViewport({ scale: 1 })
      const dpi = safeDpi(base.width, base.height, s.dpi)
      const vp = pg.getViewport({ scale: dpi / 72 })
      const c = document.createElement('canvas')
      c.width = Math.round(vp.width)
      c.height = Math.round(vp.height)
      const ctx = c.getContext('2d')!
      if (!(s.transparent && s.fmt !== 'jpeg')) {
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, c.width, c.height)
      }
      await pg.render({ canvas: c, canvasContext: ctx, viewport: vp, background: s.transparent && s.fmt !== 'jpeg' ? 'rgba(0,0,0,0)' : '#ffffff' }).promise
      const blob = await toBlob(c, `image/${s.fmt}`, s.quality)
      const { width: w, height: h } = c
      c.width = c.height = 0
      res.push({ page: p, name: outName(name, p, pages.length, ext), blob, url: URL.createObjectURL(blob), w, h })
      setOuts([...res])
    }
    setBusy('')
  }

  const [auto, setAuto] = useState(true)
  useEffect(() => {
    if (auto && doc) {
      setAuto(false)
      void convert()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, auto])

  const zip = async () => {
    const files = await Promise.all(outs.map(async (o) => ({ name: o.name, data: new Uint8Array(await o.blob.arrayBuffer()) })))
    download(`${name.replace(/\.pdf$/i, '')}-images.zip`, new Blob([makeZip(files) as Uint8Array<ArrayBuffer>], { type: 'application/zip' }))
  }
  const totalBytes = outs.reduce((a, o) => a + o.blob.size, 0)

  return (
    <Split>
      <div>
        <Panel title="1 · PDF">
          <FileDrop accept="application/pdf,.pdf" label="Drop a PDF here or click to choose" onFiles={async ([f]) => open(new Uint8Array(await f.arrayBuffer()), f.name)} />
          <Row>
            <Btn kind="ghost" onClick={() => void samplePdf().then((b) => open(b, 'sample.pdf'))}>Load sample PDF</Btn>
          </Row>
          {err && <Note tone="err">{err}</Note>}
          {doc && <p className="muted" style={{ margin: '8px 0 0' }}>📄 <b>{name}</b> · {pages.length} page{pages.length === 1 ? '' : 's'}</p>}
        </Panel>
        <Panel title="2 · Output">
          <Seg value={s.fmt} onChange={(fmt) => set({ fmt })} options={[['png', 'PNG'], ['jpeg', 'JPG'], ['webp', 'WebP']]} label="Format" />
          <div style={{ height: 10 }} />
          <Slider label="Resolution" value={s.dpi} onChange={(dpi) => set({ dpi })} min={36} max={600} step={6} unit=" DPI" show={(v) => String(v)} />
          <Row>
            {DPI_PRESETS.map((d) => (
              <Btn key={d} kind={s.dpi === d ? 'primary' : 'normal'} onClick={() => set({ dpi: d })}>{d}</Btn>
            ))}
          </Row>
          {s.fmt !== 'png' && <Slider label="Quality" value={s.quality} onChange={(quality) => set({ quality })} min={0.4} max={1} step={0.05} show={(v) => `${Math.round(v * 100)}%`} />}
          {s.fmt !== 'jpeg' && (
            <label className="k-check">
              <input type="checkbox" checked={s.transparent} onChange={(e) => set({ transparent: e.target.checked })} /> Transparent background (no white fill)
            </label>
          )}
          <Txt label="Pages" value={s.spec} onChange={(spec) => set({ spec })} placeholder="all, 1-3, 5, odd, even, 8-" hint="Examples: all · 1-3, 7 · odd · 4-" />
          {sel.errors.map((e) => <Note key={e} tone="warn">{e}</Note>)}
          <Row>
            <Btn kind="primary" disabled={!doc || !!busy || !sel.pages.length} onClick={() => void convert()}>
              Convert {sel.pages.length} page{sel.pages.length === 1 ? '' : 's'}
            </Btn>
            {busy && <Btn kind="ghost" onClick={() => (cancel.current = true)}>Stop</Btn>}
          </Row>
          {busy && <p className="muted">⏳ {busy}</p>}
          <Note>72 DPI = screen size, 150 DPI = sharp on screens and fine for documents, 300 DPI = print quality. Very large pages are capped at 40 MP per image.</Note>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Pages selected" value={`${sel.pages.length} / ${pages.length}`} />
          <Stat label="First page size" value={pages[sel.pages[0] - 1] ? pixelSize(pages[sel.pages[0] - 1].w, pages[sel.pages[0] - 1].h, s.dpi).join(' × ') : '—'} sub="pixels" />
          <Stat label="Total pixels" value={`${(estPx / 1e6).toFixed(1)} MP`} />
          <Stat label="Output" value={outs.length ? fmtBytes(totalBytes) : '—'} sub={outs.length ? `${outs.length} file${outs.length === 1 ? '' : 's'}` : 'not converted yet'} tone={outs.length ? 'good' : undefined} />
        </Stats>
        {outs.length > 0 && (
          <Panel title="Images" actions={<Btn kind="primary" disabled={!!busy} onClick={() => void zip()}>⬇ All as ZIP</Btn>}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
              {outs.map((o) => (
                <figure key={o.page} style={{ margin: 0, border: '1px solid var(--line)', borderRadius: 10, padding: 8, background: 'var(--panel2)' }}>
                  <img src={o.url} alt={`Page ${o.page}`} style={{ width: '100%', height: 150, objectFit: 'contain', background: 'repeating-conic-gradient(#ccc 0 25%, #fff 0 50%) 0 0/16px 16px' }} />
                  <figcaption style={{ fontSize: 12, marginTop: 6 }}>
                    <b>Page {o.page}</b> · {o.w}×{o.h} · {fmtBytes(o.blob.size)}
                    <div><a href={o.url} download={o.name}>⬇ {o.name}</a></div>
                  </figcaption>
                </figure>
              ))}
            </div>
          </Panel>
        )}
        <Panel title="Pages in the PDF">
          {!pages.length && <p className="muted">Open a PDF to see its pages.</p>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10 }}>
            {pages.map((p, i) => {
              const on = sel.pages.includes(i + 1)
              return (
                <button
                  type="button"
                  key={i}
                  title="Click to select only this page"
                  onClick={() => set({ spec: String(i + 1) })}
                  style={{ border: `2px solid ${on ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 8, padding: 6, background: 'var(--panel)', opacity: on ? 1 : 0.5, cursor: 'pointer', color: 'inherit' }}
                >
                  {p.thumb ? <img src={p.thumb} alt="" style={{ width: '100%', height: 100, objectFit: 'contain' }} /> : <div style={{ height: 100 }} />}
                  <div style={{ fontSize: 12 }}>
                    <b>{i + 1}</b> · {Math.round(p.w)}×{Math.round(p.h)} pt
                  </div>
                </button>
              )
            })}
          </div>
          {pages.length > 60 && <p className="muted">Thumbnails are shown for the first 60 pages.</p>}
        </Panel>
      </div>
    </Split>
  )
}
