import { useState } from 'react'
import { Area, BarChart, Btn, Check, CsvButton, download, JsonButtons, money, Note, num, Panel, Row, Select, Split, Stat, Stats, Txt, uid, useToolState } from '../kit'
import { balancePdf, parseTrialBalance, ratios, SECTIONS, totals, type Account, type Section } from './lib/balance-sheet-generator'

const A = (name: string, section: Section, cur: number, prior: number, quick = false): Account => ({ id: uid(), name, section, cur, prior, quick })

interface State { company: string; date: string; prior: string; currency: string; showPrior: boolean; paper: 'a4' | 'letter'; accounts: Account[] }
const DEF: State = {
  company: 'Northwind Trading LLC', date: '2026-09-30', prior: '2025-09-30', currency: '$', showPrior: true, paper: 'letter',
  accounts: [
    A('Cash and cash equivalents', 'ca', 84200, 61900, true), A('Accounts receivable, net', 'ca', 126500, 109800, true), A('Inventory', 'ca', 158300, 141200), A('Prepaid expenses', 'ca', 12400, 10900),
    A('Property, plant and equipment', 'nca', 412000, 389000), A('Accumulated depreciation', 'nca', -138600, -112400), A('Intangible assets', 'nca', 45000, 50000), A('Long-term investments', 'nca', 30000, 30000),
    A('Accounts payable', 'cl', 97300, 88600), A('Accrued expenses', 'cl', 28400, 24100), A('Short-term loan', 'cl', 40000, 35000), A('Current portion of long-term debt', 'cl', 24000, 24000), A('Unearned revenue', 'cl', 15800, 12200),
    A('Long-term debt', 'ncl', 168000, 192000), A('Deferred tax liability', 'ncl', 21500, 18900),
    A('Common stock', 'eq', 150000, 150000), A('Additional paid-in capital', 'eq', 25000, 25000), A('Retained earnings', 'eq', 159800, 110600),
  ],
}
const SAMPLE_TB = `Account, Section, Current, Prior
Cash at bank, current assets, 18500, 12000
Accounts receivable, current assets, 9200, 8100
Delivery van, non-current assets, 32000, 32000
Accumulated depreciation - van, non-current assets, (9600), (3200)
Accounts payable, current liabilities, 7400, 6900
Bank loan, non-current liabilities, 15000, 20000
Owner's capital, equity, 20000, 20000
Retained earnings, equity, 7700, 2000`

const fmtDate = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
}

