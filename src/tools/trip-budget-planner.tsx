import { useMemo, useState } from 'react'
import { Bar, BarChart, Btn, color, CsvButton, Donut, JsonButtons, money, Note, Panel, pct, Row, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { balances, settle, shares, toHome, tripDays, type Expense, type Rates } from './lib/trip-budget-planner'

interface Cat { name: string; budget: number }
interface State {
  name: string
  start: string
  end: string
  home: string
  people: string[]
  rates: Rates
  cats: Cat[]
  expenses: Expense[]
}

const ALL: string[] = []
const X = (date: string, desc: string, cat: string, amount: number, cur: string, paidBy: string, split = ALL): Expense => ({ id: uid(), date, desc, cat, amount, cur, paidBy, split })
const DEF: State = {
  name: 'Italy & Switzerland',
  start: '2026-06-10',
  end: '2026-06-17',
  home: 'USD',
  people: ['Alex', 'Sam', 'Jordan'],
  rates: { EUR: 1.08, CHF: 1.12, GBP: 1.27 },
  cats: [
    { name: 'Flights', budget: 2400 }, { name: 'Lodging', budget: 1800 }, { name: 'Food', budget: 900 }, { name: 'Transport', budget: 450 },
    { name: 'Activities', budget: 500 }, { name: 'Shopping', budget: 300 }, { name: 'Other', budget: 150 },
  ],
  expenses: [
    X('2026-06-10', 'Return flights ×3', 'Flights', 2265, 'USD', 'Alex'),
    X('2026-06-10', 'Hotel Milan, 3 nights', 'Lodging', 540, 'EUR', 'Sam'),
    X('2026-06-10', 'Airport train', 'Transport', 39, 'EUR', 'Jordan'),
    X('2026-06-10', 'Dinner in Navigli', 'Food', 96, 'EUR', 'Alex'),
    X('2026-06-11', 'Duomo rooftop tickets', 'Activities', 60, 'EUR', 'Jordan'),
    X('2026-06-11', 'Lunch & gelato', 'Food', 58, 'EUR', 'Sam'),
    X('2026-06-12', 'Lake Como ferry', 'Transport', 45, 'EUR', 'Alex'),
    X('2026-06-12', 'Leather wallet', 'Shopping', 85, 'EUR', 'Sam', ['Sam']),
    X('2026-06-13', 'Train Milan → Zermatt', 'Transport', 246, 'CHF', 'Jordan'),
    X('2026-06-13', 'Chalet, 4 nights', 'Lodging', 1120, 'CHF', 'Alex'),
    X('2026-06-14', 'Gornergrat railway', 'Activities', 270, 'CHF', 'Sam'),
    X('2026-06-14', 'Fondue night', 'Food', 168, 'CHF', 'Jordan'),
    X('2026-06-15', 'Groceries', 'Food', 74, 'CHF', 'Alex'),
    X('2026-06-16', 'Swiss chocolate', 'Shopping', 42, 'CHF', 'Jordan', ['Jordan', 'Alex']),
  ],
}

export default function TripBudgetPlanner() {
  const [s, set, reset] = useToolState('trip-budget-planner', DEF)
  const [newCur, setNewCur] = useState('')
  const m = (x: number) => money(x, '', 0) + ' ' + s.home
  const hv = (e: Expense) => toHome(e.amount, e.cur, s.rates, s.home)
  const currencies = [s.home, ...Object.keys(s.rates).filter((c) => c !== s.home)]
  const days = tripDays(s.start, s.end)
  const budget = s.cats.reduce((a, c) => a + c.budget, 0)
  const spent = s.expenses.reduce((a, e) => a + (hv(e) || 0), 0)
  const byCat = s.cats.map((c) => ({ ...c, spent: s.expenses.filter((e) => e.cat === c.name).reduce((a, e) => a + (hv(e) || 0), 0) }))
  const bal = useMemo(() => balances(s.expenses, s.people, s.rates, s.home), [s.expenses, s.people, s.rates, s.home])
  const sh = useMemo(() => shares(s.expenses, s.people, s.rates, s.home), [s.expenses, s.people, s.rates, s.home])
  const transfers = settle(bal)
  const unknown = s.expenses.filter((e) => !Number.isFinite(hv(e)))
  const daily = (() => {
    const out: { label: string; value: number[] }[] = []
    const t0 = Date.parse(s.start + 'T00:00:00Z')
    for (let i = 0; i < Math.min(days, 60); i++) {
      const d = new Date(t0 + i * 86400000).toISOString().slice(0, 10)
      out.push({ label: d.slice(5), value: s.cats.map((c) => s.expenses.filter((e) => e.date === d && e.cat === c.name).reduce((a, e) => a + (hv(e) || 0), 0)) })
    }
    return out
  })()
  const edit = (id: string, p: Partial<Expense>) => set({ expenses: s.expenses.map((e) => (e.id === id ? { ...e, ...p } : e)) })
  const variable = byCat.filter((c) => c.name !== 'Flights')
  const varLeft = variable.reduce((a, c) => a + c.budget - c.spent, 0)

  return (
    <>
    <Split>
      <div>
        <Panel title="Trip" actions={<Btn kind="ghost" onClick={reset}>Sample</Btn>}>
          <Txt label="Name" value={s.name} onChange={(name) => set({ name })} />
          <Row>
            <Txt label="Start" type="date" value={s.start} onChange={(start) => set({ start })} />
            <Txt label="End" type="date" value={s.end} onChange={(end) => set({ end })} />
          </Row>
          <Txt label="Home currency (code)" value={s.home} onChange={(v) => set({ home: v.toUpperCase().slice(0, 4) })} />
          <span className="k-label">Travellers</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '4px 0 10px' }}>
            {s.people.map((p, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid var(--line)', borderRadius: 99, background: 'var(--panel)', paddingLeft: 10 }}>
                <i style={{ width: 8, height: 8, borderRadius: 9, background: color(i), marginRight: 6 }} />
                <input value={p} aria-label="Traveller name" style={{ border: 0, background: 'none', width: 70 }} onChange={(e) => {
                  const nn = e.target.value
                  set({ people: s.people.map((x, j) => (j === i ? nn : x)), expenses: s.expenses.map((x) => ({ ...x, paidBy: x.paidBy === p ? nn : x.paidBy, split: x.split.map((y) => (y === p ? nn : y)) })) })
                }} />
                <Btn kind="ghost" title="Remove traveller" disabled={s.people.length < 2} onClick={() => set({ people: s.people.filter((_, j) => j !== i) })}>✕</Btn>
              </span>
            ))}
            <Btn onClick={() => set({ people: [...s.people, `Person ${s.people.length + 1}`] })}>+ Person</Btn>
          </div>
        </Panel>
        <Panel title="Exchange rates (manual)">
          <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>Value of 1 unit in {s.home}. Enter the rate your card or exchange office actually gave you.</p>
          {Object.entries(s.rates).map(([c, r]) => (
            <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
              <b style={{ width: 48 }}>1 {c}</b>
              <span>=</span>
              <input className="k-text" type="number" step="any" min={0} value={r} aria-label={`${c} rate`} style={{ width: 100 }} onChange={(e) => set({ rates: { ...s.rates, [c]: Math.max(0, Number(e.target.value) || 0) } })} />
              <span className="muted">{s.home}</span>
              <span className="muted" style={{ fontSize: 12 }}>(1 {s.home} = {r ? (1 / r).toFixed(4) : '—'} {c})</span>
              <Btn kind="ghost" title="Remove" onClick={() => { const n = { ...s.rates }; delete n[c]; set({ rates: n }) }}>✕</Btn>
            </div>
          ))}
          <Row>
            <Txt label="Add currency" value={newCur} placeholder="e.g. JPY" onChange={(v) => setNewCur(v.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))} />
            <div style={{ marginBottom: 10 }}><Btn disabled={!newCur || newCur === s.home || newCur in s.rates} onClick={() => { set({ rates: { ...s.rates, [newCur]: 1 } }); setNewCur('') }}>+ Add</Btn></div>
          </Row>
        </Panel>
        <Panel title="Category budgets">
          {byCat.map((c, i) => (
            <div key={c.name} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ flex: 1, fontWeight: 650, fontSize: 13.5 }}><i style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 3, background: color(i), marginRight: 6 }} />{c.name}</span>
                <span className="muted" style={{ fontSize: 12.5 }}>{m(c.spent)} /</span>
                <input className="k-text" type="number" min={0} value={c.budget} aria-label={`${c.name} budget`} style={{ width: 90 }} onChange={(e) => set({ cats: s.cats.map((x) => (x.name === c.name ? { ...x, budget: Math.max(0, Number(e.target.value) || 0) } : x)) })} />
              </div>
              <Bar value={c.spent} max={c.budget || 1} color={c.spent > c.budget ? 'var(--err)' : color(i)} />
            </div>
          ))}
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Budget" value={m(budget)} sub={`${days} days · ${s.people.length} travellers`} />
          <Stat label="Spent" value={m(spent)} sub={pct(spent / (budget || 1), 0) + ' of budget'} tone="accent" />
          <Stat label="Remaining" value={m(budget - spent)} tone={budget - spent < 0 ? 'bad' : 'good'} sub={`${m(varLeft / days)} / day excl. flights`} />
          <Stat label="Per person" value={m(spent / (s.people.length || 1))} sub={`${m(spent / (s.people.length || 1) / days)} per day`} />
        </Stats>
        {unknown.length > 0 && <Note tone="warn">{unknown.length} expense(s) use a currency without a rate. Add it under exchange rates.</Note>}

        <Panel title="Spending breakdown">
          <Donut slices={byCat.filter((c) => c.spent > 0).map((c) => ({ label: c.name, value: c.spent, color: color(s.cats.findIndex((x) => x.name === c.name)) }))} fv={(v) => m(v)} center={<span style={{ fontSize: 13 }}>{m(spent)}</span>} />
        </Panel>

        <Panel title="Daily spending">
          <BarChart bars={daily} stacks={s.cats.map((c, i) => ({ name: c.name, color: color(i) }))} fy={(v) => money(v, '', 0)} />
        </Panel>

        <Panel title="Who owes whom">
          <Table
            head={['Traveller', 'Paid', 'Their share', 'Balance']}
            rows={s.people.map((p) => {
              const paid = s.expenses.filter((e) => e.paidBy === p).reduce((a, e) => a + (hv(e) || 0), 0)
              return [<b key="p">{p}</b>, m(paid), m(sh[p] ?? 0), <b key="b" style={{ color: (bal[p] ?? 0) >= 0 ? 'var(--ok)' : 'var(--err)' }}>{(bal[p] ?? 0) >= 0 ? '+' : ''}{money(bal[p] ?? 0, '', 2)}</b>]
            })}
          />
          {transfers.length ? (
            <ul style={{ margin: '10px 0 0', paddingLeft: 18 }}>
              {transfers.map((t, i) => <li key={i}><b>{t.from}</b> pays <b>{t.to}</b> {money(t.amount, '', 2)} {s.home}</li>)}
            </ul>
          ) : <Note tone="ok">Everyone is settled up.</Note>}
        </Panel>
      </div>
    </Split>
    <div style={{ marginTop: 16 }}>
          <Panel title="Expenses" actions={<>
            <Btn kind="primary" onClick={() => set({ expenses: [X(s.expenses[s.expenses.length - 1]?.date ?? s.start, '', s.cats[2]?.name ?? s.cats[0]?.name ?? 'Other', 0, currencies[1] ?? s.home, s.people[0]), ...s.expenses] })}>+ Expense</Btn>
            <CsvButton name="trip-expenses.csv" rows={() => [['Date', 'Description', 'Category', 'Amount', 'Currency', `In ${s.home}`, 'Paid by', 'Split'], ...s.expenses.map((e) => [e.date, e.desc, e.cat, e.amount, e.cur, (hv(e) || 0).toFixed(2), e.paidBy, e.split.length ? e.split.join(' ') : 'everyone'])]} />
            <JsonButtons name="trip-budget.json" data={s} onLoad={(d) => d && Array.isArray(d.expenses) && set(d)} />
          </>}>
            <Table
              max={40}
              head={['Date', 'Description', 'Category', 'Amount', 'Cur.', s.home, 'Paid by', 'Split', '']}
              rows={s.expenses.map((e) => [
                <input key="d" type="date" value={e.date} aria-label="Date" style={{ width: 130 }} onChange={(ev) => edit(e.id, { date: ev.target.value })} />,
                <input key="n" value={e.desc} aria-label="Description" placeholder="What?" style={{ minWidth: 130 }} onChange={(ev) => edit(e.id, { desc: ev.target.value })} />,
                <select key="c" value={e.cat} aria-label="Category" style={{ minWidth: 112 }} onChange={(ev) => edit(e.id, { cat: ev.target.value })}>{s.cats.map((c) => <option key={c.name}>{c.name}</option>)}</select>,
                <input key="a" type="number" min={0} step="any" value={e.amount} aria-label="Amount" style={{ width: 80 }} onChange={(ev) => edit(e.id, { amount: Math.max(0, Number(ev.target.value) || 0) })} />,
                <select key="u" value={e.cur} aria-label="Currency" style={{ minWidth: 72 }} onChange={(ev) => edit(e.id, { cur: ev.target.value })}>{[...new Set([...currencies, e.cur])].map((c) => <option key={c}>{c}</option>)}</select>,
                <b key="h">{Number.isFinite(hv(e)) ? money(hv(e), '', 2) : '?'}</b>,
                <select key="p" value={e.paidBy} aria-label="Paid by" style={{ minWidth: 88 }} onChange={(ev) => edit(e.id, { paidBy: ev.target.value })}>{s.people.map((p) => <option key={p}>{p}</option>)}</select>,
                <span key="s" style={{ display: 'inline-flex', gap: 3 }}>
                  {s.people.map((p, i) => {
                    const on = !e.split.length || e.split.includes(p)
                    return (
                      <button key={p} type="button" title={`${p}: ${on ? 'shares' : 'not sharing'}`} onClick={() => {
                        const cur = e.split.length ? e.split : s.people
                        const next = on ? cur.filter((x) => x !== p) : [...cur, p]
                        if (next.length) edit(e.id, { split: next.length === s.people.length ? [] : next })
                      }} style={{ width: 24, height: 24, borderRadius: 99, border: '1px solid var(--line)', fontSize: 11, fontWeight: 700, background: on ? color(i) : 'transparent', color: on ? '#fff' : 'var(--muted)' }}>{p.slice(0, 1)}</button>
                    )
                  })}
                </span>,
                <Btn key="x" kind="ghost" title="Delete" onClick={() => set({ expenses: s.expenses.filter((x) => x.id !== e.id) })}>✕</Btn>,
              ])}
              foot={['Total', '', '', '', '', money(spent, '', 2), '', '', '']}
            />
          </Panel>

    </div>
    </>
  )
}
