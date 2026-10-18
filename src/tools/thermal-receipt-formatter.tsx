import { createPortal } from 'react-dom'
import { Area, Btn, Check, CopyButton, download, JsonButtons, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { encode } from './lib/barcode-generator'
import { center, columns, fmtNum, itemLines, lr, printable, rule, totals, wrap, type Item, type Line } from './lib/thermal-receipt-formatter'

interface It extends Item { id: string }
interface State {
  paper: 58 | 80; font: 'A' | 'B'; cur: string; shop: string; address: string; phone: string; taxId: string
  no: string; date: string; time: string; cashier: string; items: It[]
  discountType: 'pct' | 'amount'; discount: number; taxRate: number; taxLabel: string; inclusive: boolean; rounding: number
  method: string; tendered: number; footer: string; barcode: boolean
}
const DEF: State = {
  paper: 58, font: 'A', cur: '$', shop: 'Corner Bean Café', address: '14 Linden Row\nWestbrook', phone: 'Tel 555-0142', taxId: 'Tax ID 00-1234567',
  no: 'R-20261018-0042', date: '2026-10-18', time: '09:41', cashier: 'Mara',
  items: [
    { id: 'a', name: 'Flat white (oat)', qty: 2, price: 3.8 },
    { id: 'b', name: 'Almond croissant', qty: 1, price: 3.25 },
    { id: 'c', name: 'Sourdough loaf, seeded', qty: 1, price: 6.5 },
    { id: 'd', name: 'Sparkling water 330ml', qty: 3, price: 1.6 },
  ],
  discountType: 'pct', discount: 10, taxRate: 8.5, taxLabel: 'Sales tax', inclusive: false, rounding: 0,
  method: 'Cash', tendered: 30, footer: 'Thank you for visiting!\nKeep this receipt for returns within 14 days.', barcode: true,
}

function build(s: State, width: number): Line[] {
  const t = totals(s.items, s)
  const m = (x: number) => fmtNum(x, s.cur)
  const L: Line[] = []
  const half = Math.floor(width / 2)
  for (const w of wrap(s.shop.toUpperCase(), half)) L.push({ text: center(w, half), style: 'big', plain: center(w, width) })
  for (const a of [...s.address.split('\n'), s.phone, s.taxId].filter((x) => x.trim())) for (const w of wrap(a, width)) L.push({ text: center(w, width) })
  L.push({ text: rule(width, '=') })
  L.push({ text: lr('Receipt', s.no, width) })
  L.push({ text: lr(s.date, s.time, width) })
  if (s.cashier) L.push({ text: lr('Served by', s.cashier, width) })
  L.push({ text: rule(width) })
  for (const it of s.items.filter((x) => x.name.trim() || x.price)) for (const text of itemLines(it, width, s.cur)) L.push({ text })
  L.push({ text: rule(width) })
  const nItems = s.items.reduce((a, x) => a + x.qty, 0)
  L.push({ text: lr(`Subtotal (${nItems} item${nItems === 1 ? '' : 's'})`, m(t.subtotal), width) })
  if (t.discount) L.push({ text: lr(`Discount${s.discountType === 'pct' ? ` ${s.discount}%` : ''}`, m(-t.discount), width) })
  if (!s.inclusive && s.taxRate) L.push({ text: lr(`${s.taxLabel} ${s.taxRate}%`, m(t.tax), width) })
  L.push({ text: lr('TOTAL', m(t.rounded), half), style: 'big', plain: lr('TOTAL', m(t.rounded), width) })
  if (t.adjust) L.push({ text: lr('  incl. cash rounding', m(t.adjust), width) })
  if (s.inclusive && s.taxRate) L.push({ text: lr(`  incl. ${s.taxLabel} ${s.taxRate}%`, m(t.tax), width) })
  L.push({ text: rule(width) })
  L.push({ text: lr(s.method || 'Paid', m(s.method === 'Cash' ? s.tendered : t.rounded), width), style: 'bold' })
  if (s.method === 'Cash') L.push({ text: lr('Change', m(Math.max(0, Math.round((s.tendered - t.rounded) * 100) / 100)), width), style: 'bold' })
  L.push({ text: '' })
  for (const w of wrap(s.footer, width)) L.push({ text: center(w, width) })
  return L
}

function Receipt({ s, lines, width, mm }: { s: State; lines: Line[]; width: number; mm: number }) {
  const fs = mm / (width * 0.6)
  let bc: ReturnType<typeof encode> | null = null
  try { bc = s.barcode && s.no.trim() ? encode('code128', s.no.trim()) : null } catch { bc = null }
  return (
    <div style={{ width: `${mm}mm`, fontFamily: '"Courier New", ui-monospace, monospace', fontSize: `${fs}mm`, lineHeight: 1.2, color: '#000', whiteSpace: 'pre', overflow: 'hidden' }}>
      {lines.map((l, i) => (
        <div key={i} style={l.style === 'big' ? { fontSize: `${fs * 2}mm`, fontWeight: 700 } : l.style === 'bold' ? { fontWeight: 700 } : undefined}>{l.text || ' '}</div>
      ))}
      {bc && (
        <svg viewBox={`${-bc.quiet[0]} 0 ${bc.width + bc.quiet[0] + bc.quiet[1]} 40`} style={{ width: `${mm * 0.86}mm`, height: '11mm', display: 'block', margin: '2mm auto 0' }} preserveAspectRatio="none">
          {bc.bars.map(([x, w], i) => <rect key={i} x={x} y={0} width={w} height={40} fill="#000" />)}
        </svg>
      )}
      {bc && <div style={{ textAlign: 'center', fontSize: `${fs * 0.9}mm` }}>{s.no}</div>}
    </div>
  )
}

export default function ThermalReceiptFormatter() {
  const [s, set, reset] = useToolState('thermal-receipt-formatter', DEF)
  const width = columns(s.paper, s.font)
  const mm = printable(s.paper)
  const lines = build(s, width)
  const t = totals(s.items, s)
  const text = lines.map((l) => l.plain ?? l.text).join('\n') + '\n'
  const fsMm = mm / (width * 0.6)
  const heightMm = Math.ceil(lines.reduce((a, l) => a + (l.style === 'big' ? 2 : 1), 0) * fsMm * 1.2 + (s.barcode ? 17 : 0) + 12)
  const edit = (id: string, p: Partial<It>) => set({ items: s.items.map((x) => (x.id === id ? { ...x, ...p } : x)) })
  const short = s.method === 'Cash' && s.tendered < t.rounded
  const css = `.rcpt-print{display:none}@media print{@page{size:${s.paper}mm ${heightMm}mm;margin:0}#root{display:none!important}html,body{background:#fff!important;margin:0!important;padding:0!important}.rcpt-print{display:block;padding:4mm ${(s.paper - mm) / 2}mm}}`

  return (
    <Split wide="left">
      <div>
        <Panel title="Printer">
          <Row>
            <div><span className="k-label">Paper</span><Seg value={String(s.paper) as '58' | '80'} onChange={(v) => set({ paper: Number(v) as 58 | 80 })} options={[['58', '58 mm'], ['80', '80 mm']]} /></div>
            <div><span className="k-label">Font</span><Seg value={s.font} onChange={(font) => set({ font })} options={[['A', 'Font A (large)'], ['B', 'Font B (small)']]} /></div>
          </Row>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>{width} characters per line on {mm} mm printable width.</p>
        </Panel>
        <Panel title="Shop header">
          <Row>
            <Txt label="Shop name" value={s.shop} onChange={(shop) => set({ shop })} />
            <Txt label="Phone" value={s.phone} onChange={(phone) => set({ phone })} />
          </Row>
          <Row>
            <Area label="Address" value={s.address} onChange={(address) => set({ address })} rows={2} />
            <Txt label="Tax / company ID" value={s.taxId} onChange={(taxId) => set({ taxId })} />
          </Row>
          <Row>
            <Txt label="Receipt no." value={s.no} onChange={(no) => set({ no })} />
            <Txt label="Date" type="date" value={s.date} onChange={(date) => set({ date })} />
            <Txt label="Time" type="time" value={s.time} onChange={(time) => set({ time })} />
            <Txt label="Cashier" value={s.cashier} onChange={(cashier) => set({ cashier })} />
          </Row>
        </Panel>
        <Panel title="Items" actions={<Btn onClick={() => set({ items: [...s.items, { id: uid(), name: 'New item', qty: 1, price: 1 }] })}>+ Item</Btn>}>
          <Table
            head={['Item', 'Qty', 'Price', 'Amount', '']}
            rows={s.items.map((x) => [
              <input key="n" value={x.name} onChange={(e) => edit(x.id, { name: e.target.value })} aria-label="Item name" style={{ width: '100%', minWidth: 120 }} />,
              <input key="q" type="number" min={0} step={1} value={x.qty} onChange={(e) => edit(x.id, { qty: Math.max(0, Number(e.target.value) || 0) })} aria-label="Quantity" style={{ width: 56 }} />,
              <input key="p" type="number" min={0} step={0.01} value={x.price} onChange={(e) => edit(x.id, { price: Number(e.target.value) || 0 })} aria-label="Unit price" style={{ width: 76 }} />,
              fmtNum(x.qty * x.price, s.cur),
              <Btn key="x" kind="ghost" onClick={() => set({ items: s.items.filter((y) => y.id !== x.id) })} title="Remove">✕</Btn>,
            ])}
          />
        </Panel>
        <Panel title="Totals & payment">
          <Row>
            <Select label="Currency" value={s.cur} onChange={(cur) => set({ cur })} options={['$', '€', '£', '₴', 'zł ', '¥', 'CHF ', '']} />
            <Select label="Discount type" value={s.discountType} onChange={(discountType) => set({ discountType })} options={[['pct', '% of subtotal'], ['amount', 'Fixed amount']]} />
            <Num label="Discount" value={s.discount} onChange={(discount) => set({ discount })} min={0} />
          </Row>
          <Row>
            <Txt label="Tax label" value={s.taxLabel} onChange={(taxLabel) => set({ taxLabel })} />
            <Num label="Tax rate" value={s.taxRate} onChange={(taxRate) => set({ taxRate })} unit="%" min={0} max={100} />
            <Select label="Cash rounding" value={s.rounding} onChange={(rounding) => set({ rounding })} options={[[0, 'None'], [0.05, '0.05'], [0.1, '0.10'], [1, '1.00']]} />
          </Row>
          <Check label="Prices already include tax (show tax as “incl.”)" value={s.inclusive} onChange={(inclusive) => set({ inclusive })} />
          <Row>
            <Select label="Payment" value={s.method} onChange={(method) => set({ method })} options={['Cash', 'Card', 'Mobile pay', 'Voucher', 'On account']} />
            {s.method === 'Cash' && <Num label="Tendered" value={s.tendered} onChange={(tendered) => set({ tendered })} min={0} />}
          </Row>
          {short && <Note tone="err">Tendered cash is less than the total.</Note>}
          <Area label="Footer message" value={s.footer} onChange={(footer) => set({ footer })} rows={2} />
          <Check label="Code 128 barcode of the receipt number" value={s.barcode} onChange={(barcode) => set({ barcode })} />
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Total" value={fmtNum(t.rounded, s.cur)} tone="accent" sub={t.tax ? `${s.inclusive ? 'incl.' : '+'} ${fmtNum(t.tax, s.cur)} tax` : undefined} />
          <Stat label="Paper length" value={`${heightMm} mm`} sub={`${lines.length} lines`} />
        </Stats>
        <Panel title={`Receipt · ${s.paper} mm`} actions={<>
          <Btn kind="primary" onClick={() => window.print()}>🖨 Print</Btn>
          <CopyButton text={text} label="Copy text" />
          <Btn onClick={() => download(`${s.no || 'receipt'}.txt`, text)}>⬇ TXT</Btn>
        </>}>
          <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '16px 8px', overflowX: 'auto' }}>
            <div style={{ background: '#fff', width: `${s.paper}mm`, margin: '0 auto', padding: `4mm ${(s.paper - mm) / 2}mm 6mm`, boxShadow: '0 2px 10px rgba(0,0,0,.18)', zoom: 1.35, boxSizing: 'border-box', maskImage: 'linear-gradient(#000 0 calc(100% - 3mm), transparent)' }}>
              <Receipt s={s} lines={lines} width={width} mm={mm} />
            </div>
          </div>
          <JsonButtons name="receipt.json" data={s} onLoad={(d) => set(d)} />
          <Btn kind="ghost" onClick={reset}>Reset</Btn>
        </Panel>
        <Panel title="Printing tips">
          <ul className="muted" style={{ margin: 0, paddingLeft: 18, fontSize: 13.5 }}>
            <li>The page size is set to exactly {s.paper} × {heightMm} mm with zero margins. In the print dialog pick your receipt printer, set margins to <b>None</b> and scale to <b>100%</b>.</li>
            <li>If the driver only offers fixed lengths, choose its “roll” or longest size; the receipt starts at the top.</li>
            <li>The TXT export is fixed-width ({width} columns), ready for raw ESC/POS text printing or a POS system.</li>
          </ul>
        </Panel>
      </div>
      {createPortal(<><style>{css}</style><div className="rcpt-print"><Receipt s={s} lines={lines} width={width} mm={mm} /></div></>, document.body)}
    </Split>
  )
}
