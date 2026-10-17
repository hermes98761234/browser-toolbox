import { useMemo, useState } from 'react'
import { Area, BarChart, Btn, Check, color, CsvButton, Donut, FileDrop, JsonButtons, money, Note, Panel, pct, Row, Select, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { detectColumns, detectDateFormat, groupSum, parseCsv, toTxns, type DateFmt, type Rule } from './lib/bank-csv-analyzer'

const CATS = ['Groceries', 'Dining', 'Transport', 'Fuel', 'Housing', 'Utilities', 'Subscriptions', 'Shopping', 'Health', 'Entertainment', 'Travel', 'Fees', 'Transfers', 'Income', 'Uncategorized']

const RULES: Rule[] = [
  { kw: 'refund', cat: 'Income' },
  ...'whole foods,trader joe,kroger,safeway,aldi,lidl,tesco,sainsbury,costco,walmart grocery,publix,wegmans'.split(',').map((kw) => ({ kw, cat: 'Groceries' })),
  ...'uber eats,doordash,grubhub,deliveroo,starbucks,mcdonald,chipotle,blue bottle,pizza,cafe,restaurant'.split(',').map((kw) => ({ kw, cat: 'Dining' })),
  ...'uber,lyft,mta,metro,transit,parking,train,amtrak'.split(',').map((kw) => ({ kw, cat: 'Transport' })),
  ...'shell,chevron,exxon,bp ,fuel,gas station'.split(',').map((kw) => ({ kw, cat: 'Fuel' })),
  ...'rent,mortgage,property mgmt'.split(',').map((kw) => ({ kw, cat: 'Housing' })),
  ...'electric,energy,water,comcast,verizon,at&t,t-mobile,internet'.split(',').map((kw) => ({ kw, cat: 'Utilities' })),
  ...'netflix,spotify,hulu,disney,apple.com/bill,icloud,youtube,adobe,dropbox,patreon'.split(',').map((kw) => ({ kw, cat: 'Subscriptions' })),
  ...'amazon,amzn,target,ikea,best buy,etsy,ebay,zara,h&m'.split(',').map((kw) => ({ kw, cat: 'Shopping' })),
  ...'pharmacy,cvs,walgreens,dental,clinic,gym,fitness'.split(',').map((kw) => ({ kw, cat: 'Health' })),
  ...'cinema,amc,steam,ticketmaster,concert'.split(',').map((kw) => ({ kw, cat: 'Entertainment' })),
  ...'airbnb,hotel,airline,delta,united,booking.com,expedia'.split(',').map((kw) => ({ kw, cat: 'Travel' })),
  ...'fee,interest charge,overdraft,atm'.split(',').map((kw) => ({ kw, cat: 'Fees' })),
  ...'transfer,zelle,venmo,savings'.split(',').map((kw) => ({ kw, cat: 'Transfers' })),
  ...'payroll,salary,deposit'.split(',').map((kw) => ({ kw, cat: 'Income' })),
]

function sampleCsv(): string {
  let seed = 7
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const lines = ['Date,Description,Amount,Balance']
  const items: [string, number, number, number][] = [
    // desc, min, max, times per month
    ['WHOLE FOODS MKT #10234 AUSTIN TX', 38, 140, 5], ['TRADER JOE S #552', 25, 80, 3], ['SQ *BLUE BOTTLE COFFEE 0412', 4.5, 9, 6],
    ['DOORDASH*THAI HOUSE', 22, 48, 3], ['CHIPOTLE 2231', 11, 16, 2], ['UBER *TRIP HELP.UBER.COM', 9, 31, 4], ['SHELL OIL 57442190', 35, 62, 2],
    ['AMZN Mktp US*2K4LZ0 amzn.com/bill', 12, 95, 4], ['TARGET 00012345', 20, 110, 1], ['CVS/PHARMACY #07421', 8, 40, 1],
    ['NETFLIX.COM', 15.49, 15.49, 1], ['SPOTIFY USA', 11.99, 11.99, 1], ['PLANET FITNESS CLUB FEES', 24.99, 24.99, 1], ['AUSTIN ENERGY UTIL PMT', 72, 128, 1],
    ['COMCAST CABLE COMM', 79.99, 79.99, 1], ['STEAMGAMES.COM 4259522985', 9.99, 39.99, 1], ['CORNER BOOKSHOP', 14, 36, 1], ['FARMERS MARKET SOUTH', 18, 34, 2],
  ]
  let bal = 4210.55
  for (const mo of [7, 8, 9]) {
    const rows: [number, string, number][] = [
      [1, 'RENT - MAPLE PROPERTY MGMT', -1850], [1, 'PAYROLL ACME CORP DIR DEP', 3420.18], [15, 'PAYROLL ACME CORP DIR DEP', 3420.18], [16, 'TRANSFER TO SAVINGS 4421', -600],
    ]
    for (const [d, mn, mx, n] of items) for (let i = 0; i < n; i++) rows.push([1 + Math.floor(r() * 28), d, -Math.round((mn + r() * (mx - mn)) * 100) / 100])
    if (mo === 8) rows.push([12, 'DELTA AIR 0062341', -386.4], [13, 'AIRBNB * HMXQ2', -512], [20, 'MONTHLY SERVICE FEE', -12])
    if (mo === 9) rows.push([5, 'AMAZON.COM REFUND', 42.99])
    rows.sort((a, b) => a[0] - b[0])
    for (const [d, desc, amt] of rows) {
      bal += amt
      lines.push(`${String(mo).padStart(2, '0')}/${String(d).padStart(2, '0')}/2026,"${desc}",${amt.toFixed(2)},${bal.toFixed(2)}`)
    }
  }
  return lines.join('\n')
}

const DEF = { csv: sampleCsv(), rules: RULES, dateCol: -2, descCol: -2, amtCol: -2, fmt: 'auto' as 'auto' | DateFmt, flip: false, cur: '$', month: 'all', name: 'sample-statement.csv' }

export default function BankCsvAnalyzer() {
  const [s, set, reset] = useToolState('bank-csv-analyzer', DEF)
  const [q, setQ] = useState('')
  const [showRaw, setShowRaw] = useState(false)
  const rows = useMemo(() => parseCsv(s.csv), [s.csv])
  const head = useMemo(() => rows[0] ?? [], [rows])
  const body = useMemo(() => rows.slice(1), [rows])
  const auto = useMemo(() => detectColumns(head, body.slice(0, 20)), [head, body])
  const cols = { ...auto, ...(s.dateCol > -2 ? { date: s.dateCol } : {}), ...(s.descCol > -2 ? { desc: s.descCol } : {}), ...(s.amtCol > -2 ? { amount: s.amtCol } : {}) }
  const fmt: DateFmt = s.fmt === 'auto' ? detectDateFormat(body.slice(0, 50).map((r) => r[cols.date] ?? '')) : s.fmt
  const all = useMemo(() => toTxns(body, cols, fmt, s.rules, s.flip), [body, cols.date, cols.desc, cols.amount, cols.debit, cols.credit, fmt, s.rules, s.flip]) // eslint-disable-line react-hooks/exhaustive-deps
  const months = [...new Set(all.map((t) => t.date.slice(0, 7)))].sort()
  const txns = s.month === 'all' ? all : all.filter((t) => t.date.startsWith(s.month))
  const m = (x: number) => money(x, s.cur)
  const income = txns.filter((t) => t.amount > 0 && t.category !== 'Transfers').reduce((a, t) => a + t.amount, 0)
  const spend = -txns.filter((t) => t.amount < 0 && t.category !== 'Transfers').reduce((a, t) => a + t.amount, 0)
  const unc = txns.filter((t) => t.category === 'Uncategorized')
  const byCat = [...groupSum(txns.filter((t) => t.amount < 0 && t.category !== 'Transfers'), (t) => t.category)].map(([k, v]) => ({ k, v: -v.total, n: v.count })).sort((a, b) => b.v - a.v)
  const catColor = (c: string) => (c === 'Uncategorized' ? '#94a3b8' : color(CATS.indexOf(c) >= 0 ? CATS.indexOf(c) : CATS.length + c.length))
  const merchants = [...groupSum(txns.filter((t) => t.amount < 0), (t) => t.merchant)].map(([k, v]) => ({ k, total: -v.total, n: v.count, cat: txns.find((t) => t.merchant === k)!.category })).sort((a, b) => b.total - a.total)
  const topCats = byCat.slice(0, 6).map((x) => x.k)
  const monthly = months.map((mo) => {
    const mt = all.filter((t) => t.date.startsWith(mo) && t.amount < 0 && t.category !== 'Transfers')
    const vals = topCats.map((c) => -mt.filter((t) => t.category === c).reduce((a, t) => a + t.amount, 0))
    return { label: new Date(`${mo}-01T00:00`).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), value: [...vals, -mt.filter((t) => !topCats.includes(t.category)).reduce((a, t) => a + t.amount, 0)] }
  })
  const addRule = (kw: string, cat: string) => set({ rules: [{ kw: kw.toLowerCase(), cat }, ...s.rules.filter((r) => r.kw !== kw.toLowerCase())] })
  const colOpts: [number, string][] = [[-2, 'Auto'], [-1, '— none —'], ...head.map((h, i) => [i, h || `Column ${i + 1}`] as [number, string])]
  const shown = txns.filter((t) => !q || `${t.desc} ${t.category} ${t.merchant}`.toLowerCase().includes(q.toLowerCase()))
  const ok = cols.date >= 0 && cols.desc >= 0 && (cols.amount >= 0 || cols.debit >= 0 || cols.credit >= 0)

  return (
    <Split wide="right">
      <div>
        <Panel title="Statement">
          <FileDrop accept=".csv,.txt,text/csv" onFiles={async ([f]) => set({ csv: await f.text(), name: f.name, dateCol: -2, descCol: -2, amtCol: -2, month: 'all' })} label="Drop your bank's CSV export" />
          <p className="muted" style={{ fontSize: 13, margin: '6px 0' }}>{s.name} · {body.length} rows · processed locally, nothing is uploaded.</p>
          <Row>
            <Btn kind="ghost" onClick={() => set({ csv: sampleCsv(), name: 'sample-statement.csv', dateCol: -2, descCol: -2, amtCol: -2, month: 'all' })}>Load sample</Btn>
            <Btn kind="ghost" onClick={() => setShowRaw(!showRaw)}>{showRaw ? 'Hide' : 'Edit'} raw CSV</Btn>
          </Row>
          {showRaw && <Area value={s.csv} onChange={(csv) => set({ csv })} rows={8} mono />}
        </Panel>
        <Panel title="Columns">
          <Row>
            <Select label={`Date${s.dateCol === -2 ? ` (→ ${head[auto.date] ?? '?'})` : ''}`} value={s.dateCol} onChange={(dateCol) => set({ dateCol })} options={colOpts} />
            <Select label={`Description${s.descCol === -2 ? ` (→ ${head[auto.desc] ?? '?'})` : ''}`} value={s.descCol} onChange={(descCol) => set({ descCol })} options={colOpts} />
          </Row>
          <Row>
            <Select label={`Amount${s.amtCol === -2 ? ` (→ ${auto.amount >= 0 ? head[auto.amount] : auto.debit >= 0 ? 'debit/credit' : '?'})` : ''}`} value={s.amtCol} onChange={(amtCol) => set({ amtCol })} options={colOpts} />
            <Select label={`Date format${s.fmt === 'auto' ? ` (→ ${fmt.toUpperCase()})` : ''}`} value={s.fmt} onChange={(v) => set({ fmt: v })} options={[['auto', 'Auto'], ['ymd', 'YYYY-MM-DD'], ['dmy', 'DD/MM/YYYY'], ['mdy', 'MM/DD/YYYY']]} />
          </Row>
          <Row>
            <Check label="Spending is positive in my file (flip signs)" value={s.flip} onChange={(flip) => set({ flip })} />
            <Select label="Currency" value={s.cur} onChange={(cur) => set({ cur })} options={['$', '€', '£', '₴', 'zł', 'CHF ']} />
          </Row>
          {!ok && <Note tone="err">Couldn't find date, description and amount columns — pick them above.</Note>}
        </Panel>
        <Panel title={`Rules (${s.rules.length})`} actions={<><Btn onClick={() => set({ rules: [{ kw: '', cat: 'Shopping' }, ...s.rules] })}>+ Rule</Btn><JsonButtons name="bank-rules.json" data={s.rules} onLoad={(rules) => Array.isArray(rules) && set({ rules })} /></>}>
          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>If the description contains the keyword, the category applies. First match wins — put specific rules (“uber eats”) above general ones (“uber”).</p>
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            <Table
              head={['Keyword', 'Category', '']}
              rows={s.rules.map((r, i) => [
                <input key="k" value={r.kw} onChange={(e) => set({ rules: s.rules.map((x, j) => (j === i ? { ...x, kw: e.target.value } : x)) })} aria-label="Keyword" style={{ width: 130 }} />,
                <select key="c" value={r.cat} onChange={(e) => set({ rules: s.rules.map((x, j) => (j === i ? { ...x, cat: e.target.value } : x)) })} aria-label="Category">{CATS.map((c) => <option key={c}>{c}</option>)}</select>,
                <Btn key="x" kind="ghost" onClick={() => set({ rules: s.rules.filter((_, j) => j !== i) })} title="Remove">✕</Btn>,
              ])}
            />
          </div>
          <Btn kind="ghost" onClick={() => set({ rules: RULES })}>Restore default rules</Btn>
        </Panel>
      </div>
      <div>
        <Row>
          <Select label="Period" value={s.month} onChange={(month) => set({ month })} options={[['all', `All (${months.length} months)`], ...months.map((mo) => [mo, new Date(`${mo}-01T00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })] as [string, string])]} />
        </Row>
        <Stats>
          <Stat label="Income" value={m(income)} tone="good" />
          <Stat label="Spending" value={m(spend)} sub={s.month === 'all' && months.length ? `${m(spend / months.length)} / month` : undefined} />
          <Stat label="Net" value={m(income - spend)} tone={income - spend >= 0 ? 'good' : 'bad'} sub={income ? `${pct((income - spend) / income, 0)} saved` : undefined} />
          <Stat label="Uncategorized" value={unc.length} tone={unc.length ? 'bad' : 'good'} sub={`${m(-unc.reduce((a, t) => a + t.amount, 0))}`} />
        </Stats>
        <Split>
          <Panel title="Spending by category">
            <Donut slices={byCat.map((c) => ({ label: c.k, value: +c.v.toFixed(2), color: catColor(c.k) }))} fv={(v) => money(v, s.cur, 0)} size={180} center={<b>{money(spend, s.cur, 0)}</b>} />
          </Panel>
          <Panel title="By month">
            <BarChart bars={monthly} stacks={[...topCats.map((c) => ({ name: c, color: catColor(c) })), { name: 'Other', color: '#cbd5e1' }]} fy={(v) => money(v, s.cur, 0)} height={220} />
          </Panel>
        </Split>
        <Panel title="Merchants" actions={<CsvButton name="merchants.csv" rows={() => [['Merchant', 'Category', 'Transactions', 'Total', 'Average'], ...merchants.map((x) => [x.k, x.cat, x.n, x.total.toFixed(2), (x.total / x.n).toFixed(2)])]} />}>
          <Table
            head={['Merchant', 'Category', '#', 'Total', 'Avg']}
            rows={merchants.map((x) => [
              x.k,
              x.cat === 'Uncategorized' ? (
                <select key="c" value="" onChange={(e) => e.target.value && addRule(x.k, e.target.value)} aria-label="Assign category" style={{ color: 'var(--err)' }}>
                  <option value="">Assign…</option>
                  {CATS.filter((c) => c !== 'Uncategorized').map((c) => <option key={c}>{c}</option>)}
                </select>
              ) : (
                <span key="c" style={{ color: catColor(x.cat), fontWeight: 700 }}>{x.cat}</span>
              ),
              x.n,
              <b key="t">{m(x.total)}</b>,
              m(x.total / x.n),
            ])}
            max={15}
          />
        </Panel>
        <Panel title={`Transactions (${shown.length})`} actions={<CsvButton name="categorized-transactions.csv" rows={() => [['Date', 'Description', 'Merchant', 'Category', 'Amount'], ...all.map((t) => [t.date, t.desc, t.merchant, t.category, t.amount.toFixed(2)])]} />}>
          <Txt label="Search" value={q} onChange={setQ} placeholder="coffee, Dining, amazon…" />
          <Table
            head={['Date', 'Description', 'Category', 'Amount']}
            rows={[...shown].sort((a, b) => b.date.localeCompare(a.date)).map((t) => [t.date, <span key="d" title={t.desc}>{t.merchant}</span>, <span key="c" style={{ color: catColor(t.category) }}>{t.category}</span>, <b key="a" style={{ color: t.amount > 0 ? 'var(--ok)' : undefined }}>{m(t.amount)}</b>])}
            max={40}
          />
        </Panel>
        <Row>
          <Btn kind="ghost" onClick={reset}>Reset everything</Btn>
        </Row>
      </div>
    </Split>
  )
}
