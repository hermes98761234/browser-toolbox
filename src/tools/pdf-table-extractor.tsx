import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Check, CopyButton, download, FileDrop, Note, num, Panel, Row, Seg, Slider, Split, Stat, Stats, Table, toCsv, Txt, useToolState } from '../kit'
import { combine, DEF_OPTS, extractTable, segmentsFromOps, toMarkdown, toTsv, type PageTable, type Run, type Seg as Segment } from './lib/pdf-table-extractor'
import { parsePages } from './lib/pdf-to-images'

type Pdfjs = typeof import('pdfjs-dist')
type Task = ReturnType<Pdfjs['getDocument']>
type Doc = Awaited<Task['promise']>
let pdfjsP: Promise<Pdfjs> | null = null
function pdfjs() {
  pdfjsP ??= (async () => {
    const lib = await import('pdfjs-dist')
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    lib.GlobalWorkerOptions.workerSrc = worker.default
    return lib
  })()
  return pdfjsP
}

const DEF = { ...DEF_OPTS, spec: 'all', dropHeader: true, manualOn: false, header: true }

/** Sample: a ruled invoice table with a wrapped cell, then a borderless table over two pages. */
async function samplePdf(): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const reg = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const right = (p: ReturnType<typeof doc.addPage>, t: string, x: number, y: number, size = 10, f = reg) => p.drawText(t, { x: x - f.widthOfTextAtSize(t, size), y, size, font: f })
  const p1 = doc.addPage([612, 792])
  p1.drawText('Northwind Supplies — Invoice 2026-114', { x: 54, y: 730, size: 18, font: bold, color: rgb(0.15, 0.2, 0.5) })
  p1.drawText('Issued 14 October 2026 · Payment due within 30 days', { x: 54, y: 708, size: 10, font: reg, color: rgb(0.4, 0.4, 0.45) })
  const cols = [54, 110, 330, 400, 480, 558]
  const items = [
    ['SKU', 'Description', 'Qty', 'Unit price', 'Amount'],
    ['A-101', 'Recycled copy paper, A4|80 g/m², box of 5 reams', '12', '24.90', '298.80'],
    ['B-220', 'Gel pens, black', '40', '1.35', '54.00'],
    ['C-031', 'Desk organiser, bamboo', '6', '18.50', '111.00'],
    ['D-412', 'Whiteboard markers|assorted colours, pack of 8', '10', '7.80', '78.00'],
    ['E-009', 'Stapler, heavy duty', '3', '32.00', '96.00'],
  ]
  let y = 670
  const lines: number[] = [y + 16]
  items.forEach((r, i) => {
    const desc = r[1].split('|')
    const h = 8 + desc.length * 13
    if (i === 0) p1.drawRectangle({ x: cols[0], y: y - h + 16, width: cols[5] - cols[0], height: h, color: rgb(0.9, 0.92, 0.97) })
    const f = i === 0 ? bold : reg
    p1.drawText(r[0], { x: cols[0] + 4, y, size: 10, font: f })
    desc.forEach((d, k) => p1.drawText(d, { x: cols[1] + 4, y: y - k * 13, size: 10, font: f }))
    right(p1, r[2], cols[3] - 6, y, 10, f)
    right(p1, r[3], cols[4] - 6, y, 10, f)
    right(p1, r[4], cols[5] - 6, y, 10, f)
    y -= h
    lines.push(y + 16)
  })
  for (const ly of lines) p1.drawLine({ start: { x: cols[0], y: ly }, end: { x: cols[5], y: ly }, thickness: 0.7, color: rgb(0.55, 0.58, 0.65) })
  for (const cx of cols) p1.drawLine({ start: { x: cx, y: lines[0] }, end: { x: cx, y: lines[lines.length - 1] }, thickness: 0.7, color: rgb(0.55, 0.58, 0.65) })
  p1.drawText('Total due: 637.80 EUR', { x: 420, y: y - 10, size: 11, font: bold })
  p1.drawText('Thank you for your order. Questions? Write to billing@northwind.example.', { x: 54, y: 90, size: 9, font: reg })
  // Borderless station log across two pages, header repeated.
  const head = ['Date', 'Station', 'Temp °C', 'Rain mm', 'Wind km/h']
  const st = ['Harbour', 'Hilltop', 'Airport', 'Riverside']
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const data: string[][] = []
  for (let d = 1; d <= 22; d++) for (const s of st.slice(0, 2)) data.push([`2026-09-${String(d).padStart(2, '0')}`, s === 'Hilltop' && d % 5 === 0 ? 'Hilltop (backup)' : s, (12 + rnd() * 9).toFixed(1), (rnd() < 0.6 ? 0 : rnd() * 14).toFixed(1), String(Math.round(5 + rnd() * 30))])
  const xs = [54, 160, 330, 420, 520]
  for (let pg = 0; pg < 2; pg++) {
    const p = doc.addPage([612, 792])
    p.drawText(pg ? 'Weather station log (continued)' : 'Weather station log — September 2026', { x: 54, y: 730, size: 15, font: bold })
    let yy = 690
    head.forEach((h, j) => (j < 2 ? p.drawText(h, { x: xs[j], y: yy, size: 10, font: bold }) : right(p, h, xs[j], yy, 10, bold)))
    yy -= 18
    for (const r of data.slice(pg * 26, pg * 26 + 26)) {
      r.forEach((c, j) => (j < 2 ? p.drawText(c, { x: xs[j], y: yy, size: 10, font: reg }) : right(p, c, xs[j], yy, 10)))
      yy -= 15
    }
    p.drawText(`Page ${pg + 2} of 3`, { x: 280, y: 40, size: 8, font: reg, color: rgb(0.5, 0.5, 0.5) })
  }
  return doc.save()
}

