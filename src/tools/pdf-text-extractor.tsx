import { useEffect, useMemo, useState } from 'react'
import { Btn, Check, CopyButton, download, FileDrop, Note, num, Panel, Row, Seg, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { pageText, wordCount, type Mode, type Run } from './lib/pdf-text-extractor'
import { parsePages } from './lib/pdf-to-images'

const DEF = { mode: 'paragraphs' as Mode, columns: true, dehyphen: true, separators: true, spec: 'all' }

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

const LOREM = [
  'Browser-based tools keep documents on your own device. Nothing is uploaded: the PDF is parsed by a JavaScript engine running inside this tab, and the extracted text never leaves it.',
  'Text in a PDF is stored as positioned runs of glyphs rather than as flowing paragraphs. To rebuild readable text the extractor groups runs that share a baseline into lines, sorts them from left to right and inserts spaces wherever the gap between two runs is wider than a fraction of the font size.',
  'Multi-column layouts are detected by looking for a vertical gutter that no line crosses. When one is found, the left column is read first, then the right one, so sentences are not interleaved across columns.',
  'Hyphenated line endings such as extra- ordinary are joined back together when the next line starts with a lowercase letter, which makes the output much easier to search and paste into other documents.',
]

/** Builds a three-page sample PDF: two-column article, a small table, and an image-only page. */
async function samplePdf(): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const reg = await doc.embedFont(StandardFonts.TimesRoman)
  const wrap = (text: string, width: number, size: number) => {
    const out: string[] = []
    let line = ''
    for (const w of text.split(' ')) {
      const t = line ? `${line} ${w}` : w
      if (reg.widthOfTextAtSize(t, size) > width && line) {
        // Hyphenate long words that would leave a ragged gap, to exercise dehyphenation.
        const room = width - reg.widthOfTextAtSize(line + ' ', size)
        if (w.length > 7 && room > reg.widthOfTextAtSize(w.slice(0, 4) + '-', size)) {
          let k = w.length - 2
          while (k > 3 && reg.widthOfTextAtSize(`${line} ${w.slice(0, k)}-`, size) > width) k--
          out.push(`${line} ${w.slice(0, k)}-`)
          line = w.slice(k)
        } else {
          out.push(line)
          line = w
        }
      } else line = t
    }
    if (line) out.push(line)
    return out
  }
  const p1 = doc.addPage([612, 792])
  p1.drawText('Extracting Text From PDF Files', { x: 54, y: 730, size: 22, font: bold, color: rgb(0.2, 0.22, 0.55) })
  p1.drawText('A short sample article set in two columns', { x: 54, y: 706, size: 12, font: reg, color: rgb(0.4, 0.4, 0.45) })
  const colW = 240
  let col = 0, y = 670
  for (const para of LOREM) {
    for (const ln of wrap(para, colW, 11)) {
      if (y < 80) {
        col++
        y = 670
      }
      p1.drawText(ln, { x: 54 + col * (colW + 24), y, size: 11, font: reg })
      y -= 14
    }
    y -= 10
    if (col === 0 && y < 420) {
      col = 1
      y = 670
    }
  }
  p1.drawText('Page 1', { x: 290, y: 40, size: 9, font: reg, color: rgb(0.5, 0.5, 0.5) })
  const p2 = doc.addPage([612, 792])
  p2.drawText('Quarterly figures', { x: 54, y: 730, size: 18, font: bold })
  const rows = [['Region', 'Q1', 'Q2', 'Q3'], ['North', '12,400', '13,950', '15,210'], ['South', '9,870', '10,020', '11,480'], ['West', '7,300', '8,850', '9,940']]
  rows.forEach((r, i) => r.forEach((c, j) => p2.drawText(c, { x: 54 + j * 110, y: 690 - i * 22, size: 12, font: i === 0 ? bold : reg })))
  p2.drawText('Use the Layout mode to keep table columns aligned with spaces.', { x: 54, y: 580, size: 11, font: reg })
  const p3 = doc.addPage([612, 792])
  for (let i = 0; i < 6; i++) p3.drawRectangle({ x: 80 + i * 75, y: 300, width: 55, height: 80 + i * 40, color: rgb(0.3 + i * 0.1, 0.5, 0.9 - i * 0.1) })
  return doc.save()
}

