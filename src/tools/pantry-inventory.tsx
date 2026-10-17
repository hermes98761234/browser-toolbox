import { useEffect, useRef, useState } from 'react'
import { Btn, CopyButton, CsvButton, FileDrop, JsonButtons, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, Txt, uid, today, useToolState } from '../kit'
import { decodeLine, encodeEan, scanRows, validGtin } from './lib/barcode-scanner'
import { addDays, applyScan, CATS, daysLeft, SHELF, shoppingList, shoppingText, sortItems, status, type Item, type Place, type SortKey, type Status } from './lib/pantry-inventory'

interface Detector { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> }
const NATIVE = (globalThis as unknown as { BarcodeDetector?: new () => Detector }).BarcodeDetector
const PLACES: Place[] = ['Pantry', 'Fridge', 'Freezer']
const T = today()
const it = (name: string, cat: string, place: Place, qty: number, unit: string, min: number, d: number | null, code = ''): Item => ({ id: uid(), name, cat, place, qty, unit, min, exp: d === null ? '' : addDays(T, d), code })
const DEF = {
  items: [
    it('Whole milk', 'Dairy', 'Fridge', 1, 'l', 1, 2, '4000417025005'),
    it('Greek yogurt', 'Dairy', 'Fridge', 3, 'cup', 1, -1),
    it('Eggs', 'Dairy', 'Fridge', 8, 'pc', 4, 12),
    it('Spinach', 'Produce', 'Fridge', 1, 'bag', 0, 0),
    it('Chicken thighs', 'Meat', 'Freezer', 2, 'pack', 1, 75),
    it('Frozen peas', 'Frozen', 'Freezer', 1, 'bag', 1, 160),
    it('Spaghetti', 'Dry goods', 'Pantry', 1, 'pack', 2, 400, '8076800195057'),
    it('Basmati rice', 'Dry goods', 'Pantry', 2, 'kg', 1, 300),
    it('Chickpeas', 'Canned', 'Pantry', 4, 'can', 2, 540, '4006381333931'),
    it('Tomato passata', 'Canned', 'Pantry', 0, 'jar', 1, 210),
    it('Olive oil', 'Condiments', 'Pantry', 1, 'bottle', 1, 250),
    it('Sourdough bread', 'Bakery', 'Pantry', 1, 'loaf', 0, 3),
  ],
  sort: 'expiry' as SortKey,
  place: 'All',
  scanMode: 'add' as 'add' | 'use',
  extras: ['Coffee beans'] as string[],
  got: [] as string[],
}
const BLANK = { name: '', cat: 'Dry goods', place: 'Pantry' as Place, qty: 1, unit: 'pc', min: 1, exp: '', code: '' }
const TONE: Record<Status, [string, string]> = {
  expired: ['var(--err)', 'Expired'], today: ['var(--err)', 'Today'], soon: ['var(--warn)', '≤ 3 days'], week: ['#ca8a04', '≤ 7 days'], ok: ['var(--ok)', 'OK'], none: ['var(--muted)', 'No date'],
}

function decodeCanvas(c: HTMLCanvasElement): string | null {
  const g = c.getContext('2d', { willReadFrequently: true })!
  const { data, width: w, height: h } = g.getImageData(0, 0, c.width, c.height)
  const lum = (x: number, y: number) => { const i = (y * w + x) * 4; return data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114 }
  for (const y of scanRows(h, 21)) {
    const r = decodeLine(Array.from({ length: w }, (_, x) => lum(x, y)))
    if (r) return r.text
  }
  return null
}
async function detect(src: CanvasImageSource, w: number, h: number): Promise<string | null> {
  if (NATIVE) {
    try {
      const r = await new NATIVE().detect(src)
      if (r[0]) return r[0].rawValue
    } catch { /* fall back */ }
  }
  const c = document.createElement('canvas')
  const sc = Math.min(1, 1000 / w)
  c.width = Math.round(w * sc)
  c.height = Math.round(h * sc)
  c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height)
  return decodeCanvas(c)
}
/** Renders an EAN-13 to a canvas so the decoder can be tried without a camera. */
function sampleBarcode(code: string): HTMLCanvasElement {
  const bits = encodeEan(code)
  const c = document.createElement('canvas')
  c.width = (bits.length + 20) * 3
  c.height = 120
  const g = c.getContext('2d')!
  g.fillStyle = '#fff'
  g.fillRect(0, 0, c.width, c.height)
  g.fillStyle = '#000'
  ;[...bits].forEach((b, i) => b === '1' && g.fillRect((i + 10) * 3, 10, 3, 100))
  return c
}