interface PageData { runs: Run[]; segs: Segment[]; w: number; h: number; t: number[] }

export default function PdfTableExtractor() {
  const [s, set, reset] = useToolState('pdf-table-extractor', DEF)
  const [name, setName] = useState('sample.pdf')
  const [pages, setPages] = useState<PageData[]>([])
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [view, setView] = useState(1)
  const [manual, setManual] = useState<number[]>([])
  const [fmtOut, setFmtOut] = useState<'csv' | 'tsv' | 'md'>('csv')
  const docRef = useRef<Doc | null>(null)
  const taskRef = useRef<Task | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [scale, setScale] = useState(1)

  const open = async (data: Uint8Array, fname: string) => {
    setErr('')
    setBusy('Opening…')
    try {
      const lib = await pdfjs()
      const task = lib.getDocument({ data: data.slice() })
      const d = await task.promise
      const out: PageData[] = []
      for (let i = 1; i <= d.numPages; i++) {
        setBusy(`Reading page ${i} of ${d.numPages}…`)
        const pg = await d.getPage(i)
        const vp = pg.getViewport({ scale: 1 })
        const tc = await pg.getTextContent()
        const runs: Run[] = []
        for (const it of tc.items) {
          if (!('str' in it)) continue
          const [a, b, c, dd, e, f] = it.transform as number[]
          runs.push({ str: it.str, x: e, y: f, w: it.width, h: Math.hypot(c, dd) || Math.hypot(a, b) || it.height })
        }
        let segs: Segment[] = []
        try {
          const ol = await pg.getOperatorList()
          segs = segmentsFromOps(ol.fnArray, ol.argsArray, lib.OPS)
        } catch {
          /* no ruling lines */
        }
        out.push({ runs, segs, w: vp.width, h: vp.height, t: vp.transform })
      }
      void taskRef.current?.destroy()
      taskRef.current = task
      docRef.current = d
      setPages(out)
      setName(fname)
      setView(1)
      setManual([])
    } catch (e) {
      setErr(`Could not read this PDF: ${(e as Error).message}`)
    }
    setBusy('')
  }

  useEffect(() => {
    void samplePdf().then((b) => open(b, 'sample.pdf'))
    return () => void taskRef.current?.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Render the previewed page.
  useEffect(() => {
    const d = docRef.current, cv = canvasRef.current
    if (!d || !cv || !pages[view - 1]) return
    let cancelled = false
    let task: { cancel: () => void; promise: Promise<void> } | null = null
    void (async () => {
      const pg = await d.getPage(view)
      if (cancelled) return
      const sc = Math.min(2, 900 / pages[view - 1].w)
      const vp = pg.getViewport({ scale: sc })
      cv.width = vp.width
      cv.height = vp.height
      setScale(sc)
      task = pg.render({ canvas: cv, canvasContext: cv.getContext('2d')!, viewport: vp })
      await task.promise.catch(() => undefined)
    })()
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [view, pages])

  const sel = useMemo(() => parsePages(s.spec, pages.length || 1), [s.spec, pages.length])
  const chosen = sel.pages.filter((n) => n <= pages.length)
  const opts = { gap: s.gap, minCells: s.minCells, rules: s.rules, mergeWrapped: s.mergeWrapped }
  const tables = useMemo<PageTable[]>(
    () => pages.map((p) => extractTable(p.runs, p.segs, opts, s.manualOn ? manual : null)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pages, s.gap, s.minCells, s.rules, s.mergeWrapped, s.manualOn, manual],
  )
  const rows = useMemo(() => combine(chosen.map((n) => tables[n - 1]?.rows ?? []), s.dropHeader), [chosen, tables, s.dropHeader])
  const heads = chosen.map((n) => tables[n - 1]?.rows[0]?.join('|')).filter(Boolean)
  const firstDiff = chosen.find((n) => tables[n - 1]?.rows[0] && tables[n - 1].rows[0].join('|') !== heads[0])
  const mixed = firstDiff ? `${firstDiff}-${chosen[chosen.length - 1]}` : ''
  const text = fmtOut === 'csv' ? toCsv(rows) : fmtOut === 'tsv' ? toTsv(rows) : toMarkdown(rows)
  const base = name.replace(/\.pdf$/i, '')
  const cur = tables[view - 1]
  const pd = pages[view - 1]

  const toPx = (x: number, y: number): [number, number] => (pd ? [(pd.t[0] * x + pd.t[2] * y + pd.t[4]) * scale, (pd.t[1] * x + pd.t[3] * y + pd.t[5]) * scale] : [0, 0])
  const onPreviewClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!pd || !s.manualOn) return
    const r = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * pd.w * scale
    const x = (px / scale - pd.t[4]) / (pd.t[0] || 1)
    const hit = manual.findIndex((m) => Math.abs(toPx(m, 0)[0] - px) < 8)
    setManual(hit >= 0 ? manual.filter((_, i) => i !== hit) : [...manual, Math.round(x * 10) / 10].sort((a, b) => a - b))
  }
  const enableManual = () => {
    set({ manualOn: true })
    if (!manual.length && cur) setManual(cur.bounds.map((b) => Math.round(b * 10) / 10))
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="PDF file">
          <FileDrop accept="application/pdf,.pdf" label="Drop a PDF with tables or click to choose" onFiles={async ([f]) => open(new Uint8Array(await f.arrayBuffer()), f.name)} />
          <Row>
            <span className="muted" style={{ flex: 1, wordBreak: 'break-all' }}>📄 {name} · {pages.length} page{pages.length === 1 ? '' : 's'}</span>
            <Btn kind="ghost" onClick={() => void samplePdf().then((b) => open(b, 'sample.pdf'))}>Load sample</Btn>
          </Row>
          {busy && <Note>{busy}</Note>}
          {err && <Note tone="err">{err}</Note>}
        </Panel>
        <Panel title="Detection" actions={<Btn kind="ghost" onClick={() => { reset(); setManual([]) }}>Reset</Btn>}>
          <Txt label="Pages" value={s.spec} onChange={(spec) => set({ spec })} placeholder="all, 2-3, 1,4" hint="Rows from every selected page are joined into one table." />
          {sel.errors.length > 0 && <Note tone="warn">{sel.errors.join('; ')}</Note>}
          <Slider label="Cell gap" value={s.gap} min={0.3} max={3} step={0.1} onChange={(gap) => set({ gap })} unit=" × font size" show={(v) => v.toFixed(1)} />
          <Slider label="Min. cells per table row" value={s.minCells} min={1} max={6} onChange={(minCells) => set({ minCells })} />
          <Check label="Use ruling lines (borders) when present" value={s.rules} onChange={(rules) => set({ rules })} />
          <Check label="Merge wrapped lines into the row above" value={s.mergeWrapped} onChange={(mergeWrapped) => set({ mergeWrapped })} />
          <Check label="Drop header rows repeated on later pages" value={s.dropHeader} onChange={(dropHeader) => set({ dropHeader })} />
          <Check label="First row is a header" value={s.header} onChange={(header) => set({ header })} />
          <p className="muted" style={{ fontSize: 13 }}>Raise the cell gap if words of one cell get split into columns; lower it if neighbouring cells merge.</p>
        </Panel>
        <Panel title="Tables per page">
          <Table
            head={['Page', 'Rows', 'Cols', 'Columns from', '']}
            rows={tables.map((t, i) => [
              <a key="p" href="#" onClick={(e) => { e.preventDefault(); setView(i + 1) }}>{i + 1}</a>,
              t.rows.length,
              t.rows[0]?.length ?? 0,
              t.source === 'none' ? <span key="n" className="muted">no table</span> : t.source,
              <Btn key="o" kind="ghost" onClick={() => { set({ spec: String(i + 1) }); setView(i + 1) }}>Only this</Btn>,
            ])}
            max={40}
          />
          {mixed && <Note tone="warn">The selected pages start with different header rows — they may hold different tables. Narrow the page range (e.g. “{mixed}”).</Note>}
        </Panel>
        <Panel title="Column boundaries">
          <Seg value={s.manualOn ? 'manual' : 'auto'} onChange={(v) => (v === 'manual' ? enableManual() : set({ manualOn: false }))} options={[['auto', 'Automatic'], ['manual', 'Manual']]} />
          {s.manualOn ? (
            <>
              <p className="muted" style={{ fontSize: 13 }}>Click the page preview to add a boundary; click near one to remove it. Manual boundaries apply to every page.</p>
              <Row>
                {manual.map((m, i) => (
                  <input key={i} type="number" step={1} value={m} aria-label={`Boundary ${i + 1}`} style={{ width: 76 }} onChange={(e) => setManual(manual.map((v, j) => (j === i ? Number(e.target.value) || 0 : v)).sort((a, b) => a - b))} />
                ))}
                <Btn kind="ghost" onClick={() => setManual([])}>Clear</Btn>
              </Row>
            </>
          ) : (
            <p className="muted" style={{ fontSize: 13 }}>
              Page {view}: {cur?.source === 'rules' ? 'columns from vertical ruling lines' : cur?.source === 'gaps' ? 'columns from whitespace gaps' : 'no table found'}
              {cur?.bounds.length ? ` at x = ${cur.bounds.map((b) => Math.round(b)).join(', ')} pt` : ''}.
            </p>
          )}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Rows" value={num(rows.length, 0)} tone="accent" />
          <Stat label="Columns" value={rows[0]?.length ?? 0} />
          <Stat label="Pages used" value={`${chosen.filter((n) => tables[n - 1]?.rows.length).length} / ${chosen.length}`} />
          <Stat label="Empty cells" value={num(rows.flat().filter((c) => !c.trim()).length, 0)} sub="check for misaligned columns" />
        </Stats>
        <Panel
          title="Page preview"
          actions={
            <select className="k-select" value={view} onChange={(e) => setView(Number(e.target.value))} aria-label="Page">
              {pages.map((_, i) => <option key={i} value={i + 1}>Page {i + 1}</option>)}
            </select>
          }
        >
          <div style={{ position: 'relative', maxHeight: 520, overflow: 'auto', border: '1px solid var(--line)', borderRadius: 8, background: '#fff' }}>
            <div style={{ position: 'relative' }}>
            <canvas ref={canvasRef} style={{ width: '100%', display: 'block' }} />
            {pd && cur && (
              <svg viewBox={`0 0 ${pd.w * scale} ${pd.h * scale}`} onClick={onPreviewClick} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: s.manualOn ? 'crosshair' : 'default' }}>
                {cur.rows.length > 0 && (() => {
                  const [x0, y0] = toPx(cur.left - 4, cur.top + 2)
                  const [x1, y1] = toPx(cur.right + 4, cur.bottom - 2)
                  return <rect x={Math.min(x0, x1)} y={Math.min(y0, y1)} width={Math.abs(x1 - x0)} height={Math.abs(y1 - y0)} fill="rgba(99,102,241,0.06)" stroke="#6366f1" strokeDasharray="6 4" />
                })()}
                {cur.rowYs.map((y, i) => {
                  const [x0, yy] = toPx(cur.left - 4, y)
                  return <circle key={i} cx={x0 - 6} cy={yy - 3} r={2.5} fill="#10b981" />
                })}
                {cur.bounds.map((b, i) => {
                  const [x, y0] = toPx(b, cur.top + 2)
                  const [, y1] = toPx(b, cur.bottom - 2)
                  return <line key={i} x1={x} x2={x} y1={y0} y2={y1} stroke={s.manualOn ? '#ef4444' : '#6366f1'} strokeWidth={2} />
                })}
              </svg>
            )}
            </div>
          </div>
          <p className="muted" style={{ fontSize: 12 }}>Dashed box: detected table · lines: column boundaries · green dots: row starts.</p>
        </Panel>
        <Panel
          title="Extracted table"
          actions={
            <>
              <Seg value={fmtOut} onChange={setFmtOut} options={[['csv', 'CSV'], ['tsv', 'TSV'], ['md', 'Markdown']]} />
              <CopyButton text={text} />
              <Btn kind="primary" disabled={!rows.length} onClick={() => download(`${base}-table.${fmtOut === 'md' ? 'md' : fmtOut}`, fmtOut === 'csv' ? '﻿' + text : text, fmtOut === 'csv' ? 'text/csv' : 'text/plain')}>⬇ Download</Btn>
            </>
          }
        >
          {rows.length ? (
            <Table head={s.header ? rows[0] : rows[0].map((_, i) => `Col ${i + 1}`)} rows={s.header ? rows.slice(1) : rows} max={60} />
          ) : (
            <Note tone="warn">No table rows on the selected pages. Lower “Min. cells per table row” or adjust the cell gap. Scanned PDFs need OCR first.</Note>
          )}
        </Panel>
        <Note>Everything runs locally with pdf.js. Cells are found from text positions: columns from whitespace gaps or vertical ruling lines, rows from baselines or horizontal rules (wrapped cell text is merged).</Note>
      </div>
    </Split>
  )
}
