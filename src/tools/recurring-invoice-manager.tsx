import { useState } from 'react'
import { Area, Btn, Check, CsvButton, download, JsonButtons, money, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { makeZip } from './lib/image-compressor'
import { addDays, dueToGenerate, invoiceNumber, invoicesPdf, makeInvoice, monthly, scheduleBetween, totals, type Business, type Freq, type Invoice, type Line, type Template } from './lib/recurring-invoice-manager'

const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const TODAY = localToday()
const ago = (n: number) => addDays(TODAY, -n)

const TPL: Template[] = [
  { id: 't1', client: 'Brightline Coffee Co.', email: 'accounts@brightline.example', address: '88 Roast Lane\nPortland, OR 97205', items: [{ desc: 'Website care plan (monthly retainer)', qty: 1, price: 650 }, { desc: 'Managed hosting', qty: 1, price: 39 }], taxPct: 0, freq: 'monthly', start: ago(95), terms: 14, active: true, limit: 0, note: 'Thank you for your business!' },
  { id: 't2', client: 'Northwind Legal LLP', email: 'billing@northwind.example', address: '1 Court Square\nBoston, MA 02108', items: [{ desc: 'SEO & content retainer', qty: 1, price: 1800 }, { desc: 'Blog articles', qty: 4, price: 220 }], taxPct: 0, freq: 'monthly', start: ago(40), terms: 30, active: true, limit: 12, note: '' },
  { id: 't3', client: 'Studio Kalina', email: 'hello@kalina.example', address: 'vul. Khreshchatyk 10\nKyiv 01001', items: [{ desc: 'Quarterly brand design support', qty: 1, price: 2400 }], taxPct: 20, freq: 'quarterly', start: ago(200), terms: 21, active: true, limit: 0, note: 'VAT reverse-charge does not apply.' },
  { id: 't4', client: 'Peak Fitness Gym', email: 'owner@peakfit.example', address: '42 Summit Rd\nDenver, CO 80202', items: [{ desc: 'Weekly social media posts', qty: 5, price: 45 }], taxPct: 8, freq: 'weekly', start: ago(16), terms: 7, active: true, limit: 0, note: '' },
]
function seedInvoices(): { invoices: Invoice[]; next: number } {
  const out: Invoice[] = []
  let n = 41
  // history up to ~3 weeks ago; the rest is "due now" on first visit
  for (const { t, issue } of dueToGenerate(TPL, [], ago(20))) out.push({ ...makeInvoice(t, issue, invoiceNumber('INV-{YYYY}-', n++, issue), uid()), paid: issue < ago(45) })
  return { invoices: out, next: n }
}
const seed = seedInvoices()
interface S { biz: Business; templates: Template[]; invoices: Invoice[]; sel: string; batch: 'combined' | 'zip'; calMonth: string }
const DEF: S = {
  biz: { name: 'Juniper Digital Studio', address: '220 Mill Street, Unit 5\nAustin, TX 78701', email: 'billing@juniper.example', taxId: 'EIN 12-3456789', payment: 'Bank transfer: Juniper Digital LLC\nACCT 0123456789 · ROUTING 111000025\nOr pay online: juniper.example/pay', currency: '$', prefix: 'INV-{YYYY}-', next: seed.next },
  templates: TPL, invoices: seed.invoices, sel: 't1', batch: 'combined', calMonth: TODAY.slice(0, 7),
}
const FREQ: [Freq, string][] = [['weekly', 'Weekly'], ['monthly', 'Monthly'], ['quarterly', 'Quarterly'], ['yearly', 'Yearly']]
const monthAdd = (ym: string, n: number) => { const d = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1)); return d.toISOString().slice(0, 7) }

