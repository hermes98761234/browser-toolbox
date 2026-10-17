import { useMemo, useState } from 'react'
import { Area, Btn, Check, download, Note, Num, Panel, Row, Select, Seg, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { code128Widths, ean13, fill, labelPos, parseCsv, qr, SHEETS, type Ecl, type Sheet } from './lib/barcode-label-maker'

type Sym = 'code128' | 'ean13' | 'qr'
interface Prim { rects: [number, number, number, number][]; texts: { x: number; y: number; size: number; text: string; bold?: boolean; anchor: 'start' | 'middle' }[]; error?: string }

const SAMPLE = `code,title,price,qty
SKU-10023,Ceramic mug 350 ml,$12.90,3
SKU-10024,Espresso cup set,$18.50,2
SKU-10031,Bamboo cutting board,$24.00,4
SKU-10045,Linen tea towel,$7.25,3
SKU-10052,Cast iron trivet,$15.00,2
SKU-10060,Glass storage jar 1 L,$9.80,4
SKU-10071,Wooden spoon set,$11.40,3`

const EAN_SAMPLE = `code,title,price,qty
400638133393,Organic oats 500 g,$3.49,6
501234567890,Sparkling water 1 L,$1.20,6
590123412345,Dark chocolate 70%,$2.95,6
871234567890,Green tea 20 bags,$4.10,3`

const QR_SAMPLE = `code,title,price,qty
https://example.com/p/10023,Ceramic mug,Scan for care guide,3
https://example.com/p/10031,Cutting board,Scan for care guide,3
WIFI:T:WPA;S:Guest;P:welcome2026;;,Guest Wi-Fi,Scan to join,2`

const DEF = { sym: 'code128' as Sym, sheet: 'L7160', csv: SAMPLE, codeTpl: '{code}', line1: '{title}', line2: '{price}', useQty: true, skip: 0, ecl: 'M' as Ecl, showCode: true, outline: true }

const fit = (t: string, size: number, w: number) => {
  const max = Math.floor(w / (size * 0.5))
  return t.length > max ? t.slice(0, Math.max(1, max - 1)) + '…' : t
}

/** Greedy word wrap into at most `lines` lines (the last one truncated). */
function wrap(t: string, size: number, w: number, lines: number): string[] {
  const max = Math.max(1, Math.floor(w / (size * 0.5)))
  const out: string[] = []
  let cur = ''
  for (const word of t.split(/\s+/)) {
    const next = cur ? `${cur} ${word}` : word
    if (next.length <= max || !cur) cur = next
    else {
      out.push(cur)
      cur = word
    }
  }
  if (cur) out.push(cur)
  return out.length > lines ? [...out.slice(0, lines - 1), fit(out.slice(lines - 1).join(' '), size, w)] : out.map((x) => fit(x, size, w))
}

function layout(sym: Sym, code: string, l1: string, l2: string, w: number, h: number, ecl: Ecl, showCode: boolean): Prim {
  const pad = Math.min(2.5, h * 0.08)
  const rects: Prim['rects'] = []
  const texts: Prim['texts'] = []
  try {
    if (sym === 'qr') {
      const q = qr(code, ecl)
      const side = Math.min(h - 2 * pad, w * 0.5)
      const m = side / (q.size + 2)
      const ox = pad + m, oy = (h - side) / 2 + m
      for (let y = 0; y < q.size; y++) {
        let x = 0
        while (x < q.size) {
          if (!q.modules[y][x]) { x++; continue }
          let e = x
          while (e < q.size && q.modules[y][e]) e++
          rects.push([ox + x * m, oy + y * m, (e - x) * m + 0.01, m + 0.01])
          x = e
        }
      }
      const tx = pad + side + pad, tw = w - tx - pad
      const fs = Math.min(3.4, h * 0.12, tw / 5)
      if (tw > 6) {
        const t1 = l1 ? wrap(l1, fs, tw, 2) : []
        const t2 = l2 ? wrap(l2, fs * 0.8, tw, 2) : []
        let y = (h - (t1.length * fs * 1.2 + t2.length * fs * 0.95)) / 2 + fs * 0.85
        for (const line of t1) { texts.push({ x: tx, y, size: fs, text: line, bold: true, anchor: 'start' }); y += fs * 1.2 }
        for (const line of t2) { texts.push({ x: tx, y, size: fs * 0.8, text: line, anchor: 'start' }); y += fs * 0.95 }
      }
      return { rects, texts }
    }
    const fs = Math.min(4, h * 0.13)
    let y = pad
    const cx = w / 2
    if (l1) { texts.push({ x: cx, y: y + fs * 0.85, size: fs, text: fit(l1, fs, w - 2 * pad), bold: true, anchor: 'middle' }); y += fs * 1.15 }
    if (l2) { texts.push({ x: cx, y: y + fs * 0.75, size: fs * 0.85, text: fit(l2, fs * 0.85, w - 2 * pad), anchor: 'middle' }); y += fs * 1.05 }
    const hr = showCode ? Math.min(3, h * 0.1) : 0
    const barH = h - y - pad - hr * 1.15 - 0.6
    if (barH < 3) throw new Error('Label too small')
    let shown = code
    if (sym === 'ean13') {
      const e = ean13(code)
      shown = `${e.code[0]}  ${e.code.slice(1, 7)}  ${e.code.slice(7)}`
      const mw = (w - 2 * pad) / (95 + 18)
      const x0 = (w - 95 * mw) / 2
      for (let i = 0; i < 95; i++) if (e.bits[i] === '1') {
        const guard = i < 3 || (i >= 45 && i < 50) || i >= 92
        rects.push([x0 + i * mw, y + 0.6, mw + 0.005, barH + (guard ? hr * 0.6 : 0)])
      }
    } else {
      const ws = code128Widths(code)
      const total = ws.reduce((a, b) => a + b, 0)
      const mw = (w - 2 * pad) / (total + 20)
      let x = (w - total * mw) / 2
      ws.forEach((n, i) => { if (i % 2 === 0) rects.push([x, y + 0.6, n * mw + 0.005, barH]); x += n * mw })
      if (mw < 0.19) texts.push({ x: cx, y: h - 0.5, size: 1.6, text: '⚠ bars < 0.19 mm — use a bigger label or shorter code', anchor: 'middle' })
    }
    if (showCode) texts.push({ x: cx, y: y + 0.6 + barH + hr * 1.0, size: hr, text: shown, anchor: 'middle' })
    return { rects, texts }
  } catch (e) {
    return { rects, texts: [{ x: w / 2, y: h / 2, size: Math.min(3, h * 0.12), text: (e as Error).message.slice(0, 40), anchor: 'middle' }], error: (e as Error).message }
  }
}

const winAnsi = (t: string) => t.replace(/[^\x20-\x7e\xa0-\xff€–—…‘’“”•]/g, '?')

async function makePdf(sh: Sheet, items: Prim[], skip: number, outline: boolean) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const k = 72 / 25.4
  const pages: ReturnType<typeof doc.addPage>[] = []
  items.forEach((p, n) => {
    const pos = labelPos(sh, n + skip)
    while (pages.length <= pos.page) pages.push(doc.addPage([sh.pageW * k, sh.pageH * k]))
    const pg = pages[pos.page]
    const Y = (y: number) => (sh.pageH - pos.y - y) * k
    if (outline) pg.drawRectangle({ x: pos.x * k, y: Y(sh.h), width: sh.w * k, height: sh.h * k, borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 0.3 })
    for (const [x, y, w, h] of p.rects) pg.drawRectangle({ x: (pos.x + x) * k, y: Y(y + h), width: w * k, height: h * k, color: rgb(0, 0, 0) })
    for (const t of p.texts) {
      const f = t.bold ? bold : font
      const txt = winAnsi(t.text)
      const tw = f.widthOfTextAtSize(txt, t.size * k)
      pg.drawText(txt, { x: (pos.x + t.x) * k - (t.anchor === 'middle' ? tw / 2 : 0), y: Y(t.y), size: t.size * k, font: f, color: rgb(0, 0, 0) })
    }
  })
  return doc.save()
}

