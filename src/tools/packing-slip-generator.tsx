import { useMemo, useState } from 'react'
import { Btn, Check, CsvButton, download, FileDrop, JsonButtons, Note, Panel, Row, Seg, Split, Stat, Stats, Table, Txt, toCsv, useToolState } from '../kit'
import { encode, toSvg } from './lib/barcode-generator'
import { buildPdf, canBarcode, ordersFromCsv, ordersToCsv, pickList, SAMPLE_CSV, type Order, type SlipOpts } from './lib/packing-slip-generator'

interface State extends SlipOpts {
  orders: Order[]
  skip: string[] // order ids excluded from the PDF
}

const DEF: State = {
  company: 'Juniper & Clay Goods',
  from: '210 Workshop Row\nEugene OR 97401\nhello@juniperclay.example',
  footer: 'Thank you for your order! Questions or returns: hello@juniperclay.example within 30 days.',
  page: 'letter',
  bins: true,
  picklist: true,
  orders: ordersFromCsv(SAMPLE_CSV).orders,
  skip: [],
}

export default function PackingSlipGenerator() {
  const [s, set, reset] = useToolState('packing-slip-generator', DEF)
  const [sel, setSel] = useState(0)
  const [paste, setPaste] = useState('')
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err' | 'warn'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const o = s.orders[Math.min(sel, s.orders.length - 1)]
  const chosen = s.orders.filter((x) => !s.skip.includes(x.id))
  const picks = useMemo(() => pickList(chosen), [chosen])
  const units = chosen.reduce((a, x) => a + x.items.reduce((b, i) => b + i.qty, 0), 0)

  const editOrder = (p: Partial<Order>) => set({ orders: s.orders.map((x) => (x === o ? { ...x, ...p } : x)) })
  const editItem = (i: number, p: Partial<Order['items'][number]>) => editOrder({ items: o.items.map((it, j) => (j === i ? { ...it, ...p } : it)) })
  const importCsv = (text: string, replace: boolean) => {
    const r = ordersFromCsv(text)
    if (!r.orders.length) return setMsg({ tone: 'err', text: r.errors[0] ?? 'No orders found.' })
    set({ orders: replace ? r.orders : [...s.orders, ...r.orders], skip: [] })
    setSel(0)
    setMsg({ tone: r.errors.length ? 'warn' : 'ok', text: `Imported ${r.orders.length} orders.${r.errors.length ? ' ' + r.errors.slice(0, 3).join(' ') : ''}` })
  }
  const makePdf = async () => {
    setBusy(true)
    try {
      const bytes = await buildPdf(s, chosen)
      download(`packing-slips-${chosen.length}.pdf`, new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }))
    } catch (e) {
      setMsg({ tone: 'err', text: `PDF failed: ${(e as Error).message}` })
    }
    setBusy(false)
  }
  const bc = o && canBarcode(o.id) ? toSvg(encode('code128', o.id), { module: 1.4, height: 38, text: true, fontSize: 11, fg: '#000', bg: '#fff' }) : ''

  return (
    <Split wide="right">
      <div>
        <Panel title="Your business">
          <Txt label="Company name" value={s.company} onChange={(company) => set({ company })} />
          <label className="k-field"><span className="k-label">Return address</span><textarea className="k-area" rows={3} value={s.from} onChange={(e) => set({ from: e.target.value })} /></label>
          <Txt label="Footer message" value={s.footer} onChange={(footer) => set({ footer })} />
          <Seg value={s.page} onChange={(page) => set({ page })} options={[['letter', 'US Letter'], ['a4', 'A4'], ['4x6', '4×6 in label']]} />
          <Row>
            <Check label="Bin locations on slips" value={s.bins} onChange={(bins) => set({ bins })} />
            <Check label="Add pick list page" value={s.picklist} onChange={(picklist) => set({ picklist })} />
          </Row>
        </Panel>
        <Panel title="Import orders (CSV)">
          <FileDrop accept=".csv,text/csv" onFiles={async ([f]) => importCsv(await f.text(), true)} label="Drop a CSV export (one row per line item)" />
          <textarea className="k-area mono" rows={3} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="…or paste CSV rows here" />
          <Row>
            <Btn onClick={() => importCsv(paste, false)} disabled={!paste.trim()}>Add pasted orders</Btn>
            <Btn kind="ghost" onClick={() => download('orders-template.csv', SAMPLE_CSV, 'text/csv')}>⬇ Template</Btn>
            <CsvButton name="orders.csv" rows={() => ordersToCsv(s.orders)} />
          </Row>
          {msg && <Note tone={msg.tone}>{msg.text}</Note>}
          <p className="muted" style={{ fontSize: 13 }}>Columns: order_id, date, ship_name, ship_address (lines separated by “|”), ship_method, note, sku, item, qty, bin. Common aliases (Order Number, Quantity, Location…) are recognised.</p>
        </Panel>
        <Panel title="Orders" actions={<Btn onClick={() => { set({ orders: [...s.orders, { id: String(10000 + Math.floor(Math.random() * 90000)), date: new Date().toISOString().slice(0, 10), name: '', address: '', method: '', note: '', items: [{ sku: '', name: 'New item', qty: 1, bin: '' }] }] }); setSel(s.orders.length) }}>+ Order</Btn>}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {s.orders.map((x, i) => (
              <span key={x.id + i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 8, border: `2px solid ${i === sel ? 'var(--accent)' : 'var(--line)'}`, background: 'var(--panel2)' }}>
                <input type="checkbox" checked={!s.skip.includes(x.id)} onChange={(e) => set({ skip: e.target.checked ? s.skip.filter((k) => k !== x.id) : [...s.skip, x.id] })} aria-label={`Include ${x.id}`} />
                <button type="button" onClick={() => setSel(i)} style={{ background: 'none', border: 0, color: 'var(--fg)', cursor: 'pointer', fontWeight: 600 }}>#{x.id}</button>
              </span>
            ))}
          </div>
          {o ? (
            <>
              <Row>
                <Txt label="Order #" value={o.id} onChange={(id) => editOrder({ id })} />
                <Txt label="Date" value={o.date} onChange={(date) => editOrder({ date })} />
                <Txt label="Ship via" value={o.method} onChange={(method) => editOrder({ method })} />
              </Row>
              <Txt label="Ship to (name)" value={o.name} onChange={(name) => editOrder({ name })} />
              <label className="k-field"><span className="k-label">Address</span><textarea className="k-area" rows={3} value={o.address} onChange={(e) => editOrder({ address: e.target.value })} /></label>
              <Txt label="Note / gift message" value={o.note} onChange={(note) => editOrder({ note })} />
              {!canBarcode(o.id) && <Note tone="warn">Order numbers with non-ASCII characters can't be encoded in Code 128; the slip will have no barcode.</Note>}
              <Table head={['SKU', 'Item', 'Qty', 'Bin', '']} rows={o.items.map((it, i) => [
                <input key="s" value={it.sku} onChange={(e) => editItem(i, { sku: e.target.value })} style={{ width: 100 }} aria-label="SKU" />,
                <input key="n" value={it.name} onChange={(e) => editItem(i, { name: e.target.value })} aria-label="Item" />,
                <input key="q" type="number" min={1} value={it.qty} onChange={(e) => editItem(i, { qty: Math.max(1, Math.round(Number(e.target.value) || 1)) })} style={{ width: 56 }} aria-label="Quantity" />,
                <input key="b" value={it.bin} onChange={(e) => editItem(i, { bin: e.target.value })} style={{ width: 60 }} aria-label="Bin" />,
                <Btn key="x" kind="ghost" onClick={() => editOrder({ items: o.items.filter((_, j) => j !== i) })}>✕</Btn>,
              ])} />
              <Row>
                <Btn onClick={() => editOrder({ items: [...o.items, { sku: '', name: '', qty: 1, bin: '' }] })}>+ Item</Btn>
                <Btn kind="danger" onClick={() => { set({ orders: s.orders.filter((x) => x !== o) }); setSel(0) }}>Delete order</Btn>
              </Row>
            </>
          ) : <Note>No orders yet. Import a CSV or add one.</Note>}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Orders in PDF" value={`${chosen.length} / ${s.orders.length}`} />
          <Stat label="Units" value={units} sub={`${chosen.reduce((a, x) => a + x.items.length, 0)} lines`} />
          <Stat label="Pick-list SKUs" value={picks.length} sub={`${new Set(picks.map((p) => p.bin)).size} bins`} />
        </Stats>
        <Panel title={o ? `Preview — order #${o.id}` : 'Preview'} actions={<>
          <Btn kind="primary" onClick={makePdf} disabled={!chosen.length || busy}>{busy ? 'Building…' : `⬇ PDF (${chosen.length} slip${chosen.length === 1 ? '' : 's'}${s.picklist ? ' + pick list' : ''})`}</Btn>
          <JsonButtons name="packing-slips.json" data={s} onLoad={(d) => d && Array.isArray(d.orders) && set(d)} />
          <Btn kind="ghost" onClick={reset}>Reset</Btn>
        </>}>
          {o && (
            <div style={{ background: '#fff', color: '#111827', borderRadius: 6, boxShadow: '0 2px 14px rgba(0,0,0,.15)', padding: s.page === '4x6' ? 14 : 26, maxWidth: s.page === '4x6' ? 360 : 640, margin: '0 auto', fontSize: s.page === '4x6' ? 11 : 13, fontFamily: 'Helvetica, Arial, sans-serif' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1.25em' }}>{s.company}</div>
                  <div style={{ color: '#6b7280', whiteSpace: 'pre-line', fontSize: '0.85em' }}>{s.from}</div>
                </div>
                <div style={{ textAlign: s.page === '4x6' ? 'left' : 'right' }}>
                  <div style={{ fontWeight: 800, fontSize: '1.4em', letterSpacing: 1 }}>PACKING SLIP</div>
                  <div>Order #{o.id}</div>
                  {o.date && <div>Date: {o.date}</div>}
                  {o.method && <div>Ship via: {o.method}</div>}
                  {bc && <div style={{ marginTop: 6 }} dangerouslySetInnerHTML={{ __html: bc }} />}
                </div>
              </div>
              <hr style={{ border: 0, borderTop: '1px solid #d1d5db', margin: '12px 0' }} />
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontSize: '0.75em', fontWeight: 700, color: '#6b7280' }}>SHIP TO</div>
                  <b>{o.name}</b>
                  <div style={{ whiteSpace: 'pre-line' }}>{o.address}</div>
                </div>
                {o.note && <div style={{ flex: 1, minWidth: 160 }}><div style={{ fontSize: '0.75em', fontWeight: 700, color: '#6b7280' }}>NOTE</div>{o.note}</div>}
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 14 }}>
                <thead><tr style={{ background: '#1c2433', color: '#fff', textAlign: 'left' }}><th style={{ padding: 5, width: 22 }} /><th style={{ padding: 5 }}>Qty</th><th style={{ padding: 5 }}>SKU</th><th style={{ padding: 5 }}>Item</th>{s.bins && <th style={{ padding: 5 }}>Bin</th>}</tr></thead>
                <tbody>
                  {o.items.map((it, i) => (
                    <tr key={i} style={{ background: i % 2 ? '#f5f7fa' : undefined }}>
                      <td style={{ padding: 5 }}><span style={{ display: 'inline-block', width: 10, height: 10, border: '1px solid #6b7280' }} /></td>
                      <td style={{ padding: 5, fontWeight: 700 }}>{it.qty}</td><td style={{ padding: 5 }}>{it.sku}</td><td style={{ padding: 5 }}>{it.name}</td>{s.bins && <td style={{ padding: 5, color: '#6b7280' }}>{it.bin}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ color: '#6b7280', fontSize: '0.8em', marginTop: 14, borderTop: '1px solid #e5e7eb', paddingTop: 6 }}>{s.footer}</div>
            </div>
          )}
        </Panel>
        <Panel title="Pick list (selected orders)" actions={<Btn onClick={() => download('pick-list.csv', toCsv([['Bin', 'SKU', 'Item', 'Qty', 'Orders'], ...picks.map((p) => [p.bin, p.sku, p.name, p.qty, p.orders.join(' ')])]), 'text/csv')}>⬇ CSV</Btn>}>
          <Table head={['Bin', 'SKU', 'Item', 'Qty', 'Orders']} rows={picks.map((p) => [<b key="b">{p.bin || '—'}</b>, p.sku, p.name, <b key="q">{p.qty}</b>, p.orders.join(', ')])} />
          <p className="muted" style={{ fontSize: 13 }}>Untick orders above to leave them out of the PDF and the pick list.</p>
        </Panel>
      </div>
    </Split>
  )
}
