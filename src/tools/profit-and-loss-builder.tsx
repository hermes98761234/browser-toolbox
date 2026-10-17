import { useMemo, useState } from 'react'
import { Area, BarChart, Btn, CsvButton, Donut, download, FileDrop, JsonButtons, money, Note, Panel, pct, Row, Seg, Split, Stat, Stats, Txt, uid, useToolState } from '../kit'
import { winAnsi } from './lib/freelance-agreement-builder'
import { categorize, parseTransactions, SECTIONS, statement, total, type Account, type Period, type Rule, type Section } from './lib/profit-and-loss-builder'

/** Deterministic sample: a small design studio, January–September. */
function sampleCsv(): string {
  const y = new Date().getFullYear()
  const rows = ['Date,Description,Amount']
  let seed = 11
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let m = 1; m <= 9; m++) {
    const d = (day: number) => `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const r2 = (x: number) => (Math.round(x * 100) / 100).toFixed(2)
    rows.push(`${d(3)},Stripe payout - web projects,${r2(9800 + rnd() * 5200 + m * 350)}`)
    rows.push(`${d(17)},Stripe payout - retainers,${r2(4200 + rnd() * 900)}`)
    if (m % 3 === 0) rows.push(`${d(22)},Invoice 10${m}4 Acme Corp,${r2(6000 + rnd() * 3000)}`)
    rows.push(`${d(1)},Landlord - studio rent,-3200.00`)
    rows.push(`${d(5)},Gusto payroll,${r2(-(8600 + (m > 6 ? 2400 : 0)))}`)
    rows.push(`${d(8)},Freelance illustrator,${r2(-(1200 + rnd() * 1800))}`)
    rows.push(`${d(9)},Stock photo licences,${r2(-(120 + rnd() * 260))}`)
    rows.push(`${d(11)},Adobe Creative Cloud,-329.99`)
    rows.push(`${d(11)},Figma,-75.00`)
    rows.push(`${d(14)},Google Ads,${r2(-(400 + rnd() * 700))}`)
    rows.push(`${d(15)},Comcast Business internet,-149.00`)
    rows.push(`${d(20)},Hartford insurance,-210.00`)
    if (m % 2) rows.push(`${d(24)},Uber client meeting,${r2(-(30 + rnd() * 60))}`)
    rows.push(`${d(26)},Bank fee,-15.00`)
    rows.push(`${d(28)},Interest earned,${r2(8 + rnd() * 6)}`)
    rows.push(`${d(28)},Transfer to savings,-2000.00`)
    if (m % 3 === 1 && m > 1) rows.push(`${d(15)},IRS estimated tax,-4200.00`)
    if (m === 4) rows.push(`${d(18)},Apple Store MacBook,-2899.00`)
    if (m === 5 || m === 8) rows.push(`${d(12)},Office Depot supplies,${r2(-(60 + rnd() * 50))}`)
  }
  return rows.join('\n')
}

const ACC: Account[] = [
  { id: 'proj', name: 'Project revenue', section: 'revenue' },
  { id: 'ret', name: 'Retainers', section: 'revenue' },
  { id: 'free', name: 'Contractors', section: 'cogs' },
  { id: 'stock', name: 'Stock assets', section: 'cogs' },
  { id: 'pay', name: 'Payroll', section: 'opex' },
  { id: 'rent', name: 'Rent', section: 'opex' },
  { id: 'soft', name: 'Software', section: 'opex' },
  { id: 'mkt', name: 'Marketing', section: 'opex' },
  { id: 'util', name: 'Utilities & internet', section: 'opex' },
  { id: 'ins', name: 'Insurance', section: 'opex' },
  { id: 'trav', name: 'Travel & meals', section: 'opex' },
  { id: 'equip', name: 'Equipment', section: 'opex' },
  { id: 'fees', name: 'Bank fees', section: 'opex' },
  { id: 'int', name: 'Interest income', section: 'other' },
  { id: 'tax', name: 'Income tax', section: 'tax' },
  { id: 'xfer', name: 'Transfers', section: 'exclude' },
]
const R = (pattern: string, account: string): Rule => ({ id: uid(), pattern, account })
const RULES: Rule[] = [
  R('retainer', 'ret'), R('stripe', 'proj'), R('invoice', 'proj'), R('illustrator', 'free'), R('stock photo', 'stock'), R('payroll', 'pay'), R('landlord', 'rent'),
  R('/adobe|figma|notion|github/i', 'soft'), R('google ads', 'mkt'), R('comcast', 'util'), R('insurance', 'ins'), R('uber', 'trav'), R('macbook', 'equip'),
  R('bank fee', 'fees'), R('interest', 'int'), R('irs', 'tax'), R('transfer', 'xfer'),
]

const DEF = { company: 'Pixel & Pine Studio', csv: sampleCsv(), accounts: ACC, rules: RULES, by: 'quarter' as Period, currency: '$' }
type S = typeof DEF

interface Row { label: string; values: number[]; total: number; kind: 'head' | 'line' | 'sub' | 'key' }

export default function ProfitAndLossBuilder() {
  const [s, set, reset] = useToolState('profit-and-loss-builder', DEF)
  const [showCsv, setShowCsv] = useState(false)
  const m = (x: number) => money(x, s.currency, 0)
  const parsed = useMemo(() => parseTransactions(s.csv), [s.csv])
  const assign = useMemo(() => parsed.txns.map((t) => categorize(t, s.rules, s.accounts)), [parsed, s.rules, s.accounts])
  const st = useMemo(() => statement(parsed.txns, assign, s.accounts, s.by), [parsed, assign, s.accounts, s.by])
  const accName = new Map(s.accounts.map((a) => [a.id, a.name]))
  const unc = parsed.txns.map((t, i) => ({ t, i })).filter(({ i }) => !assign[i])
  const range = parsed.txns.length ? `${parsed.txns.reduce((a, t) => (t.date < a ? t.date : a), '9999')} – ${parsed.txns.reduce((a, t) => (t.date > a ? t.date : a), '0000')}` : ''

  const rows: Row[] = []
  const sec = (k: Section, label: string, subLabel: string) => {
    rows.push({ label, values: [], total: 0, kind: 'head' })
    for (const l of st.sections[k]) rows.push({ label: l.account.name, values: l.values, total: l.total, kind: 'line' })
    rows.push({ label: subLabel, values: st.sum[k], total: total(st.sum[k]), kind: 'sub' })
  }
  sec('revenue', 'Revenue', 'Total revenue')
  sec('cogs', 'Cost of goods sold', 'Total COGS')
  rows.push({ label: 'Gross profit', values: st.gross, total: total(st.gross), kind: 'key' })
  sec('opex', 'Operating expenses', 'Total operating expenses')
  rows.push({ label: 'Operating income (EBIT)', values: st.operating, total: total(st.operating), kind: 'key' })
  if (st.sections.other.length) sec('other', 'Other income / (expense)', 'Total other')
  rows.push({ label: 'Income before tax', values: st.pretax, total: total(st.pretax), kind: 'key' })
  if (st.sections.tax.length) sec('tax', 'Income tax', 'Total tax')
  rows.push({ label: 'Net income', values: st.net, total: total(st.net), kind: 'key' })

  const rev = total(st.sum.revenue)
  const gp = total(st.gross), op = total(st.operating), net = total(st.net)
  const editAcc = (id: string, p: Partial<Account>) => set({ accounts: s.accounts.map((a) => (a.id === id ? { ...a, ...p } : a)) })
  const editRule = (id: string, p: Partial<Rule>) => set({ rules: s.rules.map((r) => (r.id === id ? { ...r, ...p } : r)) })
  const ruleFor = (desc: string, account: string) => {
    const pattern = desc.toLowerCase().replace(/\d[\d\s,.-]*/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' ')
    set({ rules: [...s.rules, R(pattern || desc, account)] })
  }

  const pdf = async () => {
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
    const doc = await PDFDocument.create()
    doc.setTitle(`Profit and Loss — ${s.company}`)
    const reg = await doc.embedFont(StandardFonts.Helvetica)
    const bold = await doc.embedFont(StandardFonts.HelveticaBold)
    const cols = st.periods.length + 1
    const land = cols > 5
    const [W, H] = land ? [792, 612] : [612, 792]
    const M = 44, labelW = land ? 190 : 200
    const cw = (W - 2 * M - labelW) / cols
    const size = cols > 10 ? 7 : cols > 7 ? 8 : 9.5
    let page = doc.addPage([W, H])
    let y = H - M
    const fmtN = (x: number) => (Math.abs(x) < 0.005 ? '-' : `${x < 0 ? '(' : ''}${Math.abs(x).toLocaleString('en-US', { maximumFractionDigits: 0 })}${x < 0 ? ')' : ''}`)
    const header = () => {
      page.drawText(winAnsi(s.company), { x: M, y, size: 16, font: bold })
      y -= 18
      page.drawText(`Profit and Loss Statement  ·  ${range}  ·  amounts in ${winAnsi(s.currency.trim())}`, { x: M, y, size: 9, font: reg, color: rgb(0.4, 0.4, 0.45) })
      y -= 22
      ;[...st.periods, 'Total'].forEach((p, k) => {
        const tw = bold.widthOfTextAtSize(p, size)
        page.drawText(p, { x: M + labelW + (k + 1) * cw - tw - 4, y, size, font: bold })
      })
      y -= 6
      page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1 })
      y -= 13
    }
    header()
    for (const r of rows) {
      if (y < M + 30) {
        page = doc.addPage([W, H])
        y = H - M
        header()
      }
      const f = r.kind === 'line' ? reg : bold
      if (r.kind === 'key') {
        page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: size + 7, color: rgb(0.93, 0.94, 0.98) })
      }
      page.drawText(winAnsi(r.label), { x: M + (r.kind === 'line' ? 12 : 0), y, size, font: f, maxWidth: labelW - 14 })
      if (r.kind !== 'head')
        [...r.values, r.total].forEach((v, k) => {
          const t = fmtN(v)
          page.drawText(t, { x: M + labelW + (k + 1) * cw - f.widthOfTextAtSize(t, size) - 4, y, size, font: f })
        })
      if (r.kind === 'sub') page.drawLine({ start: { x: M + labelW, y: y + size + 2 }, end: { x: W - M, y: y + size + 2 }, thickness: 0.4, color: rgb(0.6, 0.6, 0.65) })
      y -= r.kind === 'head' ? size + 6 : r.kind === 'key' ? size + 10 : size + 5
    }
    y -= 10
    page.drawText(`Gross margin ${pct(gp / (rev || 1))}  ·  Operating margin ${pct(op / (rev || 1))}  ·  Net margin ${pct(net / (rev || 1))}`, { x: M, y, size: 9, font: reg })
    if (st.uncategorized.count) page.drawText(`Excludes ${st.uncategorized.count} uncategorised transactions totalling ${fmtN(st.uncategorized.amount)}.`, { x: M, y: y - 13, size: 8, font: reg, color: rgb(0.7, 0.2, 0.2) })
    download(`pnl-${s.company.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`, new Blob([(await doc.save()) as BlobPart], { type: 'application/pdf' }), 'application/pdf')
  }

  const opexSlices = st.sections.opex.map((l) => ({ label: l.account.name, value: l.total })).filter((x) => x.value > 0)

  return (
    <Split wide="right">
      <div>
        <Panel title="Transactions" actions={<Btn kind="ghost" onClick={reset}>Sample</Btn>}>
          <FileDrop accept=".csv,.tsv,.txt,text/csv" onFiles={async (f) => set({ csv: await f[0].text() })} label="Drop a bank / accounting CSV export" />
          <p className="muted" style={{ fontSize: 12.5 }}>
            {parsed.txns.length} transactions {range && `· ${range}`} {parsed.skipped > 0 && `· ${parsed.skipped} rows skipped`}<br />
            Detected: {parsed.cols || 'no usable columns'}
          </p>
          <Btn onClick={() => setShowCsv(!showCsv)}>{showCsv ? 'Hide' : 'Edit'} raw CSV</Btn>
          {showCsv && <Area value={s.csv} onChange={(csv) => set({ csv })} rows={10} mono />}
          <Note>Needs a date, a description and either a signed amount (income +, spending −) or debit/credit columns. An optional category column matching an account name is used too.</Note>
        </Panel>
        <Panel title="Mapping rules" actions={<Btn onClick={() => set({ rules: [...s.rules, R('', s.accounts[0]?.id ?? '')] })}>+ Rule</Btn>}>
          <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>First match wins. Text matches anywhere (case-insensitive); wrap in /…/ for a regex.</p>
          {s.rules.map((r, k) => (
            <div key={r.id} style={{ display: 'flex', gap: 4, marginBottom: 4, alignItems: 'center' }}>
              <input className="k-text" value={r.pattern} onChange={(e) => editRule(r.id, { pattern: e.target.value })} aria-label="Pattern" style={{ flex: 1, minWidth: 0, fontFamily: 'var(--mono)', fontSize: 12.5 }} />
              <span className="muted">→</span>
              <select className="k-select" value={r.account} onChange={(e) => editRule(r.id, { account: e.target.value })} aria-label="Account" style={{ flex: 1, minWidth: 0 }}>
                {s.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <Btn kind="ghost" title="Move up" disabled={k === 0} onClick={() => { const x = [...s.rules]; [x[k - 1], x[k]] = [x[k], x[k - 1]]; set({ rules: x }) }}>↑</Btn>
              <Btn kind="ghost" title="Remove" onClick={() => set({ rules: s.rules.filter((q) => q.id !== r.id) })}>✕</Btn>
            </div>
          ))}
        </Panel>
        <Panel title="Chart of accounts" actions={<Btn onClick={() => set({ accounts: [...s.accounts, { id: uid(), name: 'New account', section: 'opex' }] })}>+ Account</Btn>}>
          {s.accounts.map((a) => (
            <div key={a.id} style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
              <input className="k-text" value={a.name} onChange={(e) => editAcc(a.id, { name: e.target.value })} aria-label="Account name" style={{ flex: 1, minWidth: 0 }} />
              <select className="k-select" value={a.section} onChange={(e) => editAcc(a.id, { section: e.target.value as Section })} aria-label="Section" style={{ flex: 1, minWidth: 0 }}>
                {SECTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <Btn kind="ghost" title="Remove" onClick={() => set({ accounts: s.accounts.filter((x) => x.id !== a.id), rules: s.rules.filter((r) => r.account !== a.id) })}>✕</Btn>
            </div>
          ))}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Revenue" value={m(rev)} />
          <Stat label="Gross profit" value={m(gp)} sub={`${pct(gp / (rev || 1))} margin`} />
          <Stat label="Operating income" value={m(op)} sub={`${pct(op / (rev || 1))} margin`} tone={op < 0 ? 'bad' : undefined} />
          <Stat label="Net income" value={m(net)} sub={`${pct(net / (rev || 1))} net margin`} tone={net < 0 ? 'bad' : 'good'} />
        </Stats>
        {unc.length > 0 && <Note tone="warn">{unc.length} transaction{unc.length > 1 ? 's are' : ' is'} not mapped ({m(st.uncategorized.amount)}) and left out of the statement — map them below.</Note>}
        <Panel
          title="Income statement"
          actions={
            <>
              <Seg value={s.by} onChange={(by) => set({ by })} options={[['month', 'Monthly'], ['quarter', 'Quarterly'], ['year', 'Yearly']]} />
              <CsvButton name="profit-and-loss.csv" rows={() => [['Line', ...st.periods, 'Total'], ...rows.map((r) => [r.label, ...(r.kind === 'head' ? [] : [...r.values, r.total].map((v) => Math.round(v * 100) / 100))])]} />
              <Btn kind="primary" onClick={() => void pdf()}>⬇ PDF</Btn>
            </>
          }
        >
          <Row>
            <Txt label="Company" value={s.company} onChange={(company) => set({ company })} />
            <Txt label="Currency symbol" value={s.currency} onChange={(currency) => set({ currency })} />
          </Row>
          <div className="k-table-wrap">
            <table className="k-table" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <thead>
                <tr>
                  <th />
                  {st.periods.map((p) => <th key={p} style={{ textAlign: 'right' }}>{p}</th>)}
                  <th style={{ textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ background: r.kind === 'key' ? 'var(--panel2)' : undefined }}>
                    <td style={{ paddingLeft: r.kind === 'line' ? 22 : 8, fontWeight: r.kind === 'line' ? 400 : 700, color: r.kind === 'head' ? 'var(--muted)' : undefined, whiteSpace: 'nowrap' }}>{r.label}</td>
                    {r.kind === 'head'
                      ? [...st.periods, ''].map((_, k) => <td key={k} />)
                      : [...r.values, r.total].map((v, k) => (
                          <td key={k} style={{ textAlign: 'right', fontWeight: r.kind === 'line' ? 400 : 700, color: r.kind === 'key' && v < 0 ? 'var(--err)' : undefined, borderTop: r.kind === 'sub' ? '1px solid var(--grid-strong)' : undefined }}>
                            {Math.abs(v) < 0.005 ? '–' : v < 0 ? `(${m(-v)})` : m(v)}
                          </td>
                        ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {total(st.sum.exclude) !== 0 && <p className="muted" style={{ fontSize: 12 }}>Not on the P&amp;L: {m(total(st.sum.exclude))} in transfers / owner draws / loan principal.</p>}
        </Panel>
        <Panel title="Net income by period">
          <BarChart bars={st.periods.map((p, k) => ({ label: p, value: st.net[k], color: st.net[k] < 0 ? '#ef4444' : '#10b981' }))} fy={m} height={200} />
        </Panel>
        {opexSlices.length > 0 && (
          <Panel title="Where operating costs go">
            <Donut slices={opexSlices} fv={m} center={<span>{m(total(st.sum.opex))}</span>} />
          </Panel>
        )}
        <Panel title={`Unmapped transactions (${unc.length})`} actions={<JsonButtons name="pnl-setup.json" data={s} onLoad={(d: S) => d && Array.isArray(d.accounts) && set({ ...DEF, ...d })} />}>
          {unc.length === 0 ? (
            <Note tone="ok">Every transaction is mapped to an account. ✓</Note>
          ) : (
            <div className="k-table-wrap">
              <table className="k-table">
                <thead><tr><th>Date</th><th>Description</th><th style={{ textAlign: 'right' }}>Amount</th><th>Map to (creates a rule)</th></tr></thead>
                <tbody>
                  {unc.slice(0, 50).map(({ t, i }) => (
                    <tr key={i}>
                      <td>{t.date}</td>
                      <td>{t.desc}</td>
                      <td style={{ textAlign: 'right' }}>{m(t.amount)}</td>
                      <td>
                        <select className="k-select" value="" onChange={(e) => e.target.value && ruleFor(t.desc, e.target.value)} aria-label="Map to account">
                          <option value="">Choose account…</option>
                          {s.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="muted" style={{ fontSize: 12 }}>Mapped so far: {parsed.txns.length - unc.length} of {parsed.txns.length}. Accounts in use: {[...new Set(assign.filter(Boolean))].map((a) => accName.get(a)).slice(0, 8).join(', ')}{new Set(assign.filter(Boolean)).size > 8 ? '…' : ''}</p>
        </Panel>
      </div>
    </Split>
  )
}
