import { Btn, CopyButton, JsonButtons, Note, Panel, Row, Select, Split, Stat, Stats, Table, Txt, today, useToolState } from '../kit'
import { check, checkVatNumber, lineNet, RATES, round2, summary, totals, type Invoice, type Issue, type Line } from './lib/vat-invoice-checker'

const L = (desc: string, qty: number, price: number, rate: number, statedNet: number | null = null, statedVat: number | null = null, disc = 0): Line => ({ desc, qty, price, disc, rate, statedNet, statedVat })

const SAMPLES: Record<string, Invoice> = {
  de: {
    country: 'DE', number: 'RE-2026-0187', issueDate: '2026-10-02', supplyDate: '2026-09-30', currency: 'EUR',
    supplier: 'Nordlicht Design GmbH', supplierAddress: 'Torstraße 88, 10119 Berlin', supplierVat: 'DE 287 451 903',
    customer: 'Bäckerei Sonnenschein KG', customerAddress: 'Marktplatz 3, 50667 Köln', customerVat: '', notes: '',
    lines: [
      L('Logo redesign (fixed fee)', 1, 1450, 19, 1450, 275.5),
      L('Business cards, 500 pcs', 2, 64.9, 19, 129.8, 24.66),
      L('Brand guideline workshop (hours)', 6, 95, 19, 570, 108.3, 10),
      L('Printed brochure (books & print 7%)', 40, 3.25, 7, 130, 9.1),
    ],
    statedNet: 2279.8, statedVat: 417.56, statedGross: 2697.36,
  },
  rc: {
    country: 'NL', number: 'INV-2026-044', issueDate: '2026-10-05', supplyDate: '2026-10-05', currency: 'EUR',
    supplier: 'Tulip Cloud B.V.', supplierAddress: 'Keizersgracht 120, 1015 Amsterdam', supplierVat: 'NL859372154B01',
    customer: 'Atelier Lumière SAS', customerAddress: '14 rue Oberkampf, 75011 Paris', customerVat: 'FR40303265045', notes: '',
    lines: [L('Hosting plan Pro — October', 1, 249, 0, 249, 0), L('Extra storage 500 GB', 2, 19, 0, 38, 0)],
    statedNet: 287, statedVat: 0, statedGross: 287,
  },
  uk: {
    country: 'GB', number: 'A-10442', issueDate: '2026-10-10', supplyDate: '2026-10-10', currency: 'GBP',
    supplier: 'Bramble & Co Ltd', supplierAddress: '22 Mill Lane, Bristol BS1 4QT', supplierVat: 'GB 123 4567 89',
    customer: 'Greenleaf Cafe', customerAddress: '5 High St, Bath BA1 1AA', customerVat: '', notes: '',
    lines: [L('Commercial coffee grinder', 1, 840, 20, 840, 168), L('Domestic energy saving install', 1, 300, 5, 300, 15)],
    statedNet: 1140, statedVat: 183, statedGross: 1323,
  },
}

const DEF = SAMPLES.de
const COUNTRIES = Object.keys(RATES)
const ICON: Record<Issue['level'], string> = { error: '⛔', warn: '⚠️', ok: '✅' }

function NumCell({ v, onChange, w = 80, nullable }: { v: number | null; onChange: (v: number | null) => void; w?: number; nullable?: boolean }) {
  return (
    <input
      type="number"
      step="any"
      value={v ?? ''}
      placeholder={nullable ? '—' : '0'}
      onChange={(e) => onChange(e.target.value === '' ? (nullable ? null : 0) : Number(e.target.value))}
      style={{ width: w }}
    />
  )
}

