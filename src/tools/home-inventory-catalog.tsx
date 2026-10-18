import { useEffect, useMemo, useState } from 'react'
import { Btn, CsvButton, Donut, download, FileDrop, money, Note, Num, Panel, pct, Row, Select, Split, Stat, Stats, Txt, Area, uid, useToolState, Bar } from '../kit'
import { completeness, csvRows, groupBy, itemTotal, pdfSafe, search, wrap, type Item } from './lib/home-inventory-catalog'

// ---------- photo store (IndexedDB, downscaled JPEG blobs) ----------
const DB = 'tb-home-inventory'
function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore('photos')
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
async function op<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await idb()
  return new Promise((res, rej) => {
    const req = fn(db.transaction('photos', mode).objectStore('photos'))
    req.onsuccess = () => res(req.result as T)
    req.onerror = () => rej(req.error)
  })
}
const putPhoto = (id: string, b: Blob) => op<void>('readwrite', (s) => s.put(b, id))
const getPhoto = (id: string) => op<Blob | undefined>('readonly', (s) => s.get(id))
const delPhoto = (id: string) => op<void>('readwrite', (s) => s.delete(id))

const toJpeg = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('encode'))), 'image/jpeg', 0.78))
async function shrink(file: Blob, max = 1024): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * k)
  c.height = Math.round(bmp.height * k)
  const g = c.getContext('2d')!
  g.fillStyle = '#fff'
  g.fillRect(0, 0, c.width, c.height)
  g.drawImage(bmp, 0, 0, c.width, c.height)
  return toJpeg(c)
}
/** Demo photo drawn in code so sample items have pictures. */
function demoPhoto(name: string, icon: string, hue: number): Promise<Blob> {
  const c = document.createElement('canvas')
  c.width = 480
  c.height = 360
  const g = c.getContext('2d')!
  const gr = g.createLinearGradient(0, 0, 480, 360)
  gr.addColorStop(0, `hsl(${hue} 60% 78%)`)
  gr.addColorStop(1, `hsl(${hue + 40} 55% 52%)`)
  g.fillStyle = gr
  g.fillRect(0, 0, 480, 360)
  g.font = '140px system-ui, "Noto Color Emoji", sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(icon, 240, 160)
  g.fillStyle = 'rgba(0,0,0,.55)'
  g.fillRect(0, 300, 480, 60)
  g.fillStyle = '#fff'
  g.font = 'bold 28px system-ui, sans-serif'
  g.fillText(name, 240, 330)
  return toJpeg(c)
}
const blobToDataUrl = (b: Blob) => new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(b) })

const ROOMS = ['Living room', 'Kitchen', 'Bedroom', 'Office', 'Garage', 'Bathroom', 'Basement', 'Garden']
const CATS = ['Electronics', 'Furniture', 'Appliances', 'Jewelry', 'Tools', 'Clothing', 'Art & decor', 'Sports', 'Musical instruments', 'Other']
const ICON: Record<string, string> = { Electronics: '📺', Furniture: '🛋️', Appliances: '🧊', Jewelry: '💍', Tools: '🧰', Clothing: '🧥', 'Art & decor': '🖼️', Sports: '🚲', 'Musical instruments': '🎸', Other: '📦' }

const mk = (id: string, name: string, room: string, category: string, value: number, paid: number, brand: string, serial: string, purchased: string, qty = 1, notes = ''): Item =>
  ({ id, name, room, category, value, paid, brand, serial, purchased, qty, notes, photos: [`demo-${id}`] })
