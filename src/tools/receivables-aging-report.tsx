import { useMemo, useState } from 'react'
import { Area, Bar, BarChart, Btn, CsvButton, FileDrop, money, Note, Num, Panel, pct, Row, Select, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { detectDelimiter, parseCsv } from './lib/csv-json-converter'
import { age, avgDaysLate, BUCKETS, byClient, guessMapping, type DateFmt, type Mapping } from './lib/receivables-aging-report'

const COLORS = ['#10b981', '#facc15', '#f59e0b', '#f97316', '#ef4444']
type Key = keyof Mapping
const ROLES: [Key, string, boolean][] = [['client', 'Client', true], ['invoice', 'Invoice no.', false], ['date', 'Invoice date', false], ['due', 'Due date', false], ['amount', 'Amount', false], ['paid', 'Paid', false], ['balance', 'Open balance', false]]

function sampleCsv(): string {
  const clients = ['Copperline Retail', 'Harbor & Pine Foods', 'Lindmoor Clinics', 'Brightwater Logistics', 'Oakfield Schools', 'Saffron Hotels', 'Northgate Studios', 'Tidewell Marine']
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const asOf = Date.parse('2026-10-18T00:00:00Z')
  const lines = ['Customer,Invoice #,Invoice Date,Due Date,Amount,Paid']
  let n = 3100
  clients.forEach((c, ci) => {
    const count = 3 + Math.floor(rnd() * 5)
    for (let k = 0; k < count; k++) {
      const ageDays = Math.floor(rnd() ** (ci === 2 || ci === 6 ? 0.6 : 1.6) * 170)
      const d = new Date(asOf - ageDays * 86400000)
      const terms = [14, 30, 30, 45, 60][Math.floor(rnd() * 5)]
      const due = new Date(d.getTime() + terms * 86400000)
      const amt = Math.round((300 + rnd() * 6200) / 5) * 5
      const paid = rnd() < 0.25 ? Math.round(amt * (0.2 + rnd() * 0.5)) : 0
      lines.push(`${c},INV-${n++},${d.toISOString().slice(0, 10)},${due.toISOString().slice(0, 10)},"${amt.toLocaleString('en-US')}.00",${paid}`)
    }
  })
  return lines.join('\n')
}

interface State { csv: string; asOf: string; fmt: DateFmt; basis: 'due' | 'invoice'; terms: number; cur: string; map: Partial<Mapping> }
const DEF: State = { csv: sampleCsv(), asOf: '2026-10-18', fmt: 'auto', basis: 'due', terms: 30, cur: '$', map: {} }

export default function ReceivablesAgingReport() {
  const [s, set, reset] = useToolState('receivables-aging-report', DEF)
  const [focus, setFocus] = useState<string | null>(null)
  const parsed = useMemo(() => {
    const rows = parseCsv(s.csv, detectDelimiter(s.csv))
    return { head: rows[0] ?? [], body: rows.slice(1) }
  }, [s.csv])
  const guess = useMemo(() => guessMapping(parsed.head), [parsed.head])
  const map: Mapping = { ...guess, ...s.map }
  const { invs, bad } = useMemo(() => age(parsed.body, map, s.asOf, { fmt: s.fmt, basis: s.basis, terms: s.terms }), [parsed.body, map.client, map.invoice, map.date, map.due, map.amount, map.paid, map.balance, s.asOf, s.fmt, s.basis, s.terms]) // eslint-disable-line react-hooks/exhaustive-deps
  const clients = useMemo(() => byClient(invs), [invs])
  const totals = BUCKETS.map((_, i) => clients.reduce((a, c) => a + c.b[i], 0))
  const total = totals.reduce((a, b) => a + b, 0)
  const overdue = total - totals[0]
  const m = (x: number) => money(x, s.cur, 0)
  const m2 = (x: number) => money(x, s.cur, 2)
  const noAmount = map.amount < 0 && map.balance < 0
  const shown = invs.filter((v) => !focus || v.client === focus).sort((a, b) => b.days - a.days)
  const top = clients.slice(0, 12)
  const colOpts: [number, string][] = [[-1, '(none)'], ...parsed.head.map((h, i) => [i, h || `Column ${i + 1}`] as [number, string])]

  return (
    <Split wide="right">
      <div>
        <Panel title="Invoices (CSV)" actions={<Btn kind="ghost" onClick={() => { reset(); setFocus(null) }}>Sample</Btn>}>
          <FileDrop accept=".csv,.tsv,.txt,text/csv" onFiles={async ([f]) => { set({ csv: await f.text(), map: {} }); setFocus(null) }} label="Drop a CSV export from your accounting tool" />
          <Area value={s.csv} onChange={(csv) => set({ csv })} rows={8} mono />
          <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 0' }}>One row per open invoice. Comma, semicolon or tab separated; amounts like 1,234.50, 1.234,50 or (300.00) are understood. Spreadsheet files: save as CSV first.</p>
        </Panel>
        <Panel title="Columns">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0 10px' }}>
            {ROLES.map(([k, l]) => <Select key={k} label={l} value={map[k]} onChange={(v) => set({ map: { ...s.map, [k]: v } })} options={colOpts} />)}
          </div>
          <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>Detected automatically from the header. Open balance wins over Amount − Paid when both exist.</p>
          {noAmount && <Note tone="err">Choose an Amount or Open balance column.</Note>}
        </Panel>
        <Panel title="Aging rules">
          <Row>
            <Txt label="As of" type="date" value={s.asOf} onChange={(asOf) => set({ asOf })} />
            <Select label="Age by" value={s.basis} onChange={(basis) => set({ basis })} options={[['due', 'Days past due'], ['invoice', 'Days since invoice']]} />
          </Row>
          <Row>
            <Select label="Numeric dates" value={s.fmt} onChange={(fmt) => set({ fmt })} options={[['auto', 'Auto'], ['mdy', 'MM/DD/YYYY'], ['dmy', 'DD/MM/YYYY']]} />
            <Num label="Default terms" value={s.terms} onChange={(terms) => set({ terms: Math.max(0, Math.round(terms)) })} unit="days" min={0} step={1} hint="Used when a due date is missing" />
            <Select label="Currency" value={s.cur} onChange={(cur) => set({ cur })} options={['$', '€', '£', '₴', 'zł ', 'CHF ', '']} />
          </Row>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Total receivables" value={m(total)} sub={`${invs.length} open invoices · ${clients.length} clients`} />
          <Stat label="Overdue" value={m(overdue)} sub={pct(overdue / (total || 1), 0) + ' of total'} tone={overdue / (total || 1) > 0.3 ? 'bad' : undefined} />
          <Stat label="Over 90 days" value={m(totals[4])} sub={pct(totals[4] / (total || 1), 0)} tone={totals[4] > 0 ? 'bad' : 'good'} />
          <Stat label="Avg days late" value={avgDaysLate(invs).toFixed(0)} sub="balance-weighted" tone="accent" />
        </Stats>
        {bad.length > 0 && <Note tone="warn">Skipped {bad.length} row{bad.length > 1 ? 's' : ''}: {bad.slice(0, 4).map((b) => `line ${b.line} (${b.reason})`).join(', ')}{bad.length > 4 ? '…' : ''}</Note>}
        <Panel title="Aging buckets">
          <div style={{ display: 'flex', height: 30, borderRadius: 8, overflow: 'hidden', marginBottom: 10 }}>
            {totals.map((v, i) => v > 0 && <div key={i} title={`${BUCKETS[i]}: ${m2(v)}`} style={{ width: `${(v / (total || 1)) * 100}%`, background: COLORS[i] }} />)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
            {BUCKETS.map((b, i) => (
              <div key={b} style={{ borderLeft: `4px solid ${COLORS[i]}`, paddingLeft: 8 }}>
                <div className="muted" style={{ fontSize: 12 }}>{b}{i ? ' days' : ''}</div>
                <b>{m(totals[i])}</b> <span className="muted" style={{ fontSize: 12 }}>{pct(totals[i] / (total || 1), 0)}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Balance by client">
          <BarChart bars={top.map((c) => ({ label: c.client, value: c.b }))} stacks={BUCKETS.map((b, i) => ({ name: b, color: COLORS[i] }))} fy={(v) => m(v)} height={260} />
          {clients.length > 12 && <p className="muted" style={{ fontSize: 12.5 }}>Top 12 of {clients.length} clients shown.</p>}
        </Panel>
        <Panel title="Aging by client" actions={<>
          <CsvButton name={`ar-aging-${s.asOf}.csv`} rows={() => [['Client', ...BUCKETS, 'Total', 'Invoices', 'Oldest days'], ...clients.map((c) => [c.client, ...c.b, c.total, c.count, c.oldest]), ['TOTAL', ...totals.map((x) => Math.round(x * 100) / 100), Math.round(total * 100) / 100, invs.length, '']]} />
        </>}>
          <Table
            head={['Client', ...BUCKETS, 'Total', 'Overdue']}
            rows={clients.map((c) => [
              <button key="c" type="button" onClick={() => setFocus(focus === c.client ? null : c.client)} style={{ background: 'none', border: 0, padding: 0, color: 'var(--accent)', fontWeight: focus === c.client ? 800 : 600, textAlign: 'left', cursor: 'pointer' }}>{c.client}</button>,
              ...c.b.map((v, i) => <span key={i} style={{ color: v && i >= 3 ? COLORS[i] : undefined, fontWeight: v && i >= 3 ? 700 : undefined }}>{v ? m(v) : '–'}</span>),
              <b key="t">{m(c.total)}</b>,
              <div key="o" style={{ minWidth: 70 }}><Bar value={c.total - c.b[0]} max={c.total || 1} color={c.b[4] > 0 ? 'var(--err)' : 'var(--warn)'} /><span className="muted" style={{ fontSize: 11 }}>{pct((c.total - c.b[0]) / (c.total || 1), 0)}</span></div>,
            ])}
            foot={['Total', ...totals.map((v) => m(v)), m(total), pct(overdue / (total || 1), 0)]}
          />
        </Panel>
        <Panel title={focus ? `Invoices · ${focus}` : 'Open invoices (oldest first)'} actions={<>
          {focus && <Btn kind="ghost" onClick={() => setFocus(null)}>Show all</Btn>}
          <CsvButton name={`ar-invoices-${s.asOf}.csv`} rows={() => [['Client', 'Invoice', 'Invoice date', 'Due date', 'Days', 'Bucket', 'Balance'], ...shown.map((v) => [v.client, v.invoice, v.date ?? '', v.due, v.days, BUCKETS[v.bucket], v.balance])]} />
        </>}>
          <Table
            head={['Client', 'Invoice', 'Due', s.basis === 'due' ? 'Days late' : 'Age', 'Bucket', 'Balance']}
            rows={shown.map((v) => [v.client, v.invoice, v.due, v.days > 0 ? v.days : <span key="d" className="muted">{v.days === 0 ? 'today' : `in ${-v.days} d`}</span>, <span key="b" style={{ background: COLORS[v.bucket], color: v.bucket === 1 || v.bucket === 2 ? '#222' : '#fff', borderRadius: 6, padding: '1px 7px', fontSize: 12, fontWeight: 700 }}>{BUCKETS[v.bucket]}</span>, m2(v.balance)])}
            max={60}
          />
          <p className="muted" style={{ fontSize: 12.5 }}>Click a client above to filter. Credit notes (negative balances) reduce the bucket they fall in.</p>
        </Panel>
      </div>
    </Split>
  )
}
