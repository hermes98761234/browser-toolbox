import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Check, download, FileDrop, Note, num, Panel, Row, Select, Slider, Split, Stat, Stats, useToolState } from '../kit'
import { fmtBytes } from './lib/image-compressor'
import { buildPdf, paraText, parseDocx, sampleDocx, toHtml, type Doc, type PdfOpts } from './lib/word-to-pdf'

const DEF: PdfOpts = { family: 'Helvetica', size: 11, paper: 'auto', margin: 64, pageNumbers: true, lineHeight: 1.3 }

const bin = (b: Uint8Array, type: string) => new Blob([b as Uint8Array<ArrayBuffer>], { type })

function b64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

/** Small bar chart drawn on a canvas, embedded into the sample DOCX as a PNG. */
async function chartPng(): Promise<Uint8Array | undefined> {
  const c = document.createElement('canvas')
  c.width = 600
  c.height = 300
  const g = c.getContext('2d')
  if (!g) return undefined
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, 600, 300)
  const data = [['Jul', 3], ['Aug', 5], ['Sep', 4], ['Oct', 6], ['Nov', 2], ['Dec', 4]] as const
  g.strokeStyle = '#d0d7e2'
  g.font = '15px sans-serif'
  g.fillStyle = '#555'
  for (let v = 0; v <= 6; v += 2) {
    const y = 250 - v * 35
    g.beginPath(); g.moveTo(50, y); g.lineTo(580, y); g.stroke()
    g.fillText(String(v), 25, y + 5)
  }
  data.forEach(([m, v], i) => {
    const x = 70 + i * 86
    g.fillStyle = '#3b6fb6'
    g.fillRect(x, 250 - v * 35, 56, v * 35)
    g.fillStyle = '#333'
    g.fillText(m, x + 14, 275)
  })
  g.font = 'bold 17px sans-serif'
  g.fillText('Site visits per month', 50, 24)
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'))
  return blob ? new Uint8Array(await blob.arrayBuffer()) : undefined
}