const SAMPLE: Item[] = [
  mk('tv', '65" OLED TV', 'Living room', 'Electronics', 1600, 1899, 'Sample Vision X65', 'SV65-118342', '2023-11-24'),
  mk('sofa', 'Three-seat sofa', 'Living room', 'Furniture', 1200, 1450, 'Linen, grey', '', '2021-05-02'),
  mk('fridge', 'Fridge-freezer', 'Kitchen', 'Appliances', 950, 1100, 'CoolLine 400', 'CL4-99812', '2022-03-15'),
  mk('mixer', 'Stand mixer', 'Kitchen', 'Appliances', 380, 420, 'BakePro 5', 'BP5-2231', '2020-12-10'),
  mk('ring', 'Engagement ring', 'Bedroom', 'Jewelry', 3200, 2800, '0.7 ct, white gold', 'Appraisal #A-5521', '2019-08-01', 1, 'Appraisal certificate in the safe'),
  mk('laptop', 'Laptop', 'Office', 'Electronics', 1300, 1700, 'Ultrabook 14', 'UB14-77K2', '2024-02-20'),
  mk('chair', 'Office chair', 'Office', 'Furniture', 450, 520, 'Ergo Mesh', '', '2022-09-09'),
  mk('bike', 'Road bike', 'Garage', 'Sports', 1100, 1500, 'Carbon frame, 56 cm', 'WTU123456', '2021-04-18'),
  mk('tools', 'Cordless tool kit', 'Garage', 'Tools', 520, 600, '18 V, 5 tools', '', '2023-06-30'),
  mk('guitar', 'Acoustic guitar', 'Living room', 'Musical instruments', 700, 650, 'Dreadnought', 'GT-0099812', '2018-10-05'),
]
const DEF = { currency: '$', owner: 'My home', items: SAMPLE, sel: 'tv', q: '', room: '', group: 'room' as 'room' | 'category' }
type State = typeof DEF

async function buildPdf(s: State, date: string): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const cur = pdfSafe(s.currency)
  const mm = (x: number) => `${cur}${Math.round(x).toLocaleString('en-US')}`
  const W = 595, H = 842, M = 40
  let page = doc.addPage([W, H])
  let y = H - M
  const text = (t: string, x: number, yy: number, size = 10, f = font, c = rgb(0.1, 0.1, 0.12)) => page.drawText(pdfSafe(t), { x, y: yy, size, font: f, color: c })
  const newPage = () => { page = doc.addPage([W, H]); y = H - M }
  text('Home Inventory Report', M, y - 6, 22, bold)
  y -= 30
  text(`${s.owner} · generated ${date} · ${s.items.length} entries · total value ${mm(s.items.reduce((a, i) => a + itemTotal(i), 0))}`, M, y, 10, font, rgb(0.35, 0.35, 0.4))
  y -= 26
  for (const g of groupBy(s.items, 'room')) {
    text(`${g.name}: ${mm(g.value)} (${g.count} items)`, M + 10, y, 11)
    y -= 15
  }
  y -= 10
  for (const g of groupBy(s.items, 'room')) {
    if (y < M + 110) newPage()
    page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 22, color: rgb(0.92, 0.93, 0.98) })
    text(`${g.name}`, M + 8, y, 13, bold)
    text(mm(g.value), W - M - 8 - bold.widthOfTextAtSize(pdfSafe(mm(g.value)), 13), y, 13, bold)
    y -= 30
    for (const it of g.items) {
      if (y < M + 80) newPage()
      const top = y + 10
      const k = it.photos[0]
      const b = k ? await getPhoto(k).catch(() => undefined) : undefined
      if (b) {
        const img = await doc.embedJpg(new Uint8Array(await b.arrayBuffer()))
        const sc = Math.min(70 / img.width, 70 / img.height)
        page.drawImage(img, { x: M + (70 - img.width * sc) / 2, y: top - 70 + (70 - img.height * sc) / 2, width: img.width * sc, height: img.height * sc })
      } else {
        page.drawRectangle({ x: M, y: top - 70, width: 70, height: 70, borderColor: rgb(0.8, 0.8, 0.85), borderWidth: 1 })
        text('no photo', M + 14, top - 38, 8, font, rgb(0.6, 0.6, 0.65))
      }
      const x = M + 84
      text(`${it.name}${it.qty > 1 ? ` × ${it.qty}` : ''}`, x, top - 10, 11, bold)
      const val = mm(itemTotal(it))
      text(val, W - M - bold.widthOfTextAtSize(pdfSafe(val), 11), top - 10, 11, bold)
      const meta = [it.category, it.brand, it.serial && `S/N ${it.serial}`, it.purchased && `bought ${it.purchased}`, it.paid > 0 && `paid ${mm(it.paid)}`, `${it.photos.length} photo(s)`].filter(Boolean).join(' · ')
      let ly = top - 25
      for (const line of wrap(pdfSafe(meta), W - M - x, (t) => font.widthOfTextAtSize(t, 9)).slice(0, 2)) { text(line, x, ly, 9, font, rgb(0.3, 0.3, 0.35)); ly -= 12 }
      for (const line of wrap(pdfSafe(it.notes), W - M - x, (t) => font.widthOfTextAtSize(t, 9)).slice(0, 2)) { text(line, x, ly, 9, font, rgb(0.45, 0.45, 0.5)); ly -= 12 }
      y = top - 84
      page.drawLine({ start: { x: M, y: y + 6 }, end: { x: W - M, y: y + 6 }, thickness: 0.5, color: rgb(0.88, 0.88, 0.9) })
    }
    y -= 8
  }
  doc.getPages().forEach((p, i, all) => p.drawText(`Page ${i + 1} of ${all.length}`, { x: W - M - 60, y: 20, size: 8, font, color: rgb(0.5, 0.5, 0.55) }))
  return doc.save()
}

