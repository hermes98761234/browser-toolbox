import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, Btn, CsvButton, FileDrop, Note, Num, Panel, Row, Seg, Split, Stat, Stats, Table, Txt, download, money, num, today, uid, useToolState } from '../kit'
import { dueFor, kmPerMonth, SCHEDULE, type Item, type Rec, type Status } from './lib/car-maintenance-tracker'

interface Vehicle { id: string; name: string; odo: number; unit: 'km' | 'mi'; since: string; schedule: Item[] }
interface State { vehicles: Vehicle[]; sel: string; records: Rec[]; currency: string }

// ---------- receipt photos in IndexedDB (too big for localStorage) ----------
const DB = 'tb-car-maintenance'
function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore('photos')
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
async function photoOp<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await idb()
  return new Promise((res, rej) => {
    const req = fn(db.transaction('photos', mode).objectStore('photos'))
    req.onsuccess = () => res(req.result as T)
    req.onerror = () => rej(req.error)
  })
}
const putPhoto = (id: string, b: Blob) => photoOp<void>('readwrite', (s) => s.put(b, id))
const getPhoto = (id: string) => photoOp<Blob | undefined>('readonly', (s) => s.get(id))
const delPhoto = (id: string) => photoOp<void>('readwrite', (s) => s.delete(id))