export default function WordToPdf() {
  const [o, set, reset] = useToolState('word-to-pdf', DEF)
  const [doc, setDoc] = useState<Doc | null>(null)
  const [name, setName] = useState('sample-report.docx')
  const [err, setErr] = useState('')
  const [pdf, setPdf] = useState<{ bytes: Uint8Array; pages: number; lost: number; clipped: number; ms: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const frame = useRef<HTMLIFrameElement>(null)
  const sample = useRef<Uint8Array | null>(null)

  const load = async (buf: Uint8Array, n: string) => {
    setErr('')
    try {
      setDoc(await parseDocx(buf))
      setName(n)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }
  const loadSample = async () => {
    sample.current ??= sampleDocx(await chartPng())
    await load(sample.current, 'sample-report.docx')
  }
  useEffect(() => {
    void loadSample()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!doc) return
    let alive = true
    setBusy(true)
    const t0 = performance.now()
    const id = setTimeout(() => {
      buildPdf(doc, o)
        .then((r) => alive && setPdf({ ...r, ms: performance.now() - t0 }))
        .catch((e) => alive && setErr(`PDF build failed: ${e instanceof Error ? e.message : e}`))
        .finally(() => alive && setBusy(false))
    }, 150)
    return () => {
      alive = false
      clearTimeout(id)
    }
  }, [doc, o])

  const html = useMemo(() => {
    if (!doc) return ''
    const urls: Record<string, string> = {}
    for (const [id, im] of Object.entries(doc.images)) urls[id] = `data:image/${im.type === 'jpeg' ? 'jpeg' : im.type === 'png' ? 'png' : 'gif'};base64,${b64(im.data)}`
    return toHtml(doc, o, (id) => urls[id] ?? '')
  }, [doc, o])

  const info = useMemo(() => {
    if (!doc) return null
    const paras = doc.blocks.flatMap((b) => (b.kind === 'p' ? [b] : b.rows.flatMap((r) => r.cells.flatMap((c) => c.paras))))
    const words = paras.reduce((a, p) => a + (paraText(p).match(/\S+/g)?.length ?? 0), 0)
    return {
      words,
      paras: paras.length,
      heads: doc.blocks.filter((b) => b.kind === 'p' && b.level !== 0 && b.level > -3).map((b) => (b.kind === 'p' ? { lv: b.level, t: paraText(b) } : { lv: 0, t: '' })),
      tables: doc.blocks.filter((b) => b.kind === 'table').length,
      lists: paras.filter((p) => p.list).length,
      images: Object.keys(doc.images).length,
    }
  }, [doc])

  const base = name.replace(/\.docx?$/i, '')
  const lostNote = pdf && pdf.lost > 0

  return (
    <Split wide="right">
      <div>
        <Panel title="1 · Word document">
          <FileDrop accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onFiles={async ([f]) => load(new Uint8Array(await f.arrayBuffer()), f.name)} label="Drop a .docx file or click to choose" />
          <Row>
            <Btn onClick={() => void loadSample()}>Load sample report</Btn>
            <Btn kind="ghost" onClick={async () => download('sample-report.docx', bin((sample.current ??= sampleDocx(await chartPng())), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))}>⬇ Sample .docx</Btn>
          </Row>
          {err && <Note tone="err">{err}</Note>}
          {doc && <p className="muted" style={{ fontSize: 13, margin: '8px 0 0' }}>Loaded <b>{name}</b> — read entirely in your browser; nothing is uploaded.</p>}
        </Panel>
        <Panel title="2 · PDF settings">
          <Row>
            <Select label="Font family" value={o.family} onChange={(family) => set({ family })} options={[['Helvetica', 'Sans (Helvetica)'], ['Times', 'Serif (Times)'], ['Courier', 'Mono (Courier)']]} />
            <Select label="Paper" value={o.paper} onChange={(paper) => set({ paper })} options={[['auto', 'As in document'], ['A4', 'A4'], ['Letter', 'US Letter']]} />
          </Row>
          <Slider label="Body size" value={o.size} onChange={(size) => set({ size })} min={8} max={16} step={0.5} unit=" pt" />
          <Slider label="Line spacing" value={o.lineHeight} onChange={(lineHeight) => set({ lineHeight })} min={1} max={2} step={0.05} unit="×" />
          <Slider label="Margins" value={o.margin} onChange={(margin) => set({ margin })} min={24} max={108} step={2} show={(v) => `${num(v, 0)} pt (${num(v / 72 * 2.54, 1)} cm)`} />
          <Check label="Page numbers in footer" value={o.pageNumbers} onChange={(pageNumbers) => set({ pageNumbers })} />
          <Btn kind="ghost" onClick={reset}>Reset settings</Btn>
        </Panel>
        {info && (
          <Panel title="What was found">
            <Stats>
              <Stat label="Words" value={num(info.words, 0)} />
              <Stat label="Paragraphs" value={info.paras} />
              <Stat label="Tables" value={info.tables} />
              <Stat label="Images" value={info.images} />
            </Stats>
            {info.heads.length > 0 && (
              <>
                <h4 style={{ margin: '10px 0 4px' }}>Outline</h4>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
                  {info.heads.slice(0, 40).map((h, i) => (
                    <li key={i} style={{ marginLeft: Math.max(0, h.lv - 1) * 14, fontWeight: h.lv <= 1 ? 700 : 400 }}>{h.t || '(empty heading)'}</li>
                  ))}
                </ul>
              </>
            )}
            {doc?.warnings.map((w) => <Note key={w} tone="warn">{w}</Note>)}
          </Panel>
        )}
        <Note>
          Mapped: headings, title, bold / italic / underline / strike, colours, font sizes, alignment, bulleted and numbered lists (nested), tables with shading and
          spans, PNG/JPEG images and page breaks. Approximated: the PDF uses the 14 standard PDF fonts (Latin text only), and headers/footers, text boxes, columns,
          footnotes and exact Word spacing are not reproduced. For pixel-perfect output use <b>Print → Save as PDF</b> on the preview.
        </Note>
      </div>

      <div>
        <Stats>
          <Stat label="PDF pages" value={pdf ? pdf.pages : '—'} tone="accent" />
          <Stat label="PDF size" value={pdf ? fmtBytes(pdf.bytes.length) : '—'} />
          <Stat label="Build time" value={busy ? '…' : pdf ? `${num(pdf.ms, 0)} ms` : '—'} sub="pdf-lib, in browser" />
        </Stats>
        {lostNote && <Note tone="warn">{pdf.lost} character(s) outside the Latin-1/WinAnsi range were replaced with “?” in the PDF. Use the print option for non-Latin scripts.</Note>}
        {pdf && pdf.clipped > 0 && <Note tone="warn">{pdf.clipped} table row(s) taller than a page were clipped.</Note>}
        <Panel
          title="Preview"
          actions={
            <>
              <Btn kind="primary" disabled={!pdf || busy} onClick={() => pdf && download(`${base}.pdf`, bin(pdf.bytes, 'application/pdf'))}>⬇ Download PDF</Btn>
              <Btn disabled={!pdf} onClick={() => pdf && window.open(URL.createObjectURL(bin(pdf.bytes, 'application/pdf')), '_blank')}>Open PDF</Btn>
              <Btn onClick={() => frame.current?.contentWindow?.print()} disabled={!doc}>🖨 Print</Btn>
              <Btn kind="ghost" onClick={() => download(`${base}.html`, html, 'text/html')} disabled={!doc}>⬇ HTML</Btn>
            </>
          }
        >
          {doc ? (
            <iframe ref={frame} title="Document preview" srcDoc={html} style={{ width: '100%', height: 760, border: '1px solid var(--line)', borderRadius: 8, background: '#e5e7eb' }} />
          ) : (
            <p className="muted">Loading sample…</p>
          )}
          <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>The styled preview is rendered by your browser; the downloaded PDF is laid out by this tool (line wrapping, page breaks, tables) with the same structure.</p>
        </Panel>
      </div>
    </Split>
  )
}
