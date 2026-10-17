import { Btn, Check, CsvButton, Donut, JsonButtons, money, Note, Num, Panel, Row, Select, Split, Stat, Stats, Table, today, Txt, uid, useToolState } from '../kit'
import { breakdown, countTotal, CURRENCIES, denKey, reconcile, toCents } from './lib/petty-cash-reconciler'

interface Voucher {
  id: string
  date: string
  no: string
  payee: string
  category: string
  amount: number
  receipt: boolean
}
interface Snapshot {
  id: string
  date: string
  period: string
  float: number
  counted: number
  vouchers: number
  variance: number
  status: string
}
interface State {
  currency: string
  custodian: string
  period: string
  float: number
  ious: number
  cashIn: number
  tolerance: number
  counts: Record<string, number>
  vouchers: Voucher[]
  history: Snapshot[]
}

const CATS = ['Office supplies', 'Postage & courier', 'Travel & parking', 'Refreshments', 'Cleaning', 'Repairs', 'Other']

const DEF: State = {
  currency: 'USD',
  custodian: 'J. Rivera (Front desk)',
  period: 'October 2026, week 2',
  float: 500,
  ious: 20,
  cashIn: 0,
  tolerance: 0,
  counts: { n5000: 2, n2000: 8, n1000: 3, n500: 3, n100: 6, c25: 4, c10: 3, c5: 1, c1: 5 },
  vouchers: [
    { id: 'v1', date: '2026-10-05', no: 'PC-101', payee: 'Staples', category: 'Office supplies', amount: 42.18, receipt: true },
    { id: 'v2', date: '2026-10-06', no: 'PC-102', payee: 'USPS', category: 'Postage & courier', amount: 18.6, receipt: true },
    { id: 'v3', date: '2026-10-07', no: 'PC-103', payee: 'City parking', category: 'Travel & parking', amount: 24, receipt: true },
    { id: 'v4', date: '2026-10-08', no: 'PC-104', payee: 'Corner Bakery', category: 'Refreshments', amount: 36.75, receipt: true },
    { id: 'v5', date: '2026-10-09', no: 'PC-105', payee: 'Ace Hardware', category: 'Repairs', amount: 27.49, receipt: false },
    { id: 'v6', date: '2026-10-09', no: 'PC-106', payee: 'Taxi — client visit', category: 'Travel & parking', amount: 18.33, receipt: true },
  ],
  history: [],
}

