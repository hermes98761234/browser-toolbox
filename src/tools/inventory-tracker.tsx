import { useEffect, useRef, useState } from 'react'
import { Btn, CsvButton, JsonButtons, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, Txt, money, num, today, uid, useToolState } from '../kit'
import { dailyUsage, daysOfCover, findCode, recommendedRop, reorderDate, status, suggestOrder, valuation, type Item, type Move, type Reason, type Status } from './lib/inventory-tracker'

interface State { currency: string; items: Item[]; moves: Move[]; scanMode: 'find' | 'in' | 'out' }

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)
const I = (id: string, sku: string, name: string, category: string, location: string, barcode: string, qty: number, unit: string, rop: number, rq: number, lead: number, cost: number, price: number, supplier: string): Item =>
  ({ id, sku, name, category, location, barcode, qty, unit, reorderPoint: rop, reorderQty: rq, leadDays: lead, cost, price, supplier })
const ITEMS: Item[] = [
  I('i1', 'COF-1KG', 'Espresso beans 1 kg', 'Coffee', 'Shelf A1', '5012345678900', 14, 'bag', 8, 20, 5, 17.5, 32, 'Roastery North'),
  I('i2', 'MLK-OAT', 'Oat milk 1 L', 'Dairy & alt', 'Fridge 2', '7394376616013', 9, 'carton', 12, 36, 3, 1.6, 0, 'FreshCo'),
  I('i3', 'CUP-12', 'Paper cups 12 oz (50)', 'Packaging', 'Store room', '4006381333931', 22, 'sleeve', 10, 30, 7, 3.9, 0, 'PackRight'),
  I('i4', 'LID-12', 'Lids 12 oz (50)', 'Packaging', 'Store room', '4006381333948', 6, 'sleeve', 10, 30, 7, 2.2, 0, 'PackRight'),
  I('i5', 'SYR-VAN', 'Vanilla syrup 750 ml', 'Syrups', 'Shelf B2', '3179730008508', 5, 'bottle', 3, 6, 10, 6.8, 0, 'Sweet Supply'),
  I('i6', 'CRS-BOX', 'Frozen croissants (24)', 'Bakery', 'Freezer', '8410076472885', 0, 'box', 2, 4, 2, 14, 60, 'Bakehouse'),
  I('i7', 'CLN-TAB', 'Machine cleaning tablets', 'Cleaning', 'Shelf C1', '7613035834526', 3, 'tub', 1, 2, 14, 18, 0, 'BaristaPro'),
  I('i8', 'RCP-ROL', 'Receipt paper rolls (10)', 'Office', 'Counter', '0012345678905', 4, 'pack', 2, 3, 7, 7.5, 0, 'OfficeMart'),
  I('i9', 'MUG-LOGO', 'Branded mug', 'Merch', 'Display', '5901234123457', 64, 'pcs', 6, 12, 21, 4.2, 14, 'PrintMug'),
]
function demoMoves(): Move[] {
  const out: Move[] = []
  const plan: [string, number, number][] = [['i1', 3, 2], ['i2', 1, 6], ['i3', 2, 4], ['i4', 2, 4], ['i5', 6, 1], ['i6', 2, 3], ['i8', 9, 1], ['i9', 7, 1]]
  for (const [id, every, n] of plan) for (let d = 28; d >= 1; d -= every) out.push({ id: uid(), itemId: id, date: daysAgo(d), delta: -n, reason: id === 'i9' ? 'sold' : 'used', note: '' })
  out.push({ id: uid(), itemId: 'i1', date: daysAgo(12), delta: 20, reason: 'received', note: 'PO-1042' }, { id: uid(), itemId: 'i2', date: daysAgo(4), delta: 24, reason: 'received', note: 'PO-1047' }, { id: uid(), itemId: 'i9', date: daysAgo(9), delta: -2, reason: 'damaged', note: 'dropped' })
  return out.sort((a, b) => b.date.localeCompare(a.date))
}
const DEF: State = { currency: '$', items: ITEMS, moves: demoMoves(), scanMode: 'find' }