async function shrink(file: File, max = 1200): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * k)
  c.height = Math.round(bmp.height * k)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  return new Promise((res) => c.toBlob((b) => res(b ?? file), 'image/jpeg', 0.75))
}
const xml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const demoReceipt = (r: Rec, items: string, cur: string) => 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="320"><rect width="240" height="320" fill="#fffef6"/><text x="120" y="34" font-family="monospace" font-size="15" text-anchor="middle" font-weight="bold">${xml(r.shop)}</text>` +
  `<text x="16" y="70" font-family="monospace" font-size="11">Date: ${r.date}</text><text x="16" y="88" font-family="monospace" font-size="11">Odometer: ${r.odo}</text>` +
  items.split(', ').map((t, i) => `<text x="16" y="${120 + i * 18}" font-family="monospace" font-size="11">- ${xml(t.slice(0, 28))}</text>`).join('') +
  `<line x1="16" x2="224" y1="270" y2="270" stroke="#333" stroke-dasharray="3 3"/><text x="16" y="292" font-family="monospace" font-size="14" font-weight="bold">TOTAL ${cur}${r.cost.toFixed(2)}</text></svg>`)

// ---------- sample data ----------
const ago = (months: number) => {
  const d = new Date()
  d.setDate(d.getDate() - Math.round(months * 30.4375))
  return d.toISOString().slice(0, 10)
}
const R = (mo: number, odo: number, items: string[], cost: number, shop: string, note = '', id = uid()): Rec => ({ id, vehicle: 'car1', date: ago(mo), odo, items, cost, shop, note })
const DEF: State = {
  currency: '$', sel: 'car1',
  vehicles: [{ id: 'car1', name: '2021 Toyota Corolla', odo: 68400, unit: 'km', since: ago(48), schedule: SCHEDULE }],
  records: [
    R(40, 14000, ['oil', 'rotate'], 89, 'QuickLube'),
    R(30, 27500, ['oil', 'rotate', 'cabin', 'brakes'], 214, 'Toyota dealer', 'Front pads at 60 %'),
    R(20, 41000, ['oil', 'rotate', 'bfluid', 'air'], 265, 'Toyota dealer'),
    { ...R(11, 54000, ['oil', 'rotate', 'cabin', 'brakes', 'battery', 'wipers'], 298, 'Corner Garage', 'Replaced rear wiper too', 'demo-receipt'), photo: true },
    R(3, 65000, ['oil', 'rotate'], 132, 'Corner Garage'),
  ],
}

const TONE: Record<Status, string> = { overdue: 'var(--err)', soon: 'var(--warn)', ok: 'var(--ok)', unknown: 'var(--muted)' }
const LABEL: Record<Status, string> = { overdue: 'Overdue', soon: 'Due soon', ok: 'OK', unknown: '—' }

export default function CarMaintenanceTracker() {
  const [s, set, reset] = useToolState('car-maintenance-tracker', DEF)
  const v = s.vehicles.find((x) => x.id === s.sel) ?? s.vehicles[0]
  const recs = useMemo(() => s.records.filter((r) => r.vehicle === v?.id).sort((a, b) => b.date.localeCompare(a.date)), [s.records, v?.id])
  const now = today()
  const [form, setForm] = useState({ date: now, odo: v?.odo ?? 0, items: ['oil'] as string[], cost: 0, shop: '', note: '' })
  const [file, setFile] = useState<File | null>(null)
  const [view, setView] = useState<{ url: string; title: string } | null>(null)
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [showSched, setShowSched] = useState(false)

  // object URLs for stored receipt photos
  useEffect(() => {
    let alive = true
    const urls: string[] = []
    void (async () => {
      const out: Record<string, string> = {}
      for (const r of recs.filter((x) => x.photo)) {
        try {
          const b = await getPhoto(r.id)
          if (b) urls.push((out[r.id] = URL.createObjectURL(b)))
        } catch {
          /* IndexedDB unavailable */
        }
      }
      if (alive) setThumbs(out)
    })()
    return () => {
      alive = false
      urls.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [recs])

  if (!v) return <Note>No vehicle.</Note>
  const u = v.unit
  const rate = kmPerMonth(recs, v.odo, now)
  const dues = v.schedule.map((it) => dueFor(it, recs, v.odo, now, rate, v.since)).sort((a, b) => {
    const o = { overdue: 0, soon: 1, ok: 2, unknown: 3 }
    return o[a.status] - o[b.status] || (a.eta ?? '9').localeCompare(b.eta ?? '9')
  })
  const overdue = dues.filter((d) => d.status === 'overdue')
  const upcoming = dues.find((d) => d.status !== 'overdue' && d.eta)
  const soon = dues.filter((d) => d.status === 'soon')
  const spent = recs.reduce((a, r) => a + r.cost, 0)
  const name = (id: string) => v.schedule.find((i) => i.id === id)?.name ?? id
  const m = (x: number) => money(x, s.currency, 0)
  const setV = (p: Partial<Vehicle>) => set({ vehicles: s.vehicles.map((x) => (x.id === v.id ? { ...x, ...p } : x)) })
  const years = [...new Set(recs.map((r) => r.date.slice(0, 4)))].sort()

  const save = async () => {
    if (!form.items.length || !form.date) return
    const r: Rec = { id: uid(), vehicle: v.id, ...form, photo: !!file }
    if (file) {
      try {
        await putPhoto(r.id, await shrink(file))
      } catch {
        r.photo = false
      }
    }
    set((x) => ({
      ...x, records: [...x.records, r],
      vehicles: x.vehicles.map((y) => (y.id === v.id && form.odo > y.odo ? { ...y, odo: form.odo } : y)),
    }))
    setForm({ ...form, items: [], cost: 0, note: '' })
    setFile(null)
  }
  const backup = async () => {
    const photos: Record<string, string> = {}
    for (const r of s.records.filter((x) => x.photo))
      try {
        const b = await getPhoto(r.id)
        if (b) photos[r.id] = await new Promise<string>((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.readAsDataURL(b) })
      } catch { /* skip */ }
    download('car-maintenance.json', JSON.stringify({ ...s, photos }, null, 1), 'application/json')
  }
  const restore = async (f: File) => {
    try {
      const d = JSON.parse(await f.text()) as State & { photos?: Record<string, string> }
      for (const [id, url] of Object.entries(d.photos ?? {})) await putPhoto(id, await (await fetch(url)).blob())
      delete d.photos
      set(d)
    } catch { /* invalid file */ }
  }

  return (
    <div>
      <Row>
        <Seg value={v.id} onChange={(sel) => set({ sel })} options={s.vehicles.map((x) => [x.id, x.name] as const)} />
        <Btn onClick={() => { const id = uid(); set({ vehicles: [...s.vehicles, { id, name: 'New vehicle', odo: 0, unit: 'km', since: now, schedule: SCHEDULE }], sel: id }) }}>+ Vehicle</Btn>
      </Row>
      <Stats>
        <Stat label="Odometer" value={`${num(v.odo, 0)} ${u}`} sub={rate ? `≈ ${num(rate, 0)} ${u}/month` : 'log services to estimate usage'} />
        <Stat label="Overdue" value={overdue.length} tone={overdue.length ? 'bad' : 'good'} sub={soon.length ? `${soon.length} due soon` : 'nothing due soon'} />
        <Stat label="Next service" value={upcoming?.item.name ?? '—'} sub={upcoming?.eta && `≈ ${upcoming.eta}`} />
        <Stat label="Spent" value={m(spent)} sub={v.odo ? `${money(spent / v.odo, s.currency, 3)} per ${u} · ${recs.length} visits` : ''} tone="accent" />
      </Stats>
      {overdue.length > 0 && <Note tone="err">⚠ Overdue: {overdue.map((d) => d.item.name).join(', ')}.</Note>}
      <Split wide="right">
        <div>
          <Panel title="Vehicle">
            <Txt label="Name" value={v.name} onChange={(name) => setV({ name })} />
            <Row>
              <Num label="Current odometer" unit={u} min={0} value={v.odo} onChange={(odo) => setV({ odo })} />
              <Seg value={u} onChange={(unit) => setV({ unit, schedule: v.schedule.map((i) => ({ ...i, km: Math.round((unit === 'mi' ? i.km / 1.609344 : i.km * 1.609344) / 500) * 500 })) })} options={[['km', 'km'], ['mi', 'mi']]} />
            </Row>
            <Txt label="In service since" type="date" value={v.since} onChange={(since) => setV({ since })} />
          </Panel>
          <Panel title="Log a service">
            <Row>
              <Txt label="Date" type="date" value={form.date} onChange={(date) => setForm({ ...form, date })} />
              <Num label="Odometer" unit={u} min={0} value={form.odo} onChange={(odo) => setForm({ ...form, odo })} />
            </Row>
            <div className="k-label" style={{ marginBottom: 4 }}>Work done</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {v.schedule.map((i) => {
                const on = form.items.includes(i.id)
                return <button key={i.id} type="button" onClick={() => setForm({ ...form, items: on ? form.items.filter((x) => x !== i.id) : [...form.items, i.id] })}
                  style={{ borderRadius: 999, padding: '4px 10px', fontSize: 13, cursor: 'pointer', border: `1px solid ${on ? 'var(--accent)' : 'var(--line)'}`, background: on ? 'var(--accent)' : 'var(--panel)', color: on ? 'var(--on-accent)' : 'var(--fg)' }}>{i.name}</button>
              })}
            </div>
            <Row>
              <Num label="Cost" unit={s.currency} min={0} value={form.cost} onChange={(cost) => setForm({ ...form, cost })} />
              <Txt label="Shop" value={form.shop} onChange={(shop) => setForm({ ...form, shop })} />
            </Row>
            <Txt label="Notes" value={form.note} onChange={(note) => setForm({ ...form, note })} />
            <FileDrop accept="image/*" onFiles={(f) => setFile(f[0])} label={file ? `📎 ${file.name}` : 'Attach a receipt photo (optional)'} />
            <Btn kind="primary" disabled={!form.items.length} onClick={() => void save()}>Save service</Btn>
          </Panel>
          <Panel title="Data" actions={<Btn kind="ghost" onClick={reset}>Reset sample</Btn>}>
            <Row>
              <Btn onClick={() => void backup()}>⬇ Backup (with photos)</Btn>
              <label className="k-btn">⬆ Restore<input type="file" accept=".json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void restore(f) }} /></label>
              <CsvButton name="service-history.csv" rows={() => [['Vehicle', 'Date', `Odometer (${u})`, 'Work', 'Cost', 'Shop', 'Notes'], ...recs.map((r) => [v.name, r.date, r.odo, r.items.map(name).join('; '), r.cost, r.shop, r.note])]} />
            </Row>
            <p className="muted">Records stay in this browser (receipt photos in IndexedDB). Use Backup to move them to another device.</p>
          </Panel>
        </div>
        <div>
          <Panel title="Upcoming maintenance" actions={<Btn kind="ghost" onClick={() => setShowSched(!showSched)}>{showSched ? 'Done editing' : '⚙ Edit intervals'}</Btn>}>
            {showSched ? (
              <Table head={['Item', `Every (${u})`, 'Every (months)', '']} rows={v.schedule.map((i) => [
                <input key="n" value={i.name} onChange={(e) => setV({ schedule: v.schedule.map((x) => (x.id === i.id ? { ...x, name: e.target.value } : x)) })} aria-label="Item" />,
                <input key="k" type="number" min={0} style={{ width: 90 }} value={i.km} onChange={(e) => setV({ schedule: v.schedule.map((x) => (x.id === i.id ? { ...x, km: Math.max(0, Number(e.target.value) || 0) } : x)) })} aria-label="Distance interval" />,
                <input key="m" type="number" min={0} style={{ width: 70 }} value={i.months} onChange={(e) => setV({ schedule: v.schedule.map((x) => (x.id === i.id ? { ...x, months: Math.max(0, Number(e.target.value) || 0) } : x)) })} aria-label="Months interval" />,
                <Btn key="x" kind="ghost" onClick={() => setV({ schedule: v.schedule.filter((x) => x.id !== i.id) })}>✕</Btn>,
              ])} foot={[<Btn key="a" onClick={() => setV({ schedule: [...v.schedule, { id: uid(), name: 'New item', km: 10000, months: 12 }] })}>+ Item</Btn>, '', '', '']} />
            ) : (
              <Table head={['Item', 'Status', 'Due at', 'Left', 'Last done']} rows={dues.map((d) => {
                const frac = d.kmLeft !== undefined && d.item.km ? 1 - d.kmLeft / d.item.km : d.daysLeft !== undefined && d.item.months ? 1 - d.daysLeft / (d.item.months * 30.4) : 0
                return [
                  <b key="n">{d.item.name}</b>,
                  <span key="s" style={{ color: TONE[d.status], fontWeight: 700 }}>{LABEL[d.status]}</span>,
                  <span key="d">{d.dueOdo !== undefined && `${num(d.dueOdo, 0)} ${u}`}{d.dueOdo !== undefined && d.dueDate && <br />}{d.dueDate && <span className="muted">{d.dueDate}</span>}</span>,
                  <div key="l" style={{ minWidth: 110 }}>
                    <div style={{ fontSize: 12.5 }}>{d.kmLeft !== undefined && `${num(d.kmLeft, 0)} ${u}`}{d.kmLeft !== undefined && d.daysLeft !== undefined && ' · '}{d.daysLeft !== undefined && `${d.daysLeft} d`}</div>
                    <Bar value={Math.max(0, Math.min(1, frac))} color={TONE[d.status]} />
                  </div>,
                  d.last ? <span key="ld">{d.last.date}<br /><span className="muted">{num(d.last.odo, 0)} {u}</span></span> : <span key="ld" className="muted">never logged</span>,
                ]
              })} />
            )}
          </Panel>
          <Panel title="Service history">
            <Table max={15} head={['Date', 'Odometer', 'Work', 'Cost', 'Receipt', '']} rows={recs.map((r) => {
              const url = r.photo ? thumbs[r.id] ?? (r.id === 'demo-receipt' ? demoReceipt(r, r.items.map(name).join(', '), s.currency) : undefined) : undefined
              return [
                r.date, `${num(r.odo, 0)}`,
                <span key="w" style={{ display: 'block', minWidth: 180, maxWidth: 300, whiteSpace: 'normal' }}>{r.items.map(name).join(', ')}{r.shop && <><br /><span className="muted">{r.shop}{r.note && ` · ${r.note}`}</span></>}</span>,
                m(r.cost),
                url ? <img key="p" src={url} alt="Receipt" onClick={() => setView({ url, title: `${r.date} · ${r.shop}` })} style={{ width: 40, height: 52, objectFit: 'cover', borderRadius: 4, cursor: 'zoom-in', border: '1px solid var(--line)' }} /> : '',
                <Btn key="x" kind="ghost" title="Delete" onClick={() => { set({ records: s.records.filter((x) => x.id !== r.id) }); if (r.photo) void delPhoto(r.id).catch(() => undefined) }}>✕</Btn>,
              ]
            })} />
          </Panel>
          {years.length > 0 && (
            <Panel title="Spending per year">
              <BarChart height={200} fy={(x) => m(x)} bars={years.map((y) => ({ label: y, value: recs.filter((r) => r.date.startsWith(y)).reduce((a, r) => a + r.cost, 0) }))} />
            </Panel>
          )}
        </div>
      </Split>
      {view && (
        <div onClick={() => setView(null)} role="dialog" aria-label="Receipt" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'grid', placeItems: 'center', zIndex: 50, cursor: 'zoom-out', padding: 16 }}>
          <figure style={{ margin: 0, textAlign: 'center', color: '#fff' }}>
            <img src={view.url} alt="Receipt" style={{ maxWidth: '92vw', maxHeight: '82vh', background: '#fff', borderRadius: 6 }} />
            <figcaption>{view.title}</figcaption>
          </figure>
        </div>
      )}
    </div>
  )
}