interface PageRuns { runs: Run[]; w: number; h: number }

export default function PdfTextExtractor() {
  const [s, set, reset] = useToolState('pdf-text-extractor', DEF)
  const [name, setName] = useState('sample.pdf')
  const [pages, setPages] = useState<PageRuns[]>([])
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [view, setView] = useState(0)
  const [q, setQ] = useState('')

  const open = async (data: Uint8Array, fname: string) => {
    setErr('')
    setBusy('Opening…')
    try {
      const lib = await pdfjs()
      const task = lib.getDocument({ data: data.slice() })
      const d = await task.promise
      const out: PageRuns[] = []
      for (let i = 1; i <= d.numPages; i++) {
        setBusy(`Reading page ${i} of ${d.numPages}…`)
        const pg = await d.getPage(i)
        const vp = pg.getViewport({ scale: 1 })
        const tc = await pg.getTextContent()
        const runs: Run[] = []
        for (const it of tc.items) {
          if (!('str' in it)) continue
          const [a, b, c, dd, e, f] = it.transform as number[]
          const h = Math.hypot(c, dd) || Math.hypot(a, b) || it.height
          runs.push({ str: it.str, x: e, y: f, w: it.width, h })
        }
        out.push({ runs, w: vp.width, h: vp.height })
      }
      await task.destroy()
      setPages(out)
      setName(fname)
      setView(0)
    } catch (e) {
      setErr(`Could not read this PDF: ${(e as Error).message}`)
    }
    setBusy('')
  }

  useEffect(() => {
    void samplePdf().then((b) => open(b, 'sample.pdf'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sel = useMemo(() => parsePages(s.spec, pages.length || 1), [s.spec, pages.length])
  const texts = useMemo(() => pages.map((p) => pageText(p.runs, { mode: s.mode, columns: s.columns, dehyphen: s.dehyphen })), [pages, s.mode, s.columns, s.dehyphen])
  const chosen = sel.pages.filter((n) => n <= pages.length)
  const full = chosen.map((n) => (s.separators ? `──────── Page ${n} ────────\n\n` : '') + texts[n - 1]).join(s.separators ? '\n\n' : '\n\n\f')
  const shown = view === 0 ? full : texts[view - 1] ?? ''
  const empty = chosen.filter((n) => !texts[n - 1]?.trim())
  const words = chosen.reduce((a, n) => a + wordCount(texts[n - 1] ?? ''), 0)
  const chars = chosen.reduce((a, n) => a + (texts[n - 1]?.length ?? 0), 0)
  const hits = q.trim() ? shown.toLowerCase().split(q.trim().toLowerCase()).length - 1 : 0
  const base = name.replace(/\.pdf$/i, '')

  return (
    <Split wide="right">
      <div>
        <Panel title="PDF file">
          <FileDrop accept="application/pdf,.pdf" label="Drop a PDF here or click to choose" onFiles={async ([f]) => open(new Uint8Array(await f.arrayBuffer()), f.name)} />
          <Row>
            <span className="muted" style={{ flex: 1, wordBreak: 'break-all' }}>📄 {name} · {pages.length} page{pages.length === 1 ? '' : 's'}</span>
            <Btn kind="ghost" onClick={() => void samplePdf().then((b) => open(b, 'sample.pdf'))}>Load sample</Btn>
          </Row>
          {busy && <Note>{busy}</Note>}
          {err && <Note tone="err">{err}</Note>}
        </Panel>
        <Panel title="Options" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <div className="k-label">Output style</div>
          <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['paragraphs', 'Paragraphs'], ['lines', 'Lines'], ['layout', 'Layout']]} />
          <p className="muted" style={{ fontSize: 13 }}>
            {s.mode === 'paragraphs' ? 'Reflows lines into paragraphs: best for copying prose.' : s.mode === 'lines' ? 'Keeps the original line breaks of the page.' : 'Pads with spaces to keep columns and tables aligned (use a monospace font).'}
          </p>
          {s.mode !== 'layout' && <Check label="Detect two-column layouts" value={s.columns} onChange={(columns) => set({ columns })} />}
          {s.mode !== 'layout' && <Check label="Join hyphenated line breaks" value={s.dehyphen} onChange={(dehyphen) => set({ dehyphen })} />}
          <Check label="Page separators in output" value={s.separators} onChange={(separators) => set({ separators })} />
          <Txt label="Pages" value={s.spec} onChange={(spec) => set({ spec })} placeholder="all, 1-3, 5, odd" hint="e.g. all · 2-5 · 1,3,8- · odd" />
          {sel.errors.length > 0 && <Note tone="warn">{sel.errors.join('; ')}</Note>}
        </Panel>
        <Panel title="Per page">
          <Table
            head={['Page', 'Size (pt)', 'Runs', 'Words']}
            rows={pages.map((p, i) => [
              <a key="p" href="#" onClick={(e) => { e.preventDefault(); setView(i + 1) }}>{i + 1}</a>,
              `${Math.round(p.w)} × ${Math.round(p.h)}`,
              p.runs.length,
              texts[i]?.trim() ? num(wordCount(texts[i]), 0) : <span key="e" style={{ color: 'var(--warn)' }}>no text</span>,
            ])}
            max={50}
          />
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Pages extracted" value={`${chosen.length} / ${pages.length}`} />
          <Stat label="Words" value={num(words, 0)} tone="accent" />
          <Stat label="Characters" value={num(chars, 0)} />
          <Stat label="Pages without text" value={empty.length} tone={empty.length ? 'bad' : 'good'} sub={empty.length ? `page ${empty.slice(0, 6).join(', ')}` : 'all have a text layer'} />
        </Stats>
        {empty.length > 0 && (
          <Note tone="warn">
            Some pages have no text layer — they are probably scanned images. Run them through the <a href="#/tool/pdf-ocr-converter">PDF OCR Converter</a> to recognise the text.
          </Note>
        )}
        <Panel
          title="Extracted text"
          actions={
            <>
              <CopyButton text={shown} />
              <Btn kind="primary" onClick={() => download(`${base}.txt`, shown, 'text/plain;charset=utf-8')}>⬇ TXT</Btn>
              <Btn onClick={() => download(`${base}-pages.json`, JSON.stringify(chosen.map((n) => ({ page: n, text: texts[n - 1] })), null, 2), 'application/json')}>⬇ JSON</Btn>
            </>
          }
        >
          <Row>
            <select className="k-select" value={view} onChange={(e) => setView(Number(e.target.value))} aria-label="Page to show" style={{ maxWidth: 180 }}>
              <option value={0}>All selected pages</option>
              {pages.map((_, i) => <option key={i} value={i + 1}>Page {i + 1}</option>)}
            </select>
            <input className="k-text" style={{ flex: 1, minWidth: 140 }} placeholder="Find in text…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find" />
            {q.trim() && <b>{hits} match{hits === 1 ? '' : 'es'}</b>}
          </Row>
          <textarea
            className="k-area mono"
            readOnly
            value={shown || '(no text on the selected pages)'}
            rows={24}
            style={{ width: '100%', whiteSpace: s.mode === 'layout' ? 'pre' : 'pre-wrap', overflowX: 'auto', fontSize: 13, marginTop: 8 }}
          />
        </Panel>
        <Note>Text is extracted with pdf.js entirely in your browser. Fonts without a Unicode map may produce garbled characters — that is a property of the PDF, not the extractor.</Note>
      </div>
    </Split>
  )
}
