import { useState } from 'react'
import { Btn, CsvButton, FileDrop, JsonButtons, money, Note, Num, Panel, pct, Row, Seg, Select, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { parseCsv } from './lib/chart-builder'
import { readXlsx } from './lib/excel-to-csv'
import { analyse, groups, importTables, totals, type Kind, type Line } from './lib/budget-variance-report'

interface State { currency: string; lines: Line[]; pct: number; abs: number; rule: 'and' | 'or'; months: number; of: number; sort: 'order' | 'variance' | 'pct'; view: 'all' | 'flagged' }
const L = (category: string, group: string, kind: Kind, budget: number, actual: number): Line => ({ id: uid(), category, group, kind, budget, actual })
const DEF: State = {
  currency: '$', pct: 10, abs: 500, rule: 'and', months: 12, of: 12, sort: 'order', view: 'all',
  lines: [
    L('Product sales', 'Revenue', 'income', 480000, 512300), L('Services', 'Revenue', 'income', 120000, 98400), L('Grants', 'Revenue', 'income', 20000, 20000),
    L('Salaries', 'People', 'expense', 310000, 318900), L('Contractors', 'People', 'expense', 40000, 61200), L('Training', 'People', 'expense', 12000, 7400),
    L('Rent', 'Facilities', 'expense', 48000, 48000), L('Utilities', 'Facilities', 'expense', 9000, 10350),
    L('Online ads', 'Marketing', 'expense', 36000, 29800), L('Events', 'Marketing', 'expense', 18000, 24500),
    L('Software', 'Operations', 'expense', 22000, 23100), L('Travel', 'Operations', 'expense', 15000, 9200), L('Insurance', 'Operations', 'expense', 6000, 6000),
  ],
}

export default function BudgetVarianceReport() {
  const [s, set, reset] = useToolState('budget-variance-report', DEF)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const m = (x: number) => money(x, s.currency, 0)
  const prorate = s.of > 0 ? Math.min(1, s.months / s.of) : 1
  const v = analyse(s.lines, { pct: s.pct, abs: s.abs, rule: s.rule }, prorate)
  const t = totals(v)
  const g = groups(v)
  const shown = v.filter((x) => s.view === 'all' || x.flag).sort((a, b) => (s.sort === 'variance' ? Math.abs(b.variance) - Math.abs(a.variance) : s.sort === 'pct' ? Math.abs(b.pct) - Math.abs(a.pct) : 0))
  const flagged = v.filter((x) => x.flag)
  const edit = (id: string, p: Partial<Line>) => set({ lines: s.lines.map((x) => (x.id === id ? { ...x, ...p } : x)) })
  const maxBar = Math.max(1, ...v.map((x) => Math.max(x.budgetAdj, x.actual)))
  const maxVar = Math.max(1, ...v.map((x) => Math.abs(x.variance)))
  const signed = (x: number, fav: boolean | null) => <span style={{ color: fav === null ? undefined : fav ? 'var(--ok)' : 'var(--err)', fontWeight: 600 }}>{x > 0 ? '+' : ''}{m(x)} {fav === null ? '' : fav ? 'F' : 'U'}</span>

  const load = async (f: File) => {
    try {
      const tables = /\.xlsx$/i.test(f.name) ? (await readXlsx(new Uint8Array(await f.arrayBuffer()))).filter((sh) => !sh.hidden).map((sh) => sh.rows) : [parseCsv(await f.text())]
      const r = importTables(tables, uid)
      if (!r) return setMsg({ tone: 'err', text: 'No usable table found. Use columns Category, Type (Income/Expense), Budget, Actual — or an XLSX with a budget sheet and an actual sheet (Category, Amount).' })
      set({ lines: r.lines })
      setMsg({ tone: 'ok', text: `${f.name}: ${r.note}` })
    } catch (e) {
      setMsg({ tone: 'err', text: `${f.name}: ${(e as Error).message}` })
    }
  }

  return (
    <div>
      <Stats>
        <Stat label="Net result" value={m(t.na)} sub={<>budget {m(t.nb)} · {signed(t.netVar, t.netVar === 0 ? null : t.netVar > 0)}</>} tone={t.netVar >= 0 ? 'good' : 'bad'} />
        <Stat label="Income" value={m(t.ia)} sub={<>vs {m(t.ib)} · {signed(t.incomeVar, t.incomeVar === 0 ? null : t.incomeVar > 0)}</>} />
        <Stat label="Expenses" value={m(t.ea)} sub={<>vs {m(t.eb)} · {signed(t.expenseVar, t.expenseVar === 0 ? null : t.expenseVar < 0)}</>} />
        <Stat label="Lines needing explanation" value={flagged.length} tone={flagged.length ? 'bad' : 'good'} sub={`unfavourable, ≥ ${s.pct}% ${s.rule} ≥ ${m(s.abs)}`} />
      </Stats>
      <Split>
        <div>
          <Panel title="Data" actions={<Btn kind="ghost" onClick={reset}>Reset sample</Btn>}>
            <FileDrop accept=".csv,.tsv,.txt,.xlsx" onFiles={([f]) => void load(f)} label="CSV or XLSX: Category, Group, Type, Budget, Actual — or two sheets" />
            {msg && <Note tone={msg.tone}>{msg.text}</Note>}
            <Row>
              <Select label="Currency" value={s.currency} onChange={(currency) => set({ currency })} options={['$', '€', '£', '₴', 'zł', '¥', 'CHF ']} />
              <Btn onClick={() => set({ lines: [...s.lines, L('New line', 'General', 'expense', 0, 0)] })}>+ Line</Btn>
            </Row>
          </Panel>
          <Panel title="Rules">
            <Row>
              <Num label="Flag when variance ≥" value={s.pct} onChange={(p) => set({ pct: p })} unit="%" min={0} />
              <Num label="…and amount ≥" value={s.abs} onChange={(abs) => set({ abs })} unit={s.currency} min={0} />
            </Row>
            <Seg value={s.rule} onChange={(rule) => set({ rule })} options={[['and', 'Both must be exceeded'], ['or', 'Either one']]} />
            <Row>
              <Num label="Actuals cover" value={s.months} onChange={(months) => set({ months })} unit="months" min={0} />
              <Num label="of a budget for" value={s.of} onChange={(of) => set({ of })} unit="months" min={1} />
            </Row>
            {prorate < 1 && <Note>Budget pro-rated to {pct(prorate, 0)} (year-to-date comparison).</Note>}
            <Note>Favourable (F) means better than plan: income above budget or costs below it. Unfavourable (U) lines that pass the materiality test are flagged for explanation.</Note>
          </Panel>
        </div>
        <div>
          <Panel title="By group">
            <Table head={['Group', 'Budget', 'Actual', 'Variance']} rows={g.map((x) => [<span key="g">{x.group} <span className="muted">{x.kind === 'income' ? '(income)' : ''}</span></span>, m(x.budget), m(x.actual), signed(x.variance, x.fav)])} />
          </Panel>
          {flagged.length > 0 && (
            <Panel title="Commentary prompts">
              {flagged.map((x) => (
                <Note key={x.id} tone="warn"><b>{x.category}</b> is {m(Math.abs(x.variance))} ({Math.abs(x.pct * 100).toFixed(0)}%) {x.kind === 'income' ? 'below' : 'over'} budget. Explain the driver (volume, price, timing or one-off) and whether it will reverse.</Note>
              ))}
            </Panel>
          )}
        </div>
      </Split>
      <Panel
        title="Variance report"
        actions={
          <>
            <Seg value={s.view} onChange={(view) => set({ view })} options={[['all', 'All lines'], ['flagged', `Flagged (${flagged.length})`]]} />
            <Select label="" value={s.sort} onChange={(sort) => set({ sort })} options={[['order', 'Original order'], ['variance', 'Largest variance'], ['pct', 'Largest %']]} />
          </>
        }
      >
        <Table
          head={['Line', 'Type', `Budget${prorate < 1 ? ' (pro-rated)' : ''}`, 'Actual', 'Variance', '%', 'Budget vs actual · variance', '']}
          rows={shown.map((x) => [
            <div key="c">
              <input value={x.category} onChange={(e) => edit(x.id, { category: e.target.value })} style={{ width: 130, fontWeight: 600, display: 'block' }} aria-label="Category" />
              <input value={x.group} onChange={(e) => edit(x.id, { group: e.target.value })} style={{ width: 130, fontSize: 12, display: 'block' }} aria-label="Group" className="muted" />
            </div>,
            <select key="k" value={x.kind} onChange={(e) => edit(x.id, { kind: e.target.value as Kind })} aria-label="Type" style={{ minWidth: 92 }}><option value="income">Income</option><option value="expense">Expense</option></select>,
            <input key="b" type="number" value={x.budget} onChange={(e) => edit(x.id, { budget: Number(e.target.value) || 0 })} style={{ width: 86 }} aria-label="Budget" title={prorate < 1 ? `Pro-rated: ${m(x.budgetAdj)}` : undefined} />,
            <input key="a" type="number" value={x.actual} onChange={(e) => edit(x.id, { actual: Number(e.target.value) || 0 })} style={{ width: 86 }} aria-label="Actual" />,
            signed(x.variance, x.fav),
            <span key="p" style={{ fontWeight: x.flag ? 700 : 400, color: x.flag ? 'var(--err)' : undefined }}>{Number.isFinite(x.pct) ? `${x.pct > 0 ? '+' : ''}${(x.pct * 100).toFixed(1)}%` : 'new'}{x.flag ? ' ⚑' : ''}</span>,
            <svg key="v" width={250} height={22} aria-label="bars">
              <rect x={0} y={4} width={(x.budgetAdj / maxBar) * 150} height={14} rx={2} fill="none" stroke="#94a3b8" strokeDasharray="3 2" />
              <rect x={0} y={7} width={(x.actual / maxBar) * 150} height={8} rx={2} fill={x.fav === false ? '#ef4444' : '#22c55e'} />
              <line x1={205} x2={205} y1={2} y2={20} stroke="#94a3b8" />
              <rect x={x.variance >= 0 ? 205 : 205 - (Math.abs(x.variance) / maxVar) * 40} y={6} width={(Math.abs(x.variance) / maxVar) * 40} height={10} fill={x.fav === false ? '#ef4444' : '#22c55e'} rx={1} />
            </svg>,
            <Btn key="x" kind="ghost" title="Remove" onClick={() => set({ lines: s.lines.filter((y) => y.id !== x.id) })}>✕</Btn>,
          ])}
          foot={['Net (income − expenses)', '', m(t.nb), m(t.na), signed(t.netVar, t.netVar === 0 ? null : t.netVar > 0), t.nb ? `${((t.netVar / Math.abs(t.nb)) * 100).toFixed(1)}%` : '', '', '']}
        />
        {shown.length === 0 && <Note tone="ok">No line breaches the thresholds.</Note>}
        <div className="k-legend" style={{ marginTop: 6 }}>
          <span><i style={{ background: 'transparent', border: '1px dashed #94a3b8' }} />Budget</span>
          <span><i style={{ background: '#22c55e' }} />Actual / favourable</span>
          <span><i style={{ background: '#ef4444' }} />Unfavourable</span>
          <span>⚑ needs explanation</span>
        </div>
        <Row>
          <CsvButton name="budget-variance.csv" rows={() => [['Category', 'Group', 'Type', 'Budget', 'Actual', 'Variance', 'Variance %', 'F/U', 'Flag'], ...v.map((x) => [x.category, x.group, x.kind, +x.budgetAdj.toFixed(2), x.actual, +x.variance.toFixed(2), Number.isFinite(x.pct) ? +(x.pct * 100).toFixed(2) : '', x.fav === null ? '' : x.fav ? 'F' : 'U', x.flag ? 'yes' : ''])]} />
          <JsonButtons name="budget-variance.json" data={s} onLoad={(d) => set(d)} />
          <Btn onClick={() => print()}>🖨 Print</Btn>
        </Row>
      </Panel>
    </div>
  )
}
