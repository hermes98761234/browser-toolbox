import { useEffect, useRef, useState } from 'react'
import { BarChart, Btn, Check, CsvButton, Donut, download, FileDrop, money, Note, Num, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, Table, Txt, uid, useToolState, Area } from '../kit'
import { CATEGORIES, cleanPixels, extract, summarize, type Category, type Expense, type Extracted } from './lib/receipt-scanner'

interface Detector { detect(src: CanvasImageSource): Promise<{ rawValue: string; boundingBox: DOMRectReadOnly }[]> }
const TextDetectorCtor = (globalThis as unknown as { TextDetector?: new () => Detector }).TextDetector

const SAMPLE_TEXT = `GREENLEAF MARKET
12 Orchard Road, Riverside
Tel 555-0142
Date: 14/10/2026  17:42
Oat milk 1L              1.89
Bananas 1.2 kg           2.15
Sourdough loaf           3.40
Free-range eggs x12      3.60
Cheddar 200g             2.75
SUBTOTAL                13.79
VAT 5%                   0.69
TOTAL                   14.48
VISA **** 4821
Thank you for shopping!`

// ---------- IndexedDB ----------
const DB = 'tb-receipt-scanner'
const STORE = 'expenses'
function openDb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' })
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  return new Promise((res, rej) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error)
  })
}
const dbAll = () => tx<Expense[]>('readonly', (s) => s.getAll() as IDBRequest<Expense[]>)
const dbPut = (e: Expense) => tx('readwrite', (s) => s.put(e))
const dbDel = (id: string) => tx('readwrite', (s) => s.delete(id))

const ago = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)
const SEED: Expense[] = [
  ['Corner Bean Cafe', 'Dining', 8.6, 0.41, 'Visa ····4821', 3],
  ['Northside Fuel', 'Fuel & transport', 52.3, 2.49, 'Debit', 9],
  ['City Pharmacy', 'Health', 14.25, 0.68, 'Cash', 17],
  ['Greenleaf Market', 'Groceries', 41.9, 2.0, 'Visa ····4821', 34],
].map(([m, c, t, x, p, d], i) => ({ id: `seed${i}`, date: ago(d as number), merchant: m as string, category: c as Category, total: t as number, tax: x as number, currency: '$', payment: p as string, note: 'sample', text: '', thumb: '', created: i }))

// ---------- images ----------
function fit(src: CanvasImageSource & { width: number; height: number }, max = 1600): HTMLCanvasElement {
  const k = Math.min(1, max / Math.max(src.width, src.height))
  const c = document.createElement('canvas')
  c.width = Math.round(src.width * k)
  c.height = Math.round(src.height * k)
  c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height)
  return c
}
function sampleReceipt(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 640
  c.height = 860
  const g = c.getContext('2d')!
  const bg = g.createLinearGradient(0, 0, 640, 860)
  bg.addColorStop(0, '#8a6d50')
  bg.addColorStop(1, '#5b4632')
  g.fillStyle = bg
  g.fillRect(0, 0, 640, 860)
  g.save()
  g.translate(320, 430)
  g.rotate(-0.025)
  g.shadowColor = 'rgba(0,0,0,.45)'
  g.shadowBlur = 24
  g.fillStyle = '#f7f4ec'
  g.fillRect(-210, -390, 420, 780)
  g.shadowBlur = 0
  const sh = g.createLinearGradient(-210, 0, 210, 0)
  sh.addColorStop(0, 'rgba(0,0,0,0)')
  sh.addColorStop(1, 'rgba(0,0,0,.22)')
  g.fillStyle = sh
  g.fillRect(-210, -390, 420, 780)
  g.fillStyle = '#2b2b2b'
  SAMPLE_TEXT.split('\n').forEach((l, i) => {
    g.font = i === 0 ? 'bold 26px "Courier New", monospace' : '17px "Courier New", monospace'
    g.fillText(l, -190, -340 + i * (i === 0 ? 0 : 44) + (i ? 18 : 0))
  })
  g.restore()
  return c
}
function cleaned(src: HTMLCanvasElement, mode: 'color' | 'gray' | 'bw', flatten: boolean, contrast: number, rot: number): HTMLCanvasElement {
  const r = document.createElement('canvas')
  const q = rot % 2 === 1
  r.width = q ? src.height : src.width
  r.height = q ? src.width : src.height
  const rg = r.getContext('2d', { willReadFrequently: true })!
  rg.translate(r.width / 2, r.height / 2)
  rg.rotate((rot * Math.PI) / 2)
  rg.drawImage(src, -src.width / 2, -src.height / 2)
  rg.setTransform(1, 0, 0, 1, 0, 0)
  const img = rg.getImageData(0, 0, r.width, r.height)
  let bgd: Uint8ClampedArray | null = null
  if (flatten) {
    const b = document.createElement('canvas')
    b.width = r.width
    b.height = r.height
    const bx = b.getContext('2d', { willReadFrequently: true })!
    bx.filter = `blur(${Math.max(8, Math.round(r.width / 40))}px)`
    bx.drawImage(r, 0, 0)
    bgd = bx.getImageData(0, 0, r.width, r.height).data
  }
  cleanPixels(img.data, bgd, mode, contrast)
  rg.putImageData(img, 0, 0)
  return r
}
function thumb(c: HTMLCanvasElement): string {
  return fit(c, 220).toDataURL('image/jpeg', 0.6)
}

