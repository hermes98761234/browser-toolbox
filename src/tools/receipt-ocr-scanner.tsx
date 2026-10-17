import { useEffect, useRef, useState, type PointerEvent as RPE } from 'react'
import { Area, Btn, Check, CsvButton, download, FileDrop, JsonButtons, money, Note, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, Table, today, Txt, uid, useToolState } from '../kit'
import { checks, parseReceipt, round2, SAMPLE_TEXT, type Item, type Parsed } from './lib/receipt-ocr-scanner'

interface Form {
  merchant: string; date: string; time: string; currency: string; category: string; payment: string
  subtotal: string; tax: string; tip: string; discount: string; total: string; taxIncluded: boolean; items: Item[]
}
interface Saved { id: string; merchant: string; date: string; currency: string; category: string; payment: string; subtotal: number; tax: number; tip: number; total: number; items: Item[] }
interface State { text: string; dmy: boolean; form: Form; log: Saved[] }

const CATS = ['Groceries', 'Dining', 'Transport', 'Fuel', 'Office supplies', 'Travel', 'Utilities', 'Health', 'Entertainment', 'Other']
const n2s = (x: number | null) => (x === null ? '' : x.toFixed(2))
const s2n = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')))
const guessCat = (m: string) => (/market|grocer|super|bäck|bakery|foods?\b|aldi|lidl|tesco|walmart|costco/i.test(m) ? 'Groceries' : /caf|coffee|restaurant|bar|pizza|bistro|grill|kitchen/i.test(m) ? 'Dining' : /fuel|petrol|gas|shell|bp|esso/i.test(m) ? 'Fuel' : /taxi|uber|rail|metro|bus|parking/i.test(m) ? 'Transport' : 'Other')

function toForm(p: Parsed): Form {
  return {
    merchant: p.merchant, date: p.date, time: p.time, currency: p.currency || '$', category: guessCat(p.merchant), payment: p.payment,
    subtotal: n2s(p.subtotal), tax: n2s(p.tax), tip: n2s(p.tip), discount: n2s(p.discount), total: n2s(p.total), taxIncluded: p.subtotal === null && p.tax !== null, items: p.items,
  }
}
const DEF: State = { text: SAMPLE_TEXT, dmy: false, form: toForm(parseReceipt(SAMPLE_TEXT, false)), log: [] }

declare global {
  interface Window { TextDetector?: new () => { detect: (src: CanvasImageSource) => Promise<{ rawValue: string; boundingBox: DOMRectReadOnly }[]> } }
}

function sampleReceipt(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 720
  c.height = 1040
  const g = c.getContext('2d')!
  const bg = g.createLinearGradient(0, 0, 720, 1040)
  bg.addColorStop(0, '#5b4636')
  bg.addColorStop(1, '#2f241c')
  g.fillStyle = bg
  g.fillRect(0, 0, 720, 1040)
  g.save()
  g.translate(360, 520)
  g.rotate(-0.025)
  g.shadowColor = 'rgba(0,0,0,.5)'
  g.shadowBlur = 24
  g.fillStyle = '#f7f4ec'
  g.fillRect(-250, -470, 500, 940)
  g.shadowBlur = 0
  g.fillStyle = '#26221c'
  const lines = SAMPLE_TEXT.split('\n')
  g.font = 'bold 22px ui-monospace, Menlo, monospace'
  g.textAlign = 'center'
  g.fillText(lines[0], 0, -420)
  g.textAlign = 'left'
  g.font = '17px ui-monospace, Menlo, monospace'
  lines.slice(1).forEach((l, i) => {
    g.globalAlpha = 0.82 + ((i * 7) % 5) / 30
    g.fillText(l, -228, -385 + i * 31)
  })
  g.restore()
  return c
}