export default function HomeInventoryCatalog() {
  const [s, set, reset] = useToolState<State>('home-inventory-catalog', DEF)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const m = (x: number) => money(x, s.currency, 0)
  const sel = s.items.find((i) => i.id === s.sel)
  const shown = search(s.items, s.q, s.room)
  const groups = groupBy(shown, s.group)
  const total = s.items.reduce((a, i) => a + itemTotal(i), 0)
  const comp = completeness(s.items)
  const photoKeys = useMemo(() => s.items.flatMap((i) => i.photos), [s.items])

  // Load object URLs for every photo key (creating demo photos on first run).
  useEffect(() => {
    let alive = true
    const made: string[] = []
    void (async () => {
      const next: Record<string, string> = {}
      for (const k of photoKeys) {
        try {
          let b = await getPhoto(k)
          if (!b && k.startsWith('demo-')) {
            const it = SAMPLE.find((x) => `demo-${x.id}` === k)
            if (it) {
              b = await demoPhoto(it.name, ICON[it.category] ?? '📦', (SAMPLE.indexOf(it) * 37) % 360)
              await putPhoto(k, b)
            }
          }
          if (b) {
            next[k] = URL.createObjectURL(b)
            made.push(next[k])
          }
        } catch {
          if (alive) setErr('Photo storage (IndexedDB) is unavailable in this browser mode; items still save, photos will not.')
        }
      }
      if (alive) setUrls(next)
    })()
    return () => {
      alive = false
      made.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [photoKeys])

  const edit = (id: string, p: Partial<Item>) => set({ items: s.items.map((i) => (i.id === id ? { ...i, ...p } : i)) })
  const add = () => {
    const it: Item = { id: uid(), name: 'New item', room: s.room || ROOMS[0], category: 'Other', brand: '', serial: '', purchased: '', qty: 1, value: 0, paid: 0, notes: '', photos: [] }
    set({ items: [it, ...s.items], sel: it.id })
  }
  const remove = async (it: Item) => {
    if (!confirm(`Delete "${it.name}" and its photos?`)) return
    set({ items: s.items.filter((x) => x.id !== it.id), sel: '' })
    for (const p of it.photos) await delPhoto(p).catch(() => {})
  }
  const addPhotos = async (it: Item, files: File[]) => {
    setBusy('Saving photos…')
    const keys: string[] = []
    for (const f of files) {
      try {
        const k = `p-${uid()}`
        await putPhoto(k, await shrink(f))
        keys.push(k)
      } catch {
        setErr(`Could not read ${f.name}.`)
      }
    }
    set((st) => ({ ...st, items: st.items.map((i) => (i.id === it.id ? { ...i, photos: [...i.photos, ...keys] } : i)) }))
    setBusy('')
  }
  const dropPhoto = (it: Item, k: string) => {
    edit(it.id, { photos: it.photos.filter((p) => p !== k) })
    void delPhoto(k).catch(() => {})
  }

  const backup = async () => {
    setBusy('Packing backup…')
    const photos: Record<string, string> = {}
    for (const k of photoKeys) {
      const b = await getPhoto(k).catch(() => undefined)
      if (b) photos[k] = await blobToDataUrl(b)
    }
    download('home-inventory-backup.json', JSON.stringify({ app: 'home-inventory-catalog', version: 1, state: { ...s, sel: '' }, photos }), 'application/json')
    setBusy('')
  }
  const restore = async (f: File) => {
    try {
      const d = JSON.parse(await f.text()) as { state?: State; photos?: Record<string, string> }
      if (!d.state || !Array.isArray(d.state.items)) throw new Error('bad')
      setBusy('Restoring…')
      for (const [k, url] of Object.entries(d.photos ?? {})) await putPhoto(k, await (await fetch(url)).blob())
      set({ ...DEF, ...d.state })
      setErr('')
    } catch {
      setErr('That file is not a Home Inventory backup.')
    }
    setBusy('')
  }

  const pdf = async () => {
    setBusy('Building PDF…')
    try {
      const bytes = await buildPdf(s, new Date().toLocaleDateString('en-GB'))
      download('home-inventory-report.pdf', new Blob([bytes as BlobPart], { type: 'application/pdf' }))
    } catch (e) {
      setErr(`PDF failed: ${(e as Error).message}`)
    }
    setBusy('')
  }

  return (
    <Split wide="right">
      <div>
        <Panel title={sel ? 'Edit item' : 'Item'} actions={sel && <Btn kind="danger" onClick={() => void remove(sel)}>Delete</Btn>}>
          {!sel ? <Note>Pick an item from the catalog or add a new one.</Note> : (
            <>
              <Txt label="Name" value={sel.name} onChange={(name) => edit(sel.id, { name })} />
              <Row>
                <Select label="Room" value={ROOMS.includes(sel.room) ? sel.room : ROOMS[0]} onChange={(room) => edit(sel.id, { room })} options={ROOMS} />
                <Select label="Category" value={CATS.includes(sel.category) ? sel.category : 'Other'} onChange={(category) => edit(sel.id, { category })} options={CATS} />
              </Row>
              <Row>
                <Txt label="Brand / model" value={sel.brand} onChange={(brand) => edit(sel.id, { brand })} />
                <Txt label="Serial number" value={sel.serial} onChange={(serial) => edit(sel.id, { serial })} />
              </Row>
              <Row>
                <Txt label="Purchase date" type="date" value={sel.purchased} onChange={(purchased) => edit(sel.id, { purchased })} />
                <Num label="Quantity" value={sel.qty} onChange={(qty) => edit(sel.id, { qty: Math.max(0, Math.round(qty)) })} min={0} step={1} />
              </Row>
              <Row>
                <Num label="Price paid (each)" value={sel.paid} onChange={(paid) => edit(sel.id, { paid })} unit={s.currency} min={0} />
                <Num label="Replacement value (each)" value={sel.value} onChange={(value) => edit(sel.id, { value })} unit={s.currency} min={0} />
              </Row>
              <Area label="Notes (where receipts are, condition, appraisal)" value={sel.notes} onChange={(notes) => edit(sel.id, { notes })} rows={2} />
              <div className="k-label">Photos ({sel.photos.length})</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(90px,1fr))', gap: 6, margin: '6px 0' }}>
                {sel.photos.map((k) => (
                  <div key={k} style={{ position: 'relative' }}>
                    {urls[k] ? <img src={urls[k]} alt="" style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 6 }} /> : <div className="muted">…</div>}
                    <button type="button" className="k-btn danger" style={{ position: 'absolute', top: 2, right: 2, padding: '0 6px' }} onClick={() => dropPhoto(sel, k)} aria-label="Remove photo">✕</button>
                  </div>
                ))}
              </div>
              <FileDrop accept="image/*" multiple onFiles={(f) => void addPhotos(sel, f)} label="Add photos (item, serial plate, receipt)" />
            </>
          )}
        </Panel>
        <Panel title="Documentation quality">
          {([['photo', 'Items with photos'], ['serial', 'Items with serial / ID'], ['value', 'Items with a value'], ['receipt', 'Items with purchase date']] as const).map(([k, l]) => (
            <div key={k} style={{ marginBottom: 8 }}>
              <Row wrap={false}><span style={{ flex: 1 }}>{l}</span><b>{pct(comp[k], 0)}</b></Row>
              <Bar value={comp[k]} color={comp[k] >= 0.8 ? 'var(--ok)' : 'var(--warn)'} />
            </div>
          ))}
          <Note>Photograph each item and its serial plate, keep receipts, and store a copy of the PDF report away from home (cloud drive, a relative). Photos stay on this device only.</Note>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Total replacement value" value={m(total)} tone="accent" />
          <Stat label="Items" value={s.items.reduce((a, i) => a + i.qty, 0)} sub={`${s.items.length} entries`} />
          <Stat label="Rooms" value={groupBy(s.items, 'room').length} />
          <Stat label="Photos" value={photoKeys.length} sub="stored in this browser" />
        </Stats>
        {busy && <Note>{busy}</Note>}
        {err && <Note tone="err">{err}</Note>}
        <Panel title="Catalog" actions={
          <>
            <Btn kind="primary" onClick={add}>+ Item</Btn>
            <Btn onClick={() => void pdf()}>⬇ PDF report</Btn>
            <CsvButton name="home-inventory.csv" rows={() => csvRows(s.items)} />
            <Btn onClick={() => void backup()}>⬇ Backup</Btn>
            <label className="k-btn">⬆ Restore<input type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void restore(f) }} /></label>
          </>
        }>
          <Row>
            <Txt label="Search" value={s.q} onChange={(q) => set({ q })} placeholder="name, brand, serial…" />
            <Select label="Room" value={s.room} onChange={(room) => set({ room })} options={[['', 'All rooms'] as [string, string], ...ROOMS.map((r) => [r, r] as [string, string])]} />
            <Select label="Group by" value={s.group} onChange={(group) => set({ group })} options={[['room', 'Room'], ['category', 'Category']]} />
          </Row>
          {groups.length === 0 && <Note>No items match.</Note>}
          {groups.map((g) => (
            <div key={g.name} style={{ marginTop: 12 }}>
              <Row wrap={false}><b style={{ flex: 1 }}>{g.name}</b><span className="muted">{g.count} items · <b>{m(g.value)}</b></span></Row>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 8, marginTop: 6 }}>
                {g.items.map((it) => (
                  <button type="button" key={it.id} onClick={() => set({ sel: it.id })} style={{
                    textAlign: 'left', padding: 0, border: `2px solid ${it.id === s.sel ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 10, overflow: 'hidden', background: 'var(--panel)', color: 'inherit', cursor: 'pointer',
                  }}>
                    {it.photos[0] && urls[it.photos[0]]
                      ? <img src={urls[it.photos[0]]} alt="" style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }} />
                      : <div style={{ aspectRatio: '4/3', display: 'grid', placeItems: 'center', fontSize: 40, background: 'var(--line)' }}>{ICON[it.category] ?? '📦'}</div>}
                    <div style={{ padding: '6px 8px' }}>
                      <div style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</div>
                      <div className="muted" style={{ fontSize: 13 }}>{m(itemTotal(it))}{it.qty > 1 ? ` · ×${it.qty}` : ''}{!it.serial ? ' · no S/N' : ''}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </Panel>
        <Panel title={`Value by ${s.group}`}>
          <Donut slices={groupBy(s.items, s.group).map((g) => ({ label: g.name, value: g.value }))} fv={m} center={<span>{m(total)}</span>} />
          <Row>
            <Txt label="Household / policy name" value={s.owner} onChange={(owner) => set({ owner })} />
            <Select label="Currency" value={s.currency} onChange={(currency) => set({ currency })} options={['$', '€', '£', 'CHF ', 'zł', '₴', '¥']} />
            <Btn kind="ghost" onClick={() => { if (confirm('Reset to the sample catalog? Your items will be replaced.')) reset() }}>Load sample</Btn>
          </Row>
        </Panel>
      </div>
    </Split>
  )
}