export default function BarcodeLabelMaker() {
  const [s, set, reset] = useToolState('barcode-label-maker', DEF)
  const [page, setPage] = useState(0)
  const [busy, setBusy] = useState(false)
  const sh = SHEETS.find((x) => x.id === s.sheet) ?? SHEETS[0]
  const rows = useMemo(() => parseCsv(s.csv), [s.csv])
  const head = (rows[0] ?? []).map((h) => h.toLowerCase())
  const recs = rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])))
  const labels = useMemo(() => {
    const out: { rec: Record<string, string>; prim: Prim }[] = []
    for (const rec of recs) {
      const q = s.useQty && rec.qty !== undefined ? Math.max(0, Math.min(500, Math.round(Number(rec.qty) || 0))) : 1
      const prim = layout(s.sym, fill(s.codeTpl, rec), fill(s.line1, rec), fill(s.line2, rec), sh.w, sh.h, s.ecl, s.showCode)
      for (let i = 0; i < q; i++) out.push({ rec, prim })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.csv, s.sym, s.codeTpl, s.line1, s.line2, s.useQty, s.ecl, s.showCode, sh])
  const per = sh.cols * sh.rows
  const skip = Math.min(Math.max(0, Math.round(s.skip)), per - 1)
  const pages = Math.max(1, Math.ceil((labels.length + skip) / per))
  const pg = Math.min(page, pages - 1)
  const errors = recs.map((r, i) => ({ i, r, e: layout(s.sym, fill(s.codeTpl, r), '', '', sh.w, sh.h, s.ecl, false).error })).filter((x) => x.e)
  const W = 560

  const pdf = async () => {
    setBusy(true)
    try {
      const bytes = await makePdf(sh, labels.map((l) => l.prim), skip, s.outline)
      download(`labels-${sh.id}.pdf`, new Blob([bytes as BlobPart], { type: 'application/pdf' }), 'application/pdf')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="Barcode type">
          <Seg value={s.sym} onChange={(sym) => set({ sym, csv: sym === 'ean13' ? EAN_SAMPLE : sym === 'qr' ? QR_SAMPLE : SAMPLE })} options={[['code128', 'Code 128'], ['ean13', 'EAN-13'], ['qr', 'QR code']]} />
          <p className="muted" style={{ fontSize: 13 }}>
            {s.sym === 'code128' ? 'Any ASCII text — SKUs, asset tags, bin locations. Digit runs are packed automatically (set C).' : s.sym === 'ean13' ? 'Retail product codes: 12 digits (check digit is added) or 13 digits (verified).' : 'URLs, Wi-Fi logins, contact cards or any text up to ~2900 bytes.'}
          </p>
          {s.sym === 'qr' && <Select label="Error correction" value={s.ecl} onChange={(ecl) => set({ ecl })} options={[['L', 'L · 7% (smallest)'], ['M', 'M · 15%'], ['Q', 'Q · 25%'], ['H', 'H · 30% (logo-safe)']]} />}
        </Panel>
        <Panel title="Data (CSV merge)">
          <Area value={s.csv} onChange={(csv) => set({ csv })} rows={8} mono />
          <p className="muted" style={{ fontSize: 13, margin: '6px 0' }}>First row = column names. Use them in the templates below as {'{column}'}.</p>
          <Row>
            <Txt label="Barcode value" value={s.codeTpl} onChange={(codeTpl) => set({ codeTpl })} />
            <Txt label="Line 1" value={s.line1} onChange={(line1) => set({ line1 })} />
            <Txt label="Line 2" value={s.line2} onChange={(line2) => set({ line2 })} />
          </Row>
          <Check label={`Repeat each row by its “qty” column${head.includes('qty') ? '' : ' (no qty column found)'}`} value={s.useQty} onChange={(useQty) => set({ useQty })} />
          {s.sym !== 'qr' && <Check label="Print human-readable code under bars" value={s.showCode} onChange={(showCode) => set({ showCode })} />}
          <label className="k-btn" style={{ marginTop: 6 }}>
            ⬆ Import CSV file
            <input type="file" accept=".csv,.txt,text/csv" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) set({ csv: await f.text() }) }} />
          </label>
        </Panel>
        <Panel title="Label sheet">
          <Select label="Template" value={s.sheet} onChange={(sheet) => { set({ sheet }); setPage(0) }} options={SHEETS.map((x) => [x.id, x.name] as [string, string])} />
          <Num label="Skip used labels at start" value={s.skip} onChange={(v) => set({ skip: v })} min={0} max={per - 1} step={1} hint="Reuse a partly used sheet" />
          <Check label="Print light outlines (for alignment test)" value={s.outline} onChange={(outline) => set({ outline })} />
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Labels" value={labels.length} sub={`${recs.length} rows`} />
          <Stat label="Pages" value={pages} sub={`${per} per sheet`} />
          <Stat label="Label size" value={`${+sh.w.toFixed(1)}×${+sh.h.toFixed(1)}`} sub="mm" />
          <Stat label="Problems" value={errors.length} tone={errors.length ? 'bad' : 'good'} />
        </Stats>
        <Panel
          title={`Preview · page ${pg + 1} of ${pages}`}
          actions={
            <>
              <Btn disabled={pg === 0} onClick={() => setPage(pg - 1)}>‹</Btn>
              <Btn disabled={pg >= pages - 1} onClick={() => setPage(pg + 1)}>›</Btn>
              <Btn kind="primary" disabled={busy || !labels.length} onClick={() => void pdf()}>{busy ? 'Building…' : '⬇ Print-ready PDF'}</Btn>
            </>
          }
        >
          <div style={{ overflowX: 'auto' }}>
            <svg viewBox={`0 0 ${sh.pageW} ${sh.pageH}`} style={{ width: '100%', maxWidth: W, display: 'block', margin: '0 auto', background: '#fff', boxShadow: '0 2px 12px #0003', borderRadius: 2 }} aria-label="label sheet preview">
              {Array.from({ length: per }, (_, i) => {
                const p = labelPos(sh, i)
                const n = pg * per + i - skip
                const l = n >= 0 ? labels[n] : undefined
                return (
                  <g key={i} transform={`translate(${p.x} ${p.y})`}>
                    <rect width={sh.w} height={sh.h} rx={Math.min(2, sh.h * 0.08)} fill={n < 0 ? '#f1f5f9' : '#fff'} stroke="#cbd5e1" strokeWidth={0.25} strokeDasharray={l ? undefined : '1 1'} />
                    {l?.prim.rects.map(([x, y, w, h], j) => <rect key={j} x={x} y={y} width={w} height={h} fill="#000" />)}
                    {l?.prim.texts.map((t, j) => (
                      <text key={`t${j}`} x={t.x} y={t.y} fontSize={t.size} fontWeight={t.bold ? 700 : 400} textAnchor={t.anchor} fill={l.prim.error ? '#dc2626' : '#000'} fontFamily="Helvetica, Arial, sans-serif">{t.text}</text>
                    ))}
                  </g>
                )
              })}
            </svg>
          </div>
          <p className="muted" style={{ fontSize: 13, textAlign: 'center' }}>Print the PDF at <b>100% / Actual size</b> (not “Fit to page”).</p>
        </Panel>
        {errors.length > 0 && (
          <Panel title="Rows that can't be encoded">
            <Table head={['Row', 'Value', 'Problem']} rows={errors.map((x) => [x.i + 2, fill(s.codeTpl, x.r), <span key="e" style={{ color: 'var(--err)' }}>{x.e}</span>])} />
          </Panel>
        )}
        <Note>Tip: print one page on plain paper first, hold it against the label sheet to the light and check alignment. Scanners need a quiet zone — keep bars away from the label edge.</Note>
        <Row>
          <Btn kind="ghost" onClick={() => { reset(); setPage(0) }}>Reset</Btn>
        </Row>
      </div>
    </Split>
  )
}