const BADGE: Record<Status, [string, string]> = { out: ['Out', 'var(--err)'], low: ['Low', 'var(--warn)'], ok: ['OK', 'var(--ok)'], over: ['Overstock', '#0ea5e9'] }
type BD = new (o?: { formats?: string[] }) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> }
const detectorClass = () => (window as unknown as { BarcodeDetector?: BD }).BarcodeDetector

const blank = (barcode = ''): Item => ({ id: '', sku: '', name: '', category: '', location: '', barcode, qty: 0, unit: 'pcs', reorderPoint: 5, reorderQty: 10, leadDays: 7, cost: 0, price: 0, supplier: '' })

export default function InventoryTracker() {
  const [s, set, reset] = useToolState('inventory-tracker', DEF)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [only, setOnly] = useState<'all' | 'alerts'>('all')
  const [draft, setDraft] = useState<Item>(s.items[0] ?? blank())
  const [mv, setMv] = useState<{ qty: number; reason: Reason; note: string }>({ qty: 1, reason: 'received', note: '' })
  const [code, setCode] = useState('')
  const [scanMsg, setScanMsg] = useState('')
  const [cam, setCam] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  const m = (x: number) => money(x, s.currency)
  const day = today()
  const isNew = !s.items.some((i) => i.id === draft.id)

  const usage = (id: string) => dailyUsage(s.moves, id, day, 30)
  const addMove = (it: Item, delta: number, reason: Reason, note = '') => {
    set((st) => ({
      ...st,
      items: st.items.map((x) => (x.id === it.id ? { ...x, qty: x.qty + delta } : x)),
      moves: [{ id: uid(), itemId: it.id, date: day, delta, reason, note }, ...st.moves].slice(0, 3000),
    }))
    if (draft.id === it.id) setDraft({ ...draft, qty: draft.qty + delta })
  }

  function handleCode(raw: string) {
    const it = findCode(s.items, raw)
    if (!it) {
      setDraft(blank(raw.trim()))
      setScanMsg(`No item with code ${raw.trim()} — fill in the form to add it.`)
      return
    }
    setDraft(it)
    if (s.scanMode === 'in') addMove(it, 1, 'received', 'scan')
    if (s.scanMode === 'out') addMove(it, -1, 'sold', 'scan')
    setScanMsg(`${it.name}${s.scanMode === 'in' ? ' +1 received' : s.scanMode === 'out' ? ' −1 sold' : ''} → ${it.qty + (s.scanMode === 'in' ? 1 : s.scanMode === 'out' ? -1 : 0)} ${it.unit}`)
  }
  const handleRef = useRef(handleCode)
  useEffect(() => {
    handleRef.current = handleCode
  })

  useEffect(() => {
    if (!cam) return
    const D = detectorClass()
    let stream: MediaStream | undefined, timer = 0, last = '', lastT = 0, stop = false
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (stop || !video.current) return
        video.current.srcObject = stream
        await video.current.play()
        const det = D ? new D({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'] }) : null
        timer = window.setInterval(async () => {
          if (!det || !video.current) return
          const r = await det.detect(video.current).catch(() => [])
          const v = r[0]?.rawValue
          if (v && (v !== last || Date.now() - lastT > 2500)) {
            last = v
            lastT = Date.now()
            setCode(v)
            handleRef.current(v)
          }
        }, 350)
      } catch (e) {
        setScanMsg(`Camera unavailable: ${(e as Error).message}`)
        setCam(false)
      }
    })()
    return () => {
      stop = true
      clearInterval(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [cam])

  const saveDraft = () => {
    if (!draft.name.trim()) return
    if (isNew) {
      const it = { ...draft, id: uid(), sku: draft.sku || `SKU-${s.items.length + 1}` }
      set({ items: [...s.items, it], moves: it.qty ? [{ id: uid(), itemId: it.id, date: day, delta: it.qty, reason: 'received', note: 'opening stock' }, ...s.moves] : s.moves })
      setDraft(it)
    } else set({ items: s.items.map((x) => (x.id === draft.id ? draft : x)) })
  }

  const cats = [...new Set(s.items.map((i) => i.category).filter(Boolean))].sort()
  const alerts = s.items.filter((i) => status(i) === 'out' || status(i) === 'low')
  const val = valuation(s.items)
  const list = s.items
    .filter((i) => (!cat || i.category === cat) && (only === 'all' || alerts.includes(i)))
    .filter((i) => !q || `${i.name} ${i.sku} ${i.barcode} ${i.location} ${i.supplier}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => ['out', 'low', 'ok', 'over'].indexOf(status(a)) - ['out', 'low', 'ok', 'over'].indexOf(status(b)) || a.name.localeCompare(b.name))
  const hist = s.moves.filter((x) => isNew || x.itemId === draft.id).slice(0, 12)
  const nameOf = (id: string) => s.items.find((i) => i.id === id)?.name ?? '(deleted)'
  const fld = (k: keyof Item) => (v: string | number) => setDraft({ ...draft, [k]: v })

  return (
    <Split wide="right">
      <div>
        <Panel title="Scan or type a code">
          <Seg value={s.scanMode} onChange={(scanMode) => set({ scanMode })} options={[['find', 'Look up'], ['in', 'Receive +1'], ['out', 'Sell / use −1']]} />
          <form onSubmit={(e) => { e.preventDefault(); if (code.trim()) handleCode(code); setCode('') }} style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <input className="k-text" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Barcode or SKU, then Enter" aria-label="Barcode or SKU" style={{ flex: 1 }} />
            <button className="k-btn primary" type="submit">Go</button>
          </form>
          <Row>
            <Btn onClick={() => setCam(!cam)}>{cam ? '■ Stop camera' : '📷 Scan with camera'}</Btn>
          </Row>
          {cam && <video ref={video} muted playsInline style={{ width: '100%', borderRadius: 8, background: '#000', maxHeight: 240, objectFit: 'cover' }} />}
          {cam && !detectorClass() && <Note tone="warn">This browser has no BarcodeDetector (Chrome on Android/macOS has it). Use a USB/Bluetooth scanner in the box above — they type the code and press Enter.</Note>}
          {scanMsg && <Note tone="ok">{scanMsg}</Note>}
        </Panel>
        <Panel title={isNew ? 'New item' : `Edit: ${draft.name}`} actions={<Btn onClick={() => setDraft(blank())}>+ New</Btn>}>
          <Txt label="Name" value={draft.name} onChange={fld('name')} />
          <Row>
            <Txt label="SKU" value={draft.sku} onChange={fld('sku')} />
            <Txt label="Barcode" value={draft.barcode} onChange={fld('barcode')} />
          </Row>
          <Row>
            <Txt label="Category" value={draft.category} onChange={fld('category')} />
            <Txt label="Location" value={draft.location} onChange={fld('location')} />
          </Row>
          <Row>
            <Num label={isNew ? 'Opening stock' : 'On hand'} value={draft.qty} onChange={fld('qty')} />
            <Txt label="Unit" value={draft.unit} onChange={fld('unit')} />
          </Row>
          <Row>
            <Num label="Reorder point" value={draft.reorderPoint} onChange={fld('reorderPoint')} min={0} />
            <Num label="Reorder qty" value={draft.reorderQty} onChange={fld('reorderQty')} min={0} />
            <Num label="Lead time" unit="days" value={draft.leadDays} onChange={fld('leadDays')} min={0} />
          </Row>
          <Row>
            <Num label="Unit cost" unit={s.currency} value={draft.cost} onChange={fld('cost')} min={0} />
            <Num label="Sale price" unit={s.currency} value={draft.price} onChange={fld('price')} min={0} />
          </Row>
          <Txt label="Supplier" value={draft.supplier} onChange={fld('supplier')} />
          {!isNew && usage(draft.id) > 0 && recommendedRop(usage(draft.id), draft.leadDays) !== draft.reorderPoint && (
            <Note>Usage is {num(usage(draft.id), 2)} {draft.unit}/day. A reorder point of <b>{recommendedRop(usage(draft.id), draft.leadDays)}</b> covers the {draft.leadDays}-day lead time plus 50 % safety stock.{' '}
              <button type="button" className="k-btn ghost" onClick={() => setDraft({ ...draft, reorderPoint: recommendedRop(usage(draft.id), draft.leadDays) })}>Use it</button></Note>
          )}
          <Row>
            <Btn kind="primary" onClick={saveDraft} disabled={!draft.name.trim()}>{isNew ? 'Add item' : 'Save changes'}</Btn>
            {!isNew && <Btn kind="danger" onClick={() => { set({ items: s.items.filter((x) => x.id !== draft.id) }); setDraft(blank()) }}>Delete</Btn>}
          </Row>
        </Panel>
        {!isNew && (
          <Panel title="Stock movement">
            <Row>
              <Num label="Quantity" value={mv.qty} onChange={(qty) => setMv({ ...mv, qty })} min={0} />
              <Select label="Reason" value={mv.reason} onChange={(reason) => setMv({ ...mv, reason })} options={[['received', 'Received (+)'], ['sold', 'Sold (−)'], ['used', 'Used (−)'], ['damaged', 'Damaged / waste (−)'], ['adjust', 'Count correction (±)']]} />
            </Row>
            <Txt label="Note / PO number" value={mv.note} onChange={(note) => setMv({ ...mv, note })} />
            <Row>
              {mv.reason === 'adjust' ? (
                <>
                  <Btn onClick={() => addMove(draft, mv.qty, 'adjust', mv.note)}>+ Add {mv.qty}</Btn>
                  <Btn onClick={() => addMove(draft, -mv.qty, 'adjust', mv.note)}>− Remove {mv.qty}</Btn>
                </>
              ) : (
                <Btn kind="primary" disabled={mv.qty <= 0} onClick={() => { addMove(draft, mv.reason === 'received' ? mv.qty : -mv.qty, mv.reason, mv.note); setMv({ ...mv, note: '' }) }}>Record {mv.reason}</Btn>
              )}
            </Row>
          </Panel>
        )}
      </div>

      <div>
        <Stats>
          <Stat label="Items" value={s.items.length} sub={`${num(val.units, 0)} units on hand`} />
          <Stat label="Stock value (cost)" value={m(val.cost)} sub={val.retail ? `${m(val.retail)} retail` : undefined} />
          <Stat label="Low stock" value={s.items.filter((i) => status(i) === 'low').length} tone={alerts.length ? 'bad' : 'good'} />
          <Stat label="Out of stock" value={s.items.filter((i) => status(i) === 'out').length} tone={s.items.some((i) => status(i) === 'out') ? 'bad' : 'good'} />
        </Stats>
        {alerts.length > 0 && (
          <Panel title={`⚠ Reorder now (${alerts.length})`} actions={
            <CsvButton name={`purchase-order-${day}.csv`} rows={() => [['Supplier', 'SKU', 'Item', 'Order qty', 'Unit', 'Unit cost', 'Line total'], ...alerts.sort((a, b) => a.supplier.localeCompare(b.supplier)).map((i) => [i.supplier, i.sku, i.name, suggestOrder(i), i.unit, i.cost, +(suggestOrder(i) * i.cost).toFixed(2)])]} />
          }>
            <Table head={['Item', 'On hand', 'Order', 'Supplier', 'Cost']}
              rows={alerts.map((i) => [<button key="n" type="button" className="k-btn ghost" onClick={() => setDraft(i)}>{i.name}</button>, <b key="q" style={{ color: i.qty <= 0 ? 'var(--err)' : 'var(--warn)' }}>{i.qty} {i.unit}</b>, `${suggestOrder(i)} ${i.unit}`, i.supplier || '—', m(suggestOrder(i) * i.cost)])}
              foot={['Total', '', '', '', m(alerts.reduce((a, i) => a + suggestOrder(i) * i.cost, 0))]} />
          </Panel>
        )}
        <Panel title="Stock" actions={
          <>
            <CsvButton name="inventory.csv" rows={() => [['SKU', 'Barcode', 'Name', 'Category', 'Location', 'Qty', 'Unit', 'Reorder point', 'Reorder qty', 'Cost', 'Price', 'Supplier', 'Status', 'Usage/day', 'Days of cover'], ...s.items.map((i) => [i.sku, i.barcode, i.name, i.category, i.location, i.qty, i.unit, i.reorderPoint, i.reorderQty, i.cost, i.price, i.supplier, status(i), +usage(i.id).toFixed(3), Number.isFinite(daysOfCover(i.qty, usage(i.id))) ? Math.round(daysOfCover(i.qty, usage(i.id))) : ''])]} />
            <JsonButtons name="inventory-backup.json" data={s} onLoad={(d) => d && Array.isArray(d.items) && set(d)} />
            <Btn kind="ghost" onClick={reset}>Reset</Btn>
          </>
        }>
          <Row>
            <input className="k-text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, SKU, location…" aria-label="Search" style={{ flex: 1, minWidth: 160 }} />
            <select className="k-select" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category" style={{ width: 'auto' }}>
              <option value="">All categories</option>
              {cats.map((c) => <option key={c}>{c}</option>)}
            </select>
            <Seg value={only} onChange={setOnly} options={[['all', 'All'], ['alerts', 'Alerts']]} />
          </Row>
          <Table head={['Item', 'Status', 'On hand', '', 'Cover', 'Reorder by']}
            rows={list.map((i) => {
              const st = status(i), u = usage(i.id), cov = daysOfCover(i.qty, u)
              return [
                <button key="n" type="button" onClick={() => setDraft(i)} style={{ all: 'unset', cursor: 'pointer' }}>
                  <b style={{ color: draft.id === i.id ? 'var(--accent)' : undefined }}>{i.name}</b>
                  <div className="muted" style={{ fontSize: 12 }}>{i.sku} · {i.location}</div>
                </button>,
                <span key="s" style={{ padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 700, color: '#fff', background: BADGE[st][1] }}>{BADGE[st][0]}</span>,
                <b key="q">{i.qty} <span className="muted" style={{ fontWeight: 400 }}>{i.unit}</span></b>,
                <span key="b" style={{ whiteSpace: 'nowrap' }}>
                  <Btn kind="ghost" onClick={() => addMove(i, -1, 'sold')} title="Sold / used one">−</Btn>
                  <Btn kind="ghost" onClick={() => addMove(i, 1, 'received')} title="Received one">+</Btn>
                </span>,
                Number.isFinite(cov) ? <span key="c" style={{ color: cov < i.leadDays ? 'var(--err)' : undefined }}>{Math.round(cov)} d</span> : '—',
                st === 'out' || st === 'low' ? <b key="r" style={{ color: 'var(--err)' }}>now</b> : reorderDate(i, u, day) || '—',
              ]
            })} />
          <p className="muted" style={{ fontSize: 13 }}>Cover = days until empty at the last 30 days’ usage. Red cover = runs out before a new order could arrive.</p>
        </Panel>
        <Panel title={isNew ? 'Recent movements' : `History: ${draft.name}`}>
          <Table head={['Date', 'Item', 'Change', 'Reason', 'Note']} rows={hist.map((h) => [h.date, nameOf(h.itemId), <b key="d" style={{ color: h.delta < 0 ? 'var(--err)' : 'var(--ok)' }}>{h.delta > 0 ? '+' : ''}{h.delta}</b>, h.reason, h.note])} />
        </Panel>
      </div>
    </Split>
  )
}