export default function PettyCashReconciler() {
  const [s, set, reset] = useToolState('petty-cash-reconciler', DEF)
  const cur = CURRENCIES[s.currency] ?? CURRENCIES.USD
  const m = (cents: number) => money(cents / 100, cur.sym)
  const counted = countTotal(cur.dens, s.counts)
  const vTotal = s.vouchers.reduce((a, v) => a + toCents(v.amount), 0)
  const r = reconcile(toCents(s.float), counted, vTotal, toCents(s.ious), toCents(s.cashIn), toCents(s.tolerance))
  const missing = s.vouchers.filter((v) => !v.receipt)
  const cats = CATS.map((c) => ({ label: c, value: s.vouchers.filter((v) => v.category === c).reduce((a, v) => a + toCents(v.amount), 0) / 100 })).filter((c) => c.value > 0)
  const editV = (id: string, p: Partial<Voucher>) => set({ vouchers: s.vouchers.map((v) => (v.id === id ? { ...v, ...p } : v)) })
  const setCount = (k: string, n: number) => set({ counts: { ...s.counts, [k]: Math.max(0, Math.floor(n) || 0) } })
  const notes = cur.dens.filter((d) => !d.coin)
  const coins = cur.dens.filter((d) => d.coin)
  const tone = r.status === 'balanced' ? 'ok' : r.status === 'over' ? 'warn' : 'err'
  const inp = { width: 64, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--panel)', color: 'inherit' } as const
  const denLabel = (c: number) => (c >= 100 ? `${cur.sym}${c / 100}` : `${c}¢`)

  const grid = (list: typeof cur.dens, title: string) => (
    <div>
      <h4 style={{ margin: '4px 0 6px' }}>{title}</h4>
      {list.map((d) => {
        const k = denKey(d)
        const n = s.counts[k] ?? 0
        return (
          <div key={k} style={{ display: 'grid', gridTemplateColumns: '72px 64px 1fr', gap: 8, alignItems: 'center', margin: '3px 0' }}>
            <b>{denLabel(d.c)}</b>
            <input type="number" min={0} step={1} value={n} onChange={(e) => setCount(k, Number(e.target.value))} aria-label={`${denLabel(d.c)} ${d.coin ? 'coins' : 'notes'}`} style={inp} />
            <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: n ? undefined : 'var(--muted)' }}>{m(n * d.c)}</span>
          </div>
        )
      })}
    </div>
  )

  return (
    <Split wide="right">
      <div>
        <Panel title="Fund">
          <Row>
            <Select label="Currency" value={s.currency} onChange={(currency) => set({ currency, counts: {} })} options={Object.keys(CURRENCIES)} />
            <Num label="Imprest float" value={s.float} onChange={(float) => set({ float })} min={0} unit={cur.sym.trim()} hint="Fixed fund amount" />
          </Row>
          <Row>
            <Txt label="Custodian" value={s.custodian} onChange={(custodian) => set({ custodian })} />
            <Txt label="Period" value={s.period} onChange={(period) => set({ period })} />
          </Row>
          <Row>
            <Num label="IOUs / advances out" value={s.ious} onChange={(ious) => set({ ious })} min={0} unit={cur.sym.trim()} hint="Signed slips, not yet settled" />
            <Num label="Cash added in" value={s.cashIn} onChange={(cashIn) => set({ cashIn })} min={0} unit={cur.sym.trim()} hint="Refunds, change returned" />
            <Num label="Tolerance" value={s.tolerance} onChange={(tolerance) => set({ tolerance })} min={0} unit={cur.sym.trim()} />
          </Row>
        </Panel>
        <Panel title={`Cash count · ${m(counted)}`} actions={<Btn kind="ghost" onClick={() => set({ counts: {} })}>Clear count</Btn>}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            {grid(notes, 'Notes')}
            {grid(coins, 'Coins')}
          </div>
          <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>
            {cur.dens.reduce((a, d) => a + (s.counts[denKey(d)] ?? 0), 0)} pieces · notes {m(countTotal(notes, s.counts))} · coins {m(countTotal(coins, s.counts))}
          </p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Expected cash" value={m(r.expected)} sub="float + in − vouchers − IOUs" />
          <Stat label="Counted" value={m(counted)} />
          <Stat label={r.status === 'over' ? 'Over' : r.status === 'short' ? 'Short' : 'Variance'} value={m(r.variance)} tone={r.status === 'balanced' ? 'good' : 'bad'} />
          <Stat label="Top-up to restore float" value={m(r.topUp)} tone="accent" sub={`vouchers ${m(vTotal)}`} />
        </Stats>
        <Note tone={tone}>
          {r.status === 'balanced'
            ? `Balanced. Cash + vouchers + IOUs account for the full ${m(r.float + r.cashIn)}.`
            : r.status === 'short'
              ? `Cash is short by ${m(-r.variance)}. Look for a missing voucher, an unrecorded IOU or a counting error before booking it to cash over/short.`
              : `Cash is over by ${m(r.variance)}. Check for unrecorded cash received or a voucher entered twice.`}
          {missing.length > 0 && ` ${missing.length} voucher(s) have no receipt attached.`}
        </Note>
        <Panel
          title={`Vouchers (${s.vouchers.length})`}
          actions={
            <>
              <Btn onClick={() => set({ vouchers: [...s.vouchers, { id: uid(), date: today(), no: `PC-${100 + s.vouchers.length + 1}`, payee: '', category: 'Other', amount: 0, receipt: true }] })}>+ Voucher</Btn>
              <CsvButton name="petty-cash-vouchers.csv" rows={() => [['Date', 'Voucher', 'Payee', 'Category', 'Amount', 'Receipt'], ...s.vouchers.map((v) => [v.date, v.no, v.payee, v.category, v.amount.toFixed(2), v.receipt ? 'yes' : 'no'])]} />
            </>
          }
        >
          <Table
            head={['Date', 'No.', 'Payee', 'Category', 'Amount', 'Rcpt', '']}
            rows={s.vouchers.map((v) => [
              <input key="d" type="date" value={v.date} onChange={(e) => editV(v.id, { date: e.target.value })} aria-label="Date" style={{ width: 130 }} />,
              <input key="n" value={v.no} onChange={(e) => editV(v.id, { no: e.target.value })} aria-label="Voucher number" style={{ width: 70 }} />,
              <input key="p" value={v.payee} onChange={(e) => editV(v.id, { payee: e.target.value })} aria-label="Payee" />,
              <select key="c" value={v.category} onChange={(e) => editV(v.id, { category: e.target.value })} aria-label="Category">{CATS.map((c) => <option key={c}>{c}</option>)}</select>,
              <input key="a" type="number" min={0} step="0.01" value={v.amount} onChange={(e) => editV(v.id, { amount: Math.max(0, Number(e.target.value) || 0) })} aria-label="Amount" style={{ width: 84 }} />,
              <Check key="r" label="" value={v.receipt} onChange={(receipt) => editV(v.id, { receipt })} />,
              <Btn key="x" kind="ghost" title="Remove" onClick={() => set({ vouchers: s.vouchers.filter((x) => x.id !== v.id) })}>✕</Btn>,
            ])}
            foot={['Total', '', '', '', m(vTotal), '', '']}
          />
        </Panel>
        {cats.length > 0 && (
          <Panel title="Spending by category">
            <Donut slices={cats} fv={(v) => money(v, cur.sym)} center={<span>{m(vTotal)}</span>} size={180} />
          </Panel>
        )}
        <Panel title="Replenishment">
          {r.topUp > 0 ? (
            <>
              <p style={{ marginTop: 0 }}>Request a cheque / withdrawal of <b>{m(r.topUp)}</b> to bring the fund back to {m(r.float)}. Suggested make-up:</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {breakdown(r.topUp, cur.dens).map(({ d, n }) => (
                  <span key={denKey(d)} style={{ padding: '3px 10px', borderRadius: 99, border: '1px solid var(--line)', fontSize: 13 }}>{n} × {denLabel(d.c)}</span>
                ))}
              </div>
            </>
          ) : (
            <p className="muted" style={{ margin: 0 }}>The fund is at or above its float — no top-up needed.</p>
          )}
        </Panel>
        <Panel
          title="Report & history"
          actions={
            <>
              <Btn kind="primary" onClick={() => set({ history: [{ id: uid(), date: today(), period: s.period, float: r.float, counted, vouchers: vTotal, variance: r.variance, status: r.status }, ...s.history].slice(0, 50) })}>Save reconciliation</Btn>
              <Btn onClick={() => window.print()}>🖨 Print</Btn>
              <JsonButtons name="petty-cash.json" data={s} onLoad={(d) => set(d)} />
              <Btn kind="ghost" onClick={reset}>Reset</Btn>
            </>
          }
        >
          <div className="pc-report" style={{ fontSize: 14 }}>
            <style>{'@media print { body * { visibility: hidden } .pc-report, .pc-report * { visibility: visible } .pc-report { position: absolute; inset: 0 0 auto 0; color: #000 } .pc-report button { display: none } }'}</style>
            <h4 style={{ margin: '0 0 4px' }}>Petty cash reconciliation — {s.period}</h4>
            <div className="muted">Custodian: {s.custodian} · Prepared {today()} · {s.currency}</div>
            <table style={{ width: '100%', maxWidth: 420, borderCollapse: 'collapse', margin: '10px 0' }}>
              <tbody>
                {([['Imprest float', r.float], ['+ Cash added in', r.cashIn], ['− Vouchers paid', -vTotal], ['− IOUs outstanding', -r.ious], ['= Expected cash on hand', r.expected], ['Cash counted', counted], ['Over / (short)', r.variance]] as const).map(([l, v]) => (
                  <tr key={l} style={{ borderTop: l.startsWith('=') || l.startsWith('Over') ? '1px solid var(--line)' : undefined, fontWeight: l.startsWith('=') || l.startsWith('Over') ? 700 : 400 }}>
                    <td style={{ padding: '3px 0' }}>{l}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{m(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', gap: 30, marginTop: 24, flexWrap: 'wrap' }}>
              {['Counted by', 'Verified by'].map((x) => <div key={x} style={{ borderTop: '1px solid var(--muted)', width: 180, paddingTop: 4, fontSize: 12 }} className="muted">{x}</div>)}
            </div>
          </div>
          {s.history.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <Table
                head={['Saved', 'Period', 'Counted', 'Vouchers', 'Variance', '']}
                rows={s.history.map((h) => [h.date, h.period, m(h.counted), m(h.vouchers), <b key="v" style={{ color: h.status === 'balanced' ? 'var(--ok)' : 'var(--err)' }}>{m(h.variance)}</b>, <Btn key="x" kind="ghost" onClick={() => set({ history: s.history.filter((x) => x.id !== h.id) })}>✕</Btn>])}
              />
            </div>
          )}
        </Panel>
      </div>
    </Split>
  )
}