export default function RecurringInvoiceManager() {
  const [s, set, reset] = useToolState('recurring-invoice-manager', DEF)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<'clients' | 'business'>('clients')
  const m = (x: number) => money(x, s.biz.currency, 2)
  const due = dueToGenerate(s.templates, s.invoices, TODAY)
  const t = s.templates.find((x) => x.id === s.sel)
  const upT = (p: Partial<Template>) => t && set({ templates: s.templates.map((x) => (x.id === t.id ? { ...x, ...p } : x)) })
  const upLine = (i: number, p: Partial<Line>) => t && upT({ items: t.items.map((l, k) => (k === i ? { ...l, ...p } : l)) })
  const mrr = s.templates.reduce((a, x) => a + monthly(x), 0)
  const unpaid = s.invoices.filter((i) => !i.paid)
  const overdue = unpaid.filter((i) => i.due < TODAY)
  const next30 = s.templates.filter((x) => x.active).flatMap((x) => scheduleBetween(x, addDays(TODAY, 1), addDays(TODAY, 30)).map(() => totals(x.items, x.taxPct).total)).reduce((a, b) => a + b, 0)
  const name = (i: Invoice) => `${i.number}_${i.client.replace(/[^\w]+/g, '-')}.pdf`

  const generate = async () => {
    if (!due.length) return
    setBusy(true)
    let n = s.biz.next
    const made = due.map(({ t: tp, issue }) => makeInvoice(tp, issue, invoiceNumber(s.biz.prefix, n++, issue), uid()))
    try {
      if (s.batch === 'combined') download(`invoices_${TODAY}.pdf`, new Blob([(await invoicesPdf(made, s.biz)) as BlobPart], { type: 'application/pdf' }))
      else {
        const files = []
        for (const inv of made) files.push({ name: name(inv), data: await invoicesPdf([inv], s.biz) })
        download(`invoices_${TODAY}.zip`, new Blob([makeZip(files) as BlobPart], { type: 'application/zip' }))
      }
      set({ invoices: [...s.invoices, ...made], biz: { ...s.biz, next: n } })
    } finally { setBusy(false) }
  }
  const pdfOne = async (inv: Invoice) => download(name(inv), new Blob([(await invoicesPdf([inv], s.biz)) as BlobPart], { type: 'application/pdf' }))

  // calendar of upcoming issue dates
  const first = s.calMonth + '-01'
  const startDow = (new Date(first + 'T12:00:00Z').getUTCDay() + 6) % 7
  const daysIn = new Date(Date.UTC(+s.calMonth.slice(0, 4), +s.calMonth.slice(5, 7), 0)).getUTCDate()
  const monthEnd = `${s.calMonth}-${String(daysIn).padStart(2, '0')}`
  const events = s.templates.filter((x) => x.active).flatMap((x) => scheduleBetween(x, first, monthEnd).map((d) => ({ d, x })))
  const dueDates = s.invoices.filter((i) => !i.paid && i.due >= first && i.due <= monthEnd)

  return (
    <Split wide="right">
      <div>
        <Panel title={`Due now · ${due.length} invoice${due.length === 1 ? '' : 's'}`}>
          {due.length ? (
            <>
              <Table head={['Issue date', 'Client', 'Total']} rows={due.map(({ t: x, issue }) => [issue, x.client, m(totals(x.items, x.taxPct).total)])} />
              <Row>
                <Seg value={s.batch} onChange={(batch) => set({ batch })} options={[['combined', 'One combined PDF'], ['zip', 'ZIP of PDFs']]} />
                <Btn kind="primary" disabled={busy} onClick={() => void generate()}>{busy ? 'Generating…' : `⚡ Generate ${due.length} & download`}</Btn>
              </Row>
              <p className="muted" style={{ fontSize: 13 }}>Numbers continue from {invoiceNumber(s.biz.prefix, s.biz.next, TODAY)}. Generated invoices move to the history on the right.</p>
            </>
          ) : <Note tone="ok">All caught up — nothing is due today. Next issue: {s.templates.filter((x) => x.active).map((x) => scheduleBetween(x, addDays(TODAY, 1), addDays(TODAY, 400))[0]).filter(Boolean).sort()[0] ?? '—'}.</Note>}
        </Panel>

        <Seg value={tab} onChange={setTab} options={[['clients', '👥 Client templates'], ['business', '🏢 Your business']]} />
        {tab === 'clients' ? (
          <Panel title="Recurring templates" actions={<Btn onClick={() => { const id = uid(); set({ templates: [...s.templates, { id, client: 'New client', email: '', address: '', items: [{ desc: 'Monthly retainer', qty: 1, price: 500 }], taxPct: 0, freq: 'monthly', start: TODAY, terms: 14, active: true, limit: 0, note: '' }], sel: id }) }}>+ Template</Btn>}>
            <Select label="Template" value={s.sel} onChange={(sel) => set({ sel })} options={s.templates.map((x) => [x.id, `${x.active ? '' : '⏸ '}${x.client} · ${FREQ.find((f) => f[0] === x.freq)?.[1]}`] as [string, string])} />
            {t && (
              <>
                <Row>
                  <Txt label="Client" value={t.client} onChange={(client) => upT({ client })} />
                  <Txt label="Email" value={t.email} onChange={(email) => upT({ email })} />
                </Row>
                <Area label="Billing address" value={t.address} onChange={(address) => upT({ address })} rows={2} />
                <Row>
                  <Select label="Repeats" value={t.freq} onChange={(freq) => upT({ freq })} options={FREQ} />
                  <Txt label="First issue date" type="date" value={t.start} onChange={(start) => upT({ start })} />
                </Row>
                <Row>
                  <Num label="Payment terms" value={t.terms} onChange={(terms) => upT({ terms: Math.max(0, Math.round(terms)) })} unit="days" min={0} />
                  <Num label="Tax" value={t.taxPct} onChange={(taxPct) => upT({ taxPct: Math.max(0, taxPct) })} unit="%" min={0} />
                  <Num label="Stop after" value={t.limit} onChange={(limit) => upT({ limit: Math.max(0, Math.round(limit)) })} hint="0 = never" min={0} />
                </Row>
                <Table head={['Item', 'Qty', 'Price', '']} rows={t.items.map((l, i) => [
                  <input key="d" value={l.desc} onChange={(e) => upLine(i, { desc: e.target.value })} aria-label="Description" style={{ minWidth: 160 }} />,
                  <input key="q" type="number" value={l.qty} min={0} step="any" onChange={(e) => upLine(i, { qty: +e.target.value || 0 })} style={{ width: 60 }} aria-label="Quantity" />,
                  <input key="p" type="number" value={l.price} min={0} step="any" onChange={(e) => upLine(i, { price: +e.target.value || 0 })} style={{ width: 90 }} aria-label="Price" />,
                  <Btn key="x" kind="ghost" onClick={() => upT({ items: t.items.filter((_, k) => k !== i) })}>✕</Btn>,
                ])} foot={['Total incl. tax', '', m(totals(t.items, t.taxPct).total), '']} />
                <Row>
                  <Btn onClick={() => upT({ items: [...t.items, { desc: 'New item', qty: 1, price: 0 }] })}>+ Line</Btn>
                  <Check label="Active" value={t.active} onChange={(active) => upT({ active })} />
                  <Btn kind="danger" onClick={() => set({ templates: s.templates.filter((x) => x.id !== t.id), sel: s.templates[0]?.id ?? '' })}>Delete</Btn>
                </Row>
                <Txt label="Note on invoice" value={t.note} onChange={(note) => upT({ note })} />
                <p className="muted" style={{ fontSize: 13 }}>Next issues: {scheduleBetween(t, TODAY, addDays(TODAY, 400)).slice(0, 4).join(' · ') || '—'}{t.freq !== 'weekly' && +t.start.slice(8) > 28 ? ' (month-end dates are clamped)' : ''}</p>
              </>
            )}
          </Panel>
        ) : (
          <Panel title="Your business">
            <Txt label="Business name" value={s.biz.name} onChange={(name) => set({ biz: { ...s.biz, name } })} />
            <Area label="Address" value={s.biz.address} onChange={(address) => set({ biz: { ...s.biz, address } })} rows={2} />
            <Row>
              <Txt label="Email" value={s.biz.email} onChange={(email) => set({ biz: { ...s.biz, email } })} />
              <Txt label="Tax / company ID" value={s.biz.taxId} onChange={(taxId) => set({ biz: { ...s.biz, taxId } })} />
            </Row>
            <Area label="Payment details" value={s.biz.payment} onChange={(payment) => set({ biz: { ...s.biz, payment } })} rows={3} />
            <Row>
              <Select label="Currency" value={s.biz.currency} onChange={(currency) => set({ biz: { ...s.biz, currency } })} options={['$', '€', '£', 'CHF ', '₴', 'zł ', 'kr ', '¥']} />
              <Txt label="Number prefix" value={s.biz.prefix} onChange={(prefix) => set({ biz: { ...s.biz, prefix } })} hint="{YYYY} {MM} allowed" />
              <Num label="Next number" value={s.biz.next} onChange={(next) => set({ biz: { ...s.biz, next: Math.max(1, Math.round(next)) } })} min={1} />
            </Row>
          </Panel>
        )}
      </div>

      <div>
        <Stats>
          <Stat label="Monthly recurring" value={m(mrr)} sub={`${s.templates.filter((x) => x.active).length} active clients · ${m(mrr * 12)}/yr`} tone="accent" />
          <Stat label="Due to issue" value={due.length} sub={due.length ? m(due.reduce((a, d) => a + totals(d.t.items, d.t.taxPct).total, 0)) : 'none'} tone={due.length ? 'bad' : 'good'} />
          <Stat label="Outstanding" value={m(unpaid.reduce((a, i) => a + i.total, 0))} sub={`${overdue.length} overdue · ${m(overdue.reduce((a, i) => a + i.total, 0))}`} tone={overdue.length ? 'bad' : undefined} />
          <Stat label="Next 30 days" value={m(next30)} sub="scheduled to bill" tone="good" />
        </Stats>

        <Panel title={new Date(first + 'T12:00:00Z').toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })} actions={<>
          <Btn kind="ghost" onClick={() => set({ calMonth: monthAdd(s.calMonth, -1) })}>‹</Btn>
          <Btn kind="ghost" onClick={() => set({ calMonth: TODAY.slice(0, 7) })}>Today</Btn>
          <Btn kind="ghost" onClick={() => set({ calMonth: monthAdd(s.calMonth, 1) })}>›</Btn>
        </>}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, fontSize: 12 }}>
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <b key={d} style={{ textAlign: 'center' }}>{d}</b>)}
            {Array.from({ length: startDow }, (_, i) => <div key={'e' + i} />)}
            {Array.from({ length: daysIn }, (_, i) => {
              const d = `${s.calMonth}-${String(i + 1).padStart(2, '0')}`
              const ev = events.filter((e) => e.d === d), dd = dueDates.filter((x) => x.due === d)
              return (
                <div key={d} style={{ minHeight: 58, border: '1px solid var(--line)', borderRadius: 6, padding: 3, outline: d === TODAY ? '2px solid var(--accent)' : undefined }}>
                  <div style={{ fontWeight: 700 }}>{i + 1}</div>
                  {ev.map((e) => <div key={e.x.id} title={`Issue: ${e.x.client}`} style={{ background: 'var(--accent)', color: '#fff', borderRadius: 3, padding: '0 3px', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>⚡ {e.x.client}</div>)}
                  {dd.map((x) => <div key={x.id} title={`Payment due: ${x.number}`} style={{ background: x.due < TODAY ? 'var(--err)' : 'var(--warn)', color: '#fff', borderRadius: 3, padding: '0 3px', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>💰 {x.number.slice(-4)}</div>)}
                </div>
              )
            })}
          </div>
          <p className="muted" style={{ fontSize: 13 }}>⚡ = invoice issue date · orange = unpaid invoice due · red = overdue.</p>
        </Panel>

        <Panel title={`Invoice history (${s.invoices.length})`} actions={<>
          <CsvButton name="invoices.csv" rows={() => [['Number', 'Client', 'Issued', 'Due', 'Subtotal', 'Tax', 'Total', 'Status'], ...s.invoices.map((i) => [i.number, i.client, i.issue, i.due, i.subtotal, i.tax, i.total, i.paid ? 'paid' : i.due < TODAY ? 'overdue' : 'unpaid'])]} />
          <JsonButtons name="recurring-invoices.json" data={s} onLoad={(d) => set(d)} />
          <Btn kind="ghost" onClick={reset}>Reset demo</Btn>
        </>}>
          <Table
            head={['No.', 'Client', 'Issued', 'Due', 'Total', 'Status', '']}
            rows={[...s.invoices].sort((a, b) => (a.issue < b.issue ? 1 : -1)).map((i) => [
              i.number, i.client, i.issue, i.due, m(i.total),
              <button key="st" type="button" className="k-btn ghost" title="Toggle paid" onClick={() => set({ invoices: s.invoices.map((x) => (x.id === i.id ? { ...x, paid: !x.paid } : x)) })} style={{ color: i.paid ? 'var(--ok)' : i.due < TODAY ? 'var(--err)' : 'var(--warn)', fontWeight: 700 }}>{i.paid ? '✓ paid' : i.due < TODAY ? `overdue ${Math.round((Date.parse(TODAY) - Date.parse(i.due)) / 864e5)}d` : 'unpaid'}</button>,
              <span key="a" style={{ display: 'flex', gap: 2 }}>
                <Btn kind="ghost" title="PDF" onClick={() => void pdfOne(i)}>⬇</Btn>
                {i.email && <a className="k-btn ghost" title="Email" href={`mailto:${i.email}?subject=${encodeURIComponent(`Invoice ${i.number} from ${s.biz.name}`)}&body=${encodeURIComponent(`Hello,\n\nPlease find attached invoice ${i.number} for ${m(i.total)}, due ${i.due}.\n\nThank you,\n${s.biz.name}`)}`}>✉</a>}
                <Btn kind="ghost" title="Delete" onClick={() => set({ invoices: s.invoices.filter((x) => x.id !== i.id) })}>✕</Btn>
              </span>,
            ])}
            max={200}
          />
          <p className="muted" style={{ fontSize: 13 }}>Click a status to mark paid / unpaid. Data is stored in this browser — use Backup to keep a copy. Email opens your mail app; attach the downloaded PDF.</p>
        </Panel>
      </div>
    </Split>
  )
}