export default function BalanceSheetGenerator() {
  const [s, set, reset] = useToolState('balance-sheet-generator', DEF)
  const [tb, setTb] = useState(SAMPLE_TB)
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState('')
  const m = (x: number) => money(x, s.currency, 0)
  const T = totals(s.accounts, 'cur'), P = totals(s.accounts, 'prior')
  const R = ratios(T), RP = ratios(P)
  const balanced = Math.abs(T.diff) < 0.005
  const priorBalanced = Math.abs(P.diff) < 0.005
  const edit = (id: string, p: Partial<Account>) => set({ accounts: s.accounts.map((a) => (a.id === id ? { ...a, ...p } : a)) })
  const plug = () => {
    const re = s.accounts.find((a) => a.section === 'eq' && /retained/i.test(a.name))
    if (re) edit(re.id, { cur: Math.round((re.cur + T.diff) * 100) / 100 })
    else set({ accounts: [...s.accounts, A('Retained earnings', 'eq', T.diff, 0)] })
  }
  const pdf = async (open: boolean) => {
    setBusy(true)
    try {
      const bytes = await balancePdf({ company: s.company, date: fmtDate(s.date), prior: fmtDate(s.prior), currency: s.currency, accounts: s.accounts, showPrior: s.showPrior, letter: s.paper === 'letter' })
      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' })
      if (open) window.open(URL.createObjectURL(blob), '_blank')
      else download(`balance-sheet-${s.date}.pdf`, blob)
    } finally {
      setBusy(false)
    }
  }
  const r2 = (x: number) => (Number.isFinite(x) ? num(x, 2) : '—')
  const pc = (x: number) => (Number.isFinite(x) ? `${num(x * 100, 1)}%` : '—')
  const delta = (a: number, b: number) => (b ? `${a >= b ? '▲' : '▼'} ${num(Math.abs(((a - b) / Math.abs(b)) * 100), 1)}%` : '')

  return (
    <Split wide="right">
      <div>
        <Panel title="Company" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Txt label="Company name" value={s.company} onChange={(company) => set({ company })} />
          <Row>
            <Txt label="As of" type="date" value={s.date} onChange={(date) => set({ date })} />
            <Txt label="Prior period" type="date" value={s.prior} onChange={(prior) => set({ prior })} />
          </Row>
          <Row>
            <Select label="Currency" value={s.currency} onChange={(currency) => set({ currency })} options={['$', '€', '£', '₴', 'zł', '¥', 'CHF ']} />
            <Select label="PDF paper" value={s.paper} onChange={(paper) => set({ paper })} options={[['letter', 'US Letter'], ['a4', 'A4']]} />
          </Row>
          <Check label="Show comparative (prior period) column" value={s.showPrior} onChange={(showPrior) => set({ showPrior })} />
        </Panel>
        <Panel title="Import a trial balance">
          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>One account per line: <code>Name, [Section], Current, [Prior]</code>. Comma, semicolon or tab separated; negatives as −100 or (100). Missing sections are guessed from the name.</p>
          <Area value={tb} onChange={setTb} rows={8} mono />
          <Row>
            <Btn kind="primary" onClick={() => { const rows = parseTrialBalance(tb); setInfo(`${rows.length} accounts imported.`); if (rows.length) set({ accounts: rows.map((r) => ({ ...r, id: uid() })) }) }}>Replace accounts</Btn>
            <Btn onClick={() => { const rows = parseTrialBalance(tb); setInfo(`${rows.length} accounts added.`); set({ accounts: [...s.accounts, ...rows.map((r) => ({ ...r, id: uid() }))] }) }}>Append</Btn>
          </Row>
          {info && <Note tone="ok">{info}</Note>}
        </Panel>
        <Panel title="Ratios">
          <table className="k-table">
            <thead><tr><th>Ratio</th><th>{s.date.slice(0, 4)}</th>{s.showPrior && <th>{s.prior.slice(0, 4)}</th>}<th>Guide</th></tr></thead>
            <tbody>
              {([
                ['Current ratio', r2(R.current), r2(RP.current), '1.5 – 3 healthy', R.current >= 1.5 ? 'var(--ok)' : R.current >= 1 ? 'var(--warn)' : 'var(--err)'],
                ['Quick ratio', r2(R.quick), r2(RP.quick), '≥ 1 comfortable', R.quick >= 1 ? 'var(--ok)' : R.quick >= 0.7 ? 'var(--warn)' : 'var(--err)'],
                ['Working capital', m(R.workingCapital), m(RP.workingCapital), 'CA − CL', R.workingCapital >= 0 ? 'var(--ok)' : 'var(--err)'],
                ['Debt to equity', r2(R.debtToEquity), r2(RP.debtToEquity), '< 2 typical', R.debtToEquity < 2 ? 'var(--ok)' : 'var(--warn)'],
                ['Debt ratio', pc(R.debtRatio), pc(RP.debtRatio), 'liabilities ÷ assets', R.debtRatio < 0.6 ? 'var(--ok)' : 'var(--warn)'],
                ['Equity ratio', pc(R.equityRatio), pc(RP.equityRatio), 'equity ÷ assets', undefined],
              ] as [string, string, string, string, string | undefined][]).map(([n, a, b, g, c]) => (
                <tr key={n}><td>{n}</td><td style={{ fontWeight: 700, color: c }}>{a}</td>{s.showPrior && <td className="muted">{b}</td>}<td className="muted" style={{ fontSize: 12 }}>{g}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="muted" style={{ fontSize: 12.5 }}>Quick ratio counts only current assets ticked “quick” (cash, receivables, marketable securities).</p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Total assets" value={m(T.assets)} sub={s.showPrior ? `${delta(T.assets, P.assets)} vs prior` : ''} />
          <Stat label="Liabilities + equity" value={m(T.le)} sub={`${m(T.liab)} + ${m(T.eq)}`} />
          <Stat label="Balance check" value={balanced ? '✓ Balanced' : m(T.diff)} tone={balanced ? 'good' : 'bad'} sub={balanced ? 'A = L + E' : 'assets − (L + E)'} />
          <Stat label="Current ratio" value={r2(R.current)} tone="accent" sub={`working capital ${m(R.workingCapital)}`} />
        </Stats>
        {!balanced && (
          <Note tone="err">
            Out of balance by <b>{m(T.diff)}</b>: assets are {T.diff > 0 ? 'higher' : 'lower'} than liabilities plus equity. Check for a missing account or a sign error.{' '}
            <Btn onClick={plug}>Post difference to retained earnings</Btn>
          </Note>
        )}
        {s.showPrior && !priorBalanced && <Note tone="warn">The prior-period column is out of balance by {m(P.diff)}.</Note>}
        <Panel title={`Balance sheet · as of ${fmtDate(s.date)}`} actions={<>
          <Btn kind="primary" disabled={busy} onClick={() => void pdf(false)}>⬇ PDF</Btn>
          <Btn disabled={busy} onClick={() => void pdf(true)}>Open PDF</Btn>
          <CsvButton name={`balance-sheet-${s.date}.csv`} rows={() => [['Section', 'Account', s.date, s.prior], ...SECTIONS.flatMap((sec) => s.accounts.filter((a) => a.section === sec.id).map((a) => [sec.name, a.name, a.cur, a.prior])), ['', 'Total assets', T.assets, P.assets], ['', 'Total liabilities and equity', T.le, P.le]]} />
          <JsonButtons name="balance-sheet.json" data={s} onLoad={(d) => d && Array.isArray(d.accounts) && set({ ...DEF, ...d })} />
        </>}>
          <div className="k-table-wrap">
            <table className="k-table">
              <thead><tr><th>Account</th><th style={{ textAlign: 'right' }}>{s.date}</th>{s.showPrior && <th style={{ textAlign: 'right' }}>{s.prior}</th>}<th title="Quick asset">Q</th><th /></tr></thead>
              <tbody>
                {SECTIONS.map((sec, si) => {
                  const rows = s.accounts.filter((a) => a.section === sec.id)
                  const isLast = sec.id === 'nca' || sec.id === 'eq'
                  return [
                    si === 0 || si === 2 ? <tr key={`g${si}`}><td colSpan={5} style={{ fontWeight: 800, color: 'var(--accent)', paddingTop: 14 }}>{si === 0 ? 'ASSETS' : "LIABILITIES AND SHAREHOLDERS' EQUITY"}</td></tr> : null,
                    <tr key={sec.id}><td colSpan={5} style={{ fontWeight: 700 }}>{sec.name}</td></tr>,
                    ...rows.map((a) => (
                      <tr key={a.id}>
                        <td style={{ paddingLeft: 18 }}><input value={a.name} onChange={(e) => edit(a.id, { name: e.target.value })} aria-label="Account" style={{ width: '100%', minWidth: 160 }} /></td>
                        <td style={{ textAlign: 'right' }}><input type="number" value={a.cur} onChange={(e) => edit(a.id, { cur: Number(e.target.value) || 0 })} aria-label="Current" style={{ width: 110, textAlign: 'right', color: a.cur < 0 ? 'var(--err)' : undefined }} /></td>
                        {s.showPrior && <td style={{ textAlign: 'right' }}><input type="number" value={a.prior} onChange={(e) => edit(a.id, { prior: Number(e.target.value) || 0 })} aria-label="Prior" style={{ width: 110, textAlign: 'right' }} /></td>}
                        <td>{sec.id === 'ca' && <input type="checkbox" checked={a.quick} onChange={(e) => edit(a.id, { quick: e.target.checked })} aria-label="Quick asset" />}</td>
                        <td><Btn kind="ghost" onClick={() => set({ accounts: s.accounts.filter((x) => x.id !== a.id) })}>✕</Btn></td>
                      </tr>
                    )),
                    <tr key={`${sec.id}t`}>
                      <td><Btn kind="ghost" onClick={() => set({ accounts: [...s.accounts, A('New account', sec.id, 0, 0)] })}>+ add</Btn> <b style={{ float: 'right' }}>Total {sec.name.toLowerCase()}</b></td>
                      <td style={{ textAlign: 'right', fontWeight: 700, borderTop: '1px solid var(--text)' }}>{m(T[sec.id])}</td>
                      {s.showPrior && <td style={{ textAlign: 'right', fontWeight: 700, borderTop: '1px solid var(--line)' }} className="muted">{m(P[sec.id])}</td>}
                      <td colSpan={2} />
                    </tr>,
                    isLast ? (
                      <tr key={`${sec.id}T`} style={{ background: 'color-mix(in srgb, var(--accent) 8%, transparent)' }}>
                        <td style={{ fontWeight: 800 }}>{sec.id === 'nca' ? 'TOTAL ASSETS' : 'TOTAL LIABILITIES AND EQUITY'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 800, borderBottom: '3px double var(--text)' }}>{m(sec.id === 'nca' ? T.assets : T.le)}</td>
                        {s.showPrior && <td style={{ textAlign: 'right', fontWeight: 800, borderBottom: '3px double var(--line)' }} className="muted">{m(sec.id === 'nca' ? P.assets : P.le)}</td>}
                        <td colSpan={2} />
                      </tr>
                    ) : sec.id === 'ncl' ? (
                      <tr key="liab"><td style={{ fontWeight: 700 }}>Total liabilities</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{m(T.liab)}</td>{s.showPrior && <td style={{ textAlign: 'right' }} className="muted">{m(P.liab)}</td>}<td colSpan={2} /></tr>
                    ) : null,
                  ]
                })}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title={`Composition · ${fmtDate(s.date)}`}>
          <BarChart
            bars={[{ label: 'Assets', value: [T.ca, T.nca, 0, 0, 0] }, { label: 'Liabilities + equity', value: [0, 0, T.cl, T.ncl, T.eq] }]}
            stacks={[{ name: 'Current assets', color: '#0ea5e9' }, { name: 'Non-current assets', color: '#6366f1' }, { name: 'Current liabilities', color: '#f59e0b' }, { name: 'Non-current liabilities', color: '#ef4444' }, { name: 'Equity', color: '#10b981' }]}
            fy={(v) => m(v)}
          />
        </Panel>
      </div>
    </Split>
  )
}