export default function ReceiptOcrScanner() {
  const [s, set, reset] = useToolState('receipt-ocr-scanner', DEF)
  const [src, setSrc] = useState<(CanvasImageSource & { width: number; height: number }) | null>(() => (typeof document === 'undefined' ? null : sampleReceipt()))
  const [rot, setRot] = useState(0)
  const [crop, setCrop] = useState<[number, number, number, number] | null>(null)
  const [enhance, setEnhance] = useState<'none' | 'gray' | 'bw'>('none')
  const [zoom, setZoom] = useState(100)
  const [cropMode, setCropMode] = useState(false)
  const [sel, setSel] = useState<[number, number, number, number] | null>(null)
  const [msg, setMsg] = useState('')
  const view = useRef<HTMLCanvasElement>(null)
  const drag = useRef<[number, number] | null>(null)
  const hasDetector = typeof window !== 'undefined' && !!window.TextDetector
  const f = s.form
  const cur = f.currency || '$'
  const m = (x: number) => money(x, cur === 'zł' || cur === 'CHF' ? `${cur} ` : cur)

  // Render rotated → cropped → enhanced image.
  useEffect(() => {
    const cv = view.current
    if (!cv || !src) return
    const rw = rot % 180 ? src.height : src.width, rh = rot % 180 ? src.width : src.height
    const full = document.createElement('canvas')
    full.width = rw
    full.height = rh
    const fg = full.getContext('2d')!
    fg.translate(rw / 2, rh / 2)
    fg.rotate((rot * Math.PI) / 180)
    fg.drawImage(src, -src.width / 2, -src.height / 2)
    const [cx, cy, cw, ch] = crop ?? [0, 0, rw, rh]
    cv.width = Math.max(1, Math.round(cw))
    cv.height = Math.max(1, Math.round(ch))
    const g = cv.getContext('2d', { willReadFrequently: true })!
    g.drawImage(full, cx, cy, cw, ch, 0, 0, cw, ch)
    if (enhance !== 'none') {
      const im = g.getImageData(0, 0, cv.width, cv.height)
      const d = im.data
      let lo = 255, hi = 0
      for (let i = 0; i < d.length; i += 16) { const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; lo = Math.min(lo, y); hi = Math.max(hi, y) }
      for (let i = 0; i < d.length; i += 4) {
        let y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
        y = ((y - lo) / Math.max(1, hi - lo)) * 255
        if (enhance === 'bw') y = y > 150 ? 255 : 0
        d[i] = d[i + 1] = d[i + 2] = y
      }
      g.putImageData(im, 0, 0)
    }
  }, [src, rot, crop, enhance])

  const loadFile = async (file: File) => {
    try {
      const bmp = await createImageBitmap(file)
      setSrc(bmp)
      setRot(0)
      setCrop(null)
      setMsg('')
    } catch {
      setMsg('That image could not be decoded (HEIC photos may need converting to JPEG first).')
    }
  }
  const pt = (e: RPE<HTMLCanvasElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect()
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))]
  }
  const applyCrop = () => {
    const cv = view.current
    if (!sel || !cv) return
    const [x0, y0, x1, y1] = [sel[0] * cv.width, sel[1] * cv.height, sel[2] * cv.width, sel[3] * cv.height]
    const [ox, oy] = crop ?? [0, 0]
    if (Math.abs(x1 - x0) > 10 && Math.abs(y1 - y0) > 10) setCrop([ox + Math.min(x0, x1), oy + Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0)])
    setSel(null)
    setCropMode(false)
  }
  const detect = async () => {
    if (!window.TextDetector || !view.current) return
    try {
      const res = await new window.TextDetector().detect(view.current)
      const rows: { y: number; parts: { x: number; t: string }[] }[] = []
      for (const r of res.sort((a, b) => a.boundingBox.y - b.boundingBox.y)) {
        const row = rows.find((x) => Math.abs(x.y - r.boundingBox.y) < r.boundingBox.height * 0.6)
        if (row) row.parts.push({ x: r.boundingBox.x, t: r.rawValue })
        else rows.push({ y: r.boundingBox.y, parts: [{ x: r.boundingBox.x, t: r.rawValue }] })
      }
      const text = rows.map((r) => r.parts.sort((a, b) => a.x - b.x).map((p) => p.t).join('  ')).join('\n')
      setText(text)
      setMsg(`Detected ${res.length} text blocks — check the text and fields below.`)
    } catch (e) {
      setMsg(`Text detection failed: ${(e as Error).message}`)
    }
  }
  const setText = (text: string) => set({ text, form: toForm(parseReceipt(text, s.dmy)) })
  const patch = (p: Partial<Form>) => set({ form: { ...f, ...p } })
  const item = (i: number, p: Partial<Item>) => {
    const items = f.items.map((x, j) => {
      if (j !== i) return x
      const nx = { ...x, ...p }
      if ('qty' in p || 'price' in p) nx.total = round2(nx.qty * nx.price)
      return nx
    })
    patch({ items })
  }

  const num = { subtotal: s2n(f.subtotal), tax: s2n(f.tax), tip: s2n(f.tip), discount: s2n(f.discount), total: s2n(f.total) }
  const cks = checks({ items: f.items, ...num, taxIncluded: f.taxIncluded })
  const itemSum = round2(f.items.reduce((a, i) => a + i.total, 0))
  const save = () => {
    const rec: Saved = { id: uid(), merchant: f.merchant || 'Unknown', date: f.date, currency: cur, category: f.category, payment: f.payment, subtotal: num.subtotal ?? itemSum, tax: num.tax ?? 0, tip: num.tip ?? 0, total: num.total ?? itemSum, items: f.items }
    set({ log: [rec, ...s.log] })
  }
  const month = today().slice(0, 7)
  const monthLog = s.log.filter((r) => r.date.startsWith(month))

  return (
    <Split>
      <div>
        <Panel title="1 · Capture the receipt">
          <Row>
            <FileDrop accept="image/*" onFiles={(fs) => void loadFile(fs[0])} label="Drop a receipt photo or scan" />
            <label className="k-btn primary" style={{ alignSelf: 'center' }}>
              📷 Take photo
              <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const fl = e.target.files?.[0]; e.target.value = ''; if (fl) void loadFile(fl) }} />
            </label>
          </Row>
          <Row>
            <Btn onClick={() => { setRot((rot + 270) % 360); setCrop(null) }} title="Rotate left">⟲</Btn>
            <Btn onClick={() => { setRot((rot + 90) % 360); setCrop(null) }} title="Rotate right">⟳</Btn>
            <Btn kind={cropMode ? 'primary' : 'normal'} onClick={() => { setCropMode(!cropMode); setSel(null) }}>✂ {cropMode ? 'Drag on the image…' : 'Crop'}</Btn>
            {sel && <Btn kind="primary" onClick={applyCrop}>Apply crop</Btn>}
            {crop && <Btn kind="ghost" onClick={() => setCrop(null)}>Undo crop</Btn>}
            <Seg value={enhance} onChange={setEnhance} options={[['none', 'Original'], ['gray', 'Enhance'], ['bw', 'B/W']]} />
          </Row>
          <Slider label="Zoom" value={zoom} onChange={setZoom} min={25} max={300} step={5} unit="%" show={String} />
          <div style={{ maxHeight: 520, overflow: 'auto', background: 'var(--panel2)', borderRadius: 10, position: 'relative' }}>
            <div style={{ position: 'relative', width: `${zoom}%`, margin: '0 auto' }}>
              <canvas
                ref={view}
                style={{ width: '100%', display: 'block', cursor: cropMode ? 'crosshair' : 'default', touchAction: cropMode ? 'none' : 'auto' }}
                onPointerDown={(e) => { if (!cropMode) return; const p = pt(e); drag.current = p; setSel([p[0], p[1], p[0], p[1]]); e.currentTarget.setPointerCapture(e.pointerId) }}
                onPointerMove={(e) => { if (!cropMode || !drag.current) return; const p = pt(e); setSel([drag.current[0], drag.current[1], p[0], p[1]]) }}
                onPointerUp={() => (drag.current = null)}
              />
              {sel && (
                <div style={{ position: 'absolute', pointerEvents: 'none', border: '2px dashed var(--accent2)', background: 'rgb(14 165 233 / .12)', left: `${Math.min(sel[0], sel[2]) * 100}%`, top: `${Math.min(sel[1], sel[3]) * 100}%`, width: `${Math.abs(sel[2] - sel[0]) * 100}%`, height: `${Math.abs(sel[3] - sel[1]) * 100}%` }} />
              )}
            </div>
          </div>
          <Row>
            <Btn kind="ghost" onClick={() => view.current?.toBlob((b) => b && download('receipt.png', b))}>⬇ Save cleaned image</Btn>
            <Btn kind="ghost" onClick={() => { setSrc(sampleReceipt()); setRot(0); setCrop(null) }}>Sample receipt</Btn>
          </Row>
          {msg && <Note tone="warn">{msg}</Note>}
        </Panel>
        <Panel title="2 · Receipt text">
          {hasDetector ? (
            <Row>
              <Btn kind="primary" onClick={() => void detect()}>🔎 Detect text in the image</Btn>
              <span className="muted" style={{ fontSize: 13 }}>Uses your browser’s built-in TextDetector.</span>
            </Row>
          ) : (
            <Note>
              This browser has no built-in text recognition, and no OCR engine is downloaded — your receipt never leaves the device. Copy the text with your phone or computer instead: <b>Live Text</b> (iPhone, iPad, Mac: long-press the photo), <b>Google Lens</b> “Copy text” on Android, or <b>Text Actions</b> in the Windows Snipping Tool — then paste it below. You can also simply type the key amounts into the form.
            </Note>
          )}
          <Area value={s.text} onChange={setText} rows={10} mono placeholder="Paste the receipt text here" />
          <Row>
            <Check label="Day before month (31/12/2026)" value={s.dmy} onChange={(dmy) => set({ dmy, form: toForm(parseReceipt(s.text, dmy)) })} />
            <Btn kind="ghost" onClick={() => setText('')}>Clear</Btn>
          </Row>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Total" value={num.total !== null ? m(num.total) : '—'} tone="accent" sub={f.merchant || 'merchant?'} />
          <Stat label="Tax" value={num.tax !== null ? m(num.tax) : '—'} sub={num.tax && (num.subtotal ?? itemSum) ? `${((num.tax / (f.taxIncluded ? (num.total ?? 1) - num.tax : (num.subtotal ?? itemSum))) * 100).toFixed(2)}% effective` : f.taxIncluded ? 'included' : ''} />
          <Stat label="Line items" value={f.items.length} sub={m(itemSum)} />
          <Stat label="Checks" value={cks.length ? `${cks.filter((c) => c.ok).length}/${cks.length} pass` : '—'} tone={cks.some((c) => !c.ok) ? 'bad' : 'good'} />
        </Stats>
        <Panel title="3 · Confirm the details" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            <Txt label="Merchant" value={f.merchant} onChange={(merchant) => patch({ merchant })} />
            <Txt label="Date" type="date" value={f.date} onChange={(date) => patch({ date })} />
            <Txt label="Time" type="time" value={f.time} onChange={(time) => patch({ time })} />
          </Row>
          <Row>
            <Select label="Category" value={f.category} onChange={(category) => patch({ category })} options={CATS} />
            <Select label="Currency" value={cur} onChange={(currency) => patch({ currency })} options={['$', '€', '£', '₴', 'zł', '¥', 'CHF']} />
            <Txt label="Paid with" value={f.payment} onChange={(payment) => patch({ payment })} />
          </Row>
          <Table
            head={['Item', 'Qty', 'Price', 'Line total', '']}
            rows={f.items.map((it, i) => [
              <input key="d" value={it.desc} onChange={(e) => item(i, { desc: e.target.value })} aria-label="Item" />,
              <input key="q" type="number" min={0} value={it.qty} onChange={(e) => item(i, { qty: Number(e.target.value) || 0 })} style={{ width: 56 }} aria-label="Quantity" />,
              <input key="p" type="number" step="0.01" value={it.price} onChange={(e) => item(i, { price: Number(e.target.value) || 0 })} style={{ width: 80 }} aria-label="Price" />,
              <input key="t" type="number" step="0.01" value={it.total} onChange={(e) => item(i, { total: Number(e.target.value) || 0 })} style={{ width: 86, color: Math.abs(round2(it.qty * it.price) - it.total) > 0.011 ? 'var(--err)' : undefined }} aria-label="Line total" />,
              <Btn key="x" kind="ghost" onClick={() => patch({ items: f.items.filter((_, j) => j !== i) })} title="Remove">✕</Btn>,
            ])}
            foot={['Items', '', '', m(itemSum), '']}
          />
          <Btn onClick={() => patch({ items: [...f.items, { desc: 'Item', qty: 1, price: 0, total: 0 }] })}>+ Item</Btn>
          <Row>
            {(['subtotal', 'discount', 'tax', 'tip', 'total'] as const).map((k) => (
              <Txt key={k} label={k[0].toUpperCase() + k.slice(1)} value={f[k]} onChange={(v) => patch({ [k]: v })} placeholder="0.00" />
            ))}
          </Row>
          <Check label="Tax is already included in the prices (VAT receipts)" value={f.taxIncluded} onChange={(taxIncluded) => patch({ taxIncluded })} />
          {cks.map((c) => (
            <div key={c.label} style={{ display: 'flex', gap: 8, fontSize: 14, margin: '4px 0', color: c.ok ? 'var(--ok)' : 'var(--err)' }}>
              <b>{c.ok ? '✓' : '✗'}</b> <span><b>{c.label}</b> <span className="muted">— {c.detail}</span></span>
            </div>
          ))}
          {num.total !== null && Math.abs(itemSum - (num.subtotal ?? num.total)) > 0.011 && !num.subtotal && (
            <Btn kind="ghost" onClick={() => patch({ subtotal: itemSum.toFixed(2) })}>Use item sum as subtotal</Btn>
          )}
          <Row>
            <Btn kind="primary" onClick={save} disabled={num.total === null && !f.items.length}>💾 Save to expense log</Btn>
          </Row>
        </Panel>
        <Panel
          title={`Expense log (${s.log.length})`}
          actions={
            <>
              <CsvButton name="receipts.csv" rows={() => [['Date', 'Merchant', 'Category', 'Payment', 'Currency', 'Subtotal', 'Tax', 'Tip', 'Total', 'Items'], ...s.log.map((r) => [r.date, r.merchant, r.category, r.payment, r.currency, r.subtotal, r.tax, r.tip, r.total, r.items.map((i) => `${i.qty}× ${i.desc} ${i.total}`).join('; ')])]} />
              <JsonButtons name="receipts.json" data={s.log} onLoad={(log) => Array.isArray(log) && set({ log })} />
            </>
          }
        >
          {s.log.length ? (
            <>
              <p className="muted" style={{ marginTop: 0 }}>This month: {monthLog.length} receipts, {m(monthLog.reduce((a, r) => a + r.total, 0))} total, {m(monthLog.reduce((a, r) => a + r.tax, 0))} tax.</p>
              <Table
                max={12}
                head={['Date', 'Merchant', 'Category', 'Total', '']}
                rows={s.log.map((r) => [r.date || '—', r.merchant, r.category, money(r.total, r.currency), <Btn key="x" kind="ghost" onClick={() => set({ log: s.log.filter((x) => x.id !== r.id) })} title="Delete">✕</Btn>])}
              />
            </>
          ) : (
            <Note>Saved receipts appear here and stay in this browser. Export them as CSV for your bookkeeping app.</Note>
          )}
        </Panel>
      </div>
    </Split>
  )
}