const DEF = { mode: 'gray' as 'color' | 'gray' | 'bw', flatten: true, contrast: 1.3, rot: 0, dmy: true, currency: '$', text: SAMPLE_TEXT, seeded: false, month: 'all' }

export default function ReceiptScanner() {
  const [s, set] = useToolState('receipt-scanner', DEF)
  const [src, setSrc] = useState<HTMLCanvasElement | null>(null)
  const [cam, setCam] = useState<MediaStream | null>(null)
  const [msg, setMsg] = useState('')
  const [list, setList] = useState<Expense[]>([])
  const [dbOk, setDbOk] = useState(true)
  const [form, setForm] = useState(() => toForm(extract(DEF.text, true)))
  const outRef = useRef<HTMLCanvasElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const parsed = extract(s.text, s.dmy)

  function toForm(e: Extracted) {
    return { merchant: e.merchant, date: e.date || new Date().toISOString().slice(0, 10), total: e.total ?? 0, tax: e.tax ?? 0, category: e.category as Category, payment: e.payment, note: '' }
  }

  const refresh = () => dbAll().then((l) => setList(l.sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created))).catch(() => setDbOk(false))
  useEffect(() => {
    setSrc(sampleReceipt()) // eslint-disable-line react-hooks/set-state-in-effect
    void (async () => {
      try {
        if (!s.seeded && (await dbAll()).length === 0) for (const e of SEED) await dbPut(e)
        set({ seeded: true })
        await refresh()
      } catch {
        setDbOk(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    const out = outRef.current
    if (!src || !out) return
    const c = cleaned(src, s.mode, s.flatten, s.contrast, s.rot)
    out.width = c.width
    out.height = c.height
    out.getContext('2d')!.drawImage(c, 0, 0)
  }, [src, s.mode, s.flatten, s.contrast, s.rot])
  useEffect(() => {
    if (videoRef.current && cam) videoRef.current.srcObject = cam
    return () => cam?.getTracks().forEach((t) => t.stop())
  }, [cam])

  const openCam = async () => {
    try {
      setCam(await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 } } }))
      setMsg('')
    } catch {
      setMsg('Camera unavailable or permission denied. Choose a photo file instead.')
    }
  }
  const snap = () => {
    const v = videoRef.current
    if (!v || !v.videoWidth) return
    const c = document.createElement('canvas')
    c.width = v.videoWidth
    c.height = v.videoHeight
    c.getContext('2d')!.drawImage(v, 0, 0)
    setSrc(fit(c))
    setCam(null)
    set({ text: '' })
  }
  const load = async (f: File) => {
    try {
      setSrc(fit(await createImageBitmap(f)))
      set({ text: '', rot: 0 })
      setMsg('')
    } catch {
      setMsg('Could not read that image.')
    }
  }
  const detect = async () => {
    if (!TextDetectorCtor || !outRef.current) return
    try {
      const res = await new TextDetectorCtor().detect(outRef.current)
      const lines = res.sort((a, b) => a.boundingBox.y - b.boundingBox.y || a.boundingBox.x - b.boundingBox.x).map((r) => r.rawValue)
      if (!lines.length) return setMsg('No text found. Try B/W mode, more contrast or a sharper photo.')
      set({ text: lines.join('\n') })
      setForm(toForm(extract(lines.join('\n'), s.dmy)))
    } catch {
      setMsg('Text detection failed in this browser. Type or paste the text instead.')
    }
  }
  const save = async () => {
    const e: Expense = { id: uid(), ...form, total: Math.round(form.total * 100) / 100, tax: Math.round(form.tax * 100) / 100, currency: s.currency, text: s.text, thumb: outRef.current && src ? thumb(outRef.current) : '', created: Date.now() }
    try {
      await dbPut(e)
      await refresh()
      setMsg(`Saved ${form.merchant || 'expense'} · ${money(e.total, s.currency)}`)
    } catch {
      setDbOk(false)
    }
  }
  const del = async (id: string) => {
    await dbDel(id).catch(() => setDbOk(false))
    await refresh()
  }
  const restore = async (f: File) => {
    try {
      const arr = JSON.parse(await f.text()) as Expense[]
      for (const e of arr) if (e && e.id && typeof e.total === 'number') await dbPut(e)
      await refresh()
    } catch {
      setMsg('That file is not an expense backup.')
    }
  }

  const months = [...new Set(list.map((e) => e.date.slice(0, 7)))].sort().reverse()
  const shown = s.month === 'all' ? list : list.filter((e) => e.date.startsWith(s.month))
  const sum = summarize(shown)
  const all = summarize(list)
  const m = (x: number) => money(x, s.currency)
  const thisMonth = list.filter((e) => e.date.startsWith(new Date().toISOString().slice(0, 7))).reduce((a, e) => a + e.total, 0)
  const tag = (ok: boolean, label: string) => <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 99, marginRight: 6, background: ok ? 'color-mix(in srgb, var(--ok) 18%, transparent)' : 'color-mix(in srgb, var(--warn) 22%, transparent)' }}>{ok ? '✓' : '?'} {label}</span>

  return (
    <Split>
      <div>
        <Panel title="1 · Receipt photo">
          <Row>
            <FileDrop accept="image/*" onFiles={(f) => void load(f[0])} label="Drop or choose a receipt photo" />
            {cam ? <Btn kind="primary" onClick={snap}>📸 Capture</Btn> : <Btn onClick={() => void openCam()} disabled={!navigator.mediaDevices?.getUserMedia}>📷 Camera</Btn>}
            <Btn kind="ghost" onClick={() => { setSrc(sampleReceipt()); set({ text: SAMPLE_TEXT, rot: 0 }); setForm(toForm(extract(SAMPLE_TEXT, s.dmy))) }}>Sample</Btn>
          </Row>
          {msg && <Note tone={msg.startsWith('Saved') ? 'ok' : 'warn'}>{msg}</Note>}
          {cam && <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', borderRadius: 8, marginTop: 8 }} />}
          <canvas ref={outRef} style={{ width: '100%', maxHeight: 420, objectFit: 'contain', borderRadius: 8, border: '1px solid var(--line)', marginTop: 8, background: '#fff' }} />
          <Row>
            <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['color', 'Colour'], ['gray', 'Grey'], ['bw', 'B/W']]} />
            <Check label="Remove shadows" value={s.flatten} onChange={(flatten) => set({ flatten })} />
            <Btn onClick={() => set({ rot: (s.rot + 1) % 4 })} title="Rotate 90°">⟳</Btn>
          </Row>
          <Slider label="Contrast" min={0.6} max={2.5} step={0.05} value={s.contrast} onChange={(contrast) => set({ contrast })} />
        </Panel>
        <Panel title="2 · Receipt text">
          {TextDetectorCtor ? (
            <Btn kind="primary" onClick={() => void detect()}>🔎 Detect text in photo</Btn>
          ) : (
            <Note>This browser has no built-in text recognition (Shape Detection API), and nothing is uploaded anywhere. Type the key lines, or copy the text with your phone's Live Text / Google Lens and paste it here. The sample text below matches the sample photo.</Note>
          )}
          <Area value={s.text} onChange={(text) => set({ text })} rows={9} mono placeholder={'Store name\nDate 14/10/2026\n…\nTOTAL 14.48'} />
          <Row>
            <Btn kind="primary" onClick={() => setForm(toForm(parsed))}>Fill expense from text ↓</Btn>
            <Check label="Dates are day/month" value={s.dmy} onChange={(dmy) => set({ dmy })} />
          </Row>
          <div style={{ marginTop: 6 }}>
            {tag(parsed.how.merchant, 'merchant')}
            {tag(parsed.how.date, 'date')}
            {tag(parsed.how.total === 'label', parsed.how.total === 'guess' ? 'total guessed (largest amount)' : parsed.how.total === 'none' ? 'no total' : 'total line')}
          </div>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="This month" value={m(thisMonth)} />
          <Stat label="All expenses" value={m(all.total)} sub={`${list.length} receipts`} />
          <Stat label="Tax paid" value={m(all.tax)} />
        </Stats>
        {!dbOk && <Note tone="err">IndexedDB is not available (private mode?). Expenses cannot be saved in this browser.</Note>}
        <Panel title="3 · Expense">
          <Row>
            <Txt label="Merchant" value={form.merchant} onChange={(merchant) => setForm({ ...form, merchant })} />
            <Txt label="Date" type="date" value={form.date} onChange={(date) => setForm({ ...form, date })} />
          </Row>
          <Row>
            <Num label="Total" value={form.total} onChange={(total) => setForm({ ...form, total })} unit={s.currency} min={0} />
            <Num label="Tax" value={form.tax} onChange={(tax) => setForm({ ...form, tax })} unit={s.currency} min={0} />
            <Select label="Currency" value={s.currency} onChange={(currency) => set({ currency })} options={['$', '€', '£', 'zł', '₴', 'CHF ', '¥']} />
          </Row>
          <Row>
            <Select label="Category" value={form.category} onChange={(category) => setForm({ ...form, category })} options={CATEGORIES} />
            <Txt label="Payment" value={form.payment} onChange={(payment) => setForm({ ...form, payment })} />
          </Row>
          <Txt label="Note" value={form.note} onChange={(note) => setForm({ ...form, note })} placeholder="e.g. project, client, reimbursable" />
          <Btn kind="primary" disabled={!dbOk || !(form.total > 0)} onClick={() => void save()}>💾 Save expense</Btn>
        </Panel>
        <Panel
          title="Expenses"
          actions={
            <>
              <CsvButton name="expenses.csv" rows={() => [['Date', 'Merchant', 'Category', 'Total', 'Tax', 'Currency', 'Payment', 'Note'], ...shown.map((e) => [e.date, e.merchant, e.category, e.total, e.tax, e.currency, e.payment, e.note])]} />
              <Btn onClick={() => download('expenses-backup.json', JSON.stringify(list), 'application/json')}>⬇ Backup</Btn>
              <label className="k-btn">⬆ Restore<input type="file" accept=".json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void restore(f) }} /></label>
            </>
          }
        >
          <Select label="Month" value={s.month} onChange={(month) => set({ month })} options={[['all', 'All months'], ...months.map((x) => [x, x] as [string, string])]} />
          {shown.length ? (
            <Table
              head={['', 'Date', 'Merchant', 'Category', 'Total', '']}
              rows={shown.map((e) => [
                e.thumb ? <img key="t" src={e.thumb} alt="" style={{ width: 34, height: 44, objectFit: 'cover', borderRadius: 4 }} /> : <span key="t" style={{ fontSize: 22 }}>🧾</span>,
                e.date,
                <span key="m">{e.merchant || '—'}{e.note && <span className="muted"> · {e.note}</span>}</span>,
                e.category,
                <b key="v">{money(e.total, e.currency)}</b>,
                <Btn key="x" kind="ghost" onClick={() => void del(e.id)} title="Delete">✕</Btn>,
              ])}
              foot={['', '', `${shown.length} receipts`, '', m(sum.total), '']}
              max={50}
            />
          ) : (
            <p className="muted">No expenses yet.</p>
          )}
        </Panel>
        {shown.length > 0 && (
          <Panel title="Spending by category">
            <Donut slices={sum.cats.map(([label, value]) => ({ label, value }))} fv={m} center={<span>{m(sum.total)}</span>} />
          </Panel>
        )}
        {all.months.length > 1 && (
          <Panel title="By month">
            <BarChart bars={all.months.map(([label, value]) => ({ label, value }))} fy={m} height={200} />
          </Panel>
        )}
        <p className="muted" style={{ fontSize: 12.5 }}>Expenses (with a small thumbnail of the cleaned photo) are stored in this browser's IndexedDB only.</p>
      </div>
    </Split>
  )
}
