import { useMemo, useState } from 'react'
import { Btn, color, CsvButton, JsonButtons, LineChart, money, Note, Num, Panel, Row, Select, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { monthlyInterest, simulate, type Debt, type Strategy } from './lib/debt-payoff-planner'

interface State { currency: string; extra: number; strategy: Strategy; start: string; debts: Debt[] }
const DEF: State = {
  currency: '$',
  extra: 250,
  strategy: 'avalanche',
  start: '',
  debts: [
    { id: 'cc1', name: 'Visa card', balance: 6200, apr: 24.9, min: 185 },
    { id: 'cc2', name: 'Store card', balance: 950, apr: 27.5, min: 35 },
    { id: 'car', name: 'Car loan', balance: 11800, apr: 6.9, min: 310 },
    { id: 'stu', name: 'Student loan', balance: 18500, apr: 4.5, min: 195 },
    { id: 'med', name: 'Medical bill', balance: 1400, apr: 0, min: 50 },
  ],
}
const NAMES: Record<Strategy, string> = { avalanche: 'Avalanche (highest APR first)', snowball: 'Snowball (smallest balance first)', order: 'Custom order (top to bottom)', minimum: 'Minimum payments only' }

export default function DebtPayoffPlanner() {
  const [s, set, reset] = useToolState<State>('debt-payoff-planner', DEF)
  const [now] = useState(() => new Date())
  const m = (x: number) => money(x, s.currency, 0)
  const start = /^\d{4}-\d{2}$/.test(s.start) ? s.start : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const monthLabel = (k: number) => {
    if (!Number.isFinite(k)) return 'never'
    const d = new Date(+start.slice(0, 4), +start.slice(5, 7) - 1 + k - 1, 1)
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  }
  const debts = useMemo(() => s.debts.filter((d) => d.balance > 0), [s.debts])
  const sims = useMemo(() => {
    const r = {} as Record<Strategy, ReturnType<typeof simulate>>
    for (const k of ['avalanche', 'snowball', 'order', 'minimum'] as Strategy[]) r[k] = simulate(debts, s.extra, k)
    return r
  }, [debts, s.extra])
  const cur = sims[s.strategy]
  const base = sims.minimum
  const total = debts.reduce((a, d) => a + d.balance, 0)
  const mins = debts.reduce((a, d) => a + d.min, 0)
  const underwater = debts.filter((d) => d.min <= monthlyInterest(d))
  const edit = (id: string, p: Partial<Debt>) => set({ debts: s.debts.map((d) => (d.id === id ? { ...d, ...p } : d)) })
  const move = (i: number, dir: number) => {
    const a = [...s.debts]
    const j = i + dir
    if (j < 0 || j >= a.length) return
    ;[a[i], a[j]] = [a[j], a[i]]
    set({ debts: a })
  }
  const years = (k: number) => (Number.isFinite(k) ? `${Math.floor(k / 12)} y ${k % 12} m` : '—')

  return (
    <Split wide="right">
      <div>
        <Panel title="Plan">
          <Num label="Extra payment each month" value={s.extra} onChange={(extra) => set({ extra: Math.max(0, extra) })} unit={s.currency} min={0} hint={`Total budget ${m(mins + s.extra)}/month (minimums ${m(mins)} + extra). Freed-up minimums roll into the next debt.`} />
          <Select label="Strategy" value={s.strategy} onChange={(strategy) => set({ strategy })} options={(Object.keys(NAMES) as Strategy[]).map((k) => [k, NAMES[k]] as const)} />
          <Row>
            <Txt label="Start month" type="month" value={start} onChange={(v) => set({ start: v })} />
            <Select label="Currency" value={s.currency} onChange={(currency) => set({ currency })} options={['$', '€', '£', '₴', 'zł', '¥', 'CHF ']} />
          </Row>
        </Panel>
        <Panel title="Strategy comparison">
          <Table
            head={['Strategy', 'Debt-free', 'Interest', 'Saved']}
            rows={(['avalanche', 'snowball', 'order', 'minimum'] as Strategy[]).map((k) => {
              const r = sims[k]
              return [
                <Btn key="s" kind={s.strategy === k ? 'primary' : 'ghost'} onClick={() => set({ strategy: k })}>{k === 'order' ? 'Custom' : k[0].toUpperCase() + k.slice(1)}</Btn>,
                r.stuck ? 'never' : monthLabel(r.months),
                m(r.totalInterest),
                k === 'minimum' || base.stuck ? '—' : m(base.totalInterest - r.totalInterest),
              ]
            })}
          />
          <p className="muted" style={{ fontSize: 13 }}>
            Avalanche saves the most interest. Snowball clears small debts sooner, which keeps many people motivated. The difference here is {m(Math.abs(sims.snowball.totalInterest - sims.avalanche.totalInterest))}.
          </p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Debt-free" value={cur.stuck ? 'never' : monthLabel(cur.months)} sub={cur.stuck ? 'payments too low' : years(cur.months)} tone={cur.stuck ? 'bad' : 'accent'} />
          <Stat label="Total interest" value={m(cur.totalInterest)} sub={`on ${m(total)} of debt`} />
          <Stat label="Interest saved" value={base.stuck ? '—' : m(base.totalInterest - cur.totalInterest)} sub="vs minimums only" tone="good" />
          <Stat label="Time saved" value={base.stuck || cur.stuck ? '—' : years(base.months - cur.months)} sub={base.stuck ? 'minimums never finish' : `minimums: ${years(base.months)}`} tone="good" />
        </Stats>
        {underwater.length > 0 && <Note tone="err">Minimum payment does not cover the monthly interest on: {underwater.map((d) => `${d.name} (${m(monthlyInterest(d))} interest)`).join(', ')}. Raise the payment or the balance never falls.</Note>}
        <Panel
          title="Debts"
          actions={
            <>
              <Btn onClick={() => set({ debts: [...s.debts, { id: uid(), name: 'New debt', balance: 1000, apr: 15, min: 40 }] })}>+ Debt</Btn>
              <JsonButtons name="debts.json" data={s} onLoad={(d) => set(d)} />
              <Btn kind="ghost" onClick={reset}>Reset</Btn>
            </>
          }
        >
          <Table
            head={['Debt', 'Balance', 'APR %', 'Min/month', 'Paid off', '']}
            rows={s.debts.map((d, i) => [
              <input key="n" value={d.name} onChange={(e) => edit(d.id, { name: e.target.value })} aria-label="Name" style={{ minWidth: 110, borderLeft: `4px solid ${color(i)}` }} />,
              <input key="b" type="number" min={0} value={d.balance} onChange={(e) => edit(d.id, { balance: Math.max(0, +e.target.value || 0) })} aria-label="Balance" style={{ width: 90 }} />,
              <input key="a" type="number" min={0} step={0.1} value={d.apr} onChange={(e) => edit(d.id, { apr: Math.max(0, +e.target.value || 0) })} aria-label="APR" style={{ width: 64 }} />,
              <input key="m" type="number" min={0} value={d.min} onChange={(e) => edit(d.id, { min: Math.max(0, +e.target.value || 0) })} aria-label="Minimum payment" style={{ width: 76 }} />,
              <span key="p">{monthLabel(cur.payoffMonth[d.id] ?? NaN)}</span>,
              <span key="x" style={{ whiteSpace: 'nowrap' }}>
                {s.strategy === 'order' && <><Btn kind="ghost" onClick={() => move(i, -1)} title="Move up">↑</Btn><Btn kind="ghost" onClick={() => move(i, 1)} title="Move down">↓</Btn></>}
                <Btn kind="ghost" onClick={() => set({ debts: s.debts.filter((x) => x.id !== d.id) })} title="Remove">✕</Btn>
              </span>,
            ])}
            foot={['Total', m(total), '', m(mins), '', '']}
          />
        </Panel>
        <Panel title="Total balance over time">
          <LineChart
            height={240}
            fx={(v) => monthLabel(Math.round(v) + 1)}
            fy={m}
            yMin={0}
            xMax={Math.min(base.stuck ? 240 : base.months, Math.max(sims.avalanche.months, sims.snowball.months) * 2 + 6)}
            series={[
              { name: 'Avalanche', points: sims.avalanche.totals.map((v, i) => [i, v]), color: color(0) },
              { name: 'Snowball', points: sims.snowball.totals.map((v, i) => [i, v]), color: color(1) },
              { name: 'Minimums only', points: base.totals.slice(0, 241).map((v, i) => [i, v]), color: '#94a3b8', dashed: true },
            ]}
            xLabel="months"
          />
        </Panel>
        <Panel
          title={`Each debt · ${NAMES[s.strategy]}`}
          actions={<CsvButton name="debt-schedule.csv" rows={() => [['Month', ...debts.map((d) => d.name), 'Total'], ...cur.balances.slice(1).map((row, k) => [monthLabel(k + 1), ...row.map((v) => v.toFixed(2)), cur.totals[k + 1].toFixed(2)])]} />}
        >
          <LineChart height={220} fx={(v) => monthLabel(Math.round(v) + 1)} fy={m} yMin={0} series={debts.map((d) => ({ name: d.name, points: cur.balances.map((row, k) => [k, row[debts.indexOf(d)]] as [number, number]), color: color(s.debts.indexOf(d)) }))} />
          <Table
            head={['#', 'Paid off', 'Debt', 'Interest paid']}
            rows={cur.order.map((id, k) => {
              const d = debts.find((x) => x.id === id)!
              return [k + 1, monthLabel(cur.payoffMonth[id]), d.name, m(cur.interestByDebt[id])]
            })}
          />
        </Panel>
      </div>
    </Split>
  )
}
