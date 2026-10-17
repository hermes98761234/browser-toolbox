import { useMemo } from 'react'
import { Area, Btn, Check, CsvButton, FileDrop, LineChart, money, Note, Num, Panel, pct, Row, Select, Split, Stat, Stats, Table, useToolState } from '../kit'
import { detectColumns, detectDateFormat, parseAmount, parseCsv, toTxns, type Rule, type Txn } from './lib/bank-csv-analyzer'
import { anomalies, balances, dedupe, monthly, recurring } from './lib/bank-statement-analyzer'

const RULES = `refund: Income
payroll, salary, direct dep: Income
rent, mortgage, property: Housing
whole foods, trader joe, kroger, aldi, lidl, tesco, costco, safeway: Groceries
doordash, uber eats, starbucks, chipotle, cafe, restaurant, pizza: Dining
uber, lyft, metro, transit, parking: Transport
shell, chevron, exxon, fuel: Fuel
energy, electric, water, comcast, verizon, t-mobile, internet: Utilities
netflix, spotify, disney, icloud, apple.com, youtube, adobe, dropbox, chatgpt: Subscriptions
gym, fitness, pharmacy, cvs, dental: Health
insurance, geico, allstate: Insurance
amazon, amzn, target, ikea, etsy, best buy: Shopping
airbnb, airline, delta, hotel, expedia: Travel
fee, overdraft, interest charge: Fees
transfer, zelle, venmo, savings: Transfers`

function parseRules(text: string): Rule[] {
  return text.split('\n').flatMap((l) => {
    const i = l.lastIndexOf(':')
    if (i < 0) return []
    const cat = l.slice(i + 1).trim()
    return l.slice(0, i).split(',').map((kw) => ({ kw: kw.trim(), cat })).filter((r) => r.kw && cat)
  })
}

function sample(): { name: string; text: string }[] {
  let seed = 11
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const rows: [string, string, number][] = []
  const d = (m: number, day: number) => `2026-${String(m).padStart(2, '0')}-${String(Math.min(28, day)).padStart(2, '0')}`
  for (let m = 1; m <= 6; m++) {
    rows.push([d(m, 1), 'PAYROLL ACME CORP DIRECT DEP', 3380], [d(m, 15), 'PAYROLL ACME CORP DIRECT DEP', 3380], [d(m, 1), 'RENT - MAPLE PROPERTY MGMT', -1750], [d(m, 2), 'TRANSFER TO SAVINGS', -500])
    rows.push([d(m, 7), 'NETFLIX.COM', m >= 4 ? -17.99 : -15.49], [d(m, 11), 'SPOTIFY USA', -11.99], [d(m, 19), 'APPLE.COM/BILL ICLOUD 200GB', -2.99], [d(m, 21), 'T-MOBILE AUTOPAY', -65])
    if (m <= 3) rows.push([d(m, 4), 'PLANET FITNESS GYM', -24.99])
    if (m % 3 === 1) rows.push([d(m, 9), 'GEICO AUTO INSURANCE', -312.4])
    rows.push([d(m, 13), 'AUSTIN ENERGY UTIL PMT', -Math.round(70 + r() * 60 + (m <= 2 ? 40 : 0))])
    for (let i = 0; i < 7; i++) rows.push([d(m, 1 + Math.floor(r() * 28)), ['WHOLE FOODS MKT #102', 'TRADER JOE S #552', 'ALDI 7741'][i % 3], -Math.round((30 + r() * 90) * 100) / 100])
    for (let i = 0; i < 6; i++) rows.push([d(m, 1 + Math.floor(r() * 28)), ['SQ *BLUE BOTTLE CAFE', 'DOORDASH*THAI HOUSE', 'CHIPOTLE 2231'][i % 3], -Math.round((6 + r() * 38) * 100) / 100])
    for (let i = 0; i < 3; i++) rows.push([d(m, 1 + Math.floor(r() * 28)), 'UBER *TRIP', -Math.round((9 + r() * 22) * 100) / 100])
    for (let i = 0; i < 2; i++) rows.push([d(m, 1 + Math.floor(r() * 28)), 'AMZN MKTP US*2K4L', -Math.round((15 + r() * 50) * 100) / 100])
    rows.push([d(m, 3 + Math.floor(r() * 20)), 'SHELL OIL 5744', -Math.round((38 + r() * 20) * 100) / 100])
  }
  rows.push(['2026-05-17', 'AMZN MKTP US*2K4L', -489.99], ['2026-03-22', 'DOORDASH*THAI HOUSE', -31.4], ['2026-03-22', 'DOORDASH*THAI HOUSE', -31.4], ['2026-04-28', 'OVERDRAFT FEE', -35], ['2026-02-14', 'DELTA AIR 006', -428.6], ['2026-06-10', 'AMAZON.COM REFUND', 42.99])
  rows.sort((a, b) => a[0].localeCompare(b[0]))
  let bal = 2140.5
  const lines = rows.map(([dt, desc, amt]) => {
    bal += amt
    return `${dt},"${desc}",${amt.toFixed(2)},${bal.toFixed(2)}`
  })
  const head = 'Date,Description,Amount,Balance'
  const a = lines.filter((l) => l < '2026-04-01'), b = lines.filter((l) => l >= '2026-03-01')
  return [{ name: 'statement-2026-Q1.csv', text: [head, ...a].join('\n') }, { name: 'statement-2026-Mar-Jun.csv', text: [head, ...b].join('\n') }]
}

