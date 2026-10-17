import { useState } from 'react'
import { BarChart, Btn, CsvButton, LineChart, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, Txt, download, money, num, uid, useToolState } from '../kit'
import { PER_YEAR, basePayment, byYear, schedule, summary, toXlsx, type Freq, type LoanIn } from './lib/loan-amortization-calculator'

interface State extends LoanIn { currency: string; view: 'year' | 'period'; lumps: { id?: string; date: string; amount: number }[] }
const DEF: State = { currency: '$', principal: 320000, apr: 6.25, years: 30, freq: 'monthly', start: '2026-11-01', extra: 150, yearlyExtra: 2000, yearlyMonth: 4, lumps: [{ id: 'l1', date: '2029-06-01', amount: 10000 }], view: 'year' }
const PRESETS: [string, Partial<State>][] = [
  ['30-yr mortgage', { principal: 320000, apr: 6.25, years: 30 }],
  ['15-yr mortgage', { principal: 320000, apr: 5.6, years: 15 }],
  ['Car loan', { principal: 28000, apr: 7.4, years: 5 }],
  ['Student loan', { principal: 35000, apr: 5.5, years: 10 }],
  ['Personal loan', { principal: 12000, apr: 11.9, years: 3 }],
]
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const ym = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`
function span(periods: number, freq: Freq) {
  const months = Math.round((periods / PER_YEAR[freq]) * 12)
  return `${Math.floor(months / 12)} yr ${months % 12} mo`
}

export default function LoanAmortizationCalculator() {
  const [s, set, reset] = useToolState('loan-amortization-calculator', DEF)
  const [page, setPage] = useState(0)
  const m = (x: number, d = 2) => money(x, s.currency, d)
  const valid = s.principal > 0 && s.apr >= 0 && s.years > 0 && s.years <= 50 && /^\d{4}-\d{2}-\d{2}$/.test(s.start)
  const rows = valid ? schedule(s) : []
  const plain = valid ? schedule(s, false) : []
  const S = summary(rows), B = summary(plain)
  const pay = valid ? basePayment(s) : 0
  const years = byYear(rows)
  const hasExtra = s.extra > 0 || s.yearlyExtra > 0 || s.lumps.some((l) => l.amount > 0)
  const per = PER_YEAR[s.freq]
  const PAGE = 24
  const pages = Math.ceil(rows.length / PAGE)
  const head = ['#', 'Date', 'Payment', 'Principal', 'Interest', 'Extra', 'Balance', 'Total interest']
  const table = () => [head, ...rows.map((r) => [r.n, r.date, r.payment, r.principal, r.interest, r.extra, r.balance, r.cumInterest])]
  const freqLabel = { monthly: 'monthly', biweekly: 'bi-weekly', accelerated: 'accelerated bi-weekly', weekly: 'weekly' }[s.freq]

  return (
    <Split>
      <div>
        <Panel title="Loan">
          <Row>{PRESETS.map(([l, p]) => <Btn key={l} kind="ghost" onClick={() => set(p)}>{l}</Btn>)}</Row>
          <Row>
            <Num label="Loan amount" value={s.principal} onChange={(principal) => set({ principal })} unit={s.currency} min={1} />
            <Num label="Interest rate (APR)" value={s.apr} onChange={(apr) => set({ apr })} unit="%" min={0} max={100} step={0.05} />
          </Row>
          <Row>
            <Num label="Term" value={s.years} onChange={(years) => set({ years })} unit="years" min={0.25} max={50} />
            <Txt type="date" label="First payment" value={s.start} onChange={(start) => set({ start })} />
          </Row>
          <Row>
            <Select label="Payment frequency" value={s.freq} onChange={(freq) => set({ freq })} options={[['monthly', 'Monthly'], ['biweekly', 'Bi-weekly (26/yr)'], ['accelerated', 'Accelerated bi-weekly'], ['weekly', 'Weekly']]} />
            <Select label="Currency" value={s.currency} onChange={(currency) => set({ currency })} options={['$', '€', '£', '₴', 'zł', 'CHF ', '¥']} />
          </Row>
          {s.freq === 'accelerated' && <Note>Accelerated bi-weekly pays half the monthly payment every two weeks — 26 half-payments = 13 monthly payments a year, which pays the loan off years early.</Note>}
          {!valid && <Note tone="err">Enter a positive amount, a term up to 50 years and a valid first payment date.</Note>}
        </Panel>
        <Panel title="Extra payments">
          <Num label={`Extra with every ${freqLabel} payment`} value={s.extra} onChange={(extra) => set({ extra: Math.max(0, extra) })} unit={s.currency} min={0} />
          <Row>
            <Num label="Extra once a year" value={s.yearlyExtra} onChange={(yearlyExtra) => set({ yearlyExtra: Math.max(0, yearlyExtra) })} unit={s.currency} min={0} />
            <Select label="In" value={s.yearlyMonth} onChange={(yearlyMonth) => set({ yearlyMonth })} options={MONTHS.map((l, i) => [i + 1, l] as [number, string])} />
          </Row>
          <b style={{ display: 'block', margin: '8px 0 4px' }}>One-time lump sums</b>
          {s.lumps.map((l, i) => (
            <Row key={l.id ?? i}>
              <Txt type="date" label="Date" value={l.date} onChange={(date) => set({ lumps: s.lumps.map((x, j) => (j === i ? { ...x, date } : x)) })} />
              <Num label="Amount" value={l.amount} onChange={(amount) => set({ lumps: s.lumps.map((x, j) => (j === i ? { ...x, amount: Math.max(0, amount) } : x)) })} unit={s.currency} min={0} />
              <Btn kind="ghost" onClick={() => set({ lumps: s.lumps.filter((_, j) => j !== i) })} title="Remove">✕</Btn>
            </Row>
          ))}
          <Btn onClick={() => set({ lumps: [...s.lumps, { id: uid(), date: s.start, amount: 5000 }] })}>+ Lump sum</Btn>
          <Btn kind="ghost" onClick={reset}>Reset all</Btn>
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label={`${freqLabel[0].toUpperCase() + freqLabel.slice(1)} payment`} value={m(pay)} sub={s.extra > 0 ? `${m(pay + s.extra)} with extra` : `${num(per, 0)} payments / year`} tone="accent" />
          <Stat label="Total interest" value={m(S.interest, 0)} sub={hasExtra ? `${m(B.interest - S.interest, 0)} saved` : `${num((S.interest / (s.principal || 1)) * 100, 1)}% of the loan`} tone={hasExtra ? 'good' : undefined} />
          <Stat label="Paid off" value={S.payoff ? ym(S.payoff) : '—'} sub={hasExtra && B.periods > S.periods ? `${span(B.periods - S.periods, s.freq)} early` : span(S.periods, s.freq)} />
          <Stat label="Total paid" value={m(S.paid, 0)} sub={`${S.periods} payments`} />
        </Stats>
        {hasExtra && valid && (
          <Note tone="ok">
            Extras of {m(rows.reduce((a, r) => a + r.extra, 0), 0)} in total cut <b>{m(B.interest - S.interest, 0)}</b> of interest — every extra {s.currency}1 saves {num((B.interest - S.interest) / Math.max(1, rows.reduce((a, r) => a + r.extra, 0)), 2)} {s.currency.trim()} of interest.
          </Note>
        )}
        <Panel title="Balance over time">
          <LineChart height={240} fy={(v) => m(v, 0)} fx={(v) => String(Math.round(v))} xLabel="Year"
            series={[
              ...(hasExtra ? [{ name: 'Without extras', points: plain.map((r) => [Number(r.date.slice(0, 4)) + (Number(r.date.slice(5, 7)) - 1) / 12, r.balance] as [number, number]), dashed: true, color: '#94a3b8' }] : []),
              { name: hasExtra ? 'With extras' : 'Balance', points: rows.map((r) => [Number(r.date.slice(0, 4)) + (Number(r.date.slice(5, 7)) - 1) / 12, r.balance] as [number, number]), area: true },
            ]} />
        </Panel>
        <Panel title="Principal vs interest by year">
          <BarChart height={220} fy={(v) => m(v, 0)} bars={years.map((y) => ({ label: y.year, value: [y.principal, y.extra, y.interest] }))} stacks={[{ name: 'Principal', color: '#6366f1' }, { name: 'Extra', color: '#10b981' }, { name: 'Interest', color: '#f59e0b' }]} />
        </Panel>
        <Panel title="Amortization schedule" actions={
          <>
            <Seg value={s.view} onChange={(view) => set({ view })} options={[['year', 'By year'], ['period', 'Every payment']]} />
            <CsvButton name="amortization-schedule.csv" rows={table} />
            <Btn onClick={async () => download('amortization-schedule.xlsx', new Blob([(await toXlsx('Schedule', table())) as Uint8Array<ArrayBuffer>], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))}>⬇ XLSX</Btn>
          </>
        }>
          {s.view === 'year' ? (
            <Table head={['Year', 'Principal', 'Extra', 'Interest', 'End balance']}
              rows={years.map((y) => [y.year, m(y.principal), y.extra ? m(y.extra) : '—', m(y.interest), m(y.balance)])}
              foot={['Total', m(years.reduce((a, y) => a + y.principal, 0)), m(years.reduce((a, y) => a + y.extra, 0)), m(S.interest), '']} />
          ) : (
            <>
              <Table head={head} rows={rows.slice(page * PAGE, page * PAGE + PAGE).map((r) => [r.n, r.date, m(r.payment), m(r.principal), m(r.interest), r.extra ? m(r.extra) : '—', m(r.balance), m(r.cumInterest)])} />
              <Row>
                <Btn disabled={page === 0} onClick={() => setPage(page - 1)}>‹ Prev</Btn>
                <span className="muted">Page {Math.min(page + 1, pages)} of {pages}</span>
                <Btn disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next ›</Btn>
              </Row>
            </>
          )}
          <p className="muted" style={{ fontSize: 13 }}>Payment = P·r / (1 − (1 + r)<sup>−n</sup>) with r = APR / {per}. Interest is charged on the remaining balance each period; amounts are rounded to cents and the last payment absorbs the rounding.</p>
        </Panel>
      </div>
    </Split>
  )
}