export default function PantryInventory() {
  const [s, set, reset] = useToolState('pantry-inventory', DEF)
  const [form, setForm] = useState(BLANK)
  const [msg, setMsg] = useState('')
  const [cam, setCam] = useState(false)
  const [q, setQ] = useState('')
  const [extra, setExtra] = useState('')
  const video = useRef<HTMLVideoElement>(null)
  const onCode = useRef<(c: string) => void>(() => {})

  const handleCode = (code: string) => {
    const known = s.items.find((i) => i.code === code)
    const next = applyScan(s.items, code, s.scanMode === 'add' ? 1 : -1)
    if (next && known) {
      set({ items: next })
      setMsg(`${known.name}: ${s.scanMode === 'add' ? '+1' : '−1'} → ${Math.max(0, known.qty + (s.scanMode === 'add' ? 1 : -1))} ${known.unit}`)
    } else {
      setForm({ ...BLANK, code })
      setMsg(`New barcode ${code}${validGtin(code) ? ' (valid GTIN)' : ''}. Fill in the name below and add it.`)
    }
  }
  useEffect(() => {
    onCode.current = handleCode
  })

  useEffect(() => {
    if (!cam) return
    let stream: MediaStream | null = null
    let stop = false
    let last = ''
    let lastAt = 0
    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
        const v = video.current!
        v.srcObject = stream
        await v.play()
        while (!stop) {
          if (v.videoWidth) {
            const code = await detect(v, v.videoWidth, v.videoHeight)
            if (code && (code !== last || Date.now() - lastAt > 2500)) {
              last = code
              lastAt = Date.now()
              navigator.vibrate?.(60)
              onCode.current(code)
            }
          }
          await new Promise((r) => setTimeout(r, 250))
        }
      } catch {
        setMsg('Camera unavailable or permission denied. Use a photo, the sample, or type the barcode.')
        setCam(false)
      }
    })()
    return () => {
      stop = true
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [cam])

  const edit = (id: string, p: Partial<Item>) => set({ items: s.items.map((i) => (i.id === id ? { ...i, ...p } : i)) })
  const shown = sortItems(s.items, s.sort).filter((i) => (s.place === 'All' || i.place === s.place) && (!q || `${i.name} ${i.cat} ${i.code}`.toLowerCase().includes(q.toLowerCase())))
  const st = s.items.map((i) => status(i.exp, T))
  const expired = st.filter((x) => x === 'expired').length
  const soon = st.filter((x) => x === 'today' || x === 'soon' || x === 'week').length
  const shop = [...shoppingList(s.items, T), ...s.extras.map((name) => ({ name, qty: 1, unit: '', why: 'added', cat: 'Extras' }))]
  const useSoon = sortItems(s.items.filter((i) => ['today', 'soon'].includes(status(i.exp, T)) && i.qty > 0), 'expiry')
  const addItem = () => {
    if (!form.name.trim()) return setMsg('Give the item a name first.')
    set({ items: [...s.items, { ...form, id: uid(), name: form.name.trim(), exp: form.exp || addDays(T, SHELF[form.cat] ?? 90) }] })
    setMsg(`Added ${form.name.trim()}.`)
    setForm(BLANK)
  }

  return (
    <Split>
      <div>
        <Panel title="Scan a barcode">
          <Seg value={s.scanMode} onChange={(scanMode) => set({ scanMode })} options={[['add', 'Scan adds +1'], ['use', 'Scan uses −1']]} />
          <div style={{ position: 'relative', margin: '10px 0', display: cam ? 'block' : 'none' }}>
            <video ref={video} muted playsInline style={{ width: '100%', borderRadius: 10, background: '#000' }} />
            <div style={{ position: 'absolute', left: '8%', right: '8%', top: '50%', height: 2, background: '#ef4444', boxShadow: '0 0 6px #ef4444' }} />
          </div>
          <Row>
            <Btn kind={cam ? 'danger' : 'primary'} disabled={!navigator.mediaDevices?.getUserMedia} onClick={() => setCam(!cam)}>{cam ? '■ Stop camera' : '📷 Camera'}</Btn>
            <Btn onClick={async () => { const c = sampleBarcode('4006381333931'); const code = await detect(c, c.width, c.height); if (code) handleCode(code) }} title="Decodes a generated EAN-13 image">Try sample scan</Btn>
          </Row>
          <FileDrop accept="image/*" label="…or drop a photo of a barcode" onFiles={async ([f]) => {
            const bmp = await createImageBitmap(f)
            const code = await detect(bmp, bmp.width, bmp.height)
            if (code) handleCode(code)
            else setMsg('No barcode found. Try a sharper, straight-on photo with the bars horizontal.')
          }} />
          {msg && <Note tone="ok">{msg}</Note>}
          <p className="muted" style={{ fontSize: 12 }}>{NATIVE ? 'Using the native BarcodeDetector.' : 'No native BarcodeDetector: using the built-in EAN-13 / UPC-A / EAN-8 / Code 128 decoder.'} Known barcodes adjust stock; new ones open the form below.</p>
        </Panel>
        <Panel title="Add item">
          <Txt label="Name" value={form.name} onChange={(name) => setForm({ ...form, name })} placeholder="e.g. Oat milk" />
          <Row>
            <Select label="Category" value={form.cat} onChange={(cat) => setForm({ ...form, cat })} options={CATS} />
            <Select label="Stored in" value={form.place} onChange={(place) => setForm({ ...form, place })} options={PLACES} />
          </Row>
          <Row>
            <Num label="Quantity" value={form.qty} onChange={(qty) => setForm({ ...form, qty: Math.max(0, qty) })} min={0} />
            <Txt label="Unit" value={form.unit} onChange={(unit) => setForm({ ...form, unit })} />
            <Num label="Restock at" value={form.min} onChange={(min) => setForm({ ...form, min: Math.max(0, min) })} min={0} />
          </Row>
          <Row>
            <Txt label="Best before" type="date" value={form.exp} onChange={(exp) => setForm({ ...form, exp })} hint={form.exp ? '' : `Blank = typical ${form.cat.toLowerCase()} shelf life (${SHELF[form.cat]} days)`} />
            <Txt label="Barcode" value={form.code} onChange={(code) => setForm({ ...form, code: code.trim() })} placeholder="optional" />
          </Row>
          <Btn kind="primary" onClick={addItem}>+ Add to inventory</Btn>
        </Panel>
        <Panel title={`Shopping list (${shop.length})`} actions={<><CopyButton text={() => shoppingText(shop)} /><CsvButton name="shopping-list.csv" rows={() => [['Item', 'Qty', 'Unit', 'Reason', 'Category'], ...shop.map((l) => [l.name, l.qty, l.unit, l.why, l.cat])]} /></>}>
          {shop.length === 0 && <Note tone="ok">Nothing is low or expired.</Note>}
          {shop.map((l) => {
            const got = s.got.includes(l.name)
            return (
              <label key={l.cat + l.name} className="k-check" style={{ display: 'flex', opacity: got ? 0.5 : 1 }}>
                <input type="checkbox" checked={got} onChange={() => set({ got: got ? s.got.filter((n) => n !== l.name) : [...s.got, l.name] })} />
                <span style={{ flex: 1, textDecoration: got ? 'line-through' : undefined }}>{l.name} <b>{l.qty} {l.unit}</b></span>
                <span className="muted" style={{ fontSize: 12 }}>{l.why}</span>
                {l.cat === 'Extras' && <button type="button" className="k-btn ghost" style={{ padding: '0 6px' }} onClick={() => set({ extras: s.extras.filter((x) => x !== l.name) })}>✕</button>}
              </label>
            )
          })}
          <Row>
            <Txt label="Add to list" value={extra} onChange={setExtra} placeholder="e.g. Coffee filters" />
            <Btn onClick={() => { if (extra.trim()) set({ extras: [...s.extras, extra.trim()] }); setExtra('') }}>Add</Btn>
            {s.got.length > 0 && <Btn kind="ghost" onClick={() => set({ got: [], extras: s.extras.filter((x) => !s.got.includes(x)) })}>Clear ticked</Btn>}
          </Row>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Items" value={s.items.length} sub={`${s.items.reduce((a, i) => a + (i.qty > 0 ? 1 : 0), 0)} in stock`} />
          <Stat label="Expiring ≤ 7 days" value={soon} tone={soon ? 'accent' : undefined} />
          <Stat label="Expired" value={expired} tone={expired ? 'bad' : 'good'} />
          <Stat label="To buy" value={shop.length} />
        </Stats>
        {useSoon.length > 0 && <Note tone="warn">Use soon: {useSoon.map((i) => `${i.name} (${daysLeft(i.exp, T) === 0 ? 'today' : `${daysLeft(i.exp, T)} d`})`).join(', ')}.</Note>}
        <Panel title="Inventory" actions={<><CsvButton name="pantry.csv" rows={() => [['Name', 'Category', 'Location', 'Qty', 'Unit', 'Restock at', 'Best before', 'Days left', 'Barcode'], ...sortItems(s.items, s.sort).map((i) => [i.name, i.cat, i.place, i.qty, i.unit, i.min, i.exp, daysLeft(i.exp, T) ?? '', i.code])]} /><JsonButtons name="pantry.json" data={s} onLoad={(d) => d && Array.isArray(d.items) && set({ ...DEF, ...d })} /><Btn kind="ghost" onClick={reset}>Reset</Btn></>}>
          <Row>
            <Seg value={s.place} onChange={(place) => set({ place })} options={[['All', 'All'], ...PLACES.map((p) => [p, p] as [string, string])]} />
            <Select label="Sort by" value={s.sort} onChange={(sort) => set({ sort })} options={[['expiry', 'Expiry date'], ['name', 'Name'], ['cat', 'Category'], ['place', 'Location']]} />
            <Txt label="Search" value={q} onChange={setQ} placeholder="name, category, barcode" />
          </Row>
          <Table
            head={['Status', 'Item', 'Qty', 'Best before', '']}
            rows={shown.map((i) => {
              const stt = status(i.exp, T)
              const d = daysLeft(i.exp, T)
              const [c, word] = TONE[stt]
              return [
                <span key="s" style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 700, color: '#fff', background: c, whiteSpace: 'nowrap' }}>{stt === 'none' || stt === 'ok' ? word : d! < 0 ? `${-d!} d ago` : word}</span>,
                <div key="n"><b>{i.name}</b><div className="muted" style={{ fontSize: 12 }}>{i.cat} · {i.place}{i.code ? ` · ${i.code}` : ''}</div></div>,
                <span key="q" style={{ whiteSpace: 'nowrap', color: i.qty <= i.min ? 'var(--warn)' : undefined }}>
                  <button type="button" className="k-btn ghost" style={{ padding: '0 7px' }} onClick={() => edit(i.id, { qty: Math.max(0, i.qty - 1) })} aria-label="Use one">−</button>
                  <b> {i.qty} </b>{i.unit}
                  <button type="button" className="k-btn ghost" style={{ padding: '0 7px' }} onClick={() => edit(i.id, { qty: i.qty + 1 })} aria-label="Add one">+</button>
                </span>,
                <input key="e" type="date" value={i.exp} onChange={(e) => edit(i.id, { exp: e.target.value })} aria-label="Best before" />,
                <Btn key="x" kind="ghost" onClick={() => set({ items: s.items.filter((x) => x.id !== i.id) })} title="Remove">✕</Btn>,
              ]
            })}
          />
          {shown.length === 0 && <p className="muted">No items match.</p>}
        </Panel>
        <Note>Tip: scan in “uses −1” mode while cooking and items drop onto the shopping list automatically when they reach their restock level. Everything stays in this browser; use Backup to move it to another device.</Note>
      </div>
    </Split>
  )
}