export default function VatInvoiceChecker() {
  const [s, set] = useToolState('vat-invoice-checker', DEF)
  const issues = check(s, today())
  const t = totals(s.lines)
  const sum = summary(s.lines)
  const errs = issues.filter((i) => i.level === 'error').length
  const warns = issues.filter((i) => i.level === 'warn').length
  const editLine = (i: number, p: Partial<Line>) => set({ lines: s.lines.map((l, j) => (j === i ? { ...l, ...p } : l)) })
  const money = (x: number | null) => (x === null ? '—' : `${x.toFixed(2)} ${s.currency}`)
  const sv = checkVatNumber(s.supplierVat), cv = checkVatNumber(s.customerVat)
  const report = () =>
    [`VAT invoice check — ${s.number || '(no number)'} (${s.supplier || 'supplier?'})`, `Recomputed: net ${t.net.toFixed(2)}, VAT ${t.vat.toFixed(2)}, gross ${t.gross.toFixed(2)} ${s.currency}`, ...issues.map((i) => `[${i.level.toUpperCase()}] ${i.area}: ${i.msg}`)].join('\n')
  const fixTotals = () => set({ lines: s.lines.map((l) => ({ ...l, statedNet: lineNet(l), statedVat: round2((lineNet(l) * l.rate) / 100) })), statedNet: t.net, statedVat: t.vat, statedGross: t.gross })

  return (
    <Split wide="left">
      <div>
        <Panel
          title="Invoice"
          actions={
            <>
              <Btn kind="ghost" onClick={() => set(SAMPLES.de)}>DE sample</Btn>
              <Btn kind="ghost" onClick={() => set(SAMPLES.rc)}>EU reverse charge</Btn>
              <Btn kind="ghost" onClick={() => set(SAMPLES.uk)}>UK</Btn>
            </>
          }
        >
          <Row>
            <Select label="Supplier country" value={s.country} onChange={(country) => set({ country })} options={COUNTRIES.map((c) => [c, `${c} · ${RATES[c].join(' / ')}%`] as [string, string])} />
            <Txt label="Currency" value={s.currency} onChange={(currency) => set({ currency })} />
            <Txt label="Invoice number" value={s.number} onChange={(number) => set({ number })} />
          </Row>
          <Row>
            <Txt label="Issue date" type="date" value={s.issueDate} onChange={(issueDate) => set({ issueDate })} />
            <Txt label="Supply date" type="date" value={s.supplyDate} onChange={(supplyDate) => set({ supplyDate })} />
          </Row>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            <div>
              <Txt label="Supplier name" value={s.supplier} onChange={(supplier) => set({ supplier })} />
              <Txt label="Supplier address" value={s.supplierAddress} onChange={(supplierAddress) => set({ supplierAddress })} />
              <Txt label="Supplier VAT number" value={s.supplierVat} onChange={(supplierVat) => set({ supplierVat })} hint={s.supplierVat ? `${sv.ok ? '✓' : '✗'} ${sv.msg}` : undefined} />
            </div>
            <div>
              <Txt label="Customer name" value={s.customer} onChange={(customer) => set({ customer })} />
              <Txt label="Customer address" value={s.customerAddress} onChange={(customerAddress) => set({ customerAddress })} />
              <Txt label="Customer VAT number (B2B)" value={s.customerVat} onChange={(customerVat) => set({ customerVat })} hint={s.customerVat ? `${cv.ok ? '✓' : '✗'} ${cv.msg}` : 'needed for reverse charge'} />
            </div>
          </div>
        </Panel>
        <Panel title="Line items" actions={<Btn onClick={() => set({ lines: [...s.lines, L('', 1, 0, RATES[s.country]?.[0] ?? 20)] })}>+ Line</Btn>}>
          <Table
            head={['Description', 'Qty', 'Unit net', 'Disc %', 'VAT %', 'Stated net', 'Stated VAT', 'Computed', '']}
            rows={s.lines.map((l, i) => {
              const n = lineNet(l)
              const v = round2((n * l.rate) / 100)
              const badN = l.statedNet !== null && Math.abs(l.statedNet - n) > 0.005
              const badV = l.statedVat !== null && Math.abs(l.statedVat - v) > 0.005
              return [
                <input key="d" value={l.desc} onChange={(e) => editLine(i, { desc: e.target.value })} aria-label="Description" style={{ minWidth: 160 }} />,
                <NumCell key="q" v={l.qty} onChange={(x) => editLine(i, { qty: x ?? 0 })} w={56} />,
                <NumCell key="p" v={l.price} onChange={(x) => editLine(i, { price: x ?? 0 })} />,
                <NumCell key="c" v={l.disc} onChange={(x) => editLine(i, { disc: x ?? 0 })} w={50} />,
                <NumCell key="r" v={l.rate} onChange={(x) => editLine(i, { rate: x ?? 0 })} w={56} />,
                <span key="sn" style={{ outline: badN ? '2px solid var(--err)' : undefined, borderRadius: 4, display: 'inline-block' }}><NumCell v={l.statedNet} onChange={(x) => editLine(i, { statedNet: x })} nullable /></span>,
                <span key="sv" style={{ outline: badV ? '2px solid var(--err)' : undefined, borderRadius: 4, display: 'inline-block' }}><NumCell v={l.statedVat} onChange={(x) => editLine(i, { statedVat: x })} nullable /></span>,
                <span key="cp" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{n.toFixed(2)}<br /><span className="muted">+{v.toFixed(2)}</span></span>,
                <Btn key="x" kind="ghost" onClick={() => set({ lines: s.lines.filter((_, j) => j !== i) })}>✕</Btn>,
              ]
            })}
          />
          <Row>
            <span className="k-label" style={{ alignSelf: 'center' }}>Stated totals</span>
            <label className="k-field"><span className="k-label">Net</span><NumCell v={s.statedNet} onChange={(statedNet) => set({ statedNet })} nullable w={110} /></label>
            <label className="k-field"><span className="k-label">VAT</span><NumCell v={s.statedVat} onChange={(statedVat) => set({ statedVat })} nullable w={110} /></label>
            <label className="k-field"><span className="k-label">Gross</span><NumCell v={s.statedGross} onChange={(statedGross) => set({ statedGross })} nullable w={110} /></label>
          </Row>
          <Txt label="Notes / exemption wording on the invoice" value={s.notes} onChange={(notes) => set({ notes })} placeholder="e.g. Reverse charge – Art. 196 Directive 2006/112/EC" />
          <p className="k-hint">Leave a “stated” cell empty if the invoice doesn’t show it. Red outline = the invoice’s figure doesn’t match the recomputed one.</p>
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Verdict" value={errs ? 'Fix needed' : warns ? 'Check' : 'Valid'} tone={errs ? 'bad' : warns ? 'accent' : 'good'} sub={`${errs} errors · ${warns} warnings`} />
          <Stat label="Gross (recomputed)" value={money(t.gross)} sub={s.statedGross !== null ? `invoice: ${money(s.statedGross)}` : ''} />
        </Stats>
        <Panel title="Findings" actions={<><CopyButton text={report} label="Copy report" /><Btn onClick={() => window.print()}>🖨</Btn></>}>
          {issues.map((i, k) => (
            <div key={k} style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--line)', fontSize: 14 }}>
              <span>{ICON[i.level]}</span>
              <div><b style={{ fontSize: 12, textTransform: 'uppercase', color: 'var(--muted)' }}>{i.area}</b><div>{i.msg}</div></div>
            </div>
          ))}
          {errs > 0 && issues.some((i) => i.area === 'Maths' || i.area === 'Totals') && <div style={{ marginTop: 10 }}><Btn kind="primary" onClick={fixTotals}>Replace stated figures with correct ones</Btn></div>}
        </Panel>
        <Panel title="VAT breakdown">
          <Table
            head={['Rate', 'Net', 'VAT', 'Per-line VAT']}
            rows={sum.map((r) => [`${r.rate}%`, r.net.toFixed(2), r.vat.toFixed(2), r.vatByLine.toFixed(2)])}
            foot={['Total', t.net.toFixed(2), t.vat.toFixed(2), t.vatByLine.toFixed(2)]}
          />
          <p className="k-hint">VAT is computed per rate on the summed net (EU/HMRC practice). Rounding each line first can differ by a cent or two — both are generally accepted.</p>
        </Panel>
        <Panel title="Data" actions={<JsonButtons name={`invoice-${s.number || 'check'}.json`} data={s} onLoad={(d) => set(d)} />}>
          <Note>Checks follow the EU VAT Directive art. 226 list and HMRC’s full VAT invoice rules: number, dates, both parties, VAT IDs, descriptions, rates, per-rate VAT and totals. VAT-ID checks are format-only (no VIES lookup — nothing leaves your browser).</Note>
        </Panel>
      </div>
    </Split>
  )
}