const DEF = { sources: sample(), rules: RULES, cur: '$', opening: 0, skipTransfers: true, paste: '' }

export default function BankStatementAnalyzer() {
  const [s, set, reset] = useToolState('bank-statement-analyzer', DEF)
  const m = (x: number, dg = 2) => money(x, s.cur, dg)

  const data = useMemo(() => {
    const rules = parseRules(s.rules)
    const all: (Txn & { balance?: number })[] = []
    const errs: string[] = []
    for (const src of s.sources) {
      const rows = parseCsv(src.text.trim())
      if (rows.length < 2) { errs.push(`${src.name}: no rows`); continue }
      const head = rows[0], body = rows.slice(1)
      const cols = detectColumns(head, body.slice(0, 8))
      const bi = head.findIndex((h) => /balance|saldo/i.test(h))
      if (cols.date < 0 || (cols.amount < 0 && cols.debit < 0)) { errs.push(`${src.name}: could not find date/amount columns`); continue }
      const fmt = detectDateFormat(body.map((r) => r[cols.date] ?? ''))
      for (const r of body) {
        const t = toTxns([r], cols, fmt, rules)[0]
        if (t) all.push(bi >= 0 && (r[bi] ?? '').trim() ? { ...t, balance: parseAmount(r[bi]) } : t)
      }
    }
    const { rows, removed } = dedupe(all)
    rows.sort((a, b) => a.date.localeCompare(b.date))
    return { rows, removed, errs }
  }, [s.sources, s.rules])

  const { rows } = data
  const end = rows.at(-1)?.date ?? ''
  const isTransfer = (t: Txn) => s.skipTransfers && t.category === 'Transfers'
  const months = useMemo(() => monthly(rows, isTransfer), [rows, s.skipTransfers]) // eslint-disable-line react-hooks/exhaustive-deps
  const rec = useMemo(() => recurring(rows.filter((t) => !isTransfer(t)), end), [rows, end, s.skipTransfers]) // eslint-disable-line react-hooks/exhaustive-deps
  const bal = useMemo(() => balances(rows, s.opening), [rows, s.opening])
  const anom = useMemo(() => anomalies(rows.filter((t) => !isTransfer(t))), [rows, s.skipTransfers]) // eslint-disable-line react-hooks/exhaustive-deps
  const hasBalance = rows.length > 0 && rows.every((t) => t.balance !== undefined)

  const full = months.length > 2 ? months.slice(1, -1) : months // partial first/last months skew averages
  const avgIn = full.reduce((a, x) => a + x.income, 0) / (full.length || 1)
  const avgOut = full.reduce((a, x) => a + x.spending, 0) / (full.length || 1)
  const subs = rec.filter((x) => x.active && x.avg < 0)
  const subsMonthly = -subs.reduce((a, x) => a + x.monthly, 0)
  const cats = [...new Set(months.flatMap((x) => Object.keys(x.byCat)))].sort((a, b) => months.reduce((t, x) => t + (x.byCat[b] ?? 0), 0) - months.reduce((t, x) => t + (x.byCat[a] ?? 0), 0))
  const mLabel = (k: string) => new Date(k + '-01T00:00:00Z').toLocaleString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })
  const t0 = rows[0] ? Date.parse(rows[0].date) : 0
  const dayIdx = (d: string) => (Date.parse(d) - t0) / 86400000
  const fDay = (v: number) => new Date(t0 + v * 86400000).toISOString().slice(5, 10)

  const addFiles = async (fs: File[]) => {
    const add = await Promise.all(fs.map(async (f) => ({ name: f.name, text: await f.text() })))
    set({ sources: [...s.sources.filter((x) => !x.name.startsWith('statement-2026-')), ...add] })
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="Statements" actions={<Btn kind="ghost" onClick={reset}>Sample</Btn>}>
          <FileDrop accept=".csv,.tsv,.txt,text/csv" multiple onFiles={(fs) => void addFiles(fs)} label="Drop one or more bank CSV exports" />
          {s.sources.map((src, i) => (
            <Row key={src.name + i}>
              <span style={{ flex: 1 }}>📄 {src.name} <span className="muted">· {src.text.split('\n').length - 1} rows</span></span>
              <Btn kind="ghost" onClick={() => set({ sources: s.sources.filter((_, j) => j !== i) })}>✕</Btn>
            </Row>
          ))}
          <Area label="…or paste CSV" value={s.paste} onChange={(paste) => set({ paste })} rows={3} mono placeholder="Date,Description,Amount,Balance" />
          <Btn disabled={!s.paste.trim()} onClick={() => set({ sources: [...s.sources, { name: `pasted-${s.sources.length + 1}.csv`, text: s.paste }], paste: '' })}>Add pasted statement</Btn>
          {data.removed > 0 && <Note tone="ok">Merged overlapping statements: {data.removed} duplicate rows removed.</Note>}
          {data.errs.map((e) => <Note key={e} tone="err">{e}</Note>)}
        </Panel>
        <Panel title="Settings">
          <Row>
            <Select label="Currency" value={s.cur} onChange={(cur) => set({ cur })} options={['$', '€', '£', '₴', 'zł', '¥', 'CHF ']} />
            {!hasBalance && <Num label="Opening balance" value={s.opening} onChange={(opening) => set({ opening })} unit={s.cur} />}
          </Row>
          <Check label="Ignore transfers between own accounts" value={s.skipTransfers} onChange={(skipTransfers) => set({ skipTransfers })} />
        </Panel>
        <Panel title="Category rules">
          <Area value={s.rules} onChange={(rules) => set({ rules })} rows={10} mono />
          <p className="k-hint">One rule per line: <code>keyword, keyword: Category</code>. First match wins; unmatched outflows are “Uncategorized”.</p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Avg monthly income" value={m(avgIn, 0)} sub={`${rows.length} transactions · ${months.length} months`} />
          <Stat label="Avg monthly spending" value={m(avgOut, 0)} />
          <Stat label="Savings rate" value={pct(avgIn ? (avgIn - avgOut) / avgIn : 0, 0)} tone={avgIn > avgOut ? 'good' : 'bad'} sub={full.length < months.length ? 'full months only' : undefined} />
          <Stat label="Recurring bills" value={m(subsMonthly, 0) + '/mo'} sub={`${subs.length} active · ${m(subsMonthly * 12, 0)}/yr`} tone="accent" />
        </Stats>
        <Panel title="Income vs spending">
          <LineChart
            series={[
              { name: 'Income', points: months.map((x, i) => [i, x.income]), color: '#10b981' },
              { name: 'Spending', points: months.map((x, i) => [i, x.spending]), color: '#ef4444' },
              { name: 'Net', points: months.map((x, i) => [i, x.net]), color: '#6366f1', dashed: true },
            ]}
            fx={(v) => (Number.isInteger(v) && months[v] ? mLabel(months[v].month) : '')}
            fy={(v) => m(v, 0)}
          />
          <Table
            head={['Month', 'Income', 'Spending', 'Net', 'Saved']}
            rows={months.map((x) => [mLabel(x.month), m(x.income, 0), m(x.spending, 0), <b key="n" style={{ color: x.net >= 0 ? 'var(--ok)' : 'var(--err)' }}>{m(x.net, 0)}</b>, pct(x.income ? x.net / x.income : 0, 0)])}
          />
        </Panel>
        <Panel title={`Recurring payments & subscriptions (${rec.length})`} actions={<CsvButton name="recurring.csv" rows={() => [['Merchant', 'Category', 'Frequency', 'Last amount', 'Monthly', 'Yearly', 'Last', 'Next', 'Status'], ...rec.map((x) => [x.merchant, x.category, x.freq, x.last, x.monthly.toFixed(2), (x.monthly * 12).toFixed(2), x.lastDate, x.next, x.active ? 'active' : 'stopped'])]} />}>
          <Table
            head={['Merchant', 'Every', 'Amount', 'Per year', 'Next', 'Status']}
            rows={rec.map((x) => [
              <span key="m"><b>{x.merchant}</b><br /><span className="muted">{x.category} · {x.count}×</span></span>,
              x.freq,
              <span key="a" style={{ color: x.avg > 0 ? 'var(--ok)' : undefined }}>{m(x.last)}{!x.stable && <span className="muted"> (varies)</span>}</span>,
              m(x.monthly * 12, 0),
              x.active ? x.next : '—',
              x.priceChange && x.active ? <b key="p" style={{ color: x.priceChange < 0 ? 'var(--err)' : 'var(--ok)' }}>{x.priceChange < 0 ? '▲ price up ' : '▼ price down '}{m(Math.abs(x.priceChange))}</b> : x.active ? '✓ active' : <span key="s" className="muted">stopped?</span>,
            ])}
          />
          <p className="k-hint">Detected from merchants charged ≥ 3 times at a weekly, bi-weekly, monthly, quarterly or yearly cadence.</p>
        </Panel>
        <Panel title="Balance over time">
          {bal.points.length > 0 && <LineChart series={[{ name: 'Balance', points: bal.points.map((p) => [dayIdx(p.date), p.balance]), area: true }]} fx={fDay} fy={(v) => m(v, 0)} height={220} />}
          <Row>
            <span>Opening <b>{m(bal.opening)}</b></span>
            <span>Closing <b>{m(bal.closing)}</b></span>
            {bal.low && <span>Lowest <b style={{ color: bal.low.balance < 0 ? 'var(--err)' : undefined }}>{m(bal.low.balance)}</b> on {bal.low.date}</span>}
          </Row>
          {hasBalance ? (
            bal.breaks.length ? <Note tone="warn">Balance column jumps {bal.breaks.length}× (first: {bal.breaks[0].date}, expected {m(bal.breaks[0].expected)}, statement says {m(bal.breaks[0].actual)}). Transactions may be missing or the export is not in posting order.</Note> : <Note tone="ok">Running balance reconciles with every row of the statement.</Note>
          ) : <Note>No balance column found, so the balance is rebuilt from the opening balance.</Note>}
        </Panel>
        <Panel title="Spending by category per month" actions={<CsvButton name="categories-by-month.csv" rows={() => [['Category', ...months.map((x) => x.month)], ...cats.map((c) => [c, ...months.map((x) => (x.byCat[c] ?? 0).toFixed(2))])]} />}>
          <Table
            head={['Category', ...months.map((x) => mLabel(x.month)), 'Trend']}
            rows={cats.map((c) => {
              const v = months.map((x) => x.byCat[c] ?? 0)
              const prev = v.slice(0, -1), avg = prev.reduce((a, b) => a + b, 0) / (prev.length || 1)
              const last = v[v.length - 1]
              const ch = avg ? (last - avg) / avg : 0
              return [<b key="c">{c}</b>, ...v.map((x) => (x ? m(x, 0) : '·')), <span key="t" style={{ color: ch > 0.2 ? 'var(--err)' : ch < -0.2 ? 'var(--ok)' : undefined }}>{ch > 0.2 ? '▲' : ch < -0.2 ? '▼' : '≈'} {pct(ch, 0)}</span>]
            })}
          />
        </Panel>
        <Panel title={`Unusual transactions (${anom.length})`}>
          {anom.length ? (
            <Table head={['Date', 'Merchant', 'Amount', 'Why']} rows={anom.map((a) => [a.t.date, a.t.merchant, m(a.t.amount), a.reason])} max={20} />
          ) : <Note tone="ok">Nothing unusual found.</Note>}
        </Panel>
        <Panel title="Transactions" actions={<CsvButton name="transactions-categorized.csv" rows={() => [['Date', 'Description', 'Merchant', 'Category', 'Amount', 'Balance'], ...rows.map((t) => [t.date, t.desc, t.merchant, t.category, t.amount, t.balance ?? ''])]} />}>
          <Table head={['Date', 'Merchant', 'Category', 'Amount']} rows={[...rows].reverse().map((t) => [t.date, t.merchant, t.category, <span key="a" style={{ color: t.amount > 0 ? 'var(--ok)' : undefined }}>{m(t.amount)}</span>])} max={40} />
        </Panel>
      </div>
    </Split>
  )
}
